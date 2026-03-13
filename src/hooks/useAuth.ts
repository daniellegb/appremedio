import { useAuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export const useAuth = () => {
  const { user, session, profile, loading, signOut, isConfigured, refreshProfile } = useAuthContext();

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error('Supabase signUp error:', error);
        throw error;
      }
      return data;
    } catch (err) {
      console.error('Catch block signUp error:', err);
      throw err;
    }
  };

  return {
    user,
    session,
    loading,
    isAuthenticated: !!user,
    onboardingCompleted: profile?.onboarding_completed ?? false,
    profile,
    signOut,
    signIn,
    signUp,
    isConfigured,
    refreshProfile
  };
};
