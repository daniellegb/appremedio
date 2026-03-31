-- ==========================================
-- 1. SEED: CRIAR JOBS PARA MEDICAMENTOS EXISTENTES
-- ==========================================
-- Este script força a criação de jobs para medicamentos que já estão no banco
DO $$
DECLARE
    m RECORD;
    normalized_dose TEXT;
    advance_trigger TIMESTAMPTZ;
BEGIN
    FOR m IN SELECT * FROM public.medications WHERE next_dose_at IS NOT NULL LOOP
        normalized_dose := public.normalize_to_minute(m.next_dose_at);

        -- Job Principal
        INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
        VALUES (
            m.user_id,
            'medication_next_dose',
            jsonb_build_object(
                'title', 'Hora do Medicamento 💊',
                'body', 'Tomar ' || m.name || COALESCE(' (' || m.dosage || ')', ''),
                'type', 'medication_next_dose',
                'medication_id', m.id
            ),
            m.next_dose_at,
            'med_now:' || m.id || ':' || normalized_dose
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
END $$;

-- ==========================================
-- 2. QUERY DE DIAGNÓSTICO
-- ==========================================
-- Execute esta query para ver se existem jobs prontos para serem enviados
SELECT 
    status, 
    count(*), 
    min(trigger_at) as next_job_at,
    now() as current_db_time
FROM public.notification_jobs
GROUP BY status;
