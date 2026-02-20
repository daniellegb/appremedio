import React, { useMemo, useState } from 'react';
import { Medication, DoseEvent, Appointment, AppSettings, UsageCategory } from '../types';
import { CheckCircle2, Circle, Calendar as CalendarIcon, ChevronRight, Clock as ClockIcon, AlertTriangle, XCircle, AlertCircle, Pill, AlertOctagon, TestTubeDiagonal, MapPin, FileText, Map, Navigation, ChevronDown, ChevronUp, Stethoscope, Trash2, Pencil } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  meds: Medication[];
  doses: DoseEvent[];
  appointments: Appointment[];
  settings: AppSettings;
  onToggleDose: (id: string, medicationId?: string, time?: string, date?: string) => void;
  onEditMed: (med: Medication) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onDeleteAppointment?: (id: string) => void;
  onEditAppointment?: (app: Appointment) => void;
  onAddMed: (category?: UsageCategory) => void;
}

const Dashboard: React.FC<Props> = ({ meds, doses, appointments, settings, onToggleDose, onEditMed, onUpdateSettings, onDeleteAppointment, onEditAppointment, onAddMed }) => {
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [showPrnSelector, setShowPrnSelector] = useState(false);
  const [selectedPrnMed, setSelectedPrnMed] = useState<Medication | null>(null);
  const [prnStep, setPrnStep] = useState<'list' | 'choice' | 'custom'>('list');
  const [customPrnDate, setCustomPrnDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [customPrnTime, setCustomPrnTime] = useState(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);

  const today = new Date();
  const now = new Date();
  today.setHours(0, 0, 0, 0);

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // Usando en-CA para garantir o formato YYYY-MM-DD local para comparação com o input date
  const todayDateStr = now.toLocaleDateString('en-CA');

  const prnMeds = useMemo(() => meds.filter(m => m.usageCategory === 'prn'), [meds]);

  const handlePrnDose = (medId: string, date?: string, time?: string) => {
    const now = new Date();
    const finalDate = date || now.toLocaleDateString('en-CA');
    const finalTime = time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Usar um ID temporário que NÃO seja aleatório se estivermos tentando encontrar um registro existente
    // No caso de PRN, sempre queremos criar um novo se não passarmos um ID real.
    // O problema de duplicidade geralmente ocorre se o onToggleDose for disparado por múltiplos eventos.
    onToggleDose(Math.random().toString(36).substr(2, 9), medId, finalTime, finalDate);
    resetPrnFlow();
  };

  const resetPrnFlow = () => {
    setShowPrnSelector(false);
    setSelectedPrnMed(null);
    setPrnStep('list');
    setCustomPrnDate(new Date().toLocaleDateString('en-CA'));
    setCustomPrnTime(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);
  };

  const isExpired = (med: Medication) => {
    if (!med.expiryDate) return false;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const expiry = new Date(med.expiryDate + 'T12:00:00');
    expiry.setHours(0, 0, 0, 0);
    return expiry < todayDate;
  };

  // Filtra consultas passadas e ordena as futuras por proximidade
  const upcomingAppointments = useMemo(() => {
    const currentTime = new Date();
    return [...appointments]
      .filter(app => {
        // Cria objeto de data considerando o horário da consulta
        const appDate = new Date(`${app.date}T${app.time}`);
        return appDate >= currentTime;
      })
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 3);
  }, [appointments]);

  // Gera a agenda de hoje baseada nas configurações dos medicamentos e define status lógico (pendente vs atrasado)
  const todaySchedule = useMemo(() => {
    const schedule: Array<{
      id: string;
      med: Medication;
      time: string;
      status: 'pending' | 'taken' | 'missed';
    }> = [];

    meds.forEach(med => {
      if (med.usageCategory === 'prn') return; // PRN não aparece na agenda fixa

      const startDate = med.startDate ? new Date(med.startDate + 'T00:00:00') : today;
      const endDate = med.endDate ? new Date(med.endDate + 'T23:59:59') : null;

      // Verifica se o medicamento está ativo hoje
      if (today < startDate) return;
      if (endDate && today > endDate) return;

      // Lógica de intervalo de dias
      if (med.usageCategory === 'continuous' || med.usageCategory === 'intervals') {
        const diffTime = today.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        const interval = med.intervalDays || 1;
        if (diffDays % interval !== 0) return;
      }

    const todayStr = today.toLocaleDateString('en-CA');

      // Adiciona cada horário configurado à agenda
      (med.times || []).forEach((time, index) => {
        // Busca se já existe um registro de dose tomada/atrasada para este med e horário hoje
        const existingDose = doses.find(d => d.medicationId === med.id && d.scheduledTime === time && d.date === todayStr);
        
        let finalStatus: 'pending' | 'taken' | 'missed' = 'pending';
        
        if (existingDose?.status === 'taken') {
          finalStatus = 'taken';
        } else {
          // Se não foi tomado, verifica se já passou do horário
          if (time < currentTimeStr) {
            finalStatus = 'missed';
          } else {
            finalStatus = 'pending';
          }
        }
        
        schedule.push({
          id: existingDose?.id || `virtual-${med.id}-${time}-${index}`,
          med,
          time,
          status: finalStatus
        });
      });
    });

    return schedule.sort((a, b) => a.time.localeCompare(b.time));
  }, [meds, doses, today, currentTimeStr]);

  const taken = todaySchedule.filter(d => d.status === 'taken').length;
  const pending = todaySchedule.filter(d => d.status === 'pending').length;
  const missed = todaySchedule.filter(d => d.status === 'missed').length;

  const chartData = [
    { name: 'Tomados', value: taken, color: '#10b981' },
    { name: 'Pendentes', value: pending, color: '#3b82f6' },
    { name: 'Atrasados', value: missed, color: '#f59e0b' }, // Cor laranja (Amber 500)
  ].filter(d => d.value > 0);

  // Lógica de Alertas de estoque e validade
  const getMedAlerts = () => {
    return meds.map(med => {
      let dosesPerDay = 1;
      const timesCount = med.times?.length || 1;
      const interval = med.intervalDays || 1;

      switch (med.usageCategory) {
        case 'continuous':
        case 'period': dosesPerDay = timesCount / interval; break;
        case 'intervals': dosesPerDay = 1 / interval; break;
        case 'prn': dosesPerDay = 0; break;
        default: dosesPerDay = 1;
      }

      const daysStockLeft = dosesPerDay > 0 ? Math.floor(med.currentStock / dosesPerDay) : null;
      
      const todayDate = new Date();
      todayDate.setHours(0,0,0,0);
      const expiry = med.expiryDate ? new Date(med.expiryDate + 'T12:00:00') : null;
      if(expiry) expiry.setHours(0,0,0,0);
      const diffExpiryDays = expiry ? Math.ceil((expiry.getTime() - todayDate.getTime()) / (1000 * 3600 * 24)) : null;

      const alerts = [];
      
      if (med.currentStock <= 0) {
        alerts.push({ label: 'Estoque Esgotado', color: 'text-slate-500', bg: 'bg-slate-100', icon: AlertCircle });
      } else if (daysStockLeft !== null && daysStockLeft <= settings.thresholdRunningOut) {
        alerts.push({ label: `Estoque Acabando (${daysStockLeft}d)`, color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle });
      }

      if (diffExpiryDays !== null) {
        if (diffExpiryDays < 0) {
          alerts.push({ label: 'Medicamento Vencido', color: 'text-red-500', bg: 'bg-red-50', icon: XCircle });
        } else if (diffExpiryDays <= settings.thresholdExpiring) {
          alerts.push({ label: `Vencendo em ${diffExpiryDays}d`, color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle });
        }
      }

      return alerts.length > 0 ? { med, alerts } : null;
    }).filter(item => item !== null);
  };

  const medAlerts = getMedAlerts();

  const handleDismissDisclaimer = () => {
    onUpdateSettings({ ...settings, showDelayDisclaimer: false });
  };

  const openGoogleMaps = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const openWaze = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    const url = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      <header>
        <h2 className="text-3xl font-bold text-slate-900">Olá, João!</h2>
        <p className="text-slate-500">Hoje é dia {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</p>
      </header>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-6">
          <div className="h-40 w-40 flex-shrink-0 flex items-center justify-center">
            <PieChart width={160} height={160}>
              <Pie
                data={chartData.length > 0 ? chartData : [{ name: 'Vazio', value: 1, color: '#f1f5f9' }]}
                innerRadius={50}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
                animationDuration={800}
              >
                {(chartData.length > 0 ? chartData : [{ color: '#f1f5f9' }]).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </div>
          <div className="flex-1 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Progresso do Dia</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-black text-emerald-500">{taken}</div>
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Tomados</div>
              </div>
              <div>
                <div className="text-2xl font-black text-blue-500">{pending}</div>
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Pendentes</div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-500">{missed}</div>
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Atrasados</div>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 bg-slate-50 p-3 rounded-2xl border border-dashed border-slate-200">
              {todaySchedule.length > 0 
                ? `Você já completou ${Math.round((taken / todaySchedule.length) * 100)}% da sua rotina hoje.`
                : 'Nenhum medicamento programado para hoje.'
              }
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Horários de Hoje */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <ClockIcon size={22} className="text-blue-500" /> Horários de Hoje
            </h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-lg">
              {todaySchedule.length} doses previstas
            </span>
          </div>

          {/* Disclaimer de Segurança para Doses Atrasadas */}
          {missed > 0 && settings.showDelayDisclaimer && (
            <div className="mb-6 bg-amber-50 border border-amber-100 p-5 rounded-3xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 relative">
              <div className="flex gap-3">
                <div className="shrink-0 w-10 h-10 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                  <AlertTriangle size={20} />
                </div>
                <div className="space-y-1 flex-1 pr-6">
                  <p className="text-xs font-bold text-amber-900 uppercase tracking-tight">Aviso importante sobre atrasos</p>
                  <p className="text-[11px] leading-relaxed text-amber-700 font-medium">
                    Este app não substitui orientação médica. Em caso de dose em atraso, siga as orientações do seu médico ou da bula. Se tiver dúvidas, procure um profissional de saúde.
                  </p>
                </div>
              </div>
              <button 
                onClick={handleDismissDisclaimer}
                className="self-end text-[10px] font-black uppercase text-amber-600 hover:text-amber-800 transition-colors py-1 px-3 bg-amber-100/50 rounded-lg"
              >
                Não exibir mais
              </button>
            </div>
          )}

          <div className="space-y-3">
            {todaySchedule.map((item) => {
              const expired = isExpired(item.med);
              return (
                <div 
                  key={item.id} 
                  className={`flex flex-col bg-white p-5 rounded-[24px] border transition-all relative overflow-hidden ${
                    item.status === 'taken' 
                      ? 'border-emerald-100 bg-emerald-50/20' 
                      : item.status === 'missed' 
                        ? 'border-amber-100 bg-amber-50/10'
                        : 'border-slate-100 shadow-md'
                  } ${expired ? 'border-amber-100 bg-amber-50/10' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`text-sm font-black w-12 text-center ${item.status === 'missed' ? 'text-amber-500' : 'text-slate-400'}`}>
                      {item.time}
                    </div>
                    <div className={`w-1.5 h-10 rounded-full ${item.med.color || 'bg-slate-200'} shadow-sm`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-900 truncate">{item.med.name}</div>
                        {item.status === 'missed' && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shadow-sm">
                            <AlertOctagon size={10} />
                            Atrasado
                          </span>
                        )}
                        {expired && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase text-red-600 bg-red-100 px-1.5 py-0.5 rounded shadow-sm">
                            <XCircle size={10} />
                            Vencido
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">Dose: {item.med.dosage}</div>
                    </div>
                    <button 
                      type="button"
                      disabled={expired}
                      onClick={() => !expired && onToggleDose(item.id, item.med.id, item.time)}
                      className={`transition-all active:scale-90 ${
                        item.status === 'taken' 
                          ? 'text-emerald-500 scale-110' 
                          : item.status === 'missed'
                            ? 'text-amber-300 hover:text-amber-500'
                            : 'text-slate-200 hover:text-blue-500'
                      } ${expired ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      {item.status === 'taken' ? <CheckCircle2 size={32} /> : <Circle size={32} />}
                    </button>
                  </div>

                  {expired && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-3 animate-in fade-in zoom-in-95">
                      <p className="text-[10px] text-amber-700 font-bold leading-relaxed flex items-start gap-2">
                        <XCircle size={14} className="shrink-0 text-amber-500" />
                        <span>Não tome medicamentos vencidos! Edite o medicamento quando tiver reposto o estoque.</span>
                      </p>
                      <button 
                        type="button"
                        onClick={() => onEditMed(item.med)}
                        className="w-full py-2 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 transition-colors shadow-sm"
                      >
                        Editar medicamento
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {todaySchedule.length === 0 && (
              <div className="text-center py-12 bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200 text-slate-400">
                <ClockIcon size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-bold">Nenhum horário para hoje</p>
                <p className="text-xs">Confira seus medicamentos cadastrados.</p>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-8">
          {/* Registro de Dose Eventual */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <ClockIcon size={22} className="text-purple-500" /> Registro de dose eventual
              </h3>
            </div>
            
            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
              {!showPrnSelector ? (
                <button 
                  onClick={() => setShowPrnSelector(true)}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-purple-50 text-purple-600 rounded-2xl font-bold hover:bg-purple-100 transition-all group"
                >
                  <Pill size={20} className="group-hover:rotate-12 transition-transform" />
                  Tomei dose eventual
                </button>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                      {prnStep === 'list' ? 'Selecione o medicamento' : 
                       prnStep === 'choice' ? 'Quando você tomou?' : 
                       'Escolha data e hora'}
                    </span>
                    <button onClick={resetPrnFlow} className="text-slate-400 hover:text-slate-600">
                      <XCircle size={18} />
                    </button>
                  </div>
                  
                  {prnStep === 'list' && (
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {prnMeds.map(med => (
                        <button
                          key={med.id}
                          onClick={() => {
                            setSelectedPrnMed(med);
                            setPrnStep('choice');
                          }}
                          className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-purple-50 rounded-xl transition-colors text-left group"
                        >
                          <div className={`w-8 h-8 rounded-lg ${med.color} text-white flex items-center justify-center shrink-0`}>
                            <Pill size={16} />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-slate-700 text-sm group-hover:text-purple-700">{med.name}</div>
                            <div className="text-[10px] text-slate-400">{med.dosage}</div>
                          </div>
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-purple-400" />
                        </button>
                      ))}
                      
                      <button
                        onClick={() => onAddMed('prn')}
                        className="flex items-center gap-3 p-3 border-2 border-dashed border-slate-100 hover:border-purple-200 hover:bg-purple-50/30 rounded-xl transition-all text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-purple-100 group-hover:text-purple-500">
                          <Pill size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-500 text-sm group-hover:text-purple-700">Cadastrar novo remédio SN</div>
                          <div className="text-[10px] text-slate-400">Remédio de uso eventual</div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-purple-400" />
                      </button>
                    </div>
                  )}

                  {prnStep === 'choice' && selectedPrnMed && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
                        <div className={`w-10 h-10 rounded-lg ${selectedPrnMed.color} text-white flex items-center justify-center shrink-0`}>
                          <Pill size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{selectedPrnMed.name}</div>
                          <div className="text-[10px] text-slate-500">{selectedPrnMed.dosage}</div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handlePrnDose(selectedPrnMed.id)}
                        className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                      >
                        <ClockIcon size={18} />
                        Tomei agora
                      </button>
                      
                      <button
                        onClick={() => setPrnStep('custom')}
                        className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                      >
                        <CalendarIcon size={18} />
                        Outra data/horário
                      </button>

                      <button
                        onClick={() => setPrnStep('list')}
                        className="w-full py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600"
                      >
                        Voltar
                      </button>
                    </div>
                  )}

                  {prnStep === 'custom' && selectedPrnMed && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                          <input 
                            type="date" 
                            value={customPrnDate}
                            onChange={(e) => setCustomPrnDate(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hora</label>
                          <input 
                            type="time" 
                            value={customPrnTime}
                            onChange={(e) => setCustomPrnTime(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handlePrnDose(selectedPrnMed.id, customPrnDate, customPrnTime)}
                        className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100"
                      >
                        Confirmar Registro
                      </button>

                      <button
                        onClick={() => setPrnStep('choice')}
                        className="w-full py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600"
                      >
                        Voltar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Alertas */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <AlertTriangle size={22} className="text-orange-500" /> Alertas de Estoque e Validade
              </h3>
            </div>
            <div className="space-y-3">
              {medAlerts.length > 0 ? medAlerts.map(({ med, alerts }, idx) => (
                <div key={idx} className="bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm flex items-center gap-4 group">
                  <div className={`w-12 h-12 rounded-2xl ${med.color} text-white flex items-center justify-center shrink-0 shadow-md`}>
                    <Pill size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate">{med.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {alerts.map((alert, aidx) => (
                        <div key={aidx} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tight ${alert.bg} ${alert.color}`}>
                          <alert.icon size={10} />
                          {alert.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-[10px] font-black text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                    {med.currentStock} {med.unit}s
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-8 bg-emerald-50/40 rounded-[32px] border border-dashed border-emerald-200 text-emerald-600">
                  <CheckCircle2 size={32} className="mb-2 opacity-50" />
                  <p className="text-sm font-bold">Estoque e Validade OK</p>
                  <p className="text-[10px] uppercase font-black tracking-widest opacity-60">Tudo em dia com seus remédios</p>
                </div>
              )}
            </div>
          </section>

          {/* Próximas Consultas */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CalendarIcon size={22} className="text-blue-500" /> Próximas Consultas
              </h3>
            </div>
            <div className="space-y-4">
              {upcomingAppointments.length > 0 ? upcomingAppointments.map(app => {
                const isAppToday = app.date === todayDateStr;
                const isExpanded = expandedAppId === app.id;

                return (
                  <div 
                    key={app.id} 
                    onClick={() => setExpandedAppId(isExpanded ? null : app.id)}
                    className={`group flex flex-col bg-white p-5 rounded-[24px] border transition-all cursor-pointer shadow-md relative overflow-hidden ${
                      isExpanded ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-100 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm ${isExpanded ? 'bg-blue-600 text-white' : ''}`}>
                        {app.type === 'Consulta' ? <Stethoscope size={24} /> : <TestTubeDiagonal size={24} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate text-base">{app.doctor}</div>
                        {!isExpanded && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            {app.specialty} • {app.date.split('-').reverse().join('/')} às {app.time}
                          </div>
                        )}
                        {isAppToday && (
                          <div className="mt-1">
                            <span className="text-[9px] font-black uppercase tracking-tight text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-lg border border-blue-100 inline-block">
                              {app.type === 'Consulta' ? 'Sua consulta é hoje!' : 'Seu exame é hoje!'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-slate-300">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>

                    {/* Conteúdo Expandido - Espelhando Appointments.tsx */}
                    {isExpanded && (
                      <div className="mt-6 pt-5 border-t border-slate-50 space-y-6 animate-in fade-in slide-in-from-top-2">
                        <div className="flex flex-col gap-6">
                          {/* Seção de Data e Hora */}
                          <div className="flex gap-3">
                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                              <CalendarIcon size={18} />
                            </div>
                            <div className="flex flex-col justify-center">
                              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Data e Hora</div>
                              <div className="font-bold text-slate-700 text-sm whitespace-nowrap">
                                {app.date.split('-').reverse().join('/')} • {app.time}
                              </div>
                            </div>
                          </div>

                          {/* Seção de Local */}
                          {app.location && (
                            <div className="flex gap-3">
                              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                                <MapPin size={18} />
                              </div>
                              <div className="flex flex-col gap-3 min-w-0">
                                <div className="flex flex-col justify-center">
                                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Local</div>
                                  <div className="font-bold text-slate-700 text-sm">{app.location}</div>
                                </div>
                                
                                <div className="flex gap-2">
                                  <button 
                                    type="button"
                                    onClick={(e) => openGoogleMaps(e, app.location)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all border border-slate-100 hover:border-blue-600 shadow-sm"
                                  >
                                    <Map size={12} />
                                    Google Maps
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={(e) => openWaze(e, app.location)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-all border border-slate-100 hover:border-blue-600 shadow-sm"
                                  >
                                    <Navigation size={12} />
                                    Waze
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Seção de Observações */}
                          {app.notes && (
                            <div className="flex gap-3 pt-2">
                              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                                <FileText size={18} />
                              </div>
                              <div className="flex flex-col justify-center">
                                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Observações</div>
                                <div className="font-medium text-slate-600 text-xs leading-relaxed italic">{app.notes}</div>
                              </div>
                            </div>
                          )}

                          {/* Ações: Edição e Exclusão para paridade com Appointments.tsx */}
                          <div className="flex gap-3 pt-4 border-t border-slate-50">
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onEditAppointment?.(app); }}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all border border-blue-100"
                            >
                              <Pencil size={14} />
                              Editar
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onDeleteAppointment?.(app.id); }}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-100"
                            >
                              <Trash2 size={14} />
                              Excluir
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="text-center py-10 bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200 text-slate-400">
                  Nenhum compromisso agendado
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;