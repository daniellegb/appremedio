import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

console.log('Edge Function starting up...')
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

console.log('Registering serve handler...')
serve(async (req) => {
  console.log(`Incoming request: ${req.method} ${req.url}`)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url);
  const queryDebug = url.searchParams.get('debug') === 'true' || req.headers.get('x-debug-request') === 'true';
  console.log(`Request URL: ${url.toString()}, Debug Mode: ${queryDebug}`)

  // Parse body once
  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

  console.log(`Function invoked. Method: ${req.method}, Body:`, JSON.stringify(body));

  // Simple Debug Mode
  if (queryDebug) {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    return new Response(
      JSON.stringify({
        hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
        hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        hasVapidPublic: !!vapidPublic,
        hasVapidPrivate: !!Deno.env.get('VAPID_PRIVATE_KEY'),
        vapidPublicPreview: vapidPublic ? `${vapidPublic.substring(0, 10)}...` : null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    console.log(`Supabase env present: URL=${!!supabaseUrl}, Key=${!!supabaseServiceKey}`)
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'
    
    console.log(`VAPID keys present: Public=${!!vapidPublicKey}, Private=${!!vapidPrivateKey}`)
    console.log(`Environment variables checked`)

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys are missing in environment variables')
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    console.log(`VAPID details set with subject: ${vapidSubject}`)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log(`Supabase client initialized`)
    const now = new Date()
    const nowIso = now.toISOString()
    const todayStr = now.toISOString().split('T')[0]
    console.log(`Current time (ISO): ${nowIso}, Today: ${todayStr}`)

    // --- 0. TEST NOTIFICATION HANDLING ---
    if (body.test && body.userId) {
      console.log(`Sending test notification to user: ${body.userId}`)
      const { data: testSubs } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', body.userId)

      if (!testSubs || testSubs.length === 0) {
        return new Response(JSON.stringify({ error: 'No push subscriptions found for this user' }), {
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

    // --- 1. MATERIALIZAÇÃO (Idempotente e Conservadora) ---
    // Apenas materializar o que deve ser enviado no minuto atual.
    // Isso evita o spam de notificações passadas se a idempotência falhar por falta de constraint.
    
    // Buscar assinaturas para saber os timezones
    const { data: allSubs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('user_id, timezone, endpoint')
    
    if (subsError) console.error('Error fetching subscriptions:', subsError)
    console.log(`Found ${allSubs?.length || 0} push subscriptions for timezone mapping`)

    const jobsToInsert = []

    // a) Lembretes recorrentes (medication_reminders)
    const { data: reminders, error: remindersError } = await supabase
      .from('medication_reminders')
      .select('*')
      .eq('active', true)
    
    if (remindersError) console.error('Error fetching reminders:', remindersError)
    if (reminders && reminders.length > 0) {
      console.log(`Checking ${reminders.length} active reminders`)
      for (const r of reminders) {
        const userSubs = allSubs?.filter(s => s.user_id === r.user_id) || []
        if (userSubs.length === 0) continue;

        // Usar o timezone da primeira assinatura (ou UTC)
        const timezone = userSubs[0].timezone || 'UTC'
        const userTime = now.toLocaleTimeString('pt-BR', {
          timeZone: timezone,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        })
        const reminderTimeShort = r.reminder_time.substring(0, 5)
        
        if (queryDebug) {
          console.log(`Checking reminder for user ${r.user_id}: Timezone=${timezone}, UserTime=${userTime}, ReminderTime=${reminderTimeShort}`)
        }

        // SÓ MATERIALIZA SE FOR O MINUTO EXATO (ou janela de 1 min)
        if (userTime === reminderTimeShort) {
          const idempotencyKey = `med_reminder:${r.id}:${todayStr}:${reminderTimeShort}`
          jobsToInsert.push({
            user_id: r.user_id,
            payload: {
              title: 'Hora do Medicamento 💊',
              body: r.message_template || `Lembrete: Tomar ${r.medication_name}`,
              url: '/dashboard',
              type: 'medication_reminder',
              medication_id: r.medication_id
            },
            idempotency_key: idempotencyKey,
            trigger_at: nowIso,
            status: 'pending'
          })
        }
      }
    }

    // b) Fila de notificações (notification_queue - one-off)
    // Aqui ainda usamos a janela de tempo, mas apenas para itens não enviados
    const { data: queueItems, error: queueError } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('sent', false)
      .lte('trigger_at', nowIso)
      .gte('trigger_at', new Date(now.getTime() - 10 * 60000).toISOString()) // Janela de 10 min para segurança
    
    if (queueError) console.error('Error fetching queue items:', queueError)
    if (queueItems && queueItems.length > 0) {
      console.log(`Adding ${queueItems.length} queue items to jobs`)
      for (const q of queueItems) {
        jobsToInsert.push({
          user_id: q.user_id,
          payload: {
            title: q.title,
            body: q.body,
            url: '/dashboard',
            type: 'queue',
            queue_id: q.id
          },
          idempotency_key: `queue:${q.id}`,
          trigger_at: q.trigger_at,
          status: 'pending'
        })
      }
    }

    // c) Medicamentos (medications - next_dose_at)
    const { data: meds, error: medsError } = await supabase
      .from('medications')
      .select('*')
      .lte('next_dose_at', nowIso)
      .gte('next_dose_at', new Date(now.getTime() - 10 * 60000).toISOString()) // Janela de 10 min
      .not('next_dose_at', 'is', null)
    
    if (medsError) console.error('Error fetching medications:', medsError)
    if (meds && meds.length > 0) {
      console.log(`Adding ${meds.length} medications to jobs`)
      for (const m of meds) {
        jobsToInsert.push({
          user_id: m.user_id,
          payload: {
            title: 'Hora do Medicamento 💊',
            body: `Lembrete: Tomar ${m.name} (${m.dosage || ''})`,
            url: '/dashboard',
            type: 'medication_next_dose',
            medication_id: m.id
          },
          idempotency_key: `med_next_dose:${m.id}:${m.next_dose_at}`,
          trigger_at: m.next_dose_at,
          status: 'pending'
        })
      }
    }

    // d) Consultas (appointments - próximas 24h)
    // Só materializa se for 08:00 no timezone do usuário (ou UTC se não houver)
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('*')
      .eq('date', todayStr)
    
    if (appointmentsError) console.error('Error fetching appointments:', appointmentsError)
    if (appointments && appointments.length > 0) {
      console.log(`Checking ${appointments.length} appointments for today`)
      for (const a of appointments) {
        const userSubs = allSubs?.filter(s => s.user_id === a.user_id) || []
        const timezone = userSubs[0]?.timezone || 'UTC'
        const userHour = now.toLocaleTimeString('pt-BR', {
          timeZone: timezone,
          hour12: false,
          hour: '2-digit'
        })
        const userMinute = now.toLocaleTimeString('pt-BR', {
          timeZone: timezone,
          hour12: false,
          minute: '2-digit'
        })

        // Notificar apenas às 08:00 da manhã do dia da consulta
        if (userHour === '08' && userMinute === '00') {
          jobsToInsert.push({
            user_id: a.user_id,
            payload: {
              title: `Lembrete de ${a.type || 'Consulta'} 🏥`,
              body: `${a.doctor || 'Consulta'} agendada para hoje às ${a.time || ''}`,
              url: '/appointments',
              type: 'appointment',
              appointment_id: a.id
            },
            idempotency_key: `appointment:${a.id}:${a.date}`,
            trigger_at: nowIso,
            status: 'pending'
          })
        }
      }
    }

    // Inserir jobs (ON CONFLICT DO NOTHING)
    console.log(`Materialized ${jobsToInsert.length} jobs to insert`)
    if (jobsToInsert.length > 0) {
      const { error: upsertError } = await supabase.from('notification_jobs').upsert(jobsToInsert, { 
        onConflict: 'idempotency_key',
        ignoreDuplicates: true 
      })
      if (upsertError) console.error('Error upserting jobs:', upsertError)
    }

    // --- 2. CLAIM (Controle de Concorrência) ---
    // Usar RPC para SELECT FOR UPDATE SKIP LOCKED pois o JS SDK não suporta diretamente
    // Se o RPC não existir, usaremos uma abordagem de "claim" via UPDATE
    
    const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_notification_jobs', {
      batch_size: 20,
      now_iso: nowIso
    })

    if (claimError) {
      console.error('Error claiming jobs via RPC:', claimError)
      // Fallback: Tentar claim simples via UPDATE (menos seguro contra race conditions mas melhor que nada)
      // Nota: Em ambiente serverless real, o RPC é altamente recomendado.
    }

    if (!claimedJobs || claimedJobs.length === 0) {
      console.log('No jobs claimed for processing')
      return new Response(JSON.stringify({ message: 'No jobs to process', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Processing ${claimedJobs.length} claimed jobs`)

    // --- 3. PROCESSAMENTO (Envio) ---
    const results = []
    
    // Buscar todas as assinaturas dos usuários afetados em um único fetch
    const uniqueUserIds = [...new Set(claimedJobs.map(j => j.user_id))]
    console.log(`Fetching subscriptions for ${uniqueUserIds.length} unique users`)
    const { data: processingSubs } = await supabase
      .from('push_subscriptions')
      .select('user_id, subscription, endpoint')
      .in('user_id', uniqueUserIds)

    for (const job of claimedJobs) {
      console.log(`Processing job ${job.id} (Type: ${job.payload.type}) for user ${job.user_id}`)
      const userSubs = processingSubs?.filter(s => s.user_id === job.user_id) || []
      
      if (userSubs.length === 0) {
        await supabase.from('notification_jobs').update({ 
          status: 'failed', 
          error_message: 'No push subscriptions found',
          processed_at: new Date().toISOString()
        }).eq('id', job.id)
        continue
      }

      let successCount = 0
      let lastError = null

      for (const { subscription } of userSubs) {
        try {
          console.log(`Sending push to endpoint: ${subscription.endpoint}, Payload: ${JSON.stringify(job.payload)}`)
          await webpush.sendNotification(subscription, JSON.stringify(job.payload))
          successCount++
        } catch (err) {
          lastError = err.message
          console.error(`Push error for job ${job.id}:`, err)
          // Se a assinatura expirou, remover
          if (err.statusCode === 410 || err.statusCode === 404) {
            const { error: deleteError } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
            if (deleteError) console.error(`Error deleting expired subscription ${subscription.endpoint}:`, deleteError)
          }
        }
      }

      if (successCount > 0) {
        console.log(`Job ${job.id} sent successfully to ${successCount} subscriptions`)
        const { error: updateError } = await supabase.from('notification_jobs').update({ 
          status: 'sent', 
          processed_at: new Date().toISOString() 
        }).eq('id', job.id)
        if (updateError) console.error(`Error updating job ${job.id} to sent:`, updateError)
        
        // Se veio da notification_queue, marcar como sent lá também
        if (job.payload.type === 'queue' && job.payload.queue_id) {
          const { error: queueUpdateError } = await supabase.from('notification_queue').update({ sent: true }).eq('id', job.payload.queue_id)
          if (queueUpdateError) console.error(`Error updating queue item ${job.payload.queue_id}:`, queueUpdateError)
        }
        
        results.push({ id: job.id, status: 'sent' })
      } else {
        const newAttempts = (job.attempts || 0) + 1
        const newStatus = newAttempts >= (job.max_attempts || 3) ? 'failed' : 'pending'
        console.log(`Job ${job.id} failed. New status: ${newStatus}, Attempts: ${newAttempts}, Error: ${lastError}`)
        
        const { error: updateError } = await supabase.from('notification_jobs').update({ 
          status: newStatus, 
          attempts: newAttempts,
          error_message: lastError,
          processed_at: new Date().toISOString()
        }).eq('id', job.id)
        if (updateError) console.error(`Error updating job ${job.id} status:`, updateError)
        
        results.push({ id: job.id, status: newStatus, error: lastError })
      }
    }

    console.log(`Processed ${results.length} jobs`)
    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Global function error:', error)
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

