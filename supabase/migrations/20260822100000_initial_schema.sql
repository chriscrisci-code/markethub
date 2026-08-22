-- Market Hub Phase 1 schema

create extension if not exists "pgcrypto";

-- Enums
create type item_status as enum ('draft', 'active', 'archived');
create type connector_type as enum ('fulfillment', 'marketplace');
create type sync_status as enum ('not_published', 'published', 'sync_pending', 'sync_error');
create type adjustment_status as enum ('proposed', 'approved', 'reverted');
create type order_status as enum ('pending', 'processing', 'fulfilled', 'cancelled', 'refunded');
create type cost_type as enum (
  'marketplace_fee',
  'fulfillment_expected',
  'fulfillment_confirmed',
  'refund',
  'other'
);

-- Connector registry
create table connector_registry (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  type connector_type not null,
  display_name text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table connector_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector_key text not null references connector_registry(key),
  credentials jsonb not null default '{}',
  status text not null default 'disconnected',
  external_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connector_key)
);

-- Products
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Item',
  description text not null default '',
  base_price_cents integer not null default 0 check (base_price_cents >= 0),
  status item_status not null default 'draft',
  product_type text not null default 'apparel',
  fulfillment_provider_key text references connector_registry(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table item_variants (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  label text not null,
  sku text,
  price_cents_override integer check (price_cents_override >= 0),
  attributes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table item_artwork (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references items(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  width_px integer,
  height_px integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table item_designs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references items(id) on delete cascade,
  printable_area jsonb not null default '{}',
  provider_product_ref jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table provider_design_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_design_id uuid not null references item_designs(id) on delete cascade,
  provider_key text not null references connector_registry(key),
  adjustment jsonb not null default '{}',
  status adjustment_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Channels
create table channel_listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  connector_key text not null references connector_registry(key),
  external_listing_id text,
  sync_status sync_status not null default 'not_published',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, connector_key)
);

-- Orders (schema only in Phase 1)
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market_hub_order_number serial,
  source_connector_key text references connector_registry(key),
  external_order_id text,
  customer jsonb not null default '{}',
  shipping jsonb not null default '{}',
  status order_status not null default 'pending',
  sale_amount_cents integer not null default 0 check (sale_amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  variant_id uuid references item_variants(id) on delete set null,
  label text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);

create table fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider_key text references connector_registry(key),
  external_job_id text,
  status text not null default 'pending',
  tracking jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_costs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  cost_type cost_type not null,
  label text not null,
  amount_cents integer not null,
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table business_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  amount_cents integer not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Indexes
create index items_user_id_idx on items(user_id);
create index channel_listings_item_id_idx on channel_listings(item_id);
create index orders_user_id_idx on orders(user_id);

-- Updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_updated_at before update on items
  for each row execute function set_updated_at();
create trigger item_variants_updated_at before update on item_variants
  for each row execute function set_updated_at();
create trigger item_artwork_updated_at before update on item_artwork
  for each row execute function set_updated_at();
create trigger item_designs_updated_at before update on item_designs
  for each row execute function set_updated_at();
create trigger provider_design_adjustments_updated_at before update on provider_design_adjustments
  for each row execute function set_updated_at();
create trigger channel_listings_updated_at before update on channel_listings
  for each row execute function set_updated_at();
create trigger connector_connections_updated_at before update on connector_connections
  for each row execute function set_updated_at();
create trigger orders_updated_at before update on orders
  for each row execute function set_updated_at();
create trigger fulfillment_jobs_updated_at before update on fulfillment_jobs
  for each row execute function set_updated_at();

-- Seed connector registry
insert into connector_registry (key, type, display_name) values
  ('mock-fulfillment', 'fulfillment', 'Mock Fulfillment Provider'),
  ('mock-marketplace', 'marketplace', 'Mock Marketplace'),
  ('market-hub-store', 'marketplace', 'Market Hub Store');

-- RLS
alter table connector_registry enable row level security;
alter table connector_connections enable row level security;
alter table items enable row level security;
alter table item_variants enable row level security;
alter table item_artwork enable row level security;
alter table item_designs enable row level security;
alter table provider_design_adjustments enable row level security;
alter table channel_listings enable row level security;
alter table orders enable row level security;
alter table order_line_items enable row level security;
alter table fulfillment_jobs enable row level security;
alter table order_costs enable row level security;
alter table business_expenses enable row level security;

-- connector_registry: readable by authenticated users
create policy "connector_registry_select" on connector_registry
  for select to authenticated using (true);

-- connector_connections: owner only
create policy "connector_connections_all" on connector_connections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- items: owner only
create policy "items_all" on items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- item child tables: via item ownership
create policy "item_variants_all" on item_variants
  for all to authenticated
  using (exists (select 1 from items where items.id = item_variants.item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_variants.item_id and items.user_id = auth.uid()));

create policy "item_artwork_all" on item_artwork
  for all to authenticated
  using (exists (select 1 from items where items.id = item_artwork.item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_artwork.item_id and items.user_id = auth.uid()));

create policy "item_designs_all" on item_designs
  for all to authenticated
  using (exists (select 1 from items where items.id = item_designs.item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_designs.item_id and items.user_id = auth.uid()));

create policy "provider_design_adjustments_all" on provider_design_adjustments
  for all to authenticated
  using (exists (
    select 1 from item_designs
    join items on items.id = item_designs.item_id
    where item_designs.id = provider_design_adjustments.item_design_id and items.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from item_designs
    join items on items.id = item_designs.item_id
    where item_designs.id = provider_design_adjustments.item_design_id and items.user_id = auth.uid()
  ));

create policy "channel_listings_all" on channel_listings
  for all to authenticated
  using (exists (select 1 from items where items.id = channel_listings.item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = channel_listings.item_id and items.user_id = auth.uid()));

create policy "orders_all" on orders
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "order_line_items_all" on order_line_items
  for all to authenticated
  using (exists (select 1 from orders where orders.id = order_line_items.order_id and orders.user_id = auth.uid()))
  with check (exists (select 1 from orders where orders.id = order_line_items.order_id and orders.user_id = auth.uid()));

create policy "fulfillment_jobs_all" on fulfillment_jobs
  for all to authenticated
  using (exists (select 1 from orders where orders.id = fulfillment_jobs.order_id and orders.user_id = auth.uid()))
  with check (exists (select 1 from orders where orders.id = fulfillment_jobs.order_id and orders.user_id = auth.uid()));

create policy "order_costs_all" on order_costs
  for all to authenticated
  using (exists (select 1 from orders where orders.id = order_costs.order_id and orders.user_id = auth.uid()))
  with check (exists (select 1 from orders where orders.id = order_costs.order_id and orders.user_id = auth.uid()));

create policy "business_expenses_all" on business_expenses
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage buckets (run in Supabase dashboard or via storage API)
-- artwork: private, user-scoped paths
-- mockups: private
