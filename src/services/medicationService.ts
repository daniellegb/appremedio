import { supabase } from '../lib/supabase';
import { Medication } from '../../types';

const mapToCamelCase = (med: any): Medication => ({
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
  frequency: med.frequency || 1
});

const nullIfEmpty = (val: string | undefined | null) => {
  if (val === undefined || val === null || val.trim() === '') return null;
  return val;
};

export const medicationService = {
  async getMedications(userId: string) {
    const { data, error } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapToCamelCase);
  },

  async createMedication(userId: string, data: Omit<Medication, 'id'>) {
    const { data: created, error } = await supabase
      .from('medications')
      .insert([{ 
        name: data.name,
        dosage: data.dosage,
        unit: data.unit,
        usage_category: data.usageCategory,
        doses_per_day: data.dosesPerDay,
        interval_days: data.intervalDays,
        times: data.times,
        interval_type: data.intervalType,
        contraceptive_type: data.contraceptiveType,
        start_date: nullIfEmpty(data.startDate),
        end_date: nullIfEmpty(data.endDate),
        duration_days: data.durationDays,
        max_doses_per_day: data.maxDosesPerDay,
        total_stock: data.totalStock,
        current_stock: data.currentStock,
        expiry_date: nullIfEmpty(data.expiryDate),
        notes: data.notes,
        color: data.color,
        frequency: data.frequency || 1,
        user_id: userId 
      }])
      .select()
      .single();

    if (error) throw error;
    return mapToCamelCase(created);
  },

  async updateMedication(userId: string, id: string, data: Partial<Medication>) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.dosage !== undefined) updateData.dosage = data.dosage;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.usageCategory !== undefined) updateData.usage_category = data.usageCategory;
    if (data.dosesPerDay !== undefined) updateData.doses_per_day = data.dosesPerDay;
    if (data.intervalDays !== undefined) updateData.interval_days = data.intervalDays;
    if (data.times !== undefined) updateData.times = data.times;
    if (data.intervalType !== undefined) updateData.interval_type = data.intervalType;
    if (data.contraceptiveType !== undefined) updateData.contraceptive_type = data.contraceptiveType;
    if (data.startDate !== undefined) updateData.start_date = nullIfEmpty(data.startDate);
    if (data.endDate !== undefined) updateData.end_date = nullIfEmpty(data.endDate);
    if (data.durationDays !== undefined) updateData.duration_days = data.durationDays;
    if (data.maxDosesPerDay !== undefined) updateData.max_doses_per_day = data.maxDosesPerDay;
    if (data.totalStock !== undefined) updateData.total_stock = data.totalStock;
    if (data.currentStock !== undefined) updateData.current_stock = data.currentStock;
    if (data.expiryDate !== undefined) updateData.expiry_date = nullIfEmpty(data.expiryDate);
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;

    const { data: updated, error } = await supabase
      .from('medications')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return mapToCamelCase(updated);
  },

  async deleteMedication(userId: string, id: string) {
    const { error } = await supabase
      .from('medications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
};
