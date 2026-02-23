import React from 'react';
import { Pill, Heart, Settings, Plus, ChevronRight, User, Users, Info } from 'lucide-react';
import { useOnboarding } from '../hooks/useOnboarding';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  onComplete: (skipMedication?: boolean) => void;
}

const Onboarding: React.FC<Props> = ({ onComplete }) => {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const {
    state,
    setMode,
    updateProfile,
    updatePreferences,
    nextStep,
    completeOnboarding
  } = useOnboarding();

  const handleFinish = async (skipMedication: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    console.log('Finalizing onboarding...', { skipMedication });
    try {
      await completeOnboarding();
      console.log('Onboarding data saved successfully');
      await onComplete(skipMedication);
    } catch (error) {
      console.error('Error in handleFinish:', error);
      alert('Ocorreu um erro ao salvar seus dados. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-200 mb-4">
                <Pill className="text-white" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Remédio em Dia</h1>
              <p className="text-slate-500">Você está usando o app para:</p>
            </div>

            <div className="grid gap-4">
              <button
                onClick={() => setMode('self')}
                className="flex items-center gap-4 p-6 bg-white rounded-3xl border-2 border-transparent hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50/50 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <User className="text-blue-600" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Me cuidar</h3>
                  <p className="text-sm text-slate-500">Controlar meus próprios medicamentos</p>
                </div>
              </button>

              <button
                onClick={() => setMode('caregiver')}
                className="flex items-center gap-4 p-6 bg-white rounded-3xl border-2 border-transparent hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50/50 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <Users className="text-blue-600" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Cuidar de outra pessoa</h3>
                  <p className="text-sm text-slate-500">Ajudar alguém que você ama</p>
                </div>
              </button>
            </div>
          </motion.div>
        );

      case 2:
        if (state.mode === 'self') {
          return (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-pink-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Heart className="text-pink-500" size={32} />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Vamos nos conhecer!</h1>
                <p className="text-slate-500">Como podemos te chamar?</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Seu nome</label>
                  <input
                    type="text"
                    value={state.userProfile.name}
                    onChange={(e) => updateProfile({ name: e.target.value })}
                    placeholder="Digite seu nome"
                    className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-medium focus:border-blue-500 focus:ring-0 transition-all outline-none"
                  />
                </div>

                <button
                  disabled={!state.userProfile.name.trim()}
                  onClick={nextStep}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
                >
                  Continuar <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>
          );
        } else {
          return (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Heart className="text-blue-500" size={32} />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Sobre quem você cuida</h1>
                <p className="text-slate-500">Conte um pouco sobre você e quem você cuida</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Como posso te chamar?</label>
                  <input
                    type="text"
                    value={state.userProfile.caregiverName}
                    onChange={(e) => updateProfile({ caregiverName: e.target.value })}
                    placeholder="Seu nome"
                    className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-medium focus:border-blue-500 focus:ring-0 transition-all outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Como posso chamar quem é cuidado? (opcional)</label>
                  <input
                    type="text"
                    value={state.userProfile.patientName}
                    onChange={(e) => updateProfile({ patientName: e.target.value })}
                    placeholder="Nome da pessoa"
                    className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-medium focus:border-blue-500 focus:ring-0 transition-all outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Quem a pessoa cuidada é para você? (opcional)</label>
                  <input
                    type="text"
                    value={state.userProfile.relationship}
                    onChange={(e) => updateProfile({ relationship: e.target.value })}
                    placeholder="Ex: Mãe, Pai, Paciente, Amigo(a), Outro..."
                    className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-medium focus:border-blue-500 focus:ring-0 transition-all outline-none"
                  />
                </div>

                <button
                  disabled={!state.userProfile.caregiverName.trim()}
                  onClick={nextStep}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
                >
                  Continuar <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>
          );
        }

      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Settings className="text-slate-600" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Suas preferências</h1>
              <p className="text-slate-500">Escolha quando o app deve destacar vencimentos e estoque baixo.</p>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900">Aviso de vencimento</h4>
                    <p className="text-xs text-slate-500">Quantos dias antes o vencimento deve ser sinalizado?</p>
                  </div>
                  <span className="text-blue-600 font-black text-lg">{state.preferences.expiryWarningDays}d</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={state.preferences.expiryWarningDays}
                  onChange={(e) => updatePreferences({ expiryWarningDays: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900">Aviso de estoque baixo</h4>
                    <p className="text-xs text-slate-500">Quantos dias antes de acabar o estoque deve ser sinalizado?</p>
                  </div>
                  <span className="text-blue-600 font-black text-lg">{state.preferences.lowStockWarningDays}d</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={state.preferences.lowStockWarningDays}
                  onChange={(e) => updatePreferences({ lowStockWarningDays: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div className="text-center">
                <p className="text-[10px] text-slate-400 font-medium">Os avisos são exibidos apenas dentro do aplicativo.</p>
              </div>

              <button
                onClick={nextStep}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                Continuar <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-200 mb-4">
                <Pill className="text-white" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Vamos cadastrar o primeiro remédio?</h1>
              <p className="text-slate-500">Assim você já começa organizado e não perde nenhum horário</p>
            </div>

            <div className="space-y-4">
              <button
                disabled={isSubmitting}
                onClick={() => handleFinish(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Plus size={20} /> Cadastrar agora
                  </>
                )}
              </button>

              <button
                disabled={isSubmitting}
                onClick={() => handleFinish(true)}
                className="w-full bg-white text-slate-500 font-bold py-4 rounded-2xl border-2 border-slate-100 hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Pular por enquanto
              </button>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
