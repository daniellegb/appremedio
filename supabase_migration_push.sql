
-- 1. Adicionar campo next_dose_at na tabela medications
ALTER TABLE public.medications 
ADD COLUMN IF NOT EXISTS next_dose_at TIMESTAMP WITH TIME ZONE;

-- 2. Criar tabela de assinaturas push (conforme requisitos do usuário)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- 3. Habilitar RLS para push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de RLS para push_subscriptions
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions 
FOR ALL USING (auth.uid() = user_id);

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_medications_next_dose_at ON public.medications(next_dose_at);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
