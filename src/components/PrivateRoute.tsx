import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const PrivateRoute: React.FC = () => {
  const { isAuthenticated, onboardingCompleted, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Se o onboarding não foi concluído e não estamos na página de onboarding, redireciona
  if (!onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Se o onboarding já foi concluído e estamos na página de onboarding, 
  // deixamos o componente Onboarding lidar com a navegação final para preservar o estado (ex: abrir cadastro de remédio)
  return <Outlet />;
};

export default PrivateRoute;
