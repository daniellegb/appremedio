import React from 'react';
import { Appointment } from '../types';
import { Calendar, MapPin, Stethoscope, TestTubeDiagonal, Plus, Pencil, Trash2, Navigation, Map as MapIcon } from 'lucide-react';

interface Props {
  appointments: Appointment[];
  onAddClick: () => void;
  onEditClick: (app: Appointment) => void;
  onDeleteClick: (id: string) => void;
}

const Appointments: React.FC<Props> = ({ appointments, onAddClick, onEditClick, onDeleteClick }) => {
  const openGoogleMaps = (address: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const openWaze = (address: string) => {
    const url = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Compromissos</h2>
          <p className="text-slate-500">Consultas, exames e retornos</p>
        </div>
        <button 
          onClick={onAddClick}
          className="bg-blue-600 text-white p-3 rounded-2xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center gap-2 px-6"
        >
          <Plus size={20} />
          <span className="font-bold">Agendar</span>
        </button>
      </div>

      <div className="space-y-4">
        {appointments.map((app) => (
          <div key={app.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-md flex flex-col md:flex-row md:items-center gap-6 group hover:border-blue-200 transition-all relative overflow-hidden">
            {/* Indicador de Tipo Lateral */}
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${app.type === 'Consulta' ? 'bg-blue-500' : 'bg-purple-500'}`} />
            
            <div className="flex items-center gap-4 flex-1">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
                app.type === 'Consulta' 
                  ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white shadow-sm' 
                  : 'bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white shadow-sm'
              }`}>
                {app.type === 'Consulta' ? <Stethoscope size={30} /> : <TestTubeDiagonal size={30} />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    app.type === 'Consulta' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {app.type}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 truncate">{app.doctor}</h3>
                <p className="text-slate-500 font-medium text-sm truncate">{app.specialty}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 md:gap-10">
              {/* Seção de Data */}
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                  <Calendar size={18} />
                </div>
                <div className="flex flex-col justify-center">
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Data e Hora</div>
                  <div className="font-bold text-slate-700 text-sm whitespace-nowrap">
                    {app.date.split('-').reverse().join('/')} • {app.time}
                  </div>
                </div>
              </div>

              {/* Seção de Local */}
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                  <MapPin size={18} />
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="flex flex-col justify-center">
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Local</div>
                    <div className="font-bold text-slate-700 text-sm truncate max-w-[180px]">{app.location}</div>
                  </div>
                  
                  {app.location && (
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openGoogleMaps(app.location); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all border border-slate-100 hover:border-blue-600 shadow-sm"
                      >
                        <MapIcon size={12} />
                        Maps
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openWaze(app.location); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all border border-slate-100 hover:border-blue-600 shadow-sm"
                      >
                        <Navigation size={12} />
                        Waze
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-50">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditClick(app); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all border border-blue-100"
              >
                <Pencil size={14} />
                Editar
              </button>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeleteClick(app.id); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-100"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            </div>
          </div>
        ))}
        
        {appointments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 text-slate-400">
            <Calendar size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Nenhum compromisso marcado</p>
            <p className="text-sm">Toque em "Agendar" para registrar uma nova consulta.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Appointments;