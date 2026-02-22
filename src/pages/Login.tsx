import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Pill, Mail, Lock, Loader2, AlertTriangle } from 'lucide-react';

const Login: React.FC = () => {
  // Estados locais controlados
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const navigate = useNavigate();
  const { signIn, signUp, isConfigured } = useAuth();

  // Implementar função handleLogin
  const handleLogin = async (e: React.FormEvent) => {
    // Prevenir default
    e.preventDefault();
    
    if (isSignUp) {
      handleRegister();
      return;
    }

    // SetLoading(true)
    setLoading(true);
    // Limpar erro
    setError(null);

    try {
      // Chamar signIn(email, password)
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      // Tratar erro se houver
      setError(err.message || 'Erro ao entrar. Verifique suas credenciais.');
    } finally {
      // Finalizar loading
      setLoading(false);
    }
  };

  // Implementar função handleRegister
  const handleRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      // Chamar signUp(email, password)
      await signUp(email, password);
      setError('Cadastro realizado com sucesso! Verifique seu e-mail para confirmar a conta.');
      setIsSignUp(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[40px] shadow-xl border border-slate-100 p-8 md:p-12">
        {/* Aviso de configuração do Supabase (Mantido conforme layout anterior) */}
        {!isConfigured && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <div>
              <p className="text-amber-800 text-sm font-bold">Configuração Pendente</p>
              <p className="text-amber-700 text-xs mt-1">
                As variáveis de ambiente do Supabase não foram encontradas. 
                Configure <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no painel do AI Studio.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 mb-6">
            <Pill size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Remédio em Dia</h1>
          <p className="text-slate-500 font-medium">
            {isSignUp ? 'Crie sua conta gratuita' : 'Bem-vindo de volta'}
          </p>
        </div>

        {/* Formulário deve usar <form onSubmit={handleLogin}> */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              {/* Inputs CONTROLADOS */}
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="seu@email.com"
                required
                disabled={!isConfigured || loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              {/* Inputs CONTROLADOS */}
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="••••••••"
                required
                disabled={!isConfigured || loading}
              />
            </div>
          </div>

          {/* Exibir erro abaixo do formulário se existir */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Botão "Entrar" / "Cadastrar" */}
          <button
            type="submit"
            disabled={loading || !isConfigured}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : (isSignUp ? 'Cadastrar' : 'Entrar')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-slate-500 font-bold hover:text-blue-600 transition-colors"
            disabled={loading || !isConfigured}
          >
            {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Cadastre-se'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
