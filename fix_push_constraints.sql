
-- SCRIPT DE CORREÇÃO DE CONSTRANGIMENTOS DE PUSH
-- Execute este script no SQL Editor do Supabase para resolver o erro 42P10

-- 1. Garantir que a coluna endpoint existe e está preenchida
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS endpoint TEXT;
UPDATE public.push_subscriptions SET endpoint = subscription->>'endpoint' WHERE endpoint IS NULL;

-- 2. Remover registros duplicados (se houver) para evitar erro ao criar o índice único
-- Mantém apenas o registro mais recente para cada combinação de user_id e endpoint
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.endpoint = b.endpoint;

-- 3. Remover constrangimentos antigos que podem estar causando conflito
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_subscription_key;
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

-- 4. Criar o constrangimento único correto
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);

-- 5. Garantir que a coluna endpoint não seja nula no futuro
ALTER TABLE public.push_subscriptions ALTER COLUMN endpoint SET NOT NULL;

-- 6. Verificar se as políticas de RLS estão corretas
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
