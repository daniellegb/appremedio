import { supabase } from '../lib/supabase';
import { DoseEvent } from '../../types';

const mapToCamelCase = (record: any): DoseEvent => ({
  id: record.id,
  medicationId: record.medication_id,
  date: record.date,
  scheduledTime: record.scheduled_time,
  status: record.status
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
