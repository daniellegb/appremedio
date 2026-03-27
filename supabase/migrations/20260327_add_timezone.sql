-- ADICIONAR COLUNA DE TIMEZONE PARA NOTIFICAÇÕES PRECISAS
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Atualizar a Edge Function para considerar o timezone do usuário
