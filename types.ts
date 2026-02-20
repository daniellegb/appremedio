
export type MedicationUnit = 'comprimido' | 'gota' | 'ml' | 'dose';
export type UsageCategory = 'continuous' | 'period' | 'intervals' | 'contraceptive' | 'prn';
export type IntervalType = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'quadrimesterly' | 'custom';
export type ContraceptiveType = 'daily' | '21_7' | '24_4' | '28_continuous';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  unit: MedicationUnit;
  frequency: number; // mantido para compatibilidade legado
  usageCategory?: UsageCategory;
  dosesPerDay?: string; // '1x', '2x', ..., 'custom'
  intervalDays?: number; // 1 a 6 ou X dias
  times?: string[];
  intervalType?: IntervalType;
  contraceptiveType?: ContraceptiveType;
  startDate?: string;
  endDate?: string;
  durationDays?: number; // Added for 'period' category
  maxDosesPerDay?: number;
  totalStock: number;
  currentStock: number;
  expiryDate?: string;
  notes?: string;
  color: string;
}

export type AppointmentType = 'Consulta' | 'Exame';

export interface Appointment {
  id: string;
  type: AppointmentType;
  doctor: string;
  specialty: string;
  date: string;
  time: string;
  location: string;
  notes?: string;
}

export interface DoseEvent {
  id: string;
  medicationId: string;
  date: string; // YYYY-MM-DD
  scheduledTime: string;
  status: 'pending' | 'taken' | 'missed';
}

export interface AppSettings {
  thresholdExpiring: number;
  thresholdRunningOut: number;
  showDelayDisclaimer: boolean;
}

export type ViewType = 'dashboard' | 'calendar' | 'meds' | 'appointments' | 'settings' | 'add-appointment' | 'add-med';