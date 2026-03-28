
import { supabase } from '../lib/supabase';

export const pushService = {
  async saveSubscription(userId: string, subscription: PushSubscription) {
    const subData = subscription.toJSON();
    const endpoint = subData.endpoint;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Garantir que o endpoint seja enviado como uma coluna separada para o upsert
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        subscription: subData,
        endpoint: endpoint, // Coluna TEXT dedicada para unicidade
        timezone: timezone
      }, { 
        onConflict: 'user_id, endpoint' // Agora o PostgreSQL encontrará o índice UNIQUE correspondente
      });

    if (error) {
      console.error("Erro ao salvar assinatura push:", error);
      throw error;
    }
    return data;
  },

  async deleteSubscription(endpoint: string) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) throw error;
  },

  async syncMedicationReminders(userId: string, medications: any[], preNotificationMinutes: number = 0) {
    // 1. Remover lembretes antigos
    await supabase
      .from('medication_reminders')
      .delete()
      .eq('user_id', userId);

    // 2. Criar novos lembretes baseados nos horários dos medicamentos
    const reminders: any[] = [];
    
    medications.forEach(med => {
      if (med.times && Array.isArray(med.times)) {
        med.times.forEach((time: string) => {
          // Lembrete na hora exata
          reminders.push({
            user_id: userId,
            medication_id: med.id,
            medication_name: med.name,
            reminder_time: time,
            active: true,
            message_template: `Hora de tomar ${med.name}`
          });

          // Lembrete antecipado (se configurado)
          if (preNotificationMinutes > 0) {
            const [hours, minutes] = time.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            date.setMinutes(date.getMinutes() - preNotificationMinutes);
            
            const preTime = date.toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false 
            });

            reminders.push({
              user_id: userId,
              medication_id: med.id,
              medication_name: med.name,
              reminder_time: preTime,
              active: true,
              message_template: `Faltam ${preNotificationMinutes} minutos para tomar ${med.name}`
            });
          }
        });
      }
    });

    if (reminders.length > 0) {
      const { error } = await supabase
        .from('medication_reminders')
        .insert(reminders);
      if (error) throw error;
    }
  },

  async checkVapidMatch() {
    try {
      const clientVapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      const { data, error } = await supabase.functions.invoke('send-reminder-notifications', {
        body: { 
          debug: true, 
          clientEnv: { 
            VAPID_PUBLIC_KEY: clientVapid,
            SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL
          } 
        }
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Erro ao verificar VAPID match:", err);
      return null;
    }
  },

  async sendTestNotification(userId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('send-reminder-notifications', {
        body: { test: true, userId }
      });
      
      if (error) {
        console.error("Erro detalhado da Edge Function:", error);
        // Se for erro de autenticação (401), pode ser que o JWT não esteja sendo enviado ou seja inválido
        if (error.status === 401) {
          throw new Error("Não autorizado (401). Verifique se você está logado e se a função foi implantada corretamente.");
        }
        throw error;
      }
      return data;
    } catch (err: any) {
      console.error("Erro ao invocar Edge Function:", err);
      throw err;
    }
  },

  async getDebugInfo() {
    try {
      const { data, error } = await supabase.functions.invoke('send-reminder-notifications', {
        method: 'GET',
        headers: { 'x-debug-request': 'true' }
      });
      return { data, error };
    } catch (err) {
      return { error: err };
    }
  }
};

export const subscribeUser = async (userId: string, vapidPublicKey: string) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser');
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permission not granted');
    }

    let subscription = await registration.pushManager.getSubscription();
    
    // Se já existe uma subscrição, vamos verificar se a chave é a mesma.
    // Se as chaves mudaram, precisamos cancelar a antiga e criar uma nova.
    if (subscription) {
      const currentKey = subscription.options.applicationServerKey;
      const newKey = urlBase64ToUint8Array(vapidPublicKey);
      
      // Comparar as chaves (Uint8Array)
      const keysMatch = currentKey && 
        currentKey.byteLength === newKey.byteLength &&
        newKey.every((val, i) => val === new Uint8Array(currentKey)[i]);
        
      if (!keysMatch) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }

    await pushService.saveSubscription(userId, subscription);
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push:', error);
    throw error;
  }
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
