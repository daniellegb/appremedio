-- SCRIPT DE DIAGNÓSTICO: NOTIFICAÇÕES
-- Este script adiciona funções para ajudar a diagnosticar por que as notificações não estão chegando.

-- 1. FUNÇÃO PARA VERIFICAR O HORÁRIO DO SERVIDOR
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN now();
END;
$$ LANGUAGE plpgsql;

-- 2. FUNÇÃO PARA VERIFICAR JOBS PENDENTES
CREATE OR REPLACE FUNCTION public.check_pending_jobs(user_id_param UUID)
RETURNS TABLE (
  id UUID,
  type TEXT,
  trigger_at TIMESTAMPTZ,
  status TEXT,
  attempts INT,
  error_message TEXT,
  now_server TIMESTAMPTZ,
  is_ready BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id, 
    j.type, 
    j.trigger_at, 
    j.status, 
    j.attempts, 
    j.error_message,
    now() as now_server,
    (j.trigger_at <= now()) as is_ready
  FROM public.notification_jobs j
  WHERE j.user_id = user_id_param
  AND j.status = 'pending'
  ORDER BY j.trigger_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 3. GARANTIR QUE A TABELA DE JOBS TEM AS POLÍTICAS CORRETAS PARA O USUÁRIO VER
-- O usuário precisa conseguir ver seus próprios jobs para o diagnóstico no frontend.
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own jobs" ON public.notification_jobs;
CREATE POLICY "Users can view own jobs" ON public.notification_jobs FOR SELECT USING (auth.uid() = user_id);

-- 4. VERIFICAR SE O TRIGGER ESTÁ REALMENTE CRIANDO JOBS
-- Vamos recriar o trigger com um log (RAISE NOTICE) para ajudar no debug se necessário
-- (Nota: RAISE NOTICE só aparece no log do Postgres, não no app)

-- 5. CORREÇÃO: Se o trigger_at estiver em UTC mas o app estiver enviando em outro formato,
-- pode haver confusão. Vamos garantir que o trigger_at seja sempre TIMESTAMPTZ.
ALTER TABLE public.notification_jobs ALTER COLUMN trigger_at TYPE TIMESTAMPTZ;

-- 6. GARANTIR QUE O SERVICE ROLE PODE EXECUTAR A FUNÇÃO DE CLAIM
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(INT) TO authenticated; -- Para testes manuais se necessário
