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
    const { test, userId } = await req.json().catch(() => ({}))
    const now = new Date()

    if (test && userId) {
      console.log(`Sending test notification to user ${userId}`)
      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', userId)

      if (subsError) throw subsError

      for (const { subscription } of subs) {
        try {
          await webpush.sendNotification(subscription, JSON.stringify({
            title: 'Teste de Notificação ✅',
            body: 'Seu sistema de lembretes está funcionando corretamente!',
            url: '/dashboard'
          }))
        } catch (err) {
          console.error('Error sending test push:', err)
        }
      }

      return new Response(JSON.stringify({ message: 'Test notifications sent' }), {
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
      for (const reminder of reminders) {
        const userSubs = allSubscriptions.filter(s => s.user_id === reminder.user_id)
        for (const { subscription, timezone } of userSubs) {
          const userTime = now.toLocaleTimeString('pt-BR', {
            timeZone: timezone || 'UTC',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
          })
          const reminderTimeShort = reminder.reminder_time.substring(0, 5)

          if (userTime === reminderTimeShort) {
            try {
              await webpush.sendNotification(subscription, JSON.stringify({
                title: 'Hora do Medicamento 💊',
                body: `Lembrete: Tomar ${reminder.medication_name}`,
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
