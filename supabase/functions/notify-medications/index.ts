import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'https://medmanager.app'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('VAPID keys are missing in environment variables (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
    }
    const now = new Date()
    const nowIso = now.toISOString()
    const results = []

    // 1. NOTIFICAÇÕES DE MEDICAMENTOS
    const { data: meds, error: medsError } = await supabase
      .from('medications')
      .select('*')
      .lte('next_dose_at', nowIso)
      .not('next_dose_at', 'is', null)

    if (medsError) throw medsError

    for (const med of meds) {
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', med.user_id)
      
      if (!subscriptions) continue;

      for (const sub of subscriptions) {
        const payload = JSON.stringify({
          title: 'Hora do Medicamento 💊',
          body: `Lembrete: Tomar ${med.name} (${med.dosage})`,
          url: '/dashboard'
        })

        try {
          await webpush.sendNotification(sub.subscription, payload)
          results.push({ type: 'medication', medId: med.id, status: 'sent' })
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }
    }

    // 2. NOTIFICAÇÕES DE CONSULTAS (Próximas 24 horas)
    const tomorrow = new Date(now)
    tomorrow.setHours(tomorrow.getHours() + 24)
    const tomorrowIso = tomorrow.toISOString()

    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .gte('date', nowIso)
      .lte('date', tomorrowIso)
    
    if (!apptError && appointments) {
      for (const appt of appointments) {
        const { data: subscriptions } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', appt.user_id)

        if (!subscriptions) continue;

        for (const sub of subscriptions) {
          const payload = JSON.stringify({
            title: `Lembrete de ${appt.type} 🏥`,
            body: `${appt.title} agendado para amanhã às ${appt.time}`,
            url: '/appointments'
          })

          try {
            await webpush.sendNotification(sub.subscription, payload)
            results.push({ type: 'appointment', apptId: appt.id, status: 'sent' })
          } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
