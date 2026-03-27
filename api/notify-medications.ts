
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:example@yourdomain.com';

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Opcional: Verificar se a requisição vem de um cron job autorizado (ex: header de autorização)
  
  try {
    const now = new Date().toISOString();

    // 1. Buscar notificações pendentes na fila
    const { data: queue, error: queueError } = await supabase
      .from('notification_queue')
      .select('*')
      .lte('trigger_at', now)
      .eq('sent', false)
      .limit(50);

    if (queueError) throw queueError;

    if (!queue || queue.length === 0) {
      return res.status(200).json({ message: 'No notifications to send' });
    }

    const results = [];

    for (const item of queue) {
      // 2. Buscar assinaturas do usuário
      const { data: subscriptions, error: subError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', item.user_id);

      if (subError) {
        console.error(`Error fetching subs for user ${item.user_id}:`, subError);
        continue;
      }

      let sentToAtLeastOne = false;

      if (subscriptions && subscriptions.length > 0) {
        for (const sub of subscriptions) {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth_key
            }
          };

          const payload = JSON.stringify({
            title: item.title,
            body: item.body,
            url: '/dashboard'
          });

          try {
            await webpush.sendNotification(pushSubscription, payload);
            sentToAtLeastOne = true;
          } catch (err: any) {
            console.error(`Push error for sub ${sub.id}:`, err);
            // 3. Remover assinaturas inválidas (410 Gone ou 404 Not Found)
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
          }
        }
      }

      // 4. Marcar como enviado (mesmo que não tenha subs, para não tentar de novo infinitamente)
      await supabase
        .from('notification_queue')
        .update({ sent: true })
        .eq('id', item.id);
      
      results.push({ id: item.id, sent: sentToAtLeastOne });
    }

    return res.status(200).json({ success: true, processed: results.length, results });
  } catch (error: any) {
    console.error('Serverless function error:', error);
    return res.status(500).json({ error: error.message });
  }
}
