-- ===============================================================
-- SCRIPT DE AUDITORIA E TESTE: SISTEMA DE NOTIFICAÇÕES
-- ===============================================================
-- Execute este script no SQL Editor para entender por que as notificações automáticas não estão chegando.

-- 1. RELATÓRIO GERAL DO SISTEMA
DO $$
DECLARE
    total_jobs INT;
    pending_jobs INT;
    sent_jobs INT;
    failed_jobs INT;
    processing_jobs INT;
    user_subs INT;
    server_now TIMESTAMPTZ := now();
BEGIN
    SELECT count(*) INTO total_jobs FROM public.notification_jobs;
    SELECT count(*) INTO pending_jobs FROM public.notification_jobs WHERE status = 'pending';
    SELECT count(*) INTO sent_jobs FROM public.notification_jobs WHERE status = 'sent';
    SELECT count(*) INTO failed_jobs FROM public.notification_jobs WHERE status = 'failed';
    SELECT count(*) INTO processing_jobs FROM public.notification_jobs WHERE status = 'processing';
    SELECT count(*) INTO user_subs FROM public.push_subscriptions;

    RAISE NOTICE '--- RELATÓRIO DE NOTIFICAÇÕES ---';
    RAISE NOTICE 'Horário do Servidor (UTC): %', server_now;
    RAISE NOTICE 'Assinaturas Push no Banco: %', user_subs;
    RAISE NOTICE 'Total de Jobs: %', total_jobs;
    RAISE NOTICE 'Jobs Pendentes: %', pending_jobs;
    RAISE NOTICE 'Jobs Enviados: %', sent_jobs;
    RAISE NOTICE 'Jobs Falhos: %', failed_jobs;
    RAISE NOTICE 'Jobs em Processamento: %', processing_jobs;
    RAISE NOTICE '---------------------------------';
END $$;

-- 2. VERIFICAR OS PRÓXIMOS JOBS AGENDADOS
-- Isso mostra se o banco de dados "sabe" que tem algo para enviar e para quando.
SELECT 
    id, 
    type, 
    trigger_at, 
    (trigger_at - now()) as tempo_restante,
    status,
    attempts as tentativas,
    idempotency_key
FROM public.notification_jobs
WHERE status = 'pending'
ORDER BY trigger_at ASC
LIMIT 5;

-- 3. VERIFICAR ERROS RECENTES
-- Se algum job tentou ser enviado e falhou, o erro aparecerá aqui.
SELECT 
    id, 
    type, 
    processed_at, 
    error_message,
    attempts
FROM public.notification_jobs
WHERE status = 'failed' OR error_message IS NOT NULL
ORDER BY processed_at DESC
LIMIT 5;

-- 4. TESTE DE DISPARO MANUAL (FORÇAR ENVIO AGORA)
-- Este comando abaixo tenta "ativar" qualquer job que já deveria ter sido enviado.
-- Se o resultado for 0 linhas, significa que não há nada pendente para o horário atual ou anterior.
SELECT * FROM public.claim_notification_jobs(10);

-- 5. VERIFICAR SE OS MEDICAMENTOS ESTÃO GERANDO JOBS
-- Se você atualizar um medicamento e o 'next_dose_at' mudar, um novo job deve aparecer aqui.
SELECT 
    name, 
    next_dose_at, 
    updated_at -- Verifique se este campo existe, se não, use created_at
FROM public.medications
ORDER BY next_dose_at ASC
LIMIT 5;

-- 6. LIMPEZA DE TESTE (OPCIONAL)
-- Se você quiser "resetar" um job que falhou para tentar de novo:
-- UPDATE public.notification_jobs SET status = 'pending', attempts = 0 WHERE status = 'failed';
