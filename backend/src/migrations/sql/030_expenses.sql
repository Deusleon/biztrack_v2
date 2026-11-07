-- =====================================================
-- Migration 030: Expenses
-- =====================================================

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    store_id UUID NOT NULL,
    user_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    amount NUMERIC(12,2) NOT NULL,
    description TEXT,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference_number VARCHAR(100),
    expense_date TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT expenses_pkey PRIMARY KEY (id),
    CONSTRAINT expenses_amount_check CHECK (amount > 0),
    CONSTRAINT expenses_store_id_fkey
        FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE,
    CONSTRAINT expenses_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expenses_store_id ON public.expenses USING btree (store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses USING btree (expense_date);

DROP TRIGGER IF EXISTS trigger_update_expenses_updated_at ON public.expenses;
CREATE TRIGGER trigger_update_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
