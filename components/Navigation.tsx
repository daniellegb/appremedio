
import React from 'react';
import { ViewType } from '../types';
import { Home, Calendar, Pill, Clock, Settings } from 'lucide-react';

interface Props {
  currentView: ViewType;
  setView: (view: ViewType) => void;
}

const Navigation: React.FC<Props> = ({ currentView, setView }) => {
  const navItems = [
    { id: 'dashboard', label: 'Hoje', icon: Home },
    { id: 'calendar', label: 'Calendário', icon: Calendar },
    { id: 'meds', label: 'Remédios', icon: Pill },
    { id: 'appointments', label: 'Consultas', icon: Clock },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center py-3 z-50">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as ViewType)}
            className={`flex flex-col items-center gap-1 ${
              currentView === item.id ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Desktop Sidebar Nav */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 p-6 z-50">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <Pill size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">MedManager</h1>
        </div>
        <div className="flex flex-col gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id as ViewType)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                currentView === item.id
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};

export default Navigation;
