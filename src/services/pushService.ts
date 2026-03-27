
import { supabase } from '../lib/supabase';

export const pushService = {
  async saveSubscription(userId: string, subscription: PushSubscription) {
    const subData = subscription.toJSON();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        subscription: subData,
        timezone: timezone
      }, { onConflict: 'user_id, subscription' });

    if (error) throw error;
    return data;
  },

  async deleteSubscription(endpoint: string) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .filter('subscription->>endpoint', 'eq', endpoint);

    if (error) throw error;
  },

  async syncMedicationReminders(userId: string, medications: any[]) {
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
          reminders.push({
            user_id: userId,
            medication_id: med.id,
            medication_name: med.name,
            reminder_time: time,
            active: true
          });
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

  async sendTestNotification(userId: string) {
    const { data, error } = await supabase.functions.invoke('send-reminder-notifications', {
      body: { test: true, userId }
    });
    if (error) throw error;
    return data;
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
