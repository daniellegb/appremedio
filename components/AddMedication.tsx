
import React, { useState, useEffect } from 'react';
import { Medication, MedicationUnit, UsageCategory, IntervalType, ContraceptiveType } from '../types';
import { ChevronLeft, Pill, Package, FileText, CalendarDays, Infinity, CalendarClock, Lock, AlertCircle, Clock, Plus, Trash2, Info, AlertTriangle, History, Calendar as CalendarIcon, Tags } from 'lucide-react';
import { COLORS } from '../constants';

interface Props {
  onSave: (medication: Medication) => void;
  onCancel: () => void;
  initialData?: Medication | null;
  initialCategory?: UsageCategory;
}

const AddMedication: React.FC<Props> = ({ onSave, onCancel, initialData, initialCategory }) => {
  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    unit: 'comprimido' as MedicationUnit,
    usageCategory: (initialCategory || 'continuous') as UsageCategory,
    dosesPerDay: '1x',
    intervalDays: 1, 
    durationDays: 7,
    times: ['08:00'],
    intervalType: 'weekly' as IntervalType,
    contraceptiveType: 'daily' as ContraceptiveType,
    maxDosesPerDay: 1,
    endDate: '',
    startDate: new Date().toLocaleDateString('en-CA'),
    totalStock: 30,
    currentStock: 30,
    expiryDate: '',
    notes: '',
    color: COLORS[0]
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        dosage: initialData.dosage,
        unit: initialData.unit,
        usageCategory: initialData.usageCategory || 'continuous',
        dosesPerDay: initialData.dosesPerDay || '1x',
        intervalDays: initialData.intervalDays || 1,
        durationDays: initialData.durationDays || 7,
        times: initialData.times || ['08:00'],
        intervalType: initialData.intervalType || 'weekly',
        contraceptiveType: initialData.contraceptiveType || 'daily',
        maxDosesPerDay: initialData.maxDosesPerDay || 1,
        startDate: initialData.startDate || new Date().toLocaleDateString('en-CA'),
        endDate: initialData.endDate || '',
        totalStock: initialData.totalStock,
        currentStock: initialData.currentStock,
        expiryDate: initialData.expiryDate || '',
        notes: initialData.notes || '',
        color: initialData.color
      });
    }
  }, [initialData]);

  const getUnitLabel = (unit: MedicationUnit) => {
    switch (unit) {
      case 'comprimido': return 'comprimidos';
      case 'dose': return 'doses';
      case 'gota': return 'gotas';
      case 'ml': return 'mL';
      default: return unit;
    }
  };

  const addHours = (time: string, hours: number) => {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h + hours, m, 0, 0);
    return date.toTimeString().slice(0, 5);
  };

  const generateAutomaticTimes = (freq: string, startTime: string) => {
    if (freq === 'custom') return formData.times;
    const num = parseInt(freq);
    if (isNaN(num)) return [startTime];
    const interval = 24 / num;
    const newTimes = [startTime];
    for (let i = 1; i < num; i++) {
      newTimes.push(addHours(startTime, i * interval));
    }
    return newTimes;
  };

  const handleFrequencyChange = (freq: string) => {
    const startTime = formData.times[0] || '08:00';
    let newTimes = generateAutomaticTimes(freq, startTime);
    if (freq === 'custom') newTimes = [startTime];
    setFormData(prev => ({ ...prev, dosesPerDay: freq, times: newTimes }));
  };

  const handleTimeUpdate = (index: number, value: string) => {
    let newTimes = [...formData.times];
    newTimes[index] = value;
    if (index === 0 && formData.dosesPerDay !== 'custom' && (formData.usageCategory === 'continuous' || formData.usageCategory === 'period')) {
      newTimes = generateAutomaticTimes(formData.dosesPerDay, value);
    }
    setFormData(prev => ({ ...prev, times: newTimes }));
  };

  const addCustomTime = () => {
    if (formData.times.length < 24) {
      const lastTime = formData.times[formData.times.length - 1] || '08:00';
      setFormData(prev => ({ ...prev, times: [...prev.times, addHours(lastTime, 4)] }));
    }
  };

  const removeTime = (index: number) => {
    if (formData.times.length > 1) {
      setFormData(prev => ({ ...prev, times: prev.times.filter((_, i) => i !== index) }));
    }
  };

  const calculateEndDate = (start: string, days: number) => {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + (days - 1));
    return d.toLocaleDateString('en-CA');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalEndDate = formData.endDate;
    if (formData.usageCategory === 'period') {
      finalEndDate = calculateEndDate(formData.startDate, formData.durationDays);
    }
    onSave({
      id: initialData ? initialData.id : Math.random().toString(36).substr(2, 9),
      ...formData,
      endDate: finalEndDate,
      frequency: 0
    });
  };

  const renderPreview = () => {
    const dateStr = new Date(formData.startDate + 'T12:00:00').toLocaleDateString('pt-BR');
    switch (formData.usageCategory) {
      case 'continuous':
        return `Tomar ${formData.dosesPerDay === 'custom' ? `${formData.times.length}x` : formData.dosesPerDay} ao dia, ${formData.intervalDays === 1 ? 'todos os dias' : `a cada ${formData.intervalDays} dias`}, nos horários: ${formData.times.join(', ')}.`;
      case 'period':
        const endCalculated = calculateEndDate(formData.startDate, formData.durationDays);
        const endDateStr = new Date(endCalculated + 'T12:00:00').toLocaleDateString('pt-BR');
        return `Tomar ${formData.dosesPerDay === 'custom' ? `${formData.times.length}x` : formData.dosesPerDay} ao dia, durante ${formData.durationDays} dias (até ${endDateStr}), nos horários: ${formData.times.join(', ')}.`;
      case 'intervals':
        return `Uso programado a cada ${formData.intervalDays} dias, começando em ${dateStr} às ${formData.times[0]}.`;
      case 'contraceptive':
        return `Ciclo hormonal começando em ${dateStr} às ${formData.times[0]}.`;
      case 'prn':
        return `Uso sob demanda.`;
      default: return '';
    }
  };

  const categories = [
    { id: 'continuous', label: 'Uso contínuo', icon: Infinity },
    { id: 'period', label: 'Por período', icon: History },
    { id: 'intervals', label: 'Grandes intervalos', icon: CalendarClock },
    { id: 'contraceptive', label: 'Anticoncepcionais', icon: Lock },
    { id: 'prn', label: 'Se necessário', icon: AlertCircle },
  ];

  const isPRN = formData.usageCategory === 'prn';
  const isContinuous = formData.usageCategory === 'continuous';
  const isPeriod = formData.usageCategory === 'period';
  const isIntervals = formData.usageCategory === 'intervals';
  const isContraceptive = formData.usageCategory === 'contraceptive';

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-10">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold">{initialData ? 'Editar Medicamento' : 'Novo Medicamento'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. NOME E DOSAGEM */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Pill size={14} /> Nome do Medicamento
            </label>
            <input required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Paracetamol" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Dosagem</label>
              <input required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 500mg" value={formData.dosage} onChange={e => setFormData({...formData, dosage: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Unidade</label>
              <select className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value as MedicationUnit})}>
                {['comprimido', 'dose', 'gota', 'ml'].map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}s</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 2. ESTOQUE E VALIDADE */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Package size={14} /> Controle de Estoque</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Quantidade Atual */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Quantidade Atual</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  required 
                  className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold min-w-0" 
                  value={formData.currentStock} 
                  onChange={e => setFormData({...formData, currentStock: parseInt(e.target.value) || 0})} 
                />
                <span className="shrink-0 bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-tight shadow-sm border border-slate-200">
                  {getUnitLabel(formData.unit)}
                </span>
              </div>
            </div>

            {/* Total da Embalagem */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Total da Embalagem</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  required 
                  className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold min-w-0" 
                  value={formData.totalStock} 
                  onChange={e => setFormData({...formData, totalStock: parseInt(e.target.value) || 0})} 
                />
                <span className="shrink-0 bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-tight shadow-sm border border-slate-200">
                  {getUnitLabel(formData.unit)}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CalendarDays size={14} /> Data de Validade
            </label>
            <input type="date" className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
          </div>
        </div>

        {/* 3. CATEGORIA E CRONOGRAMA */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-8">
          <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Tags size={14} /> Categoria de Uso e Cronograma
          </label>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map((cat) => (
              <button key={cat.id} type="button" onClick={() => setFormData({...formData, usageCategory: cat.id as UsageCategory})} className={`flex flex-col items-center text-center p-3 rounded-2xl border-2 transition-all ${formData.usageCategory === cat.id ? 'border-blue-500 bg-blue-50/50 text-blue-700 shadow-md' : 'border-slate-50 bg-slate-50/30 text-slate-500'}`}>
                <cat.icon size={20} className="mb-2" />
                <span className="text-[10px] font-bold leading-tight">{cat.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-6 pt-6 border-t border-slate-50">
            {/* PRN: VISUAL SIMPLIFICADO */}
            {isPRN && (
              <div className="bg-blue-50/40 border border-blue-100 p-8 rounded-3xl flex flex-col items-center text-center gap-4 animate-in fade-in slide-in-from-top-4">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shadow-sm">
                  <AlertCircle size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Uso sob demanda</h3>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-[320px]">Esta categoria é ideal para medicamentos tomados apenas em crises ou sintomas ocasionais. Não há horários fixos.</p>
                </div>
              </div>
            )}

            {/* DATAS INICIAIS (Ocultas em PRN) */}
            {!isPRN && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><CalendarIcon size={12}/> Data de Início</label>
                  <input type="date" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                {isPeriod && (
                  <div className="space-y-2 animate-in fade-in zoom-in-95">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Duração (Dias)</label>
                    <input type="number" min="1" className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold" value={formData.durationDays} onChange={e => setFormData({...formData, durationDays: parseInt(e.target.value) || 1})} />
                  </div>
                )}
              </div>
            )}

            {/* USO CONTÍNUO OU PERÍODO */}
            {(isContinuous || isPeriod) && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={14} /> Frequência Diária</label>
                  <div className="flex flex-wrap gap-2">
                    {['1x', '2x', '3x', '4x', '5x', 'custom'].map(f => (
                      <button key={f} type="button" onClick={() => handleFrequencyChange(f)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${formData.dosesPerDay === f ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}>{f === 'custom' ? 'Pers.' : f}</button>
                    ))}
                  </div>
                </div>

                {isContinuous && (
                  <div className="space-y-4 pt-4 border-t border-slate-50">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Intervalo de dias (1 = todos os dias)</label>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <button key={i} type="button" onClick={() => setFormData({...formData, intervalDays: i})} className={`shrink-0 w-10 h-10 rounded-full text-sm font-bold border transition-all ${formData.intervalDays === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-100 text-slate-500'}`}>{i}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Horários das Doses</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {formData.times.map((time, idx) => (
                      <div key={idx} className="relative group">
                        <input type="time" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500" value={time} onChange={(e) => handleTimeUpdate(idx, e.target.value)} />
                        {formData.dosesPerDay === 'custom' && formData.times.length > 1 && (
                          <button type="button" onClick={() => removeTime(idx)} className="absolute -top-1 -right-1 bg-red-100 text-red-600 rounded-full p-0.5 hover:bg-red-200 transition-colors"><Trash2 size={10} /></button>
                        )}
                      </div>
                    ))}
                    {formData.dosesPerDay === 'custom' && <button type="button" onClick={addCustomTime} className="flex items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl h-[38px] hover:border-blue-300 transition-colors"><Plus size={20} className="text-slate-400" /></button>}
                  </div>
                </div>
              </div>
            )}

            {/* GRANDES INTERVALOS: REVISADO COM PERSONALIZADO */}
            {isIntervals && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo de Recorrência</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {id: 'weekly', label: 'Semanal', sub: '7 dias', days: 7},
                    {id: 'biweekly', label: 'Quinzenal', sub: '15 dias', days: 15},
                    {id: 'monthly', label: 'Mensal', sub: '30 dias', days: 30},
                    {id: 'quarterly', label: 'Trimestral', sub: '90 dias', days: 90},
                    {id: 'quadrimesterly', label: 'Quadrimestral', sub: '120 dias', days: 120},
                    {id: 'custom', label: 'Personalizado', sub: 'Definir', days: formData.intervalDays}
                  ].map(opt => (
                    <button 
                      key={opt.id} 
                      type="button" 
                      onClick={() => setFormData({...formData, intervalType: opt.id as IntervalType, intervalDays: opt.days})} 
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${formData.intervalType === opt.id ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-50 bg-slate-50/30 text-slate-500 hover:border-slate-200'}`}
                    >
                      <div className="text-sm font-bold">{opt.label}</div>
                      <div className="text-[10px] opacity-70 font-medium uppercase">{opt.sub}</div>
                    </button>
                  ))}
                </div>

                {/* CAMPO PARA INTERVALO PERSONALIZADO */}
                {formData.intervalType === 'custom' && (
                  <div className="space-y-2 animate-in fade-in zoom-in-95 pt-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Intervalo de quantos dias?</label>
                    <input 
                      type="number" 
                      min="1" 
                      required
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" 
                      placeholder="Ex: 45"
                      value={formData.intervalDays} 
                      onChange={e => setFormData({...formData, intervalDays: parseInt(e.target.value) || 1})} 
                    />
                  </div>
                )}

                <div className="space-y-2 pt-4 border-t border-slate-50">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Horário da Aplicação/Dose</label>
                  <input type="time" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold" value={formData.times[0]} onChange={e => handleTimeUpdate(0, e.target.value)} />
                </div>
              </div>
            )}

            {/* ANTICONCEPCIONAIS */}
            {isContraceptive && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ciclo Hormonal</label>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {id: 'daily', label: '28 Dias (Sem Pausa)', sub: 'Uso contínuo para bloquear o ciclo'},
                    {id: '21_7', label: '21 + 7 Dias', sub: 'Pausa de uma semana para o fluxo'},
                    {id: '24_4', label: '24 + 4 Dias', sub: 'Pausa reduzida de 4 dias'}
                  ].map(opt => (
                    <button key={opt.id} type="button" onClick={() => setFormData({...formData, contraceptiveType: opt.id as ContraceptiveType})} className={`p-5 rounded-3xl border-2 text-left transition-all flex items-center justify-between ${formData.contraceptiveType === opt.id ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm' : 'border-slate-50 bg-slate-50/30 text-slate-500 hover:border-slate-200'}`}>
                      <div>
                        <div className="text-base font-bold text-slate-900">{opt.label}</div>
                        <div className="text-[11px] opacity-70 font-medium">{opt.sub}</div>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${formData.contraceptiveType === opt.id ? 'border-purple-500 bg-purple-500 scale-110' : 'border-slate-200'}`}>
                        {formData.contraceptiveType === opt.id && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="space-y-2 pt-4 border-t border-slate-50">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Horário de Uso (Rigoroso)</label>
                  <input type="time" required className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold" value={formData.times[0]} onChange={e => handleTimeUpdate(0, e.target.value)} />
                </div>
              </div>
            )}

            {/* RESUMO DO CRONOGRAMA */}
            <div className="bg-blue-50/50 rounded-3xl p-6 border-l-4 border-blue-500 relative overflow-hidden group shadow-sm">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Info size={48} className="text-blue-900" />
              </div>
              <div className="flex items-center gap-2 text-blue-600 text-[10px] font-bold uppercase tracking-widest mb-2">
                <Info size={12} /> Resumo Gerado
              </div>
              <p className="text-sm font-semibold text-slate-900 leading-relaxed z-10 relative">
                {renderPreview()}
              </p>
            </div>
          </div>
        </div>

        {/* 4. OBSERVAÇÕES */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-2">
          <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><FileText size={14} /> Observações</label>
          <textarea className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all" rows={3} placeholder="Instruções extras (Ex: Ingerir com água)" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl hover:bg-blue-700 hover:shadow-blue-200 transition-all active:scale-[0.98]">
          {initialData ? 'Salvar Alterações' : 'Finalizar Cadastro'}
        </button>
      </form>
    </div>
  );
};

export default AddMedication;
