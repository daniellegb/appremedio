import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import Medications from './components/Medications';
import AddMedication from './components/AddMedication';
import Appointments from './components/Appointments';
import AddAppointment from './components/AddAppointment';
import Calendar from './components/Calendar';
import Settings from './components/Settings';
import ConfirmationModal from './components/ConfirmationModal';
import { ViewType, Medication, DoseEvent, Appointment, AppSettings, UsageCategory } from './types';
import { INITIAL_MEDS, INITIAL_APPOINTMENTS, INITIAL_DOSES, COLORS } from './constants';

const STORAGE_KEYS = {
  APPOINTMENTS: 'medmanager_v2_appointments',
  MEDS: 'medmanager_v2_meds',
  DOSES: 'medmanager_v2_doses',
  SETTINGS: 'medmanager_v2_settings'
};

const DEFAULT_SETTINGS: AppSettings = {
  thresholdExpiring: 3,
  thresholdRunningOut: 3,
  showDelayDisclaimer: true
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewType>('dashboard');
  
  const loadData = <T,>(key: string, defaultValue: T): T => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(`[MedManager] Erro ao carregar ${key}:`, e);
    }
    return defaultValue;
  };

  const [meds, setMeds] = useState<Medication[]>(() => {
    const data = loadData(STORAGE_KEYS.MEDS, INITIAL_MEDS);
    // Deduplicate by ID
    const seen = new Set();
    return data.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  });
  const [doses, setDoses] = useState<DoseEvent[]>(() => {
    const data = loadData(STORAGE_KEYS.DOSES, INITIAL_DOSES);
    const seen = new Set();
    return data.filter(d => {
      // For doses, we also want to avoid duplicates of the same med/time/date
      const key = `${d.medicationId}-${d.scheduledTime}-${d.date}`;
      if (seen.has(d.id) || seen.has(key)) return false;
      seen.add(d.id);
      seen.add(key);
      return true;
    });
  });
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    const data = loadData(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    const seen = new Set();
    return data.filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  });
  const [settings, setSettings] = useState<AppSettings>(() => loadData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS));

  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [initialMedCategory, setInitialMedCategory] = useState<UsageCategory | undefined>(undefined);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));
  }, [appointments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MEDS, JSON.stringify(meds));
  }, [meds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DOSES, JSON.stringify(doses));
  }, [doses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const handleSaveMedication = (newMed: Medication) => {
    setMeds(prev => {
      const exists = prev.some(m => m.id === newMed.id);
      if (exists) {
        return prev.map(m => m.id === newMed.id ? newMed : m);
      }
      const finalMed = { ...newMed, color: newMed.color || COLORS[Math.floor(Math.random() * COLORS.length)] };
      return [finalMed, ...prev];
    });
    setEditingMedication(null);
    setView('meds');
  };

  const handleDeleteMed = (id: string) => {
    openConfirm(
      'Excluir Medicamento',
      'Tem certeza que deseja excluir este medicamento? Esta ação não pode ser desfeita.',
      () => {
        const idStr = String(id);
        setMeds(prev => prev.filter(m => String(m.id) !== idStr));
        setDoses(prev => prev.filter(d => String(d.medicationId) !== idStr));
      }
    );
  };

  const handleEditMedication = (med: Medication) => {
    setEditingMedication(med);
    setView('add-med');
  };

  const handleSaveAppointment = (newApp: Appointment) => {
    setAppointments(prev => {
      const exists = prev.some(app => app.id === newApp.id);
      if (exists) {
        return prev.map(app => app.id === newApp.id ? newApp : app);
      }
      return [newApp, ...prev];
    });
    setEditingAppointment(null);
    setView('appointments');
  };

  const handleDeleteAppointment = (id: string) => {
    openConfirm(
      'Excluir Compromisso',
      'Tem certeza que deseja excluir este compromisso?',
      () => {
        setAppointments(prev => prev.filter(app => String(app.id) !== String(id)));
      }
    );
  };

  const handleToggleDose = (doseId: string, medicationId?: string, time?: string, date?: string) => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const targetDate = date || todayStr;
    
    setDoses(prev => {
      // 1. Tentar encontrar pelo ID exato (seja real ou virtual)
      let existingIndex = prev.findIndex(d => d.id === doseId);
      
      // 2. Se não encontrou pelo ID e temos med/time/date, tentar encontrar um registro real equivalente
      if (existingIndex === -1 && medicationId && time) {
        existingIndex = prev.findIndex(d => 
          d.medicationId === medicationId && 
          d.scheduledTime === time && 
          d.date === targetDate
        );
      }
      
      if (existingIndex > -1) {
        // Toggle de dose existente
        const updatedDoses = [...prev];
        const currentDose = updatedDoses[existingIndex];
        const med = meds.find(m => m.id === currentDose.medicationId);
        const isPrn = med?.usageCategory === 'prn';
        
        const newStatus = currentDose.status === 'taken' ? 'pending' : 'taken';
        
        // Se for PRN e estivermos desmarcando (voltando para pending), deletamos o registro
        if (isPrn && newStatus === 'pending') {
          // Atualiza estoque (devolve 1)
          setMeds(currentMeds => currentMeds.map(m => 
            m.id === currentDose.medicationId 
              ? { ...m, currentStock: m.currentStock + 1 } 
              : m
          ));
          return prev.filter((_, i) => i !== existingIndex);
        }

        // Atualiza estoque baseado na mudança de status para meds regulares
        setMeds(currentMeds => currentMeds.map(m => 
          m.id === currentDose.medicationId 
            ? { ...m, currentStock: Math.max(0, m.currentStock + (newStatus === 'taken' ? -1 : 1)) } 
            : m
        ));

        updatedDoses[existingIndex] = { ...currentDose, status: newStatus };
        return updatedDoses;
      } else if (medicationId && time) {
        // Criação de novo evento de dose
        const newDose: DoseEvent = {
          id: Math.random().toString(36).substr(2, 9),
          medicationId,
          date: targetDate,
          scheduledTime: time,
          status: 'taken'
        };

        // Reduz o estoque ao marcar como tomado
        setMeds(currentMeds => currentMeds.map(m => 
          m.id === medicationId 
            ? { ...m, currentStock: Math.max(0, m.currentStock - 1) } 
            : m
        ));

        return [...prev, newDose];
      }
      return prev;
    });
  };

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard 
          meds={meds} 
          doses={doses} 
          appointments={appointments} 
          settings={settings} 
          onToggleDose={handleToggleDose} 
          onEditMed={handleEditMedication}
          onUpdateSettings={setSettings}
          onDeleteAppointment={handleDeleteAppointment}
          onEditAppointment={(app) => { setEditingAppointment(app); setView('add-appointment'); }}
          onAddMed={(cat) => { setEditingMedication(null); setInitialMedCategory(cat); setView('add-med'); }}
        />;
      case 'meds':
        return <Medications meds={meds} settings={settings} onAdd={() => { setEditingMedication(null); setInitialMedCategory(undefined); setView('add-med'); }} onEdit={handleEditMedication} onDelete={handleDeleteMed} />;
      case 'add-med':
        return <AddMedication onSave={handleSaveMedication} onCancel={() => setView('meds')} initialData={editingMedication} initialCategory={initialMedCategory} />;
      case 'appointments':
        return <Appointments appointments={appointments} onAddClick={() => { setEditingAppointment(null); setView('add-appointment'); }} onEditClick={(app) => { setEditingAppointment(app); setView('add-appointment'); }} onDeleteClick={handleDeleteAppointment} />;
      case 'add-appointment':
        return <AddAppointment onSave={handleSaveAppointment} onCancel={() => setView('appointments')} initialData={editingAppointment} />;
      case 'calendar':
        return <Calendar appointments={appointments} meds={meds} doses={doses} onToggleDose={handleToggleDose} />;
      case 'settings':
        return <Settings 
          settings={settings} 
          onUpdateSettings={setSettings} 
          onClearData={() => {
            openConfirm(
              'Limpar Dados',
              'Isso apagará todos os seus remédios e consultas. Esta ação não pode ser desfeita. Continuar?',
              () => {
                localStorage.clear();
                window.location.reload();
              }
            );
          }} 
        />;
      default:
        return <Dashboard 
          meds={meds} 
          doses={doses} 
          appointments={appointments} 
          settings={settings} 
          onToggleDose={handleToggleDose} 
          onEditMed={handleEditMedication} 
          onUpdateSettings={setSettings} 
          onDeleteAppointment={handleDeleteAppointment}
          onEditAppointment={(app) => { setEditingAppointment(app); setView('add-appointment'); }}
          onAddMed={(cat) => { setEditingMedication(null); setInitialMedCategory(cat); setView('add-med'); }}
        />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <Navigation currentView={view === 'add-appointment' ? 'appointments' : (view === 'add-med' ? 'meds' : view)} setView={setView} />
      <main className="flex-1 md:ml-64 p-4 md:p-10 transition-all duration-300">
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </main>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default App;