
-- ==========================================
-- 1. TABELA DE LOCK GLOBAL
-- ==========================================
CREATE TABLE IF NOT EXISTS public.cron_locks (
    name TEXT PRIMARY KEY,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. ÍNDICES DE UNICIDADE (IDEMPOTÊNCIA)
-- ==========================================
-- Garante que o mesmo endpoint não seja cadastrado múltiplas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint_unique 
ON public.push_subscriptions (endpoint);

-- Garante que o mesmo job não seja inserido múltiplas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency_unique 
ON public.notification_jobs (idempotency_key);

-- ==========================================
-- 3. FUNÇÃO RPC: claim_notification_jobs
-- ==========================================
-- Garante exclusividade de processamento com FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size int, now_iso timestamp with time zone)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.notification_jobs
    SET status = 'processing'
    WHERE id IN (
        SELECT id
        FROM public.notification_jobs
        WHERE status = 'pending'
          AND trigger_at <= now_iso
          AND attempts < max_attempts
        ORDER BY trigger_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT batch_size
    )
    RETURNING *;
END;
$$;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int, timestamp with time zone) TO service_role;

-- ==========================================
-- 4. LIMPEZA AUTOMÁTICA (OPCIONAL - PODE SER RODADO VIA CRON)
-- ==========================================
-- DELETE FROM public.notification_jobs WHERE processed_at < NOW() - INTERVAL '7 days';
