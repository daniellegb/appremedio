
-- ====================================================================
-- FIX NOTIFICATION DELIVERY SYSTEM
-- ====================================================================

-- 1. LIMPEZA E REFORÇO DA ESTRUTURA DE TABELA
-- Removemos índices antigos que podem causar conflitos inesperados
DROP INDEX IF EXISTS public.notification_jobs_idempotency_key_idx;
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_idempotency_key_key;
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_unique_constraint;

-- Garantimos que as colunas de controle existam e sejam consistentes
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS type TEXT;

-- Criamos a constraint única definitiva baseada no evento real
-- Isso impede duplicatas para o mesmo medicamento no mesmo minuto
ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_unique_constraint UNIQUE (entity_id, type, scheduled_at);

-- 2. REDEFINIÇÃO DA FUNÇÃO DE AGENDAMENTO (Mais Robusta)
CREATE OR REPLACE FUNCTION public.schedule_notification(
    p_user_id UUID,
    p_type TEXT,
    p_entity_id UUID,
    p_scheduled_at TIMESTAMPTZ,
    p_title TEXT,
    p_body TEXT,
    p_url TEXT DEFAULT '/dashboard'
) RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
    v_payload JSONB;
    v_tag TEXT;
    v_normalized_at TIMESTAMPTZ;
BEGIN
    -- Normalizar para o minuto (evita duplicatas por milissegundos)
    v_normalized_at := date_trunc('minute', p_scheduled_at);
    
    -- Formato da tag: tipo_idEntidade_timestampISO (UTC)
    v_tag := p_type || '_' || p_entity_id || '_' || to_char(v_normalized_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    
    -- Payload Padronizado
    v_payload := jsonb_build_object(
        'type', p_type,
        'title', p_title,
        'body', p_body,
        'url', p_url,
        'tag', v_tag,
        'entity_id', p_entity_id,
        'scheduled_at', to_char(v_normalized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    -- Inserção Idempotente
    INSERT INTO public.notification_jobs (
        user_id, 
        type, 
        entity_id, 
        scheduled_at, 
        payload, 
        trigger_at, 
        idempotency_key,
        status,
        attempts,
        max_attempts
    )
    VALUES (
        p_user_id, 
        p_type, 
        p_entity_id, 
        v_normalized_at, 
        v_payload, 
        v_normalized_at, 
        p_type || ':' || v_tag,
        'pending',
        0,
        3
    )
    ON CONFLICT (entity_id, type, scheduled_at) DO UPDATE SET
        payload = EXCLUDED.payload,
        trigger_at = EXCLUDED.trigger_at,
        status = CASE 
            WHEN public.notification_jobs.status = 'sent' THEN 'sent'
            ELSE 'pending'
        END,
        updated_at = now()
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. REDEFINIÇÃO DA FUNÇÃO DE BUSCA (Worker RPC)
-- Adicionamos recuperação de jobs presos em 'processing'
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size int DEFAULT 50)
RETURNS SETOF public.notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_jobs
  SET 
    status = 'processing',
    updated_at = now()
  WHERE id IN (
    SELECT id
    FROM public.notification_jobs
    WHERE (status = 'pending' OR (status = 'processing' AND updated_at < now() - interval '10 minutes'))
      AND trigger_at <= now()
    ORDER BY trigger_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- 4. ATUALIZAÇÃO DOS TRIGGERS (Monitorar updated_at para Sincronização)
DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
    AFTER INSERT OR UPDATE OF next_dose_at, name, dosage, updated_at
    ON public.medications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_medication_jobs();

DROP TRIGGER IF EXISTS on_appointment_upsert ON public.appointments;
CREATE TRIGGER on_appointment_upsert
    AFTER INSERT OR UPDATE OF date, time, type, doctor, updated_at
    ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_jobs();

-- 5. FORÇAR RE-SINCRONIZAÇÃO E CRIAÇÃO DE JOBS
-- Isso vai disparar os triggers e criar os jobs que estavam faltando
UPDATE public.medications SET updated_at = now();
UPDATE public.appointments SET updated_at = now();

-- 6. LIMPEZA DE SEGURANÇA
-- Remove jobs órfãos que podem ter sido criados sem entity_id em versões anteriores
DELETE FROM public.notification_jobs WHERE entity_id IS NULL AND status = 'pending';
