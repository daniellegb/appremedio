
-- 1. Primeiro, redefinimos a função para NÃO usar a coluna advance_minutes
CREATE OR REPLACE FUNCTION public.handle_medication_jobs()
RETURNS TRIGGER AS $$
DECLARE
    normalized_dose timestamp;
BEGIN
    IF NEW.next_dose_at IS NOT NULL AND (OLD.next_dose_at IS NULL OR NEW.next_dose_at != OLD.next_dose_at) THEN
        normalized_dose := date_trunc('minute', NEW.next_dose_at);
        
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
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Agora podemos remover a coluna com CASCADE para limpar dependências residuais no trigger
-- O CASCADE removerá o trigger se ele depender especificamente da coluna (ex: UPDATE OF advance_minutes)
ALTER TABLE public.medications DROP COLUMN IF EXISTS advance_minutes CASCADE;

-- 3. Recriamos o trigger caso ele tenha sido removido pelo CASCADE
-- Garantimos que ele dispare apenas em mudanças relevantes
DROP TRIGGER IF EXISTS on_medication_upsert ON public.medications;
CREATE TRIGGER on_medication_upsert
    AFTER INSERT OR UPDATE OF next_dose_at, name, dosage
    ON public.medications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_medication_jobs();
