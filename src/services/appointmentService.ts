import { supabase } from '../lib/supabase';
import { Appointment } from '../../types';

const mapToCamelCase = (app: any): Appointment => ({
  id: app.id,
  type: app.type,
  doctor: app.doctor,
  specialty: app.specialty,
  date: app.date,
  time: app.time,
  location: app.location,
  notes: app.notes
});

const nullIfEmpty = (val: string | undefined | null) => {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
};

export const appointmentService = {
  async getAppointments(userId: string) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapToCamelCase);
  },

  async createAppointment(userId: string, data: Omit<Appointment, 'id'>) {
    const { data: created, error } = await supabase
      .from('appointments')
      .insert([{ 
        type: data.type,
        doctor: data.doctor,
        specialty: data.specialty,
        date: nullIfEmpty(data.date),
        time: data.time,
        location: data.location,
        notes: data.notes,
        user_id: userId 
      }])
      .select()
      .single();

    if (error) throw error;
    return mapToCamelCase(created);
  },

  async updateAppointment(userId: string, id: string, data: Partial<Appointment>) {
    const updateData: any = { ...data };
    if (data.date !== undefined) updateData.date = nullIfEmpty(data.date);

    const { data: updated, error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return mapToCamelCase(updated);
  },

  async deleteAppointment(userId: string, id: string) {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
};
