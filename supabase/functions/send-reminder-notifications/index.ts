import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url);
  const queryDebug = url.searchParams.get('debug') === 'true';

  // Parse body once to be used for debug and normal logic
  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

  // Advanced Debug Mode (via Body)
  if (body.debug === true && body.clientEnv) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    
    const vapidMatch = body.clientEnv.VAPID_PUBLIC_KEY === vapidPublicKey;
    const supabaseUrlMatch = body.clientEnv.SUPABASE_URL === supabaseUrl;

    return new Response(
      JSON.stringify({
        vapidMatch,
        supabaseUrlMatch,
        server: {
          vapidPreview: vapidPublicKey ? `${vapidPublicKey.substring(0, 10)}...` : null,
          supabaseUrl: supabaseUrl
        },
        client: {
          vapidPreview: body.clientEnv.VAPID_PUBLIC_KEY ? `${body.clientEnv.VAPID_PUBLIC_KEY.substring(0, 10)}...` : null,
          supabaseUrl: body.clientEnv.SUPABASE_URL
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Simple Debug Mode (via Query Param)
  if (queryDebug) {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    return new Response(
      JSON.stringify({
        hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
        hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        hasVapidPublic: !!vapidPublic,
        hasVapidPrivate: !!Deno.env.get('VAPID_PRIVATE_KEY'),
        vapidPublicPreview: vapidPublic ? `${vapidPublic.substring(0, 10)}...` : null,
        supabaseUrl: Deno.env.get('SUPABASE_URL') || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  // Segurança Manual: Verificar se a requisição tem a chave correta
  // Isso permite que sistemas automáticos (sem JWT) chamem a função com segurança
  const authHeader = req.headers.get('Authorization');
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  
  // Se a função for implantada com --no-verify-jwt, podemos usar uma chave interna
  // para permitir chamadas de sistema (cron/webhooks)
  const isInternalCall = internalSecret && authHeader === `Bearer ${internalSecret}`;
  
  // Se não for uma chamada interna e não houver JWT validado pelo gateway (quando verify-jwt está ON),
  // o Supabase já teria barrado. Mas se estiver OFF, e não for chamada interna, 
  // podemos opcionalmente validar o JWT aqui ou apenas seguir se for uma chamada de usuário logado.

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys are missing in environment variables (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { test, userId } = body;
    const now = new Date()

    if (test && userId) {
      console.log(`Sending test notification to user ${userId}`)
      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', userId)

      if (subsError) throw subsError
      
      if (!subs || subs.length === 0) {
        console.log(`No subscriptions found for user ${userId}`)
        return new Response(JSON.stringify({ message: 'No subscriptions found for this user', count: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      let successCount = 0;
      let errorCount = 0;

      for (const { subscription } of subs) {
        try {
          await webpush.sendNotification(subscription, JSON.stringify({
            title: 'Teste de Notificação ✅',
            body: 'Seu sistema de lembretes está funcionando corretamente!',
            url: '/dashboard'
          }))
          successCount++;
        } catch (err) {
          console.error('Error sending test push:', err)
          errorCount++;
        }
      }

      return new Response(JSON.stringify({ 
        message: `Test notifications processed: ${successCount} success, ${errorCount} failed`,
        successCount,
        errorCount,
        totalFound: subs.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 1. Buscar lembretes de medicação recorrentes
    const { data: reminders, error: remindersError } = await supabase
      .from('medication_reminders')
      .select('*')
      .eq('active', true)

    if (remindersError) throw remindersError

    // 2. Buscar notificações agendadas (one-off) na fila
    const { data: queuedNotifications, error: queueError } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('sent', false)
      .lte('trigger_at', now.toISOString())

    if (queueError) throw queueError

    // 3. Buscar todas as assinaturas push dos usuários afetados
    const userIds = [
      ...(reminders?.map(r => r.user_id) || []),
      ...(queuedNotifications?.map(n => n.user_id) || [])
    ]
    
    const uniqueUserIds = [...new Set(userIds)]
    let allSubscriptions: any[] = []
    
    if (uniqueUserIds.length > 0) {
      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('user_id, subscription, timezone')
        .in('user_id', uniqueUserIds)
      
      if (subsError) throw subsError
      allSubscriptions = subs || []
    }

    const results = []

    // Processar lembretes recorrentes
    if (reminders && reminders.length > 0) {
      // De-duplicar lembretes em memória por (user + med + time_hh_mm)
      const uniqueReminders = Array.from(new Map(reminders.map(r => 
        [`${r.user_id}-${r.medication_id}-${r.reminder_time.substring(0, 5)}`, r]
      )).values());

      for (const reminder of uniqueReminders) {
        const userSubs = allSubscriptions.filter(s => s.user_id === reminder.user_id)
        // De-duplicar assinaturas pelo endpoint para evitar envio duplo no mesmo navegador
        const uniqueSubs = Array.from(new Map(userSubs.map(s => [s.endpoint, s])).values());
        
        for (const { subscription, timezone } of uniqueSubs) {
          const userTime = now.toLocaleTimeString('pt-BR', {
            timeZone: timezone || 'UTC',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
          })
          const reminderTimeShort = reminder.reminder_time.substring(0, 5)

          if (userTime === reminderTimeShort) {
            try {
              const bodyMessage = reminder.message_template || `Lembrete: Tomar ${reminder.medication_name}`;
              await webpush.sendNotification(subscription, JSON.stringify({
                title: 'Hora do Medicamento 💊',
                body: bodyMessage,
                url: '/dashboard'
              }))
              results.push({ type: 'medication', id: reminder.id })
            } catch (err) {
              console.error(`Error sending push:`, err)
              if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
              }
            }
          }
        }
      }
    }

    // Processar notificações da fila (one-off)
    if (queuedNotifications && queuedNotifications.length > 0) {
      for (const notification of queuedNotifications) {
        const userSubs = allSubscriptions.filter(s => s.user_id === notification.user_id)
        for (const { subscription } of userSubs) {
          try {
            await webpush.sendNotification(subscription, JSON.stringify({
              title: notification.title,
              body: notification.body,
              url: '/dashboard'
            }))
            results.push({ type: 'queue', id: notification.id })
          } catch (err) {
            console.error(`Error sending queued push:`, err)
          }
        }
        // Marcar como enviada
        await supabase.from('notification_queue').update({ sent: true }).eq('id', notification.id)
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
