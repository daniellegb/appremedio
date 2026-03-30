
-- ==========================================
-- HOTFIX: GARANTIR UNICIDADE E LIMPAR DUPLICATAS
-- ==========================================

-- 1. Limpar jobs duplicados e pendentes antigos que causaram o spam
DELETE FROM public.notification_jobs 
WHERE status = 'pending' 
  AND trigger_at < (NOW() - INTERVAL '1 hour');

-- 2. Garantir que a constraint UNIQUE existe (mesmo que a tabela já existisse)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_jobs_idempotency_key_unique') THEN
        ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_idempotency_key_unique UNIQUE (idempotency_key);
    END IF;
END $$;

-- 3. Garantir que a constraint UNIQUE existe na medication_reminders
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_reminders_user_med_time_key') THEN
        ALTER TABLE public.medication_reminders ADD CONSTRAINT medication_reminders_user_med_time_key UNIQUE (user_id, medication_id, reminder_time);
    END IF;
END $$;
