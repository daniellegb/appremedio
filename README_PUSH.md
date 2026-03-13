# Implementação de Web Push Notifications - Remédio em Dia

Este guia explica como finalizar a configuração das notificações push.

## 1. Gerar Chaves VAPID
Você precisará de um par de chaves VAPID (Public e Private). Você pode gerá-las usando o pacote `web-push` no seu terminal:

```bash
npx web-push generate-vapid-keys
```

## 2. Configurar Variáveis de Ambiente

### No Frontend (AI Studio / .env)
Adicione a chave pública gerada:
- `VITE_VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA_AQUI`

### No Supabase (Edge Functions)
Configure as chaves no painel do Supabase ou via CLI:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (ex: `mailto:seu@email.com` ou a URL do seu app)

## 3. Banco de Dados
Execute o conteúdo do arquivo `supabase_migration_push.sql` no Editor SQL do seu projeto Supabase. Isso adicionará o campo `next_dose_at` e a tabela de assinaturas.

## 4. Deploy da Edge Function
A lógica de envio está em `/supabase/functions/notify-medications/index.ts`.
Para fazer o deploy usando a CLI do Supabase:

```bash
supabase functions deploy notify-medications
```

## 5. Agendamento (Cron Job)
Para que as notificações sejam enviadas automaticamente, você deve chamar a URL da Edge Function periodicamente (ex: a cada 1 minuto).
Você pode usar o **Supabase Cron** (pg_cron) se estiver disponível no seu plano, ou um serviço externo como o **GitHub Actions** ou **cron-job.org**.

Exemplo de SQL para Supabase Cron (se habilitado):
```sql
select cron.schedule(
  'notify-medications-every-minute',
  '* * * * *',
  $$
  select
    net.http_post(
      url:='https://[SEU_PROJETO].supabase.co/functions/v1/notify-medications',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SUA_SERVICE_ROLE_KEY]"}'
    ) as request_id;
  $$
);
```

## Como funciona a lógica:
1. Quando o usuário cria ou toma um medicamento, o app calcula o `next_dose_at` e salva no banco.
2. A Edge Function roda a cada minuto e busca medicamentos onde `next_dose_at <= NOW()`.
3. Ela envia o Push para todas as assinaturas registradas daquele usuário.
4. O Service Worker (`sw.js`) recebe o evento e mostra a notificação.
