
-- 1. Adicionar coluna endpoint se não existir
ALTER TABLE public.push_subscriptions 
ADD COLUMN IF NOT EXISTS endpoint TEXT;

-- 2. Preencher a coluna endpoint a partir do JSONB
UPDATE public.push_subscriptions 
SET endpoint = subscription->>'endpoint' 
WHERE endpoint IS NULL;

-- 3. Remover registros duplicados antes de criar o índice (mantém o mais recente)
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.endpoint = b.endpoint;

-- 4. Criar o índice UNIQUE composto (user_id + endpoint)
-- Isso permite que o mesmo endpoint seja usado por usuários diferentes (raro, mas possível em navegadores compartilhados)
-- e garante que o mesmo usuário não duplique a mesma assinatura.
ALTER TABLE public.push_subscriptions 
DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

ALTER TABLE public.push_subscriptions 
ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);

-- 5. Tornar a coluna endpoint obrigatória para garantir integridade
ALTER TABLE public.push_subscriptions 
ALTER COLUMN endpoint SET NOT NULL;
