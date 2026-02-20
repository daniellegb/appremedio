
import React from 'react';
import { Medication, AppSettings } from '../types';
import { Plus, Trash2, Pill, AlertTriangle, CalendarDays, CheckCircle2, AlertCircle, XCircle, Clock, Info, Pencil } from 'lucide-react';
import { calculateDaysOfStockLeft } from '../src/domain/stock';
import { getStockStatusType, getExpiryStatusType, getDaysUntilExpiry } from '../src/domain/medicationRules';

interface Props {
  meds: Medication[];
  settings: AppSettings;
  onAdd: () => void;
  onEdit: (med: Medication) => void;
  onDelete: (id: string) => void;
}

const Medications: React.FC<Props> = ({ meds, settings, onAdd, onEdit, onDelete }) => {
  
  const getStockStatus = (med: Medication) => {
    const daysLeft = calculateDaysOfStockLeft(med);
    const statusType = getStockStatusType(med, daysLeft, settings.thresholdRunningOut);

    if (statusType === 'OUT_OF_STOCK') {
      return { label: 'Esgotado', color: 'text-slate-400', bg: 'bg-slate-100', icon: AlertCircle };
    }
    
    if (statusType === 'RUNNING_OUT') {
      return { label: `Acabando (${daysLeft}d)`, color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle };
    }

    return { label: 'Disponível', color: 'text-green-500', bg: 'bg-green-50', icon: CheckCircle2 };
  };

  const getExpiryStatus = (med: Medication) => {
    const today = new Date();
    const statusType = getExpiryStatusType(med, today, settings.thresholdExpiring);
    const diffDays = getDaysUntilExpiry(med.expiryDate, today);

    if (statusType === 'NO_DATE') return { label: 'Sem data', color: 'text-slate-400', bg: 'bg-slate-50', icon: Info };

    if (statusType === 'EXPIRED') {
      return { label: 'Vencido', color: 'text-red-500', bg: 'bg-red-50', icon: XCircle };
    }

    if (statusType === 'EXPIRING_SOON') {
      return { label: `Vencendo em ${diffDays}d`, color: 'text-orange-500', bg: 'bg-orange-50', icon: Clock };
    }

    return { label: 'Na validade', color: 'text-green-500', bg: 'bg-green-50', icon: CheckCircle2 };
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Meus Medicamentos</h2>
          <p className="text-slate-500 text-sm">Alertas: Vencimento ({settings.thresholdExpiring}d) • Estoque ({settings.thresholdRunningOut}d)</p>
        </div>
        <button 
          onClick={onAdd}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
        >
          <Plus size={20} />
          <span>Adicionar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {meds.map((med) => {
          const stockStatus = getStockStatus(med);
          const expiryStatus = getExpiryStatus(med);
          const stockPercent = Math.min(100, (med.currentStock / med.totalStock) * 100);

          return (
            <div key={med.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-md relative overflow-hidden group transition-all hover:shadow-xl hover:border-slate-200">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col gap-1.5">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${stockStatus.bg} ${stockStatus.color}`}>
                    <stockStatus.icon size={10} />
                    Estoque: {stockStatus.label}
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${expiryStatus.bg} ${expiryStatus.color}`}>
                    <expiryStatus.icon size={10} />
                    Validade: {expiryStatus.label}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mb-6">
                <div className={`w-14 h-14 ${med.color} text-white rounded-2xl flex items-center justify-center shadow-lg shadow-inner shrink-0`}>
                  <Pill size={28} />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 truncate">{med.name}</h3>
                  <p className="text-sm text-slate-500 font-medium truncate">
                    {med.dosage} • {med.usageCategory === 'prn' ? 'Se necessário' : (med.dosesPerDay || '1x por dia')}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-tight">Capacidade</span>
                    <span className={`font-bold ${stockStatus.color}`}>
                      {med.currentStock} / {med.totalStock} <span className="text-[10px] opacity-70 uppercase">{med.unit}s</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-700 ${stockStatus.color.replace('text-', 'bg-')}`}
                      style={{ width: `${stockPercent}%` }}
                    />
                  </div>
                </div>

                {med.expiryDate && (
                  <div className={`flex items-center gap-2 p-2 rounded-xl border border-dashed border-slate-100 bg-slate-50/50`}>
                    <CalendarDays size={14} className="text-slate-400" />
                    <div className="text-[11px] font-semibold text-slate-600">
                      Vence em: {new Date(med.expiryDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 flex gap-3">
                <button 
                  type="button"
                  onClick={() => onEdit(med)}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-blue-600 bg-blue-50/50 py-2.5 rounded-xl hover:bg-blue-600 hover:text-white transition-all border border-blue-100 cursor-pointer"
                >
                  <Pencil size={16} />
                  Editar
                </button>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(med.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-bold text-red-600 bg-red-50 py-2.5 rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-100 cursor-pointer"
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {meds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border-2 border-dashed border-slate-200 text-slate-400">
          <Pill size={64} className="mb-4 opacity-10" />
          <p className="font-bold text-lg">Nenhum medicamento cadastrado</p>
          <p className="text-sm">Toque em "Adicionar" para começar seu controle.</p>
        </div>
      )}
    </div>
  );
};

export default Medications;
