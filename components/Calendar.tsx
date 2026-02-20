
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, List, Stethoscope, TestTubeDiagonal, Pill, Check, X, AlertCircle, BadgeCheck } from 'lucide-react';
import { Appointment, Medication, DoseEvent } from '../types';

type CalendarViewMode = 'monthly' | 'weekly';

interface Props {
  appointments: Appointment[];
  meds: Medication[];
  doses: DoseEvent[];
}

const Calendar: React.FC<Props> = ({ appointments, meds, doses }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('monthly');
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getAppointmentsForDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return appointments.filter(app => app.date === dateStr);
  };

  const getMedsForDate = (date: Date) => {
    const dateAtMidnight = new Date(date);
    dateAtMidnight.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${dateAtMidnight.getFullYear()}-${String(dateAtMidnight.getMonth() + 1).padStart(2, '0')}-${String(dateAtMidnight.getDate()).padStart(2, '0')}`;

    const isPastDate = dateAtMidnight < today;
    const isFutureDate = dateAtMidnight > today;
    const isTodayDate = dateAtMidnight.getTime() === today.getTime();

    return meds.filter(med => {
      // Se for PRN, só exibe se houver dose registrada para esta data
      if (med.usageCategory === 'prn') {
        return doses.some(d => d.medicationId === med.id && d.date === dateStr);
      }

      const startDate = med.startDate ? new Date(med.startDate + 'T00:00:00') : null;
      const endDate = med.endDate ? new Date(med.endDate + 'T23:59:59') : null;

      if (!startDate) return true;

      const startAtMidnight = new Date(startDate);
      startAtMidnight.setHours(0,0,0,0);

      if (dateAtMidnight < startAtMidnight) return false;
      
      if (endDate) {
        const endAtMidnight = new Date(endDate);
        endAtMidnight.setHours(0,0,0,0);
        if (dateAtMidnight > endAtMidnight) return false;
      }

      const diffTime = dateAtMidnight.getTime() - startAtMidnight.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      const interval = med.intervalDays || 1;
      
      return diffDays % interval === 0;
    }).map(med => {
      // Determinar o indicador visual baseado na regra
      let indicator: { type: 'status' | 'consumption', color: string, icon?: any, label?: string } = { type: 'status', color: 'bg-slate-400' };

      // Para PRN, os horários exibidos são os horários das doses registradas
      const displayTimes = med.usageCategory === 'prn'
        ? doses.filter(d => d.medicationId === med.id && d.date === dateStr).map(d => d.scheduledTime).sort()
        : (med.times || []);

      if (isFutureDate) {
        // Regra de Futuro: Status do medicamento projetado para a data
        const expiry = med.expiryDate ? new Date(med.expiryDate + 'T23:59:59') : null;
        const isExpiredOnDate = expiry && expiry < dateAtMidnight;

        // Cálculo de projeção de estoque
        let dosesPerDay = 1;
        const timesCount = med.times?.length || 1;
        const interval = med.intervalDays || 1;
        switch (med.usageCategory) {
          case 'continuous':
          case 'period': dosesPerDay = timesCount / interval; break;
          case 'intervals': dosesPerDay = 1 / interval; break;
          default: dosesPerDay = 1;
        }

        const daysFromToday = Math.floor((dateAtMidnight.getTime() - today.getTime()) / (1000 * 3600 * 24));
        const projectedDosesConsumed = daysFromToday * dosesPerDay;
        const isOutOfStockOnDate = (med.currentStock - projectedDosesConsumed) <= 0;

        if (isExpiredOnDate) {
          indicator = { type: 'status', color: 'bg-red-500', label: 'Vencido' };
        } else if (isOutOfStockOnDate) {
          indicator = { type: 'status', color: 'bg-slate-400', label: 'Acabado' };
        } else {
          indicator = { type: 'status', color: 'bg-emerald-500', label: 'Disponível' };
        }
      } else {
        // Regra de Passado/Hoje: Registro de consumo
        const medDoses = displayTimes.map(time => {
          const dose = doses.find(d => d.medicationId === med.id && d.scheduledTime === time && d.date === dateStr);
          return { time, dose };
        });

        // Verificação de status de consumo
        let hasMissed = false;
        let hasTaken = false;
        let hasPendingPast = false;

        medDoses.forEach(({ time, dose }) => {
          if (dose?.status === 'taken') {
            hasTaken = true;
          } else if (dose?.status === 'missed') {
            hasMissed = true;
          } else {
            // Pending
            if (isPastDate || (isTodayDate && time < currentTimeStr)) {
              hasPendingPast = true;
            }
          }
        });

        if (med.usageCategory === 'prn') {
          indicator = { type: 'consumption', color: 'text-emerald-500', icon: BadgeCheck, label: 'Dose Eventual' };
        } else if (hasMissed) {
          indicator = { type: 'consumption', color: 'text-red-500', icon: AlertCircle, label: 'Dose Atrasada' };
        } else if (hasPendingPast) {
          indicator = { type: 'consumption', color: 'text-slate-600', icon: X, label: 'Não tomado' };
        } else if (hasTaken) {
          indicator = { type: 'consumption', color: 'text-emerald-500', icon: Check, label: 'Tomado' };
        } else if (isTodayDate) {
          // Se hoje e nada aconteceu ainda, mostra status atual
          const expiry = med.expiryDate ? new Date(med.expiryDate + 'T23:59:59') : null;
          const isExpiredNow = expiry && expiry < now;
          const isOutOfStockNow = med.currentStock <= 0;
          if (isExpiredNow) indicator = { type: 'status', color: 'bg-red-500', label: 'Vencido' };
          else if (isOutOfStockNow) indicator = { type: 'status', color: 'bg-slate-400', label: 'Acabado' };
          else indicator = { type: 'status', color: 'bg-emerald-500', label: 'Disponível' };
        }
      }

      return { ...med, times: displayTimes, indicator };
    });
  };

  // Navegação
  const prev = () => {
    if (viewMode === 'monthly') {
      setCurrentDate(new Date(year, month - 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const next = () => {
    if (viewMode === 'monthly') {
      setCurrentDate(new Date(year, month + 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(currentDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  // Lógica para Visualização Mensal
  const getMonthlyDays = () => {
    const days = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const calendarDays = [];
    for (let i = 0; i < startDay; i++) calendarDays.push(null);
    for (let i = 1; i <= days; i++) calendarDays.push(new Date(year, month, i));
    return calendarDays;
  };

  // Lógica para Visualização Semanal
  const getWeeklyDays = () => {
    const days = [];
    const dayOfWeek = currentDate.getDay(); // 0 (Dom) a 6 (Sáb)
    const diff = currentDate.getDate() - dayOfWeek;
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date | null) => {
    if (!date) return false;
    return date.getDate() === selectedDate.getDate() && 
           date.getMonth() === selectedDate.getMonth() && 
           date.getFullYear() === selectedDate.getFullYear();
  };

  const calendarDays = viewMode === 'monthly' ? getMonthlyDays() : getWeeklyDays();

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Calendário</h2>
          <p className="text-sm text-slate-500">Acompanhe sua rotina de saúde</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {/* Seletor de Modo de Visualização */}
          <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex gap-1">
            <button 
              onClick={() => setViewMode('monthly')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                viewMode === 'monthly' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid size={16} />
              Mês
            </button>
            <button 
              onClick={() => setViewMode('weekly')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                viewMode === 'weekly' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <List size={16} />
              Semana
            </button>
          </div>

          {/* Navegação de Data */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <button onClick={prev} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <span className="font-bold min-w-[140px] text-center text-slate-700 text-sm">
              {viewMode === 'monthly' 
                ? `${monthNames[month]} ${year}` 
                : `Semana ${currentDate.getDate()} - ${monthNames[month]}`
              }
            </span>
            <button onClick={next} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 mb-4">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest py-2">
              {day}
            </div>
          ))}
        </div>
        
        <div className={`grid grid-cols-7 gap-2 transition-all duration-500`}>
          {calendarDays.map((date, idx) => {
            const selected = isSelected(date);
            const today = isToday(date);
            
            return (
              <div 
                key={idx} 
                onClick={() => date && setSelectedDate(date)}
                className={`aspect-square p-2 border rounded-3xl transition-all relative flex flex-col items-center justify-center cursor-pointer ${
                  date ? 'border-slate-50' : 'border-transparent'
                } ${
                  today 
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 ring-4 ring-blue-50 z-10' 
                    : selected 
                      ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100 z-10' 
                      : 'hover:bg-slate-50'
                }`}
              >
                {date && (
                  <>
                    <span className={`text-base font-black ${today ? 'text-white' : 'text-slate-700'}`}>
                      {date.getDate()}
                    </span>
                    {/* Event Indicators */}
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {/* Medicamentos */}
                      {getMedsForDate(date).map(med => (
                        <div key={med.id} title={`${med.name}: ${med.indicator.label || ''}`}>
                          {med.indicator.type === 'status' ? (
                            <div className={`w-2 h-2 rounded-full ${med.indicator.color} shadow-sm`} />
                          ) : (
                            <div className={`${med.indicator.color}`}>
                              {med.indicator.icon && <med.indicator.icon size={10} strokeWidth={3} />}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Consultas/Exames */}
                      {getAppointmentsForDate(date).map(app => (
                        <div 
                          key={app.id} 
                          className={`p-0.5 rounded-md ${
                            today 
                              ? 'bg-white/20 text-white' 
                              : app.type === 'Consulta' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                          }`}
                          title={`${app.type}: ${app.doctor}`}
                        >
                          {app.type === 'Consulta' ? <Stethoscope size={10} /> : <TestTubeDiagonal size={10} />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legenda do Calendário */}
        <div className="mt-8 pt-6 border-t border-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Disponível
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <div className="w-2 h-2 rounded-full bg-red-500" /> Vencido
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <div className="w-2 h-2 rounded-full bg-slate-400" /> Sem estoque
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consumo</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <Check size={10} className="text-emerald-500" strokeWidth={3} /> Tomado
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <X size={10} className="text-slate-600" strokeWidth={3} /> Não tomado
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <BadgeCheck size={10} className="text-emerald-500" strokeWidth={3} /> Dose Eventual
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compromissos</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <div className="p-0.5 bg-blue-100 text-blue-600 rounded"><Stethoscope size={10} /></div> Consulta
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <div className="p-0.5 bg-purple-100 text-purple-600 rounded"><TestTubeDiagonal size={10} /></div> Exame
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white text-slate-900 p-8 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 text-slate-200 rotate-12">
          <CalendarIcon size={120} />
        </div>
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Agenda do dia {String(selectedDate.getDate()).padStart(2, '0')}/{String(selectedDate.getMonth() + 1).padStart(2, '0')}
        </h3>
        <div className="space-y-4 relative z-10">
          {/* Medicamentos do dia */}
          {getMedsForDate(selectedDate).length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Medicamentos</div>
              {getMedsForDate(selectedDate).map(med => (
                <div key={med.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer group">
                  <div className={`w-12 h-12 rounded-2xl ${med.color || 'bg-slate-500'} flex items-center justify-center text-white shadow-lg relative`}>
                    <Pill size={20} />
                    {/* Indicador de status/consumo na agenda */}
                    <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white ${
                      med.indicator.type === 'status' ? med.indicator.color : 'bg-slate-100'
                    }`}>
                      {med.indicator.type === 'consumption' && med.indicator.icon && (
                        <div className={med.indicator.color}>
                          <med.indicator.icon size={12} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{med.name}</div>
                    <div className="text-xs text-slate-500">{med.dosage} • {med.times?.join(', ')}</div>
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${
                    med.indicator.type === 'status' ? 'bg-slate-100 text-slate-400' : 'bg-white shadow-sm ' + med.indicator.color
                  }`}>
                    {med.indicator.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Consultas do dia */}
          <div className="space-y-2">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Compromissos</div>
            {getAppointmentsForDate(selectedDate).length > 0 ? (
              getAppointmentsForDate(selectedDate).map(app => (
                <div key={app.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer group">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${
                    app.type === 'Consulta' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {app.time}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{app.doctor}</div>
                    <div className="text-xs text-slate-500">{app.type} • {app.specialty}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-sm italic">Nenhum compromisso para este dia.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
