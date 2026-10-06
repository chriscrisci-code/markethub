-- Saved mockup images per item + private mockups storage bucket
-- Idempotent: safe to re-run.

create table if not exists item_mockups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null,
  source_url text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists item_mockups_item_id_idx on item_mockups (item_id);

drop trigger if exists item_mockups_updated_at on item_mockups;
create trigger item_mockups_updated_at
  before update on item_mockups
  for each row execute function set_updated_at();

alter table item_mockups enable row level security;

drop policy if exists "item_mockups_all" on item_mockups;
create policy "item_mockups_all" on item_mockups
  for all to authenticated
  using (
    exists (
      select 1 from items
      where items.id = item_mockups.item_id
        and items.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from items
      where items.id = item_mockups.item_id
        and items.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('mockups', 'mockups', false)
on conflict (id) do nothing;

drop policy if exists "mockups_select_own" on storage.objects;
create policy "mockups_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'mockups'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mockups_insert_own" on storage.objects;
create policy "mockups_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'mockups'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mockups_update_own" on storage.objects;
create policy "mockups_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'mockups'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'mockups'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mockups_delete_own" on storage.objects;
create policy "mockups_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'mockups'
  and (storage.foldername(name))[1] = auth.uid()::text
);
