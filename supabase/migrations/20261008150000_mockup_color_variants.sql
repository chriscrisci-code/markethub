-- A saved mockup image is a sellable color variant.
-- Idempotent: safe to re-run.

alter table item_mockups
  add column if not exists color_name text,
  add column if not exists fulfillment_provider_key text,
  add column if not exists variant_id uuid references item_variants(id) on delete set null;

create index if not exists item_mockups_variant_id_idx on item_mockups (variant_id);
