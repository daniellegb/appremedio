import React, { useState, useEffect, useCallback } from 'react';
import Navigation from '../../components/Navigation';
import Dashboard from '../../components/Dashboard';
import Medications from '../../components/Medications';
import AddMedication from '../../components/AddMedication';
import Appointments from '../../components/Appointments';
import AddAppointment from '../../components/AddAppointment';
import Calendar from '../../components/Calendar';
import Settings from '../../components/Settings';
import ConfirmationModal from '../../components/ConfirmationModal';
import { ViewType, Medication, DoseEvent, Appointment, AppSettings, UsageCategory } from '../../types';
import { COLORS } from '../../constants';
import { useAuthContext } from '../context/AuthContext';
import { medicationService } from '../services/medicationService';
import { consumptionService } from '../services/consumptionService';
import { appointmentService } from '../services/appointmentService';
import { useLocation } from 'react-router-dom';

import { getUpdatedStock } from '../domain/stock';
import { getNextDoseAt } from '../domain/medicationRules';
import { pushService } from '../services/pushService';

const STORAGE_KEYS = {
  SETTINGS: 'medmanager_v2_settings'
};

const DEFAULT_SETTINGS: AppSettings = {
  thresholdExpiring: 3,
  thresholdRunningOut: 3,
  showDelayDisclaimer: true,
  showGreeting: true
};

