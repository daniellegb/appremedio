
-- 1. Limpar duplicatas existentes na tabela medication_reminders
DELETE FROM public.medication_reminders a
USING public.medication_reminders b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.medication_id = b.medication_id
  AND a.reminder_time = b.reminder_time
  AND COALESCE(a.message_template, '') = COALESCE(b.message_template, '');

-- 2. Garantir que message_template não seja nulo e tenha um padrão
UPDATE public.medication_reminders SET message_template = 'Hora de tomar ' || medication_name WHERE message_template IS NULL;
ALTER TABLE public.medication_reminders ALTER COLUMN message_template SET NOT NULL;
ALTER TABLE public.medication_reminders ALTER COLUMN message_template SET DEFAULT '';

-- 3. Adicionar restrição de unicidade para evitar futuras duplicatas
ALTER TABLE public.medication_reminders 
DROP CONSTRAINT IF EXISTS unique_user_med_time_template;

ALTER TABLE public.medication_reminders 
ADD CONSTRAINT unique_user_med_time_template 
UNIQUE (user_id, medication_id, reminder_time, message_template);

