import React, { useState, useEffect } from 'react';
import { User, Bell, LogOut, ChevronRight, Database, Trash2, AlertTriangle, CalendarClock, ShieldAlert, RefreshCw, Smile, Smartphone, Send } from 'lucide-react';
import { AppSettings } from '../types';
import { useAuth } from '../src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { onboardingService } from '../src/services/onboardingService';
import { subscribeUser, pushService } from '../src/services/pushService';
import ConfirmationModal from './ConfirmationModal';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onClearData: () => void;
}

const Settings: React.FC<Props> = ({ settings, onUpdateSettings, onClearData }) => {
  const { signOut, user, refreshProfile, profile } = useAuth();
  const navigate = useNavigate();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);

  useEffect(() => {
    // Check if user is already subscribed
    if ('serviceWorker' in navigator && user) {
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          setPushEnabled(!!subscription);
        });
      });
    }
  }, [user]);

  const handleTogglePush = async () => {
    if (!user) return;
    
    // Check if notifications are supported
    if (!('Notification' in window)) {
      alert("Este navegador não suporta notificações.");
      return;
    }

    // Check if we are in an iframe (AI Studio Preview)
    const isInIframe = window.self !== window.top;
    if (isInIframe) {
      alert("⚠️ ATENÇÃO: Notificações costumam ser bloqueadas dentro do preview do AI Studio.\n\nPor favor, abra o aplicativo em uma NOVA ABA (botão no canto superior direito) para configurar e receber notificações no computador.");
      if (Notification.permission === 'default') return;
    }

    // Check if permission was previously denied
    if (Notification.permission === 'denied') {
      alert("As notificações foram bloqueadas. Por favor, redefina as permissões nas configurações do seu navegador (clique no cadeado ao lado da URL).");
      return;
    }

    setIsPushLoading(true);
    try {
      if (pushEnabled) {
        // Unsubscribe
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await pushService.deleteSubscription(subscription.endpoint);
        }
        setPushEnabled(false);
      } else {
        // Subscribe
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidKey || vapidKey === 'your-vapid-public-key') {
          alert("Erro: Chave VAPID não configurada corretamente no ambiente.");
          setIsPushLoading(false);
          return;
        }
        
        // Request permission explicitly first if default
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            throw new Error('Permission not granted');
          }
        }

        await subscribeUser(user.id, vapidKey);
        setPushEnabled(true);
      }
    } catch (error: any) {
      console.error("Erro ao gerenciar notificações push:", error);
      const errorMessage = error.message || error.description || String(error);
      
      if (error.message === 'Permission not granted' || error.name === 'NotAllowedError') {
        alert("Permissão de notificação negada. Ative as notificações para receber lembretes.");
      } else {
        alert(`Erro ao configurar notificações: ${errorMessage}. Verifique se você está em uma conexão segura (HTTPS) e se as permissões do navegador permitem notificações.`);
      }
    } finally {
      setIsPushLoading(false);
    }
  };

  const displayName = profile?.mode === 'caregiver' 
    ? profile.caregiver_name 
    : (profile?.name || user?.user_metadata?.full_name || "Usuário");

  const profileTypeLabel = profile?.mode === 'caregiver' ? 'Cuidador' : 'Autocuidado';
  const patientInfo = profile?.mode === 'caregiver' && profile.patient_name 
    ? ` • Cuidando de ${profile.patient_name}` 
    : '';

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  const handleResetOnboarding = async () => {
    if (!user) return;
    
    try {
      await onboardingService.resetOnboarding(user.id);
      await refreshProfile();
      navigate('/onboarding');
    } catch (error) {
      console.error("Erro ao reiniciar onboarding:", error);
      alert("Erro ao reiniciar onboarding. Tente novamente.");
    }
  };

  const sections = [
    { 
      title: 'Conta', 
      icon: User, 
      items: [
        { 
          label: 'Perfil', 
          sublabel: `${profileTypeLabel}${patientInfo}` 
        },
        { label: 'Trocar perfil', action: () => setShowResetConfirm(true), icon: RefreshCw },
        { label: 'Privacidade' },
        { label: 'Segurança' }
      ] 
    },
  ];

  return (
    <div className="space-y-8 pb-20 md:pb-0 max-w-2xl mx-auto">
      <header className="flex flex-col items-center py-6">
        <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-full p-1 shadow-xl shadow-blue-100 mb-4 flex items-center justify-center overflow-hidden border-4 border-white">
          {user?.user_metadata?.avatar_url ? (
            <img 
              src={user.user_metadata.avatar_url} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          ) : (
            <Smile size={48} className="text-white" />
          )}
        </div>
        <h2 className="text-2xl font-bold">{displayName}</h2>
        <p className="text-slate-500">{user?.email || "email@exemplo.com"}</p>
      </header>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <section.icon size={18} className="text-slate-400" />
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{section.title}</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {section.items.map(item => {
                const label = typeof item === 'string' ? item : item.label;
                const action = typeof item === 'string' ? undefined : item.action;
                const Icon = typeof item === 'string' ? null : item.icon;
                
                return (
                  <div 
                    key={label} 
                    onClick={action}
                    className={`w-full flex items-center justify-between px-6 py-4 transition-colors text-left group ${action ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      {Icon && <Icon size={16} className="text-blue-500" />}
                      <div>
                        <span className={`font-medium ${action ? 'text-blue-600' : 'text-slate-700'}`}>{label}</span>
                        {item.sublabel && (
                          <p className="text-xs text-slate-400 font-normal">{item.sublabel}</p>
                        )}
                      </div>
                    </div>
                    {action && <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-400 transition-colors" />}
                  </div>
                );
              })}
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

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg">
                  <Smile size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-700">Frases de Boas-vindas</div>
                  <div className="text-xs text-slate-400">Exibir frases motivacionais no Dashboard</div>
                </div>
              </div>
              <button 
                onClick={() => onUpdateSettings({ ...settings, showGreeting: !settings.showGreeting })}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.showGreeting ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.showGreeting ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 text-purple-500 rounded-lg">
                  <Smartphone size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-700">Notificações Push</div>
                  <div className="text-xs text-slate-400">Ativa notificações no celular</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={async () => {
                    setIsPushLoading(true);
                    try {
                      const debug = await pushService.checkVapidMatch();
                      console.log("[VAPID Check]", debug);
                      if (debug?.vapidMatch) {
                        alert("✅ Chaves VAPID sincronizadas! O navegador e o servidor estão usando a mesma chave.");
                      } else {
                        alert(`❌ Inconsistência detectada!\nServidor: ${debug?.server?.vapidPreview}\nCliente: ${debug?.client?.vapidPreview}\n\nVerifique suas variáveis de ambiente no Supabase e no Vercel/.env`);
                      }
                    } catch (error) {
                      alert("Erro ao verificar chaves. Verifique se a Edge Function foi implantada com --no-verify-jwt");
                    } finally {
                      setIsPushLoading(false);
                    }
                  }}
                  className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
                  title="Verificar Configuração"
                >
                  <RefreshCw size={18} className={isPushLoading ? 'animate-spin' : ''} />
                </button>
                {pushEnabled && (
                  <button 
                    onClick={async () => {
                      if (!user) return;
                      setIsPushLoading(true);
                      try {
                        const result = await pushService.sendTestNotification(user.id);
                        console.log("[Push Test Result]", result);
                        
                        if (result.totalFound === 0) {
                          alert("Atenção: Nenhuma assinatura de notificação encontrada para este navegador. Tente desativar e ativar as notificações novamente.");
                        } else if (result.errorCount > 0) {
                          alert(`Enviado com problemas: ${result.successCount} sucesso, ${result.errorCount} falha(s). Verifique se o navegador está bloqueando as notificações.`);
                        } else {
                          alert("Notificação de teste enviada com sucesso! Verifique seu dispositivo.");
                        }
                      } catch (error: any) {
                        console.error("Erro ao enviar teste:", error);
                        alert(`Erro ao enviar notificação de teste: ${error.message || "Erro desconhecido"}`);
                      } finally {
                        setIsPushLoading(false);
                      }
                    }}
                    disabled={isPushLoading}
                    className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
                    title="Testar Notificação"
                  >
                    <Send size={18} />
                  </button>
                )}
                <button 
                  onClick={handleTogglePush}
                  disabled={isPushLoading}
                  className={`w-12 h-6 rounded-full transition-colors relative ${pushEnabled ? 'bg-blue-600' : 'bg-slate-200'} ${isPushLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${pushEnabled ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className={`flex items-center justify-between gap-4 pt-4 border-t border-slate-50 transition-opacity ${!pushEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                  <Bell size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-700 text-sm md:text-base">Aviso Antecipado</div>
                  <div className="text-[10px] md:text-xs text-slate-400">Minutos antes do horário</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0"
                  max="60"
                  className="w-16 md:w-20 bg-slate-50 border-none rounded-xl px-2 md:px-4 py-2 text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500"
                  value={settings.preNotificationMinutes}
                  onChange={e => onUpdateSettings({ ...settings, preNotificationMinutes: Math.min(60, Math.max(0, parseInt(e.target.value) || 0)) })}
                />
                <span className="text-xs font-bold text-slate-400">min</span>
              </div>
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

        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 text-slate-400 font-bold bg-slate-100 rounded-3xl hover:bg-slate-200 transition-colors"
        >
          <LogOut size={20} />
          Sair do Aplicativo
        </button>
      </div>

      <p className="text-center text-xs text-slate-400 pb-10">
        Versão 1.3.1 (Status Inteligente)<br/>
        Remédio em Dia - Gestão de Saúde Simplificada
      </p>

      <ConfirmationModal
        isOpen={showResetConfirm}
        title="Trocar Perfil"
        message="Isso permitirá que você reconfigure seu perfil (autocuidado ou cuidador). Seus dados de medicamentos e consultas serão mantidos. Deseja continuar?"
        confirmText="Continuar"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={() => {
          setShowResetConfirm(false);
          handleResetOnboarding();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};

export default Settings;
