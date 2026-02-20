
import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentType } from '../types';
import { ChevronLeft, Stethoscope, TestTubeDiagonal, User, Calendar, Clock, MapPin } from 'lucide-react';

interface Props {
  onSave: (appointment: Appointment) => void;
  onCancel: () => void;
  initialData?: Appointment | null;
}

const AddAppointment: React.FC<Props> = ({ onSave, onCancel, initialData }) => {
  const [type, setType] = useState<AppointmentType>('Consulta');
  const [formData, setFormData] = useState({
    doctor: '',
    specialty: '',
    date: '',
    time: '',
    location: '',
    notes: ''
  });

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setFormData({
        doctor: initialData.doctor,
        specialty: initialData.specialty,
        date: initialData.date,
        time: initialData.time,
        location: initialData.location,
        notes: initialData.notes || ''
      });
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const appToSave: Appointment = {
      id: initialData ? initialData.id : Math.random().toString(36).substr(2, 9),
      type,
      ...formData
    };
    onSave(appToSave);
  };

  return (
    <div className="max-w-2xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onCancel}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold">{initialData ? 'Editar Compromisso' : 'Novo Compromisso'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type Selector */}
        <div className="bg-white p-2 rounded-2xl border border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={() => setType('Consulta')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
              type === 'Consulta' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Stethoscope size={18} />
            Consulta
          </button>
          <button
            type="button"
            onClick={() => setType('Exame')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
              type === 'Exame' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-100' 
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <TestTubeDiagonal size={18} />
            Exame
          </button>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-5">
          {/* Doctor / Facility */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <User size={14} /> {type === 'Consulta' ? 'Médico' : 'Local/Laboratório'}
            </label>
            <input
              required
              className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder={type === 'Consulta' ? 'Ex: Dr. Armando' : 'Ex: Lab Labor'}
              value={formData.doctor}
              onChange={e => setFormData({...formData, doctor: e.target.value})}
            />
          </div>

          {/* Specialty / Procedure */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Stethoscope size={14} /> {type === 'Consulta' ? 'Especialidade' : 'Tipo de Exame'}
            </label>
            <input
              required
              className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder={type === 'Consulta' ? 'Ex: Cardiologia' : 'Ex: Sangue / Imagem'}
              value={formData.specialty}
              onChange={e => setFormData({...formData, specialty: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Calendar size={14} /> Data
              </label>
              <input
                required
                type="date"
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} /> Hora
              </label>
              <input
                required
                type="time"
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.time}
                onChange={e => setFormData({...formData, time: e.target.value})}
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <MapPin size={14} /> Endereço
            </label>
            <input
              className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Ex: Av. Principal, 123"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
        >
          {initialData ? 'Salvar Alterações' : 'Confirmar Agendamento'}
        </button>
      </form>
    </div>
  );
};

export default AddAppointment;
