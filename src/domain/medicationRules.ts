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

export interface ScheduledDose {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

/**
 * Calcula a distribuição de doses para medicamentos do tipo "por período".
 * A distribuição é baseada na contagem real de doses a partir do primeiro horário cadastrado.
 */
export const calculatePeriodDoses = (
  startDate: string,
  startTime: string,
  times: string[],
  totalDoses: number
): ScheduledDose[] => {
  const doses: ScheduledDose[] = [];
  if (!startDate || !startTime || !times || times.length === 0 || totalDoses <= 0) {
    return doses;
  }
  const startIndex = times.indexOf(startTime);
  if (startIndex === -1) {
    return doses;
  }
  let currentDate = new Date(startDate + 'T12:00:00');
  let currentIndex = startIndex;
  let dosesRemaining = totalDoses;
  while (dosesRemaining > 0) {
    const dateStr = currentDate.toISOString().split('T')[0];
    doses.push({
      date: dateStr,
      time: times[currentIndex]
    });
    dosesRemaining--;
    currentIndex++;
    if (currentIndex >= times.length) {
      currentIndex = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  return doses;
};

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

/**
 * Calcula a próxima dose programada com base nas regras do medicamento.
 */
export const getNextDoseAt = (med: Medication, referenceDate: Date = new Date()): string | null => {
  if (med.usageCategory === 'prn' || !med.times || med.times.length === 0) {
    return null;
  }

  const now = referenceDate;
  const todayStr = now.toISOString().split('T')[0];
  
  // Se houver data de término e já passou, não há próxima dose
  if (med.endDate && new Date(med.endDate + 'T23:59:59') < now) {
    return null;
  }

  // Se houver data de início e ainda não chegou, a primeira dose é na data de início
  const startDate = med.startDate ? new Date(med.startDate + 'T00:00:00') : now;
  
  // Ordenar horários
  const sortedTimes = [...med.times].sort();

  // Caso 1: Contínuo ou Período
  if (med.usageCategory === 'continuous' || med.usageCategory === 'period') {
    const intervalDays = med.intervalDays || 1;
    
    // Procurar o próximo horário hoje
    for (const time of sortedTimes) {
      const doseDateTime = new Date(`${todayStr}T${time}:00`);
      if (doseDateTime > now && doseDateTime >= startDate) {
        return doseDateTime.toISOString();
      }
    }

    // Se não houver mais hoje, procurar no próximo dia válido
    let nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + 1);
    
    // Se for intervalo de dias (ex: a cada 2 dias), precisamos calcular o deslocamento desde o início
    if (med.usageCategory === 'continuous' && intervalDays > 1 && med.startDate) {
      const start = new Date(med.startDate + 'T00:00:00');
      const diffTime = Math.abs(nextDate.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const remainder = diffDays % intervalDays;
      if (remainder !== 0) {
        nextDate.setDate(nextDate.getDate() + (intervalDays - remainder));
      }
    }

    const nextDateStr = nextDate.toISOString().split('T')[0];
    return new Date(`${nextDateStr}T${sortedTimes[0]}:00`).toISOString();
  }

  // Caso 2: Grandes Intervalos
  if (med.usageCategory === 'intervals') {
    const intervalDays = med.intervalDays || 1;
    const start = med.startDate ? new Date(med.startDate + 'T' + med.times[0] + ':00') : now;
    
    if (start > now) return start.toISOString();

    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const intervalsPassed = Math.floor(diffDays / intervalDays) + 1;
    
    const nextDate = new Date(start);
    nextDate.setDate(nextDate.getDate() + (intervalsPassed * intervalDays));
    return nextDate.toISOString();
  }

  // Caso 3: Anticoncepcional (Simplificado para o próximo horário)
  if (med.usageCategory === 'contraceptive') {
    // Lógica similar ao contínuo, mas ignorando pausas por enquanto (MVP)
    for (const time of sortedTimes) {
      const doseDateTime = new Date(`${todayStr}T${time}:00`);
      if (doseDateTime > now) return doseDateTime.toISOString();
    }
    let nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    return new Date(`${nextDateStr}T${sortedTimes[0]}:00`).toISOString();
  }

  return null;
};
