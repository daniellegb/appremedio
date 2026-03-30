
-- ==========================================
-- 1. TABELA: notification_jobs (Fila Idempotente)
-- ==========================================
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
    idempotency_key TEXT UNIQUE NOT NULL,
    trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance e concorrência
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status_trigger ON public.notification_jobs(status, trigger_at) 
WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_jobs_user_id ON public.notification_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_medication_id ON public.notification_jobs(medication_id);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_appointment_id ON public.notification_jobs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_queue_id ON public.notification_jobs(queue_id);

-- ==========================================
-- 2. AJUSTES NAS TABELAS EXISTENTES
-- ==========================================
-- Garantir unicidade nos lembretes para evitar materialização duplicada
ALTER TABLE public.medication_reminders 
DROP CONSTRAINT IF EXISTS medication_reminders_user_med_time_key;

ALTER TABLE public.medication_reminders 
ADD CONSTRAINT medication_reminders_user_med_time_key UNIQUE (user_id, medication_id, reminder_time);

-- Adicionar colunas de rastreamento na notification_queue para compatibilidade
ALTER TABLE public.notification_queue ADD COLUMN IF NOT EXISTS notification_id TEXT;
ALTER TABLE public.notification_queue ADD COLUMN IF NOT EXISTS notification_status TEXT DEFAULT 'pending';
ALTER TABLE public.notification_queue ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE;

-- Índices adicionais
CREATE INDEX IF NOT EXISTS idx_medication_reminders_user_id ON public.medication_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON public.notification_queue(user_id);

-- ==========================================
-- 3. SEGURANÇA (RLS)
-- ==========================================
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

-- Apenas o sistema (service_role) deve gerenciar jobs, 
-- mas usuários podem ver seus próprios jobs se necessário.
DROP POLICY IF EXISTS "Users can view own notification jobs" ON public.notification_jobs;
CREATE POLICY "Users can view own notification jobs" ON public.notification_jobs 
FOR SELECT USING (auth.uid() = user_id);

-- ==========================================
-- 4. FUNÇÃO RPC PARA CLAIM (Controle de Concorrência)
-- ==========================================
-- Esta função usa SELECT FOR UPDATE SKIP LOCKED para garantir que 
-- apenas uma instância processe cada job.
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

-- Garantir que a função possa ser chamada pelo service_role
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(int, text) TO service_role;
