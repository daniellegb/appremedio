import { supabase } from '../lib/supabase';
import { Profile, UserPreferences } from '../../types';

export const onboardingService = {
  async updateProfile(profile: Partial<Profile> & { id: string }) {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profile);

    if (error) throw error;
    return data;
  },

  async upsertPreferences(preferences: UserPreferences) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(preferences, { onConflict: 'user_id' });

    if (error) throw error;
    return data;
  },

  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async resetOnboarding(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ onboarding_completed: false })
      .eq('id', userId);

    if (error) throw error;
    return data;
  }
};
