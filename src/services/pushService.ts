import { supabase } from '../lib/supabase';
import { PushSubscriptionData } from '../../types';

export const pushService = {
  async saveSubscription(userId: string, subscription: PushSubscription) {
    const subData = subscription.toJSON();
    if (!subData.endpoint) {
      throw new Error('Invalid subscription object');
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: subData.endpoint,
        subscription: subData
      }, { onConflict: 'user_id, endpoint' });

    if (error) throw error;
    return data;
  },

  async deleteSubscription(endpoint: string) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) throw error;
  },

  async getSubscriptions(userId: string) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data as PushSubscriptionData[];
  }
};

export const subscribeUser = async (userId: string, vapidPublicKey: string) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser');
  }

  const registration = await navigator.serviceWorker.ready;
  
  // Check if already subscribed
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    await pushService.saveSubscription(userId, existingSub);
    return existingSub;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });

  await pushService.saveSubscription(userId, subscription);
  return subscription;
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
