import { supabase } from '../lib/supabase';

export const dataService = {
  /**
   * Limpa os dados do usuário (medicamentos, consultas e notificações agendadas)
   * Mantém histórico de consumo, configurações e onboarding.
   */
  async clearUserData(userId: string) {
    // 1. Deletar todos os medicamentos
    // O cascade no banco deve cuidar dos jobs relacionados se configurado, 
    // mas vamos limpar explicitamente para garantir.
    const { error: medError } = await supabase
      .from('medications')
      .delete()
      .eq('user_id', userId);
    
    if (medError) {
      console.error('Erro ao deletar medicamentos:', medError);
      throw medError;
    }

    // 2. Deletar todas as consultas (inclui exames)
    const { error: appError } = await supabase
      .from('appointments')
      .delete()
      .eq('user_id', userId);
    
    if (appError) {
      console.error('Erro ao deletar consultas:', appError);
      throw appError;
    }

    // 3. Limpar todas as notificações (pendentes, enviadas, falhas)
    const { error: jobError } = await supabase
      .from('notification_jobs')
      .delete()
      .eq('user_id', userId);
    
    if (jobError) {
      console.error('Erro ao limpar notificações:', jobError);
      throw jobError;
    }

    console.log('Dados do usuário limpos com sucesso (mantendo histórico e configurações).');
  }
};
