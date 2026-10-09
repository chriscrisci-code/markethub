-- Printful catalog variants, mockup-to-variant links, and Etsy publication state.
-- Additive. Existing rows stay. Safe to re-run.

create table if not exists provider_catalog_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  provider_key text not null references connector_registry(key),
  catalog_product_id text not null,
  catalog_variant_id text not null,
  color_name text,
  color_code text,
  size_name text,
  sku text,
  in_stock boolean not null default true,
  cost_cents integer,
  currency text not null default 'USD',
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, provider_key, catalog_variant_id)
);

create index if not exists provider_catalog_variants_item_idx
  on provider_catalog_variants (item_id);

alter table item_variants
  add column if not exists provider_catalog_variant_id uuid
    references provider_catalog_variants(id) on delete set null;

alter table item_mockups
  add column if not exists item_design_id uuid references item_designs(id) on delete set null,
  add column if not exists catalog_product_id text,
  add column if not exists mapping_status text not null default 'needs_resolution';

update item_mockups
set mapping_status = 'needs_resolution'
where mapping_status is null
   or color_name is null
   or variant_id is null;

create table if not exists item_mockup_variants (
  mockup_id uuid not null references item_mockups(id) on delete cascade,
  provider_catalog_variant_id uuid not null references provider_catalog_variants(id) on delete cascade,
  primary key (mockup_id, provider_catalog_variant_id)
);

alter table channel_listings
  add column if not exists publication_state text,
  add column if not exists listing_url text,
  add column if not exists sync_error text;

create table if not exists listing_variant_mappings (
  id uuid primary key default gen_random_uuid(),
  channel_listing_id uuid not null references channel_listings(id) on delete cascade,
  item_variant_id uuid references item_variants(id) on delete set null,
  provider_catalog_variant_id uuid references provider_catalog_variants(id) on delete set null,
  sku text,
  external_product_id text,
  external_offering_id text,
  created_at timestamptz not null default now(),
  unique (channel_listing_id, sku)
);

alter table provider_catalog_variants enable row level security;
alter table item_mockup_variants enable row level security;
alter table listing_variant_mappings enable row level security;

drop policy if exists "provider_catalog_variants_all" on provider_catalog_variants;
create policy "provider_catalog_variants_all" on provider_catalog_variants
  for all to authenticated
  using (
    exists (
      select 1 from items
      where items.id = provider_catalog_variants.item_id
        and items.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from items
      where items.id = provider_catalog_variants.item_id
        and items.user_id = auth.uid()
    )
  );

drop policy if exists "item_mockup_variants_all" on item_mockup_variants;
create policy "item_mockup_variants_all" on item_mockup_variants
  for all to authenticated
  using (
    exists (
      select 1 from item_mockups
      join items on items.id = item_mockups.item_id
      where item_mockups.id = item_mockup_variants.mockup_id
        and items.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from item_mockups
      join items on items.id = item_mockups.item_id
      where item_mockups.id = item_mockup_variants.mockup_id
        and items.user_id = auth.uid()
    )
  );

drop policy if exists "listing_variant_mappings_all" on listing_variant_mappings;
create policy "listing_variant_mappings_all" on listing_variant_mappings
  for all to authenticated
  using (
    exists (
      select 1 from channel_listings
      join items on items.id = channel_listings.item_id
      where channel_listings.id = listing_variant_mappings.channel_listing_id
        and items.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from channel_listings
      join items on items.id = channel_listings.item_id
      where channel_listings.id = listing_variant_mappings.channel_listing_id
        and items.user_id = auth.uid()
    )
  );
