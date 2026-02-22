
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, LayoutGrid, List, Stethoscope, TestTubeDiagonal, Pill, Check, X, AlertCircle, BadgeCheck, Info, ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react';
import { Appointment, Medication, DoseEvent } from '../types';
import { isOutOfStockOnDate } from '../src/domain/stock';
import { isPastDate, isFutureDate, isTodayDate, getCalendarDisplayMode } from '../src/domain/calendarRules';
import { isMedicationExpired, hasStock } from '../src/domain/medicationRules';
import ConfirmationModal from './ConfirmationModal';

type CalendarViewMode = 'monthly' | 'weekly';

interface Props {
  appointments: Appointment[];
  meds: Medication[];
  doses: DoseEvent[];
  onToggleDose: (doseId: string, medicationId?: string, time?: string, date?: string) => void;
  onEditMed: (med: Medication) => void;
}

const Calendar: React.FC<Props> = ({ appointments, meds, doses, onToggleDose, onEditMed }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('monthly');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    doseId: string;
    medicationId?: string;
    time?: string;
    date?: string;
  }>({ isOpen: false, doseId: '' });
  const [outOfStockModal, setOutOfStockModal] = useState<{
    isOpen: boolean;
    med: Medication | null;
  }>({ isOpen: false, med: null });
  const [showLegend, setShowLegend] = useState(() => {
    const saved = localStorage.getItem('medmanager_calendar_legend');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('medmanager_calendar_legend', JSON.stringify(showLegend));
  }, [showLegend]);
  
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
    const today = new Date();
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const isPast = isPastDate(date, today);
    const isFuture = isFutureDate(date, today);
    const isToday = isTodayDate(date, today);

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

      const dateAtMidnight = new Date(date);
      dateAtMidnight.setHours(0,0,0,0);

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
          if (isPast || (isToday && time < currentTimeStr)) {
            hasPendingPast = true;
          }
        }
      });

      const displayMode = getCalendarDisplayMode({
        date,
        today,
        hasActivity: hasTaken || hasMissed || hasPendingPast,
        isPrn: med.usageCategory === 'prn'
      });

      if (displayMode === 'STATUS') {
        const isExpiredOnDate = isMedicationExpired(med.expiryDate, isFuture ? new Date(date.getTime()) : now);
        const isOutOfStock = isFuture ? isOutOfStockOnDate(med, date, today) : !hasStock(med.currentStock);

        if (isExpiredOnDate) {
          indicator = { type: 'status', color: 'bg-red-500', label: 'Vencido' };
        } else if (isOutOfStock) {
          indicator = { type: 'status', color: 'bg-slate-400', label: 'Acabado' };
        } else {
          indicator = { type: 'status', color: 'bg-emerald-500', label: 'Disponível' };
        }
      } else {
        if (med.usageCategory === 'prn') {
          indicator = { type: 'consumption', color: 'text-emerald-500', icon: BadgeCheck, label: 'Dose Eventual' };
        } else if (hasMissed) {
          indicator = { type: 'consumption', color: 'text-red-500', icon: AlertCircle, label: 'Dose Atrasada' };
        } else if (hasPendingPast) {
          indicator = { type: 'consumption', color: 'text-slate-600', icon: X, label: 'Não tomado' };
        } else if (hasTaken) {
          indicator = { type: 'consumption', color: 'text-emerald-500', icon: Check, label: 'Tomado' };
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

  const handleToggleDose = (doseId: string, medicationId?: string, time?: string, date?: string) => {
    const med = meds.find(m => m.id === medicationId);
    const dose = doses.find(d => d.id === doseId);
    const isTaken = dose?.status === 'taken';

    // Check stock if trying to mark as taken
    if (!isTaken && med && med.currentStock <= 0) {
      setOutOfStockModal({ isOpen: true, med });
      return;
    }

    if (med?.usageCategory === 'prn' && isTaken) {
      setConfirmModal({
        isOpen: true,
        doseId,
        medicationId,
        time,
        date
      });
    } else {
      onToggleDose(doseId, medicationId, time, date);
    }
  };

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

        {/* Botão para Ocultar/Mostrar Legenda */}
        <div className="mt-6 flex justify-end">
          <button 
            onClick={() => setShowLegend(!showLegend)}
            className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
          >
            <Info size={12} />
            {showLegend ? 'Ocultar Legenda' : 'Mostrar Legenda'}
            {showLegend ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Legenda do Calendário */}
        {showLegend && (
          <div className="mt-4 pt-6 border-t border-slate-50 grid grid-cols-3 gap-2 sm:gap-6">
            <div className="space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 shrink-0" /> <span className="truncate">Disponível</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500 shrink-0" /> <span className="truncate">Vencido</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-slate-400 shrink-0" /> <span className="truncate">Sem estoque</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consumo</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <Check size={10} className="text-emerald-500 shrink-0" strokeWidth={3} /> <span className="truncate">Tomado</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <X size={10} className="text-slate-600 shrink-0" strokeWidth={3} /> <span className="truncate">Não tomado</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <BadgeCheck size={10} className="text-emerald-500 shrink-0" strokeWidth={3} /> <span className="truncate">Eventual</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compromissos</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <div className="p-0.5 bg-blue-100 text-blue-600 rounded shrink-0"><Stethoscope size={10} /></div> <span className="truncate">Consulta</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] text-slate-500 font-medium">
                  <div className="p-0.5 bg-purple-100 text-purple-600 rounded shrink-0"><TestTubeDiagonal size={10} /></div> <span className="truncate">Exame</span>
                </div>
              </div>
            </div>
          </div>
        )}
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
              {getMedsForDate(selectedDate).map(med => {
                const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
                
                return (
                  <div key={med.id} className="flex flex-col gap-2">
                    {med.times?.map((time, index) => {
                      const dose = doses.find(d => d.medicationId === med.id && d.scheduledTime === time && d.date === dateStr);
                      const isTaken = dose?.status === 'taken';
                      const doseId = dose?.id || `virtual-${med.id}-${time}-${dateStr}-${index}`;

                      return (
                        <div key={doseId} className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-slate-100 transition-colors group">
                          <div className={`w-12 h-12 rounded-2xl ${med.color || 'bg-slate-500'} flex items-center justify-center text-white shadow-lg relative shrink-0`}>
                            <Pill size={20} />
                            <div className="absolute -bottom-1 -right-1 bg-white text-slate-900 text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm border border-slate-100">
                              {time}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-900 truncate">{med.name}</div>
                            <div className="text-xs text-slate-500 truncate">{med.dosage}</div>
                          </div>
                          <div className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${
                            isTaken ? 'text-emerald-500' : 'text-slate-300'
                          }`}>
                            {isTaken ? 'Tomado' : 'Não tomado'}
                          </div>
                          <button 
                            onClick={() => handleToggleDose(doseId, med.id, time, dateStr)}
                            className={`transition-all active:scale-90 shrink-0 ${
                              isTaken ? 'text-emerald-500' : 'text-slate-200 hover:text-blue-500'
                            }`}
                            title={isTaken ? "Marcar como não tomado" : "Marcar como tomado"}
                          >
                            {isTaken ? <CheckCircle2 size={28} /> : <Circle size={28} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title="Desmarcar Dose Eventual?"
        message="Você tem certeza que deseja desmarcar esta dose eventual (SN)? Esta ação removerá o registro de consumo."
        confirmText="Sim, desmarcar"
        cancelText="Manter tomado"
        variant="warning"
        onConfirm={() => {
          onToggleDose(confirmModal.doseId, confirmModal.medicationId, confirmModal.time, confirmModal.date);
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />

      <ConfirmationModal
        isOpen={outOfStockModal.isOpen}
        title="Medicamento sem estoque"
        message="Este medicamento está sem estoque. Adicione novas unidades para registrar o consumo."
        confirmText="Editar medicamento"
        cancelText="Cancelar"
        variant="neutral"
        onConfirm={() => {
          if (outOfStockModal.med) onEditMed(outOfStockModal.med);
          setOutOfStockModal({ isOpen: false, med: null });
        }}
        onCancel={() => setOutOfStockModal({ isOpen: false, med: null })}
      />
    </div>
  );
};

export default Calendar;
