
/**
 * Retorna uma nova instância da data configurada para meia-noite.
 */
export const getMidnight = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Verifica se a data fornecida é anterior a hoje.
 */
export const isPastDate = (date: Date, today: Date): boolean => {
  return getMidnight(date) < getMidnight(today);
};

/**
 * Verifica se a data fornecida é posterior a hoje.
 */
export const isFutureDate = (date: Date, today: Date): boolean => {
  return getMidnight(date) > getMidnight(today);
};

/**
 * Verifica se a data fornecida é exatamente hoje.
 */
export const isTodayDate = (date: Date, today: Date): boolean => {
  return getMidnight(date).getTime() === getMidnight(today).getTime();
};

export type CalendarDisplayMode = 'STATUS' | 'CONSUMPTION';

/**
 * Decide se o calendário deve exibir o status do medicamento ou o registro de consumo.
 */
export const getCalendarDisplayMode = (params: {
  date: Date;
  today: Date;
  hasActivity: boolean;
  isPrn: boolean;
}): CalendarDisplayMode => {
  const { date, today, hasActivity, isPrn } = params;

  if (isFutureDate(date, today)) {
    return 'STATUS';
  }

  // Se for hoje e não houver atividade registrada (e não for PRN), mostramos status
  if (isTodayDate(date, today) && !isPrn && !hasActivity) {
    return 'STATUS';
  }

  // Caso contrário (passado ou hoje com atividade), mostramos consumo
  return 'CONSUMPTION';
};
