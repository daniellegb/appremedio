import { supabase } from '../lib/supabase';
import { DoseEvent, Medication } from '../../types';
import { getNextDoseAt } from '../domain/medicationRules';

const mapToCamelCase = (record: any): DoseEvent => ({
  id: record.id,
  medicationId: record.medication_id,
  date: record.date,
  scheduledTime: record.scheduled_time,
  status: record.status
});

const mapMedToCamelCase = (med: any): Medication => ({
  id: med.id,
  name: med.name,
  dosage: med.dosage,
  unit: med.unit,
  usageCategory: med.usage_category,
  dosesPerDay: med.doses_per_day,
  intervalDays: med.interval_days,
  times: med.times,
  intervalType: med.interval_type,
  contraceptiveType: med.contraceptive_type,
  startDate: med.start_date,
  endDate: med.end_date,
  durationDays: med.duration_days,
  maxDosesPerDay: med.max_doses_per_day,
  totalStock: med.total_stock,
  currentStock: med.current_stock,
  expiryDate: med.expiry_date,
  notes: med.notes,
  color: med.color,
  frequency: med.frequency || 1,
  next_dose_at: med.next_dose_at
});

export const consumptionService = {
  async getConsumptionRecords(userId: string) {
    const { data, error } = await supabase
      .from('consumption_records')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('scheduled_time', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapToCamelCase);
  },

  async createConsumptionRecord(userId: string, data: Omit<DoseEvent, 'id'>) {
    const { data: created, error } = await supabase
      .from('consumption_records')
      .insert([{ 
        medication_id: data.medicationId,
        date: data.date,
        scheduled_time: data.scheduledTime,
        status: data.status,
        user_id: userId 
      }])
      .select()
      .single();

    if (error) throw error;

    // Se a dose foi tomada, atualizar o estoque e a próxima dose do medicamento
    if (data.status === 'taken') {
      const { data: med } = await supabase
        .from('medications')
        .select('*')
        .eq('id', data.medicationId)
        .single();

      if (med) {
        const currentStock = Math.max(0, (med.current_stock || 0) - 1);
        const nextDoseAt = getNextDoseAt(mapMedToCamelCase(med));

        await supabase
          .from('medications')
          .update({ 
            current_stock: currentStock,
            next_dose_at: nextDoseAt
          })
          .eq('id', med.id);
      }
    }

    return mapToCamelCase(created);
  },

  async deleteConsumptionRecord(userId: string, id: string) {
    const { error } = await supabase
      .from('consumption_records')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async updateConsumptionRecord(userId: string, id: string, data: Partial<DoseEvent>) {
    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.scheduledTime !== undefined) updateData.scheduled_time = data.scheduledTime;
    if (data.medicationId !== undefined) updateData.medication_id = data.medicationId;

    const { data: updated, error } = await supabase
      .from('consumption_records')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return mapToCamelCase(updated);
  }
};
