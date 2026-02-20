
import React from 'react';
import { User, Bell, LogOut, ChevronRight, Database, Trash2, AlertTriangle, CalendarClock, ShieldAlert } from 'lucide-react';
import { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onClearData: () => void;
}

const Settings: React.FC<Props> = ({ settings, onUpdateSettings, onClearData }) => {
  const sections = [
    { title: 'Conta', icon: User, items: ['Perfil', 'Privacidade', 'Segurança'] },
  ];

  return (
    <div className="space-y-8 pb-20 md:pb-0 max-w-2xl mx-auto">
      <header className="flex flex-col items-center py-6">
        <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-full p-1 shadow-xl shadow-blue-100 mb-4">
          <img 
            src="https://picsum.photos/200" 
            alt="Profile" 
            className="w-full h-full rounded-full object-cover border-4 border-white"
          />
        </div>
        <h2 className="text-2xl font-bold">João Silva</h2>
        <p className="text-slate-500">joao.silva@email.com</p>
      </header>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <section.icon size={18} className="text-slate-400" />
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{section.title}</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {section.items.map(item => (
                <button key={item} className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors text-left">
                  <span className="font-medium text-slate-700">{item}</span>
                  <ChevronRight size={18} className="text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Preferências */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <Bell size={18} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Preferências</h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 text-orange-500 rounded-lg">
                  <CalendarClock size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-700 text-sm md:text-base">Aviso de Vencimento</div>
                  <div className="text-[10px] md:text-xs text-slate-400">Dias antes de expirar</div>
                </div>
              </div>
              <input 
                type="number" 
                min="0"
                className="w-16 md:w-20 bg-slate-50 border-none rounded-xl px-2 md:px-4 py-2 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500"
                value={settings.thresholdExpiring}
                onChange={e => onUpdateSettings({ ...settings, thresholdExpiring: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-700 text-sm md:text-base">Aviso de Estoque</div>
                  <div className="text-[10px] md:text-xs text-slate-400">Dias restantes para acabar</div>
                </div>
              </div>
              <input 
                type="number" 
                min="0"
                className="w-16 md:w-20 bg-slate-50 border-none rounded-xl px-2 md:px-4 py-2 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500"
                value={settings.thresholdRunningOut}
                onChange={e => onUpdateSettings({ ...settings, thresholdRunningOut: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-500 rounded-lg">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-700">Aviso de Atraso</div>
                  <div className="text-xs text-slate-400">Exibir lembrete de segurança no Dashboard</div>
                </div>
              </div>
              <button 
                onClick={() => onUpdateSettings({ ...settings, showDelayDisclaimer: !settings.showDelayDisclaimer })}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.showDelayDisclaimer ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.showDelayDisclaimer ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <Database size={18} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Armazenamento</h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              Seus dados são salvos localmente neste navegador.
            </p>
            <button 
              onClick={onClearData}
              className="flex items-center gap-2 text-red-600 font-bold text-sm bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 size={16} />
              Limpar Todos os Dados
            </button>
          </div>
        </div>

        <button className="w-full flex items-center justify-center gap-2 px-6 py-4 text-slate-400 font-bold bg-slate-100 rounded-3xl hover:bg-slate-200 transition-colors">
          <LogOut size={20} />
          Sair do Aplicativo
        </button>
      </div>

      <p className="text-center text-xs text-slate-400 pb-10">
        Versão 1.3.1 (Status Inteligente)<br/>
        MedManager - Gestão de Saúde Simplificada
      </p>
    </div>
  );
};

export default Settings;