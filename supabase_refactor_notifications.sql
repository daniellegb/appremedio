
-- ==========================================
-- 1. AJUSTES NA TABELA: medications
-- ==========================================
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS advance_minutes INTEGER DEFAULT 10;

-- ==========================================
-- 2. AJUSTES NA TABELA: notification_jobs (Idempotência)
-- ==========================================
-- Garantir que a tabela existe com as colunas corretas
CREATE TABLE IF NOT EXISTS public.notification_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES public.notification_queue(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    idempotency_key TEXT NOT NULL,
    trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índice UNIQUE para idempotency_key (CRÍTICO)
-- Se já existir um índice não-unique, removemos antes
DROP INDEX IF EXISTS idx_notification_jobs_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_jobs_idempotency_unique 
ON public.notification_jobs (idempotency_key);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_trigger 
ON public.notification_jobs(status, trigger_at) 
WHERE status IN ('pending', 'failed');

-- ==========================================
-- 3. FUNÇÃO RPC: claim_notification_jobs (Concorrência)
-- ==========================================
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size int, now_iso text)
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
        WHERE (status = 'pending' OR (status = 'failed' AND attempts < max_attempts))
          AND trigger_at <= now_iso::timestamp with time zone
        ORDER BY trigger_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT batch_size
    )
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int, text) TO service_role;
