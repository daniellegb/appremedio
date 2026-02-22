import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  updated_at: string;
}

export const profileService = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data as Profile;
  },

  async updateProfile(userId: string, data: Partial<Profile>) {
    const { data: updated, error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return updated as Profile;
  }
};
