-- ===============================================================
-- SUPABASE SYNC: VERSÃO RESTAURADA (SEM AVISO ANTECIPADO)
-- ===============================================================
-- Este script sincroniza o banco de dados com a versão atual do código,
-- removendo funcionalidades de aviso antecipado e garantindo a estrutura correta.

-- 1. LIMPEZA DE COLUNAS NÃO UTILIZADAS (REVERSÃO)
ALTER TABLE public.medications DROP COLUMN IF EXISTS advance_minutes CASCADE;

-- 2. GARANTIR TABELA DE ASSINATURAS PUSH (SCHEMA ATUAL)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  subscription JSONB NOT NULL,
  timezone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Garantir que a coluna timezone existe (caso a tabela já existisse sem ela)
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS timezone TEXT;

-- 3. GARANTIR TABELA DE FILA DE NOTIFICAÇÕES (LEGACY)
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  medication_id UUID REFERENCES public.medications ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. SISTEMA DE JOBS DE NOTIFICAÇÃO (BACKEND)
CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, 
  payload JSONB NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', 
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

-- 5. FUNÇÕES E TRIGGERS (VERSÃO SIMPLIFICADA)

-- Função para normalizar timestamp
CREATE OR REPLACE FUNCTION public.normalize_to_minute(ts TIMESTAMPTZ)
RETURNS TEXT AS $$
BEGIN
  RETURN to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:00"Z"');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para Medicamentos (Sem advance_minutes)
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER AS $$
DECLARE
  normalized_dose TEXT;
BEGIN
  IF NEW.next_dose_at IS NOT NULL THEN
    normalized_dose := public.normalize_to_minute(NEW.next_dose_at);

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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
AFTER INSERT OR UPDATE OF next_dose_at ON public.medications
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
  
  UPDATE public.notification_queue SET sent = true WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_queue_insert ON public.notification_queue;
CREATE TRIGGER on_queue_insert
AFTER INSERT ON public.notification_queue
FOR EACH ROW EXECUTE FUNCTION public.handle_queue_jobs();

-- 6. CONFIGURAÇÕES DE USUÁRIO
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. RLS POLICIES
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_queue;
CREATE POLICY "Users can view own notifications" ON public.notification_queue FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

-- 8. SEED: REGERAR JOBS PARA MEDICAMENTOS EXISTENTES
DO $$
DECLARE
    m RECORD;
    normalized_dose TEXT;
BEGIN
    FOR m IN SELECT * FROM public.medications WHERE next_dose_at IS NOT NULL LOOP
        normalized_dose := public.normalize_to_minute(m.next_dose_at);
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
