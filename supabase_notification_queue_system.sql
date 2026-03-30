-- ==========================================
-- 1. TABELA DE FILA DE NOTIFICAÇÕES (JOBS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  type TEXT NOT NULL, -- 'medication_next_dose', 'medication_advance', 'queue', 'test'
  payload JSONB NOT NULL,

  trigger_at TIMESTAMPTZ NOT NULL,

  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed'
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,

  idempotency_key TEXT UNIQUE,

  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Índices para performance e concorrência
CREATE INDEX IF NOT EXISTS notification_jobs_status_idx ON public.notification_jobs (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS notification_jobs_trigger_idx ON public.notification_jobs (trigger_at);
CREATE UNIQUE INDEX IF NOT EXISTS notification_jobs_idempotency_key_idx ON public.notification_jobs (idempotency_key);

-- Deduplicação de assinaturas no nível do banco
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON public.push_subscriptions (endpoint);

-- ==========================================
-- 2. FUNÇÃO RPC: claim_notification_jobs
-- ==========================================
-- Garante que múltiplos workers não processem o mesmo job
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size INT)
RETURNS SETOF public.notification_jobs AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_jobs
  SET status = 'processing'
  WHERE id IN (
    SELECT id FROM public.notification_jobs
    WHERE status = 'pending'
    AND trigger_at <= now()
    AND attempts < max_attempts
    ORDER BY trigger_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. PRODUCER: TRIGGERS PARA CRIAÇÃO DE JOBS
-- ==========================================

-- Função auxiliar para normalizar timestamp (idempotência)
CREATE OR REPLACE FUNCTION public.normalize_to_minute(ts TIMESTAMPTZ)
RETURNS TEXT AS $$
BEGIN
  RETURN to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:00"Z"');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para Medicamentos
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

DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
AFTER INSERT OR UPDATE OF next_dose_at, advance_minutes ON public.medications
FOR EACH ROW EXECUTE FUNCTION public.handle_medication_jobs();

-- Trigger para Notification Queue
CREATE OR REPLACE FUNCTION public.handle_queue_jobs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
  VALUES (
    NEW.user_id,
    'queue',
    jsonb_build_object(
      'title', NEW.title,
      'body', NEW.body,
      'url', '/dashboard',
      'type', 'queue',
      'queue_id', NEW.id
    ),
    NEW.trigger_at,
    'queue:' || NEW.id
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  
  -- Marcar como enviado na fila original para não processar novamente
  UPDATE public.notification_queue SET sent = true WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_queue_insert ON public.notification_queue;
CREATE TRIGGER on_queue_insert
AFTER INSERT ON public.notification_queue
FOR EACH ROW EXECUTE FUNCTION public.handle_queue_jobs();

-- ==========================================
-- 4. LIMPEZA AUTOMÁTICA
-- ==========================================
-- Pode ser chamado via cron ou manualmente
CREATE OR REPLACE FUNCTION public.cleanup_notification_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.notification_jobs
  WHERE status IN ('sent', 'failed')
  AND processed_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;
