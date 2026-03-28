
-- 1. Limpar TUDO para começar do zero e evitar erros de restrição
DELETE FROM public.medication_reminders;

-- 2. Remover a restrição antiga que estava permitindo duplicatas (por incluir o template)
ALTER TABLE public.medication_reminders 
DROP CONSTRAINT IF EXISTS unique_user_med_time_template;

-- 3. Criar a restrição CORRETA: Um remédio só pode ter UM registro por horário para o usuário
ALTER TABLE public.medication_reminders 
ADD CONSTRAINT unique_medication_time_per_user 
UNIQUE (user_id, medication_id, reminder_time);

