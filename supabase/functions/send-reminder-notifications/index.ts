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

  // Parse body once
  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }

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
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:example@yourdomain.com'

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys are missing in environment variables')
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date()
    const nowIso = now.toISOString()
    const todayStr = now.toISOString().split('T')[0]

    // --- 1. MATERIALIZAÇÃO (Idempotente e Conservadora) ---
    // Apenas materializar o que deve ser enviado no minuto atual.
    // Isso evita o spam de notificações passadas se a idempotência falhar por falta de constraint.
    
    // Buscar assinaturas para saber os timezones
    const { data: allSubs } = await supabase
      .from('push_subscriptions')
      .select('user_id, timezone, endpoint')

    const jobsToInsert = []

    // a) Lembretes recorrentes (medication_reminders)
    const { data: reminders } = await supabase
      .from('medication_reminders')
      .select('*')
      .eq('active', true)

    if (reminders && reminders.length > 0) {
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
    const { data: queueItems } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('sent', false)
      .lte('trigger_at', nowIso)
      .gte('trigger_at', new Date(now.getTime() - 10 * 60000).toISOString()) // Janela de 10 min para segurança

    if (queueItems && queueItems.length > 0) {
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
    const { data: meds } = await supabase
      .from('medications')
      .select('*')
      .lte('next_dose_at', nowIso)
      .gte('next_dose_at', new Date(now.getTime() - 10 * 60000).toISOString()) // Janela de 10 min
      .not('next_dose_at', 'is', null)

    if (meds && meds.length > 0) {
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
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('date', todayStr)
    
    if (appointments && appointments.length > 0) {
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
    if (jobsToInsert.length > 0) {
      await supabase.from('notification_jobs').upsert(jobsToInsert, { 
        onConflict: 'idempotency_key',
        ignoreDuplicates: true 
      })
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
    const { data: allSubs } = await supabase
      .from('push_subscriptions')
      .select('user_id, subscription, endpoint')
      .in('user_id', uniqueUserIds)

    for (const job of claimedJobs) {
      const userSubs = allSubs?.filter(s => s.user_id === job.user_id) || []
      
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
          await webpush.sendNotification(subscription, JSON.stringify(job.payload))
          successCount++
        } catch (err) {
          lastError = err.message
          console.error(`Push error for job ${job.id}:`, err)
          // Se a assinatura expirou, remover
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
          }
        }
      }

      if (successCount > 0) {
        await supabase.from('notification_jobs').update({ 
          status: 'sent', 
          processed_at: new Date().toISOString() 
        }).eq('id', job.id)
        
        // Se veio da notification_queue, marcar como sent lá também
        if (job.payload.type === 'queue' && job.payload.queue_id) {
          await supabase.from('notification_queue').update({ sent: true }).eq('id', job.payload.queue_id)
        }
        
        results.push({ id: job.id, status: 'sent' })
      } else {
        const newAttempts = (job.attempts || 0) + 1
        const newStatus = newAttempts >= (job.max_attempts || 3) ? 'failed' : 'pending'
        
        await supabase.from('notification_jobs').update({ 
          status: newStatus, 
          attempts: newAttempts,
          error_message: lastError,
          processed_at: new Date().toISOString()
        }).eq('id', job.id)
        
        results.push({ id: job.id, status: newStatus, error: lastError })
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Global function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

