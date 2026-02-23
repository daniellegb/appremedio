import { useState } from 'react';
import { onboardingService } from '../services/onboardingService';
import { Profile, UserPreferences } from '../../types';
import { useAuthContext } from '../context/AuthContext';

export interface OnboardingState {
  step: number;
  mode: 'self' | 'caregiver' | null;
  userProfile: {
    name: string;
    caregiverName: string;
    patientName: string;
    relationship: string;
  };
  preferences: {
    expiryWarningDays: number;
    lowStockWarningDays: number;
  };
}

export const useOnboarding = () => {
  const { user } = useAuthContext();
  const [state, setState] = useState<OnboardingState>({
    step: 1,
    mode: null,
    userProfile: {
      name: '',
      caregiverName: '',
      patientName: '',
      relationship: '',
    },
    preferences: {
      expiryWarningDays: 3,
      lowStockWarningDays: 3,
    },
  });

  const nextStep = () => setState(prev => ({ ...prev, step: prev.step + 1 }));
  const prevStep = () => setState(prev => ({ ...prev, step: Math.max(1, prev.step - 1) }));

  const setMode = (mode: 'self' | 'caregiver') => {
    setState(prev => ({ ...prev, mode, step: 2 }));
  };

  const updateProfile = (profile: Partial<OnboardingState['userProfile']>) => {
    setState(prev => ({
      ...prev,
      userProfile: { ...prev.userProfile, ...profile }
    }));
  };

  const updatePreferences = (prefs: Partial<OnboardingState['preferences']>) => {
    setState(prev => ({
      ...prev,
      preferences: { ...prev.preferences, ...prefs }
    }));
  };

  const completeOnboarding = async () => {
    if (!user) throw new Error('User not authenticated');

    const profileData: Partial<Profile> & { id: string } = {
      id: user.id,
      mode: state.mode || 'self',
      name: state.mode === 'self' ? state.userProfile.name : state.userProfile.caregiverName,
      caregiver_name: state.mode === 'caregiver' ? state.userProfile.caregiverName : undefined,
      patient_name: state.mode === 'caregiver' ? state.userProfile.patientName : undefined,
      relationship: state.mode === 'caregiver' ? state.userProfile.relationship : undefined,
      onboarding_completed: true,
    };

    const preferencesData: UserPreferences = {
      user_id: user.id,
      expiry_warning_days: state.preferences.expiryWarningDays,
      low_stock_warning_days: state.preferences.lowStockWarningDays,
    };

    try {
      await onboardingService.updateProfile(profileData);
      await onboardingService.upsertPreferences(preferencesData);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  };

  return {
    state,
    setMode,
    updateProfile,
    updatePreferences,
    nextStep,
    prevStep,
    completeOnboarding,
  };
};
