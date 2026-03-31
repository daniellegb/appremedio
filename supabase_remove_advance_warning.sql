
-- ====================================================================
-- REMOVE ADVANCE WARNING SYSTEM
-- ====================================================================

-- 1. LIMPEZA DE JOBS DE AVISO ANTECIPADO
-- Removemos todos os jobs pendentes que são do tipo 'advance'
DELETE FROM public.notification_jobs 
WHERE type IN ('medication_advance', 'appointment_advance');

-- 2. ATUALIZAÇÃO DA FUNÇÃO DE MEDICAMENTOS
-- Removemos a lógica de agendamento antecipado
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

-- 3. ATUALIZAÇÃO DA FUNÇÃO DE COMPROMISSOS
-- Removemos a lógica de agendamento antecipado
CREATE OR REPLACE FUNCTION public.handle_appointment_jobs()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_appointment_at TIMESTAMPTZ;
BEGIN
    -- Combinar data e hora
    v_appointment_at := (NEW.date::text || ' ' || NEW.time)::timestamp AT TIME ZONE 'UTC';
    v_appointment_at := date_trunc('minute', v_appointment_at);

    -- APENAS JOB: appointment_reminder
    PERFORM public.schedule_notification(
        NEW.user_id,
        'appointment_reminder',
        NEW.id,
        v_appointment_at,
        'Compromisso Agendado 🏥',
        'Hoje: ' || COALESCE(NEW.type, 'Consulta') || ' com ' || COALESCE(NEW.doctor, 'Médico'),
        '/dashboard'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. RECRIAÇÃO DOS TRIGGERS (SEM MONITORAR advance_minutes)
DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
    AFTER INSERT OR UPDATE OF next_dose_at, name, dosage
    ON public.medications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_medication_jobs();

DROP TRIGGER IF EXISTS on_appointment_upsert ON public.appointments;
CREATE TRIGGER on_appointment_upsert
    AFTER INSERT OR UPDATE OF date, time, type, doctor
    ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_jobs();

-- 5. REMOÇÃO DAS COLUNAS (OPCIONAL, MAS RECOMENDADO PARA LIMPEZA)
ALTER TABLE public.medications DROP COLUMN IF EXISTS advance_minutes;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS advance_minutes;

-- 6. RE-SINCRONIZAÇÃO PARA LIMPAR JOBS ANTIGOS E GARANTIR CONSISTÊNCIA
UPDATE public.medications SET updated_at = now();
UPDATE public.appointments SET updated_at = now();
