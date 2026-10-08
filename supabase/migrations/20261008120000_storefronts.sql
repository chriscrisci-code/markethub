-- Multiple storefronts (including several Etsy accounts) and per-listing connection.
-- Idempotent: safe to re-run.

insert into connector_registry (key, type, display_name) values
  ('etsy', 'marketplace', 'Etsy')
on conflict (key) do nothing;

alter table connector_connections
  add column if not exists display_name text;

update connector_connections c
set display_name = coalesce(
  nullif(c.display_name, ''),
  (select r.display_name from connector_registry r where r.key = c.connector_key),
  c.connector_key
)
where c.display_name is null or c.display_name = '';

alter table connector_connections
  drop constraint if exists connector_connections_user_id_connector_key_key;

alter table channel_listings
  add column if not exists connection_id uuid references connector_connections(id) on delete cascade;

-- One default connection per existing user+marketplace key, then attach listings.
insert into connector_connections (user_id, connector_key, display_name, status)
select distinct i.user_id, l.connector_key, r.display_name, 'connected'
from channel_listings l
join items i on i.id = l.item_id
join connector_registry r on r.key = l.connector_key
where not exists (
  select 1 from connector_connections c
  where c.user_id = i.user_id
    and c.connector_key = l.connector_key
);

update channel_listings l
set connection_id = c.id
from items i, connector_connections c
where l.connection_id is null
  and i.id = l.item_id
  and c.user_id = i.user_id
  and c.connector_key = l.connector_key;

alter table channel_listings
  drop constraint if exists channel_listings_item_id_connector_key_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'channel_listings'::regclass
      and conname = 'channel_listings_item_id_connection_id_key'
  ) then
    alter table channel_listings
      add constraint channel_listings_item_id_connection_id_key
      unique (item_id, connection_id);
  end if;
end $$;

alter table orders
  add column if not exists source_connection_id uuid references connector_connections(id) on delete set null;
