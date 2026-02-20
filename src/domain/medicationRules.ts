import { Medication } from '../../types';

/**
 * Verifica se o medicamento está vencido com base na data de expiração e a data de referência.
 */
export const isMedicationExpired = (expiryDateStr: string | undefined, referenceDate: Date): boolean => {
  if (!expiryDateStr) return false;
  
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDateStr + 'T12:00:00');
  expiry.setHours(0, 0, 0, 0);
  
  return expiry < reference;
};

/**
 * Verifica se o medicamento está dentro do limite de dias para vencer.
 */
export const isMedicationExpiringSoon = (expiryDateStr: string | undefined, referenceDate: Date, thresholdDays: number): boolean => {
  if (!expiryDateStr) return false;
  
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDateStr + 'T12:00:00');
  expiry.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((expiry.getTime() - reference.getTime()) / (1000 * 3600 * 24));
  
  return diffDays >= 0 && diffDays <= thresholdDays;
};

/**
 * Retorna o número de dias até o vencimento.
 */
export const getDaysUntilExpiry = (expiryDateStr: string | undefined, referenceDate: Date): number | null => {
  if (!expiryDateStr) return null;
  
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDateStr + 'T12:00:00');
  expiry.setHours(0, 0, 0, 0);
  
  return Math.ceil((expiry.getTime() - reference.getTime()) / (1000 * 3600 * 24));
};

/**
 * Verifica se o medicamento tem estoque disponível.
 */
export const hasStock = (currentStock: number): boolean => {
  return currentStock > 0;
};

/**
 * Verifica se o estoque está abaixo do limite configurado.
 */
export const isStockRunningOut = (daysLeft: number | null, thresholdDays: number): boolean => {
  return daysLeft !== null && daysLeft <= thresholdDays;
};

export type MedicationStockStatus = 'OUT_OF_STOCK' | 'RUNNING_OUT' | 'AVAILABLE';
export type MedicationExpiryStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'VALID' | 'NO_DATE';

/**
 * Determina o status de estoque do medicamento.
 */
export const getStockStatusType = (med: Medication, daysLeft: number | null, thresholdDays: number): MedicationStockStatus => {
  if (!hasStock(med.currentStock)) return 'OUT_OF_STOCK';
  if (isStockRunningOut(daysLeft, thresholdDays)) return 'RUNNING_OUT';
  return 'AVAILABLE';
};

/**
 * Determina o status de validade do medicamento.
 */
export const getExpiryStatusType = (med: Medication, referenceDate: Date, thresholdDays: number): MedicationExpiryStatus => {
  if (!med.expiryDate) return 'NO_DATE';
  if (isMedicationExpired(med.expiryDate, referenceDate)) return 'EXPIRED';
  if (isMedicationExpiringSoon(med.expiryDate, referenceDate, thresholdDays)) return 'EXPIRING_SOON';
  return 'VALID';
};
