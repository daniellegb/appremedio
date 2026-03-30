
-- 1. Criar a tabela de jobs se não existir
CREATE TABLE IF NOT EXISTS public.notification_jobs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending',
    trigger_at timestamptz NOT NULL,
    idempotency_key text UNIQUE,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    error_message text,
    processed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Garantir colunas extras se a tabela já existia
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS max_attempts integer DEFAULT 3;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- 3. Index para performance do worker
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_trigger ON public.notification_jobs (status, trigger_at) WHERE status = 'pending';

-- 4. RPC para o Worker (Edge Function) buscar jobs com segurança (SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size int DEFAULT 50)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_jobs
  SET 
    status = 'processing',
    updated_at = now()
  WHERE id IN (
    SELECT id
    FROM public.notification_jobs
    WHERE status = 'pending' AND trigger_at <= now()
    ORDER BY trigger_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- 5. RPC para Limpeza de Jobs Antigos
CREATE OR REPLACE FUNCTION public.cleanup_notification_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.notification_jobs
  WHERE status IN ('sent', 'failed')
    AND processed_at < now() - interval '3 days';
END;
$$;

-- 6. Trigger que gera a dose + o aviso antecipado
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    normalized_dose timestamp;
    dose_tag text;
BEGIN
    IF NEW.next_dose_at IS NOT NULL THEN
        -- Normalizamos para o minuto para consistência na idempotency_key
        normalized_dose := date_trunc('minute', NEW.next_dose_at);
        dose_tag := 'med_' || NEW.id || '_' || to_char(normalized_dose, 'YYYYMMDDHH24MI');
        
        -- JOB 1: Notificação na Hora da Dose
        INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
        VALUES (
            NEW.user_id,
            'medication_next_dose',
            jsonb_build_object(
                'title', 'Hora do Medicamento 💊',
                'body', 'Tomar ' || NEW.name || COALESCE(' (' || NEW.dosage || ')', ''),
                'tag', dose_tag,
                'url', '/dashboard'
            ),
            NEW.next_dose_at,
            'now:' || dose_tag
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        -- JOB 2: Aviso Antecipado (se configurado)
        IF NEW.advance_minutes > 0 THEN
            -- Calculamos o horário do aviso
            -- Se o aviso já passou, não criamos o job
            IF (NEW.next_dose_at - (NEW.advance_minutes * interval '1 minute')) > (now() - interval '1 minute') THEN
                INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
                VALUES (
                    NEW.user_id,
                    'medication_advance_warning',
                    jsonb_build_object(
                        'title', 'Lembrete Antecipado ⏰',
                        'body', 'Em ' || NEW.advance_minutes || ' min: ' || NEW.name,
                        'tag', dose_tag || '_adv',
                        'url', '/dashboard'
                    ),
                    NEW.next_dose_at - (NEW.advance_minutes * interval '1 minute'),
                    'adv:' || dose_tag
                )
                ON CONFLICT (idempotency_key) DO NOTHING;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Ativar o Trigger
DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
    AFTER INSERT OR UPDATE OF next_dose_at, name, dosage, advance_minutes
    ON public.medications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_medication_jobs();

-- 8. RLS para notification_jobs (Opcional, mas recomendado)
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.notification_jobs;
CREATE POLICY "Users can view their own jobs" ON public.notification_jobs
    FOR SELECT USING (auth.uid() = user_id);
