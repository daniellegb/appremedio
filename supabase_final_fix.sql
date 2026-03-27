
-- SCRIPT DE AJUSTE FINAL E UNIFICAÇÃO DE TABELAS
-- Este script garante que todas as tabelas e políticas existam na forma correta para a arquitetura atual.

-- ==========================================
-- 1. TABELA: medications (Ajustes de colunas)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.medications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT,
    unit TEXT,
    usage_category TEXT,
    doses_per_day INTEGER,
    interval_days INTEGER,
    times TEXT[],
    interval_type TEXT,
    contraceptive_type TEXT,
    start_date DATE,
    end_date DATE,
    duration_days INTEGER,
    max_doses_per_day INTEGER,
    total_stock INTEGER,
    current_stock INTEGER,
    expiry_date DATE,
    notes TEXT,
    color TEXT,
    frequency INTEGER DEFAULT 1,
    next_dose_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que colunas específicas existam (caso a tabela já existisse)
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS next_dose_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS frequency INTEGER DEFAULT 1;

-- ==========================================
-- 2. TABELA: appointments
-- ==========================================
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    type TEXT,
    doctor TEXT,
    specialty TEXT,
    date DATE,
    time TEXT,
    location TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. TABELA: consumption_records
-- ==========================================
CREATE TABLE IF NOT EXISTS public.consumption_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    medication_id UUID REFERENCES public.medications ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    scheduled_time TEXT NOT NULL,
    status TEXT NOT NULL, -- 'taken', 'skipped', 'late'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 4. TABELA: push_subscriptions (Arquitetura V2)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    subscription JSONB NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, subscription)
);

-- Garantir colunas novas caso a tabela já existisse com estrutura antiga
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS subscription JSONB;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- ==========================================
-- 5. TABELA: medication_reminders (Nova Arquitetura)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.medication_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    medication_id UUID REFERENCES public.medications ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    reminder_time TIME NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 6. TABELA: notification_queue (Legado/Agendamentos Específicos)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notification_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    medication_id UUID REFERENCES public.medications ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 7. ÍNDICES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_notification_queue_trigger_at ON public.notification_queue(trigger_at) WHERE sent = FALSE;
CREATE INDEX IF NOT EXISTS idx_notification_queue_sent ON public.notification_queue(sent);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_medications_user_id ON public.medications(user_id);
CREATE INDEX IF NOT EXISTS idx_med_reminders_time ON public.medication_reminders(reminder_time) WHERE active = TRUE;

-- ==========================================
-- 8. SEGURANÇA (RLS) E POLÍTICAS
-- ==========================================

-- Habilitar RLS em todas
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para criar políticas sem erro de duplicata
DO $$ 
BEGIN
    -- Políticas para medications
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own medications') THEN
        CREATE POLICY "Users can manage own medications" ON public.medications FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Políticas para appointments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own appointments') THEN
        CREATE POLICY "Users can manage own appointments" ON public.appointments FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Políticas para consumption_records
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own consumption') THEN
        CREATE POLICY "Users can manage own consumption" ON public.consumption_records FOR ALL USING (auth.uid() = user_id);
    END IF;

    -- Políticas para push_subscriptions
    DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.push_subscriptions;
    CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id);

    -- Políticas para medication_reminders
    DROP POLICY IF EXISTS "Users can manage own reminders" ON public.medication_reminders;
    CREATE POLICY "Users can manage own reminders" ON public.medication_reminders FOR ALL USING (auth.uid() = user_id);

    -- Políticas para notification_queue (CORREÇÃO: Adicionado INSERT/UPDATE/DELETE)
    DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notification_queue;
    CREATE POLICY "Users can manage own notifications" ON public.notification_queue FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_queue;
END $$;
