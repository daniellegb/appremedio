
-- 1. Garantir que as colunas de referência existem na tabela notification_jobs
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES public.notification_queue(id) ON DELETE CASCADE;

-- 2. Migrar dados de entity_id para as novas colunas se necessário
UPDATE public.notification_jobs
SET medication_id = entity_id
WHERE type LIKE 'medication_%' AND medication_id IS NULL;

UPDATE public.notification_jobs
SET appointment_id = entity_id
WHERE type LIKE 'appointment_%' AND appointment_id IS NULL;

-- 3. Limpar jobs órfãos (onde o medicamento ou consulta não existe mais)
DELETE FROM public.notification_jobs
WHERE medication_id IS NOT NULL 
AND medication_id NOT IN (SELECT id FROM public.medications);

DELETE FROM public.notification_jobs
WHERE appointment_id IS NOT NULL 
AND appointment_id NOT IN (SELECT id FROM public.appointments);

-- 4. Garantir que a política RLS permite a exclusão pelo usuário
DROP POLICY IF EXISTS "Users can delete their own notification jobs" ON public.notification_jobs;
CREATE POLICY "Users can delete their own notification jobs"
ON public.notification_jobs
FOR DELETE
USING (auth.uid() = user_id);

-- 5. Atualizar a função schedule_notification para popular corretamente as referências
CREATE OR REPLACE FUNCTION public.schedule_notification(
    p_user_id UUID,
    p_type TEXT,
    p_entity_id UUID,
    p_trigger_at TIMESTAMPTZ,
    p_title TEXT,
    p_body TEXT,
    p_data JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_medication_id UUID := NULL;
    v_appointment_id UUID := NULL;
    v_queue_id UUID := NULL;
BEGIN
    -- Determinar qual ID de referência usar
    IF p_type LIKE 'medication_%' THEN
        v_medication_id := p_entity_id;
    ELSIF p_type LIKE 'appointment_%' THEN
        v_appointment_id := p_entity_id;
    END IF;

    -- Se houver um queue_id no data, extrair
    IF p_data ? 'queue_id' THEN
        v_queue_id := (p_data->>'queue_id')::UUID;
    END IF;

    INSERT INTO public.notification_jobs (
        user_id,
        type,
        entity_id,
        medication_id,
        appointment_id,
        queue_id,
        trigger_at,
        title,
        body,
        data,
        status
    ) VALUES (
        p_user_id,
        p_type,
        p_entity_id,
        v_medication_id,
        v_appointment_id,
        v_queue_id,
        p_trigger_at,
        p_title,
        p_body,
        p_data,
        'pending'
    )
    ON CONFLICT (user_id, type, entity_id, trigger_at) 
    DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        data = EXCLUDED.data,
        status = 'pending',
        updated_at = NOW()
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Forçar um re-sync para garantir que os triggers rodem e as notificações sejam limpas/recriadas se necessário
-- (Isso é opcional, mas ajuda a garantir consistência)
UPDATE public.medications SET updated_at = NOW();
UPDATE public.appointments SET updated_at = NOW();
