import { Medication } from '../../types';

/**
 * Calcula a média de doses consumidas por dia com base na categoria e horários.
 */
export const calculateDosesPerDay = (med: Medication): number => {
  const timesCount = med.times?.length || 1;
  const interval = med.intervalDays || 1;

  switch (med.usageCategory) {
    case 'continuous':
    case 'period':
      return timesCount / interval;
    case 'intervals':
      return 1 / interval;
    case 'contraceptive':
      return 1;
    case 'prn':
      return 0; // Uso eventual não tem média fixa
    default:
      return 1;
  }
};

/**
 * Calcula quantos dias o estoque atual deve durar.
 */
export const calculateDaysOfStockLeft = (med: Medication): number | null => {
  if (med.currentStock <= 0) return 0;
  if (med.usageCategory === 'prn') return null;

  const dosesPerDay = calculateDosesPerDay(med);
  if (dosesPerDay <= 0) return null;

  return Math.floor(med.currentStock / dosesPerDay);
};

/**
 * Projeta o estoque em uma data futura.
 */
export const projectStockOnDate = (med: Medication, targetDate: Date, today: Date): number => {
  const dosesPerDay = calculateDosesPerDay(med);
  const daysFromToday = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
  
  if (daysFromToday <= 0) return med.currentStock;
  
  const projectedDosesConsumed = daysFromToday * dosesPerDay;
  return Math.max(0, med.currentStock - projectedDosesConsumed);
};

/**
 * Verifica se o estoque estará esgotado em uma data específica.
 */
export const isOutOfStockOnDate = (med: Medication, targetDate: Date, today: Date): boolean => {
  const projectedStock = projectStockOnDate(med, targetDate, today);
  return projectedStock <= 0;
};

/**
 * Calcula o novo valor de estoque após uma alteração de status de dose.
 */
export const getUpdatedStock = (currentStock: number, newStatus: 'taken' | 'pending'): number => {
  return Math.max(0, currentStock + (newStatus === 'taken' ? -1 : 1));
};
