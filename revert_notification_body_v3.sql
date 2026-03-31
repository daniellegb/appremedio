
-- ====================================================================
-- RESTORE DOSAGE IN NOTIFICATION BODY
-- ====================================================================

-- 1. ATUALIZAÇÃO DA FUNÇÃO DE MEDICAMENTOS
-- Restauramos o COALESCE(' (' || NEW.dosage || ')', '') na mensagem
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
        
        -- APENAS JOB: medication_next_dose
        PERFORM public.schedule_notification(
            NEW.user_id,
            'medication_next_dose',
            NEW.id,
            v_scheduled_at,
            'Hora do Medicamento 💊',
            'Tomar ' || NEW.name || COALESCE(' (' || NEW.dosage || ')', ''),
            '/dashboard'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. ATUALIZAÇÃO DOS JOBS PENDENTES
-- Corrigimos o payload dos jobs que ainda não foram enviados
UPDATE public.notification_jobs
SET payload = payload || jsonb_build_object('body', 'Tomar ' || m.name || COALESCE(' (' || m.dosage || ')', ''))
FROM public.medications m
WHERE public.notification_jobs.entity_id = m.id
AND public.notification_jobs.type = 'medication_next_dose'
AND public.notification_jobs.status = 'pending';

-- 3. RE-SINCRONIZAÇÃO
UPDATE public.medications SET updated_at = now();
