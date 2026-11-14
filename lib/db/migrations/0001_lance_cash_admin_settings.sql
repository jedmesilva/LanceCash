CREATE TABLE IF NOT EXISTS public.lance_cash_admin_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  system_bids_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
