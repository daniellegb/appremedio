
-- ==========================================
-- 1. AJUSTES NAS TABELAS BASE
-- ==========================================

-- Adicionar advance_minutes aos compromissos
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS advance_minutes INTEGER DEFAULT 0;

-- Adicionar colunas de rastreamento e idempotência aos jobs
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Limpar duplicatas existentes que violariam a nova constraint
DELETE FROM public.notification_jobs a
USING public.notification_jobs b
WHERE a.id < b.id
  AND a.entity_id = b.entity_id
  AND a.type = b.type
  AND a.scheduled_at = b.scheduled_at;

-- Adicionar a constraint UNIQUE solicitada
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_unique_constraint;
ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_unique_constraint UNIQUE (entity_id, type, scheduled_at);

-- ==========================================
-- 2. FONTE ÚNICA DE VERDADE: schedule_notification
-- ==========================================

CREATE OR REPLACE FUNCTION public.schedule_notification(
    p_user_id UUID,
    p_type TEXT,
    p_entity_id UUID,
    p_scheduled_at TIMESTAMPTZ,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/dashboard'
) RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_payload JSONB;
    v_tag TEXT;
BEGIN
    -- Garantir que o timestamp esteja em UTC para a tag e payload
    -- Formato da tag: tipo_idEntidade_timestampISO
    v_tag := p_type || '_' || p_entity_id || '_' || to_char(p_scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    
    -- Payload Padronizado (Requisito 1)
    v_payload := jsonb_build_object(
        'type', p_type,
        'title', p_title,
        'body', p_body,
        'url', p_url,
        'tag', v_tag,
        'entity_id', p_entity_id,
        'scheduled_at', to_char(p_scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    -- Inserção Idempotente (Requisito 2)
    INSERT INTO public.notification_jobs (
        user_id, 
        type, 
        entity_id, 
        scheduled_at, 
        payload, 
        trigger_at, 
        idempotency_key
    )
    VALUES (
        p_user_id, 
        p_type, 
        p_entity_id, 
        p_scheduled_at, 
        v_payload, 
        p_scheduled_at, 
        p_type || ':' || v_tag
    )
    ON CONFLICT (entity_id, type, scheduled_at) DO UPDATE SET
        payload = EXCLUDED.payload,
        trigger_at = EXCLUDED.trigger_at,
        status = CASE 
            WHEN public.notification_jobs.status = 'sent' THEN 'sent'
            ELSE 'pending'
        END,
        updated_at = now()
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. TRIGGERS REFATORADOS
-- ==========================================

-- 3.1 Medicamentos
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_scheduled_at TIMESTAMPTZ;
BEGIN
    IF NEW.next_dose_at IS NOT NULL THEN
        -- Normalizamos para o minuto para consistência
        v_scheduled_at := date_trunc('minute', NEW.next_dose_at);
        
        -- JOB 1: medication_next_dose (Na hora exata)
        PERFORM public.schedule_notification(
            NEW.user_id,
            'medication_next_dose',
            NEW.id,
            v_scheduled_at,
            'Hora do Medicamento 💊',
            'Tomar ' || NEW.name || COALESCE(' (' || NEW.dosage || ')', ''),
            '/dashboard'
        );

        -- JOB 2: medication_advance (Aviso antecipado)
        IF NEW.advance_minutes > 0 THEN
            DECLARE
                v_advance_at TIMESTAMPTZ;
            BEGIN
                v_advance_at := v_scheduled_at - (NEW.advance_minutes * interval '1 minute');
                
                -- Se o aviso já passou, não criamos o job
                IF v_advance_at > (now() - interval '1 minute') THEN
                    PERFORM public.schedule_notification(
                        NEW.user_id,
                        'medication_advance',
                        NEW.id,
                        v_advance_at,
                        'Lembrete Antecipado ⏰',
                        'Em ' || NEW.advance_minutes || ' min: ' || NEW.name,
                        '/dashboard'
                    );
                END IF;
            END;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.2 Compromissos
CREATE OR REPLACE FUNCTION public.handle_appointment_jobs()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_appointment_at TIMESTAMPTZ;
    v_scheduled_at TIMESTAMPTZ;
BEGIN
    -- Combinar data e hora (Assumindo UTC conforme requisito)
    v_appointment_at := (NEW.date::text || ' ' || NEW.time)::timestamp AT TIME ZONE 'UTC';
    v_appointment_at := date_trunc('minute', v_appointment_at);

    -- JOB 1: appointment_reminder (Na hora exata)
    PERFORM public.schedule_notification(
        NEW.user_id,
        'appointment_reminder',
        NEW.id,
        v_appointment_at,
        'Compromisso Agendado 🏥',
        'Hoje: ' || COALESCE(NEW.type, 'Consulta') || ' com ' || COALESCE(NEW.doctor, 'Médico'),
        '/dashboard'
    );

    -- JOB 2: appointment_reminder (Aviso antecipado)
    IF NEW.advance_minutes > 0 THEN
        v_scheduled_at := v_appointment_at - (NEW.advance_minutes * interval '1 minute');
        
        IF v_scheduled_at > (now() - interval '1 minute') THEN
            PERFORM public.schedule_notification(
                NEW.user_id,
                'appointment_reminder', -- Mesmo tipo, scheduled_at diferente (permitido pela constraint)
                NEW.id,
                v_scheduled_at,
                'Lembrete de Compromisso ⏰',
                'Em ' || NEW.advance_minutes || ' min: ' || COALESCE(NEW.type, 'Consulta'),
                '/dashboard'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.3 Fila Legada (Backwards Compatibility)
CREATE OR REPLACE FUNCTION public.handle_queue_jobs()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.schedule_notification(
    NEW.user_id,
    'queue',
    NEW.id,
    date_trunc('minute', NEW.trigger_at),
    NEW.title,
    NEW.body,
    '/dashboard'
  );
  
  UPDATE public.notification_queue SET sent = true WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. ATIVAÇÃO DOS TRIGGERS
-- ==========================================

DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
    AFTER INSERT OR UPDATE OF next_dose_at, name, dosage, advance_minutes
    ON public.medications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_medication_jobs();

DROP TRIGGER IF EXISTS on_appointment_upsert ON public.appointments;
CREATE TRIGGER on_appointment_upsert
    AFTER INSERT OR UPDATE OF date, time, type, doctor, advance_minutes
    ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_jobs();

DROP TRIGGER IF EXISTS on_queue_insert ON public.notification_queue;
CREATE TRIGGER on_queue_insert
    AFTER INSERT ON public.notification_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_queue_jobs();
