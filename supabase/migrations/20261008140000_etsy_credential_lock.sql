-- Keep Etsy tokens in connector_connections.credentials, but stop the
-- signed-in browser role from reading or writing that column.
-- The service role still can. Safe to re-run.

revoke select (credentials), insert (credentials), update (credentials)
  on table public.connector_connections
  from anon, authenticated;

grant select (credentials), insert (credentials), update (credentials)
  on table public.connector_connections
  to service_role;
