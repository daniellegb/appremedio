
import { GREETING_MESSAGES } from './greetingMessages';

export const greetingService = {
  /**
   * Obtém a frase do dia de forma determinística baseada na data atual.
   * @param mode O modo do perfil ('self' ou 'caregiver')
   * @returns A frase correspondente ao dia
   */
  getGreetingOfDay(mode: string = 'self', startDate?: string | Date): string {
    const key = (mode === 'caregiver') ? 'caregiver' : 'self';
    const messages = GREETING_MESSAGES[key as keyof typeof GREETING_MESSAGES] || GREETING_MESSAGES.self;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Se não houver data de início, usamos a data atual como referência (índice 0)
    const refDate = startDate ? new Date(startDate) : today;
    const normalizedRefDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    
    // Calculamos a diferença de dias
    const diffDays = Math.round((today.getTime() - normalizedRefDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // O índice é a diferença de dias, garantindo que seja positivo e dentro do range
    const index = Math.max(0, diffDays) % messages.length;
    
    return messages[index];
  }
};