const MainApp: React.FC = () => {
  const { user } = useAuthContext();
  const location = useLocation();
  
  const [meds, setMeds] = useState<Medication[]>([]);
  const [doses, setDoses] = useState<DoseEvent[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [initialMedCategory, setInitialMedCategory] = useState<UsageCategory | undefined>(undefined);
  
  const [view, setView] = useState<ViewType>(() => {
    if (location.state?.openAddMed) return 'add-med';
    return 'dashboard';
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (location.state?.openAddMed) {
      setView('add-med');
      setEditingMedication(null);
      setInitialMedCategory(undefined);
    }
  }, [location.state]);
  
  const loadData = <T,>(key: string, defaultValue: T): T => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(`[Remédio em Dia] Erro ao carregar ${key}:`, e);
    }
    return defaultValue;
  };

  const [settings, setSettings] = useState<AppSettings>(() => {
    const loaded = loadData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    // Merge with defaults to ensure new fields like showGreeting are present
    return { ...DEFAULT_SETTINGS, ...loaded };
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [medsData, dosesData, appointmentsData] = await Promise.all([
        medicationService.getMedications(user.id),
        consumptionService.getConsumptionRecords(user.id),
        appointmentService.getAppointments(user.id)
      ]);
      setMeds(medsData);
      setDoses(dosesData);
      setAppointments(appointmentsData);
      
      // Sync push reminders on load
      if (medsData.length > 0) {
        pushService.syncMedicationReminders(user.id, medsData).catch(err => 
          console.error('Erro ao sincronizar lembretes:', err)
        );
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const handleSaveMedication = async (newMed: Medication) => {
    if (!user) return;
    try {
      const exists = meds.some(m => m.id === newMed.id);
      if (exists) {
        const updated = await medicationService.updateMedication(user.id, newMed.id, newMed);
        const newMeds = meds.map(m => m.id === updated.id ? updated : m);
        setMeds(newMeds);
        await pushService.syncMedicationReminders(user.id, newMeds);
      } else {
        const finalMed = { ...newMed, color: newMed.color || COLORS[Math.floor(Math.random() * COLORS.length)] };
        const created = await medicationService.createMedication(user.id, finalMed);
        const newMeds = [created, ...meds];
        setMeds(newMeds);
        await pushService.syncMedicationReminders(user.id, newMeds);
      }
      setEditingMedication(null);
      setView('meds');
    } catch (error) {
      console.error('Erro ao salvar medicamento:', error);
    }
  };

  const handleDeleteMed = async (id: string) => {
    if (!user) return;
    openConfirm(
      'Excluir Medicamento',
      'Tem certeza que deseja excluir este medicamento? Esta ação não pode ser desfeita.',
      async () => {
        try {
          await medicationService.deleteMedication(user.id, id);
          const newMeds = meds.filter(m => m.id !== id);
          setMeds(newMeds);
          setDoses(prev => prev.filter(d => d.medicationId !== id));
          await pushService.syncMedicationReminders(user.id, newMeds);
        } catch (error) {
          console.error('Erro ao excluir medicamento:', error);
        }
      }
    );
  };

  const handleEditMedication = (med: Medication) => {
    setEditingMedication(med);
    setView('add-med');
  };

  const handleSaveAppointment = async (newApp: Appointment) => {
    if (!user) return;
    try {
      const exists = appointments.some(app => app.id === newApp.id);
      if (exists) {
        const updated = await appointmentService.updateAppointment(user.id, newApp.id, newApp);
        setAppointments(prev => prev.map(app => app.id === updated.id ? updated : app));
      } else {
        const created = await appointmentService.createAppointment(user.id, newApp);
        setAppointments(prev => [created, ...prev]);
      }
      setEditingAppointment(null);
      setView('appointments');
    } catch (error) {
      console.error('Erro ao salvar compromisso:', error);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!user) return;
    openConfirm(
      'Excluir Compromisso',
      'Tem certeza que deseja excluir este compromisso?',
      async () => {
        try {
          await appointmentService.deleteAppointment(user.id, id);
          setAppointments(prev => prev.filter(app => app.id !== id));
        } catch (error) {
          console.error('Erro ao excluir compromisso:', error);
        }
      }
    );
  };

  const handleToggleDose = async (doseId: string, medicationId?: string, time?: string, date?: string) => {
    if (!user) return;
    const todayStr = new Date().toLocaleDateString('en-CA');
    const targetDate = date || todayStr;
    
    try {
      // 1. Tentar encontrar pelo ID exato (seja real ou virtual)
      let existingIndex = doses.findIndex(d => d.id === doseId);
      
      // 2. Se não encontrou pelo ID e temos med/time/date, tentar encontrar um registro real equivalente
      if (existingIndex === -1 && medicationId && time) {
        existingIndex = doses.findIndex(d => 
          d.medicationId === medicationId && 
          d.scheduledTime === time && 
          d.date === targetDate
        );
      }
      
      if (existingIndex > -1) {
        // Toggle de dose existente
        const currentDose = doses[existingIndex];
        const med = meds.find(m => m.id === currentDose.medicationId);
        const isPrn = med?.usageCategory === 'prn';
        
        const newStatus = currentDose.status === 'taken' ? 'pending' : 'taken';
        
        // Se for PRN e estivermos desmarcando (voltando para pending), deletamos o registro
        if (isPrn && newStatus === 'pending') {
          await consumptionService.deleteConsumptionRecord(user.id, currentDose.id);
          
          // Atualiza estoque (devolve 1)
          if (med) {
            const updatedMed = await medicationService.updateMedication(user.id, med.id, { 
              currentStock: getUpdatedStock(med.currentStock, 'pending') 
            });
            setMeds(prev => prev.map(m => m.id === updatedMed.id ? updatedMed : m));
          }
          
          setDoses(prev => prev.filter((_, i) => i !== existingIndex));
          return;
        }

        // Atualiza status no banco
        const updatedDose = await consumptionService.updateConsumptionRecord(user.id, currentDose.id, { 
          status: newStatus 
        });

        // Atualiza estoque baseado na mudança de status para meds regulares
        if (med) {
          const updatedMed = await medicationService.updateMedication(user.id, med.id, { 
            currentStock: getUpdatedStock(med.currentStock, newStatus),
            // Recalcular próxima dose ao marcar como tomado
            next_dose_at: newStatus === 'taken' ? getNextDoseAt(med) : med.next_dose_at
          });
          setMeds(currentMeds => currentMeds.map(m => m.id === updatedMed.id ? updatedMed : m));
        }

        setDoses(prev => prev.map(d => d.id === updatedDose.id ? updatedDose : d));
        return;
      } else if (medicationId && time) {
        // Criação de novo evento de dose
        const createdDose = await consumptionService.createConsumptionRecord(user.id, {
          medicationId,
          date: targetDate,
          scheduledTime: time,
          status: 'taken'
        });

        // Reduz o estoque ao marcar como tomado
        const med = meds.find(m => m.id === medicationId);
        if (med) {
          const updatedMed = await medicationService.updateMedication(user.id, med.id, { 
            currentStock: getUpdatedStock(med.currentStock, 'taken'),
            next_dose_at: getNextDoseAt(med)
          });
          setMeds(prev => prev.map(m => m.id === updatedMed.id ? updatedMed : m));
        }

        setDoses(prev => [...prev, createdDose]);
      }
    } catch (error) {
      console.error('Erro ao alternar dose:', error);
    }
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
        return <Calendar appointments={appointments} meds={meds} doses={doses} onToggleDose={handleToggleDose} onEditMed={handleEditMedication} />;
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
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            renderView()
          )}
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

export default MainApp;
