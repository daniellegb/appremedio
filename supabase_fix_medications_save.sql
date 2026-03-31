-- SCRIPT DE CORREÇÃO: SALVAMENTO DE MEDICAMENTOS
-- Este script garante que a tabela medications tenha todas as colunas necessárias
-- e as permissões de segurança corretas para a versão restaurada.

-- 1. GARANTIR COLUNAS NA TABELA medications
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS frequency INTEGER DEFAULT 1;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS next_dose_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS usage_category TEXT;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS doses_per_day INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS interval_days INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS times TEXT[];
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS interval_type TEXT;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS contraceptive_type TEXT;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS duration_days INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS max_doses_per_day INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS total_stock INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS current_stock INTEGER;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- 2. GARANTIR SEGURANÇA (RLS)
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas para evitar conflitos e recriar a correta
DROP POLICY IF EXISTS "Users can manage own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can insert own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can update own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can delete own medications" ON public.medications;
DROP POLICY IF EXISTS "Users can view own medications" ON public.medications;

CREATE POLICY "Users can manage own medications" 
ON public.medications 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 3. GARANTIR QUE O TRIGGER NÃO ESTÁ CAUSANDO ERRO
-- Se a tabela notification_jobs não existir, o trigger handle_medication_jobs falhará.
-- O script anterior já criou, mas vamos garantir a estrutura básica aqui por segurança.

CREATE TABLE IF NOT EXISTS public.notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, 
  payload JSONB NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', 
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recriar a função do trigger para garantir que está limpa
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER AS $$
DECLARE
  normalized_dose TEXT;
BEGIN
  -- Só tenta criar job se tiver próxima dose e se a tabela de jobs existir
  IF NEW.next_dose_at IS NOT NULL THEN
    BEGIN
      normalized_dose := to_char(NEW.next_dose_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:00"Z"');

      INSERT INTO public.notification_jobs (user_id, type, payload, trigger_at, idempotency_key)
      VALUES (
        NEW.user_id,
        'medication_next_dose',
        jsonb_build_object(
          'title', 'Hora do Medicamento 💊',
          'body', 'Tomar ' || NEW.name || COALESCE(' (' || NEW.dosage || ')', ''),
          'type', 'medication_next_dose',
          'medication_id', NEW.id
        ),
        NEW.next_dose_at,
        'med_now:' || NEW.id || ':' || normalized_dose
      ) ON CONFLICT (idempotency_key) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Se der erro no trigger (ex: tabela de jobs sumiu), não trava o salvamento do medicamento
      RAISE WARNING 'Erro no trigger de notificações: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
AFTER INSERT OR UPDATE OF next_dose_at ON public.medications
FOR EACH ROW EXECUTE FUNCTION public.handle_medication_jobs();
