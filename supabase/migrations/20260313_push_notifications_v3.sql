-- SCRIPT DE MIGRAÇÃO PARA ARQUITETURA SUPABASE NATIVA (SEM VERCEL CRON)

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Assinaturas Push (Estrutura JSONB para flexibilidade)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, subscription)
);

-- 3. Tabela de Lembretes de Medicação (Para o motor de busca da Edge Function)
CREATE TABLE IF NOT EXISTS public.medication_reminders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    medication_id UUID REFERENCES public.medications ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    reminder_time TIME NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_med_reminders_time ON public.medication_reminders(reminder_time) WHERE active = TRUE;

-- 5. Segurança (RLS)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;

-- Políticas para Push Subscriptions
DROP POLICY IF EXISTS "Users can manage own push subs" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subs" ON public.push_subscriptions 
FOR ALL USING (auth.uid() = user_id);

-- Políticas para Medication Reminders
DROP POLICY IF EXISTS "Users can manage own reminders" ON public.medication_reminders;
CREATE POLICY "Users can manage own reminders" ON public.medication_reminders 
FOR ALL USING (auth.uid() = user_id);

-- 6. Agendamento via pg_cron (Chama a Edge Function a cada minuto)
-- Substitua 'YOUR_PROJECT_REF' pela referência do seu projeto Supabase
-- Substitua 'YOUR_ANON_KEY' pela sua anon key ou use uma service role se a função for privada
SELECT cron.schedule(
    'send-reminders-every-minute',
    '* * * * *',
    $$
    SELECT
      net.http_post(
        url:='https://YOUR_PROJECT_REF.functions.supabase.co/send-reminder-notifications',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
        body:='{}'::jsonb
      ) as request_id;
    $$
);
