BEGIN;

ALTER TABLE public.auction_bids
  ADD COLUMN IF NOT EXISTS source text;

UPDATE public.auction_bids
SET source = CASE
  WHEN is_automated THEN 'system_automation'
  ELSE 'user_manual'
END
WHERE source IS NULL;

ALTER TABLE public.auction_bids
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_identity_consistent;

ALTER TABLE public.auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_source_valid;

ALTER TABLE public.auction_bids
  ADD CONSTRAINT auction_bids_source_valid
  CHECK (source IN ('user_manual', 'user_automation', 'system_automation', 'system_admin'));

ALTER TABLE public.auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_source_identity_consistent;

ALTER TABLE public.auction_bids
  ADD CONSTRAINT auction_bids_source_identity_consistent
  CHECK (
    (source = 'user_manual' AND is_automated = false AND user_id IS NOT NULL)
    OR (source = 'user_automation' AND is_automated = true AND user_id IS NOT NULL)
    OR (source = 'system_automation' AND is_automated = true AND user_id IS NULL)
    OR (source = 'system_admin' AND is_automated = false AND user_id IS NULL)
  );

COMMIT;
