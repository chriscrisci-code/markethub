-- Storage bucket and policies for artwork uploads

insert into storage.buckets (id, name, public)
values ('artwork', 'artwork', false)
on conflict (id) do nothing;

create policy "artwork_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'artwork'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "artwork_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'artwork'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "artwork_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'artwork'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'artwork'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "artwork_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'artwork'
  and (storage.foldername(name))[1] = auth.uid()::text
);
