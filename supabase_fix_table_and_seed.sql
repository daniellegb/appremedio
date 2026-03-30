-- ==========================================
-- 1. AJUSTE NA TABELA MEDICATIONS
-- ==========================================
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS advance_minutes INT DEFAULT 0;

-- ==========================================
-- 2. ATUALIZAÇÃO DO TRIGGER (PRODUCER)
-- ==========================================
-- Recriando a função para garantir que ela use a nova coluna advance_minutes
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER AS $$
DECLARE
  normalized_dose TEXT;
  advance_trigger TIMESTAMPTZ;
BEGIN
  IF NEW.next_dose_at IS NOT NULL THEN
    normalized_dose := public.normalize_to_minute(NEW.next_dose_at);

    -- 1. Job da Dose Principal
    INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
    VALUES (
      NEW.user_id,
      'medication_next_dose',
      jsonb_build_object(
        'title', 'Hora do Medicamento 💊',
        'body', 'Tomar ' || NEW.name || COALESCE(' (' || NEW.dosage || ')', ''),
        'type', 'medication_next_dose',
        'medication_id', NEW.id
      ),
      NEW.next_dose_at,
      'med_now:' || NEW.id || ':' || normalized_dose
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- 2. Job de Aviso Antecipado (se configurado)
    IF COALESCE(NEW.advance_minutes, 0) > 0 THEN
      advance_trigger := NEW.next_dose_at - (NEW.advance_minutes || ' minutes')::interval;
      
      INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
      VALUES (
        NEW.user_id,
        'medication_advance',
        jsonb_build_object(
          'title', 'Aviso Antecipado ⏰',
          'body', 'Em ' || NEW.advance_minutes || ' min: ' || NEW.name,
          'type', 'medication_advance',
          'medication_id', NEW.id
        ),
        advance_trigger,
        'med_adv:' || NEW.id || ':' || normalized_dose
      ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-aplicar o trigger
DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
AFTER INSERT OR UPDATE OF next_dose_at, advance_minutes ON public.medications
FOR EACH ROW EXECUTE FUNCTION public.handle_medication_jobs();

-- ==========================================
-- 2. RE-EXECUÇÃO DO SEED (CRIAR JOBS)
-- ==========================================
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

        -- Job Antecipado
        IF COALESCE(m.advance_minutes, 0) > 0 THEN
            advance_trigger := m.next_dose_at - (m.advance_minutes || ' minutes')::interval;
            INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
            VALUES (
                m.user_id,
                'medication_advance',
                jsonb_build_object(
                    'title', 'Aviso Antecipado ⏰',
                    'body', 'Em ' || m.advance_minutes || ' min: ' || m.name,
                    'type', 'medication_advance',
                    'medication_id', m.id
                ),
                advance_trigger,
                'med_adv:' || m.id || ':' || normalized_dose
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- ==========================================
-- 3. DIAGNÓSTICO FINAL
-- ==========================================
SELECT 
    status, 
    count(*), 
    min(trigger_at) as next_job_at,
    now() as current_db_time
FROM public.notification_jobs
GROUP BY status;
