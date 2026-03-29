import { supabase } from '../lib/supabase';
import { AppSettings } from '../../types';

export const settingsService = {
  async getSettings(userId: string): Promise<Partial<AppSettings> | null> {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data.settings as Partial<AppSettings>;
  },

  async updateSettings(userId: string, settings: AppSettings): Promise<void> {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        settings: settings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;
  },

  subscribeToSettings(userId: string, onUpdate: (settings: Partial<AppSettings>) => void) {
    return supabase
      .channel(`user_settings:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (payload.new && (payload.new as any).settings) {
            onUpdate((payload.new as any).settings as Partial<AppSettings>);
          }
        }
      )
      .subscribe();
  }
};
