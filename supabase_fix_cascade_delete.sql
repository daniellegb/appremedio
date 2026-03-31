
-- ====================================================================
-- FIX: CASCADE DELETE FOR NOTIFICATION JOBS
-- ====================================================================

-- 1. GARANTIR COLUNAS DE REFERÊNCIA COM CASCADE
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES public.notification_queue(id) ON DELETE CASCADE;

-- 2. ATUALIZAR FUNÇÃO CENTRAL DE AGENDAMENTO PARA POPULAR REFERÊNCIAS
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
    v_medication_id UUID := NULL;
    v_appointment_id UUID := NULL;
    v_queue_id UUID := NULL;
BEGIN
    -- Normalizar para o minuto
    v_normalized_at := date_trunc('minute', p_scheduled_at);
    
    -- Determinar qual ID de referência usar para o CASCADE DELETE
    IF p_type LIKE 'medication_%' THEN
        v_medication_id := p_entity_id;
    ELSIF p_type LIKE 'appointment_%' THEN
        v_appointment_id := p_entity_id;
    ELSIF p_type = 'queue' THEN
        v_queue_id := p_entity_id;
    END IF;

    -- Formato da tag
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

    -- Inserção Idempotente com referências para CASCADE
    INSERT INTO public.notification_jobs (
        user_id, 
        type, 
        entity_id, 
        medication_id,
        appointment_id,
        queue_id,
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
        v_medication_id,
        v_appointment_id,
        v_queue_id,
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
        medication_id = EXCLUDED.medication_id,
        appointment_id = EXCLUDED.appointment_id,
        queue_id = EXCLUDED.queue_id,
        status = CASE 
            WHEN public.notification_jobs.status = 'sent' THEN 'sent'
            ELSE 'pending'
        END,
        updated_at = now()
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. LIMPEZA DE JOBS ÓRFÃOS (Retroativo)
DELETE FROM public.notification_jobs 
WHERE status = 'pending' 
  AND type LIKE 'medication_%'
  AND NOT EXISTS (SELECT 1 FROM public.medications WHERE id = entity_id);

DELETE FROM public.notification_jobs 
WHERE status = 'pending' 
  AND type LIKE 'appointment_%'
  AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE id = entity_id);

-- 4. RE-SINCRONIZAÇÃO PARA POPULAR COLUNAS DE REFERÊNCIA NOS JOBS EXISTENTES
UPDATE public.notification_jobs
SET medication_id = entity_id
WHERE type LIKE 'medication_%' AND medication_id IS NULL;

UPDATE public.notification_jobs
SET appointment_id = entity_id
WHERE type LIKE 'appointment_%' AND appointment_id IS NULL;

-- 6. RLS PARA NOTIFICATION_JOBS (Permitir que o usuário limpe seus próprios jobs)
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notification jobs" ON public.notification_jobs;
CREATE POLICY "Users can view own notification jobs" ON public.notification_jobs 
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notification jobs" ON public.notification_jobs;
CREATE POLICY "Users can delete own notification jobs" ON public.notification_jobs 
FOR DELETE USING (auth.uid() = user_id);

-- 7. RE-SINCRONIZAÇÃO INICIAL
-- Garantir que as colunas de timestamp existam para facilitar auditoria e triggers
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Forçamos um update em todos os medicamentos e compromissos para gerar os novos jobs limpos
-- Isso dispara os triggers on_medication_upsert e on_appointment_upsert
UPDATE public.medications SET updated_at = now();
UPDATE public.appointments SET updated_at = now();
