
-- ====================================================================
-- FINAL NOTIFICATION SYSTEM CLEANUP AND ENFORCEMENT
-- ====================================================================

-- 1. LIMPEZA AGRESSIVA DE TRIGGERS ANTIGOS
-- Removemos todos os nomes de triggers conhecidos para evitar duplicidade de origem
DO $$ 
BEGIN
    -- Triggers em medications
    DROP TRIGGER IF EXISTS medication_jobs_trigger ON public.medications;
    DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
    
    -- Triggers em appointments
    DROP TRIGGER IF EXISTS appointment_jobs_trigger ON public.appointments;
    DROP TRIGGER IF EXISTS on_appointment_upsert ON public.appointments;
    
    -- Triggers em notification_queue
    DROP TRIGGER IF EXISTS notification_queue_trigger ON public.notification_queue;
    DROP TRIGGER IF EXISTS on_queue_insert ON public.notification_queue;
END $$;

-- 2. LIMPEZA DE DADOS INCONSISTENTES
-- Deletamos todos os jobs pendentes para forçar a recriação correta pelos novos triggers
DELETE FROM public.notification_jobs WHERE status = 'pending';

-- 3. REFORÇO DA ESTRUTURA DE TABELA
-- Garantir que scheduled_at e entity_id existam e sejam consistentes
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Adicionar a constraint UNIQUE definitiva (entity_id, type, scheduled_at)
-- Isso impede que o mesmo evento (entity_id) gere o mesmo tipo de notificação para o mesmo horário
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_unique_constraint;
ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_unique_constraint UNIQUE (entity_id, type, scheduled_at);

-- 4. FUNÇÃO CENTRAL DE AGENDAMENTO (REFINADA)
-- Esta é a ÚNICA função que deve criar registros em notification_jobs
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
    v_normalized_at TIMESTAMPTZ;
BEGIN
    -- Normalizar para o minuto (evita duplicatas por milissegundos)
    v_normalized_at := date_trunc('minute', p_scheduled_at);
    
    -- Formato da tag: tipo_idEntidade_timestampISO (UTC)
    v_tag := p_type || '_' || p_entity_id || '_' || to_char(v_normalized_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    
    -- Payload Padronizado
    v_payload := jsonb_build_object(
        'type', p_type,
        'title', p_title,
        'body', p_body,
        'url', p_url,
        'tag', v_tag,
        'entity_id', p_entity_id,
        'scheduled_at', to_char(v_normalized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    -- Inserção Idempotente
    INSERT INTO public.notification_jobs (
        user_id, 
        type, 
        entity_id, 
        scheduled_at, 
        payload, 
        trigger_at, 
        idempotency_key,
        status,
        attempts,
        max_attempts
    )
    VALUES (
        p_user_id, 
        p_type, 
        p_entity_id, 
        v_normalized_at, 
        v_payload, 
        v_normalized_at, 
        p_type || ':' || v_tag,
        'pending',
        0,
        3
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

-- 5. RECRIAÇÃO DOS TRIGGERS (FONTE ÚNICA)

-- 5.1 Medicamentos
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_scheduled_at TIMESTAMPTZ;
BEGIN
    IF NEW.next_dose_at IS NOT NULL THEN
        v_scheduled_at := date_trunc('minute', NEW.next_dose_at);
        
        -- JOB 1: medication_next_dose
        PERFORM public.schedule_notification(
            NEW.user_id,
            'medication_next_dose',
            NEW.id,
            v_scheduled_at,
            'Hora do Medicamento 💊',
            'Tomar ' || NEW.name || COALESCE(' (' || NEW.dosage || ')', ''),
            '/dashboard'
        );

        -- JOB 2: medication_advance
        IF NEW.advance_minutes > 0 THEN
            DECLARE
                v_advance_at TIMESTAMPTZ;
            BEGIN
                v_advance_at := v_scheduled_at - (NEW.advance_minutes * interval '1 minute');
                
                -- Só agenda se for no futuro
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

CREATE TRIGGER on_medication_upsert
    AFTER INSERT OR UPDATE OF next_dose_at, name, dosage, advance_minutes
    ON public.medications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_medication_jobs();

-- 5.2 Compromissos
CREATE OR REPLACE FUNCTION public.handle_appointment_jobs()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_appointment_at TIMESTAMPTZ;
    v_scheduled_at TIMESTAMPTZ;
BEGIN
    -- Combinar data e hora (Assumindo que o input date/time está em UTC ou será tratado como tal)
    v_appointment_at := (NEW.date::text || ' ' || NEW.time)::timestamp AT TIME ZONE 'UTC';
    v_appointment_at := date_trunc('minute', v_appointment_at);

    -- JOB 1: appointment_reminder
    PERFORM public.schedule_notification(
        NEW.user_id,
        'appointment_reminder',
        NEW.id,
        v_appointment_at,
        'Compromisso Agendado 🏥',
        'Hoje: ' || COALESCE(NEW.type, 'Consulta') || ' com ' || COALESCE(NEW.doctor, 'Médico'),
        '/dashboard'
    );

    -- JOB 2: appointment_advance
    IF NEW.advance_minutes > 0 THEN
        v_scheduled_at := v_appointment_at - (NEW.advance_minutes * interval '1 minute');
        
        IF v_scheduled_at > (now() - interval '1 minute') THEN
            PERFORM public.schedule_notification(
                NEW.user_id,
                'appointment_advance',
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

CREATE TRIGGER on_appointment_upsert
    AFTER INSERT OR UPDATE OF date, time, type, doctor, advance_minutes
    ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_jobs();

-- 5.3 Fila Legada
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

CREATE TRIGGER on_queue_insert
    AFTER INSERT ON public.notification_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_queue_jobs();

-- 5.4 RPC para Forçar Disparo (Debug)
CREATE OR REPLACE FUNCTION public.trigger_notification_job_now(p_job_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.notification_jobs
    SET trigger_at = now(),
        status = 'pending',
        attempts = 0
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.5 RPC para pegar o horário do servidor (Debug)
CREATE OR REPLACE FUNCTION public.get_current_time()
RETURNS timestamptz AS $$
BEGIN
    RETURN now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RE-SINCRONIZAÇÃO INICIAL
-- Garantir que as colunas de timestamp existam para facilitar auditoria e triggers
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Forçamos um update em todos os medicamentos e compromissos para gerar os novos jobs limpos
-- Isso dispara os triggers on_medication_upsert e on_appointment_upsert
UPDATE public.medications SET updated_at = now();
UPDATE public.appointments SET updated_at = now();
