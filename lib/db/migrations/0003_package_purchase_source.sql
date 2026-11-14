BEGIN;

ALTER TABLE public.package_purchases
  ADD COLUMN IF NOT EXISTS source text;

UPDATE public.package_purchases
SET source = CASE
  WHEN lower(payment_provider) IN ('efi_bank_pix', 'pix_efi_bank', 'efi bank')
    THEN 'efi_bank_pix'
  ELSE 'simulated_pix'
END
WHERE source IS NULL OR btrim(source) = '';

ALTER TABLE public.package_purchases
  ALTER COLUMN source SET DEFAULT 'simulated_pix',
  ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'package_purchases_source_valid'
      AND conrelid = 'public.package_purchases'::regclass
  ) THEN
    ALTER TABLE public.package_purchases
      ADD CONSTRAINT package_purchases_source_valid
      CHECK (source IN ('efi_bank_pix', 'simulated_pix'));
  END IF;
END $$;

COMMIT;
