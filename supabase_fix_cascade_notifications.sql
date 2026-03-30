
-- ==========================================
-- MELHORIA: notification_jobs com CASCADE
-- ==========================================

-- Adicionar colunas de referência para permitir CASCADE DELETE
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE;
ALTER TABLE public.notification_jobs ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES public.notification_queue(id) ON DELETE CASCADE;

-- Adicionar índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_notification_jobs_medication_id ON public.notification_jobs(medication_id);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_appointment_id ON public.notification_jobs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_queue_id ON public.notification_jobs(queue_id);

-- Limpar jobs órfãos que possam ter sobrado de medicamentos já deletados
DELETE FROM public.notification_jobs 
WHERE status = 'pending' 
  AND (payload->>'type' = 'medication_reminder' OR payload->>'type' = 'medication_next_dose')
  AND NOT EXISTS (
    SELECT 1 FROM public.medications WHERE id::text = (payload->>'medication_id')
  );
