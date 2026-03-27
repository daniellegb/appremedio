# Guia de Configuração: Push Notifications com Supabase

Esta arquitetura remove a dependência de Cron Jobs da Vercel e utiliza o motor nativo do Supabase.

## 1. Banco de Dados
Execute o conteúdo do arquivo `supabase/migrations/20260313_push_notifications_v3.sql` no **SQL Editor** do seu projeto Supabase.

**Importante:** No final do script, substitua:
- `YOUR_PROJECT_REF` pela referência do seu projeto (ex: `xtfphwkkwyxdrrezuyfy`).
- `YOUR_SERVICE_ROLE_KEY` pela sua chave secreta `service_role`.

## 2. Edge Function
1. Instale a CLI do Supabase localmente se ainda não tiver.
2. Faça o deploy da função:
   ```bash
   supabase functions deploy send-reminder-notifications
   ```
3. Configure as variáveis de ambiente na Edge Function:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=sua_chave_publica
   supabase secrets set VAPID_PRIVATE_KEY=sua_chave_privada
   supabase secrets set VAPID_SUBJECT=mailto:seu@email.com
   ```

## 3. Frontend
Certifique-se de que a variável `VITE_VAPID_PUBLIC_KEY` está configurada no seu ambiente de desenvolvimento/produção (Vercel).

## 4. Como funciona
- Quando um usuário salva um medicamento, o frontend chama `pushService.syncMedicationReminders`.
- Isso limpa e recria os horários na tabela `medication_reminders`.
- O `pg_cron` do Supabase chama a Edge Function a cada minuto.
- A Edge Function busca lembretes para o minuto atual e envia o Push para todos os dispositivos registrados do usuário.
