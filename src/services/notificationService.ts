
import { supabase } from '../lib/supabase';

export const notificationService = {
  async scheduleMedicationNotification(userId: string, medicationId: string, medicationName: string, dosage: string, triggerAt: string) {
    // Evitar duplicatas para o mesmo horário e medicamento
    const { data: existing } = await supabase
      .from('notification_queue')
      .select('id')
      .eq('medication_id', medicationId)
      .eq('trigger_at', triggerAt)
      .eq('sent', false)
      .maybeSingle();

    if (existing) return;

    const { error } = await supabase
      .from('notification_queue')
      .insert([{
        user_id: userId,
        medication_id: medicationId,
        title: 'Hora do Medicamento 💊',
        body: `Lembrete: Tomar ${medicationName} (${dosage})`,
        trigger_at: triggerAt,
        sent: false
      }]);

    if (error) console.error('Error scheduling notification:', error);
  },

  async scheduleAppointmentNotification(userId: string, appointmentId: string, title: string, type: string, triggerAt: string) {
    const { error } = await supabase
      .from('notification_queue')
      .insert([{
        user_id: userId,
        appointment_id: appointmentId,
        title: `Lembrete de ${type} 🏥`,
        body: `${title} agendado para amanhã`,
        trigger_at: triggerAt,
        sent: false
      }]);

    if (error) console.error('Error scheduling appointment notification:', error);
  },

  async deleteAllNotifications(userId: string) {
    const { error } = await supabase
      .from('notification_queue')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }
};
