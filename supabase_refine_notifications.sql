
-- ==========================================
-- 1. GARANTIA DE IDEMPOTÊNCIA (ÍNDICE ÚNICO)
-- ==========================================
-- Remove o índice antigo se existir e cria o UNIQUE
DROP INDEX IF EXISTS idx_notification_jobs_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency_unique 
ON public.notification_jobs (idempotency_key);

-- ==========================================
-- 2. FUNÇÃO DE CLAIM ROBUSTA (CONCORRÊNCIA)
-- ==========================================
-- Esta função garante que múltiplas instâncias da Edge Function 
-- não processem o mesmo job simultaneamente.
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
        ORDER BY trigger_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT batch_size
    )
    RETURNING *;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int, timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int, timestamp with time zone) TO authenticated;
