import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

console.log('Notification Worker starting...')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Parse body for manual test bypass
  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

  // --- 0. TEST NOTIFICATION (Bypass Queue) ---
  if (body.test && body.userId) {
    console.log(`Manual test requested for user: ${body.userId}`)
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const { data: testSubs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', body.userId)

    if (!testSubs || testSubs.length === 0) {
      return new Response(JSON.stringify({ error: 'No push subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const payload = {
      title: 'Teste de Notificação 🔔',
      body: 'Se você recebeu isso, as notificações estão funcionando!',
      url: '/dashboard',
      type: 'test'
    }

    let success = 0
    for (const { subscription } of testSubs) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload))
        success++
      } catch (err) {
        console.error('Test push error:', err)
      }
    }

    return new Response(JSON.stringify({ success: true, sent: success }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  try {
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    // --- 1. CLAIM JOBS (Worker Phase) ---
    // Busca jobs pendentes e marca como 'processing' usando SKIP LOCKED
    const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_notification_jobs', {
      batch_size: 50
    })

    if (claimError) {
      console.error('Error claiming jobs via RPC:', claimError)
      throw claimError
    }

    if (!claimedJobs || claimedJobs.length === 0) {
      console.log('No pending jobs found.')
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Processing ${claimedJobs.length} jobs...`)

    // --- 2. FETCH SUBSCRIPTIONS ---
    const uniqueUserIds = [...new Set(claimedJobs.map(j => j.user_id))]
    const { data: allSubs } = await supabase
      .from('push_subscriptions')
      .select('user_id, subscription, endpoint')
      .in('user_id', uniqueUserIds)

    // --- 3. PROCESS JOBS ---
    for (const job of claimedJobs) {
      const userSubs = allSubs?.filter(s => s.user_id === job.user_id) || []
      
      // DEDUPLICAÇÃO EM MEMÓRIA POR ENDPOINT
      const uniqueEndpoints = new Map()
      for (const s of userSubs) {
        if (!uniqueEndpoints.has(s.endpoint)) {
          uniqueEndpoints.set(s.endpoint, s.subscription)
        }
      }

      let successCount = 0
      let lastErrorMessage = null

      if (uniqueEndpoints.size === 0) {
        console.log(`User ${job.user_id} has no push subscriptions. Marking as failed.`)
        lastErrorMessage = 'No push subscriptions found'
      } else {
        for (const [endpoint, subscription] of uniqueEndpoints.entries()) {
          try {
            await webpush.sendNotification(subscription, JSON.stringify(job.payload))
            successCount++
          } catch (err) {
            console.error(`Push error for endpoint ${endpoint}:`, err)
            lastErrorMessage = err.message
            // Se a assinatura expirou ou é inválida, remover do banco
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
            }
          }
        }
      }

      // --- 4. UPDATE JOB STATUS ---
      const newAttempts = (job.attempts || 0) + 1
      const isSuccess = successCount > 0
      
      let finalStatus = 'sent'
      if (!isSuccess) {
        finalStatus = newAttempts >= (job.max_attempts || 3) ? 'failed' : 'pending'
      }

      await supabase.from('notification_jobs').update({ 
        status: finalStatus,
        attempts: newAttempts,
        error_message: isSuccess ? null : lastErrorMessage,
        processed_at: new Date().toISOString()
      }).eq('id', job.id)

      console.log(`Job ${job.id} (${job.type}) -> ${finalStatus} (Attempts: ${newAttempts})`)
    }

    // --- 5. CLEANUP (Optional per execution) ---
    await supabase.rpc('cleanup_notification_jobs')

    return new Response(JSON.stringify({ success: true, processed: claimedJobs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Global worker error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
