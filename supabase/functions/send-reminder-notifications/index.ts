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
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { test, userId } = await req.json().catch(() => ({}))

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

    // 1. Buscar todos os lembretes ativos
    // Nota: Para escala massiva, poderíamos otimizar filtrando por janelas de tempo,
    // mas para garantir precisão com timezones, buscamos os ativos e validamos o horário local.
    const { data: reminders, error: remindersError } = await supabase
      .from('medication_reminders')
      .select('*, push_subscriptions(subscription, timezone)')
      .eq('active', true)

    if (remindersError) throw remindersError

    if (!reminders || reminders.length === 0) {
      console.log('No active reminders found in database.')
      return new Response(JSON.stringify({ message: 'No active reminders' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const now = new Date()
    const results = []

    for (const reminder of reminders) {
      const subs = reminder.push_subscriptions || []
      if (subs.length === 0) continue

      for (const { subscription, timezone } of subs) {
        // Obter a hora atual no timezone do usuário
        const userTime = now.toLocaleTimeString('pt-BR', {
          timeZone: timezone || 'UTC',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        })

        // O reminder_time no banco é "HH:mm:ss", pegamos apenas "HH:mm"
        const reminderTimeShort = reminder.reminder_time.substring(0, 5)

        console.log(`Checking reminder ${reminder.medication_name} for user ${reminder.user_id}. Local time: ${userTime}, Reminder time: ${reminderTimeShort}`)

        if (userTime === reminderTimeShort) {
          try {
            const payload = JSON.stringify({
              title: 'Hora do Medicamento 💊',
              body: `Lembrete: Tomar ${reminder.medication_name}`,
              url: '/dashboard'
            })

            await webpush.sendNotification(subscription, payload)
            results.push({ user_id: reminder.user_id, medication: reminder.medication_name, status: 'sent' })
            console.log(`Notification sent to user ${reminder.user_id} for ${reminder.medication_name}`)
          } catch (err) {
            console.error(`Error sending push to sub:`, err)
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('subscription->>endpoint', subscription.endpoint)
            }
          }
        }
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
