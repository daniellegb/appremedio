import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

console.log('Edge Function starting up...')

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

  // --- 0. LOCK GLOBAL (Evita múltiplas instâncias) ---
  const lockName = 'notification_cron_lock'
  
  // Tentar limpar lock antigo (timeout de 5 min)
  await supabase
    .from('cron_locks')
    .delete()
    .match({ name: lockName })
    .lt('locked_at', new Date(Date.now() - 5 * 60000).toISOString())

  // Tentar adquirir lock
  const { error: lockError } = await supabase
    .from('cron_locks')
    .insert({ name: lockName })

  if (lockError) {
    console.log('Another instance is already running. Aborting.')
    return new Response(JSON.stringify({ message: 'Locked' }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }

  try {
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    
    const now = new Date()
    const nowIso = now.toISOString()

    // --- 1. MATERIALIZAÇÃO (Criação de Jobs) ---
    const jobsToInsert = []

    // a) Fila de notificações manuais (notification_queue)
    // Apenas itens não enviados e que já passaram do horário
    const { data: queueItems } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('sent', false)
      .lte('trigger_at', nowIso)
    
    if (queueItems && queueItems.length > 0) {
      console.log(`Materializing ${queueItems.length} queue items`)
      for (const q of queueItems) {
        jobsToInsert.push({
          user_id: q.user_id,
          queue_id: q.id,
          payload: { title: q.title, body: q.body, url: '/dashboard', type: 'queue', queue_id: q.id },
          idempotency_key: `queue:${q.id}`,
          trigger_at: q.trigger_at,
          status: 'pending'
        })
      }
      
      // Marcar como sent imediatamente para evitar re-materialização
      const queueIds = queueItems.map(q => q.id)
      await supabase.from('notification_queue').update({ sent: true }).in('id', queueIds)
    }

    // b) Medicamentos (FONTE ÚNICA: next_dose_at)
    // Janela de busca: [trigger_at <= now + 30min] para cobrir avisos antecipados
    // Removido .gte(now - 10min) conforme solicitado
    const thirtyMinAhead = new Date(now.getTime() + 30 * 60000).toISOString()
    const { data: meds } = await supabase
      .from('medications')
      .select('*')
      .not('next_dose_at', 'is', null)
      .lte('next_dose_at', thirtyMinAhead)
    
    if (meds) {
      for (const m of meds) {
        const nextDose = new Date(m.next_dose_at)
        
        // NORMALIZAÇÃO DO TIMESTAMP (Segundos e Milissegundos = 0)
        const normalizedDose = new Date(nextDose)
        normalizedDose.setSeconds(0, 0)
        const normalizedDoseIso = normalizedDose.toISOString()

        const advanceMinutes = m.advance_minutes || 10
        const advanceTime = new Date(nextDose.getTime() - (advanceMinutes * 60000))
        const normalizedAdvance = new Date(advanceTime)
        normalizedAdvance.setSeconds(0, 0)

        // 1. Notificação Principal (na hora)
        if (nextDose <= now) {
          jobsToInsert.push({
            user_id: m.user_id,
            medication_id: m.id,
            payload: { 
              title: 'Hora do Medicamento 💊', 
              body: `Tomar ${m.name} (${m.dosage || ''})`, 
              type: 'medication_next_dose', 
              medication_id: m.id 
            },
            idempotency_key: `med_now:${m.id}:${normalizedDoseIso}`,
            trigger_at: m.next_dose_at,
            status: 'pending'
          })
        }

        // 2. Aviso Antecipado (X minutos antes)
        if (advanceTime <= now) {
          jobsToInsert.push({
            user_id: m.user_id,
            medication_id: m.id,
            payload: { 
              title: 'Aviso Antecipado ⏰', 
              body: `Em ${advanceMinutes} min: ${m.name}`, 
              type: 'medication_advance', 
              medication_id: m.id 
            },
            idempotency_key: `med_adv:${m.id}:${normalizedDoseIso}`,
            trigger_at: advanceTime.toISOString(),
            status: 'pending'
          })
        }
      }
    }

    // Inserção Idempotente (UNIQUE INDEX garante que não duplica)
    if (jobsToInsert.length > 0) {
      console.log(`Inserting ${jobsToInsert.length} potential jobs`)
      const { error: upsertError } = await supabase.from('notification_jobs').upsert(jobsToInsert, { 
        onConflict: 'idempotency_key',
        ignoreDuplicates: true 
      })
      if (upsertError) console.error('Error upserting jobs:', upsertError)
    }

    // --- 2. CLAIM (Controle de Concorrência via RPC com FOR UPDATE SKIP LOCKED) ---
    const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_notification_jobs', {
      batch_size: 50,
      now_iso: nowIso
    })

    if (claimError) {
      console.error('Error claiming jobs via RPC:', claimError)
      throw claimError
    }

    if (!claimedJobs || claimedJobs.length === 0) {
      console.log('No jobs to process.')
    } else {
      console.log(`Processing ${claimedJobs.length} claimed jobs`)

      // --- 3. PROCESSAMENTO (Envio) ---
      const uniqueUserIds = [...new Set(claimedJobs.map(j => j.user_id))]
      const { data: allSubs } = await supabase
        .from('push_subscriptions')
        .select('user_id, subscription, endpoint')
        .in('user_id', uniqueUserIds)

      for (const job of claimedJobs) {
        const userSubs = allSubs?.filter(s => s.user_id === job.user_id) || []
        
        // DEDUPLICAÇÃO EM MEMÓRIA POR ENDPOINT
        const uniqueEndpoints = new Map()
        for (const s of userSubs) {
          if (!uniqueEndpoints.has(s.endpoint)) {
            uniqueEndpoints.set(s.endpoint, s.subscription)
          }
        }

        let success = 0
        let lastErr = null

        for (const [endpoint, subscription] of uniqueEndpoints.entries()) {
          try {
            await webpush.sendNotification(subscription, JSON.stringify(job.payload))
            success++
          } catch (err) {
            lastErr = err.message
            console.error(`Push error for endpoint ${endpoint}:`, err)
            // Se a assinatura expirou, remover
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
            }
          }
        }

        // Atualização final com controle de retry
        const maxAttempts = 3
        const newAttempts = (job.attempts || 0) + 1
        const finalStatus = success > 0 ? 'sent' : (newAttempts >= maxAttempts ? 'failed' : 'pending')

        await supabase.from('notification_jobs').update({ 
          status: finalStatus,
          attempts: newAttempts,
          error_message: success > 0 ? null : lastErr,
          processed_at: new Date().toISOString()
        }).eq('id', job.id)
      }
    }

    // --- 4. LIMPEZA AUTOMÁTICA (Jobs com mais de 7 dias) ---
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('notification_jobs')
      .delete()
      .lt('processed_at', sevenDaysAgo)

    return new Response(JSON.stringify({ success: true, processed: claimedJobs?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Global error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  } finally {
    // LIBERAR LOCK
    await supabase.from('cron_locks').delete().match({ name: lockName })
  }
})
