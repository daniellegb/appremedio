
-- Tabela para armazenar configurações do usuário de forma sincronizada
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own settings') THEN
        CREATE POLICY "Users can manage own settings" ON public.user_settings 
        FOR ALL USING (auth.uid() = user_id) 
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

