-- Add Printful as a fulfillment connector (idempotent)

insert into connector_registry (key, type, display_name, is_enabled)
values ('printful', 'fulfillment', 'Printful', true)
on conflict (key) do update
set
  display_name = excluded.display_name,
  is_enabled = true,
  updated_at = now();
