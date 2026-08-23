-- Front/back artwork sides + printable_areas map on designs
-- Idempotent: safe to re-run if partially applied.

-- 1) item_artwork: allow one row per side
alter table item_artwork
  add column if not exists side text not null default 'front';

alter table item_artwork
  drop constraint if exists item_artwork_item_id_key;

alter table item_artwork
  drop constraint if exists item_artwork_item_id_unique;

-- Drop any leftover unique-on-item_id-only constraint (name may vary)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'item_artwork'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 1
      and (
        select attname from pg_attribute
        where attrelid = 'item_artwork'::regclass and attnum = conkey[1]
      ) = 'item_id'
  ) then
    execute (
      select 'alter table item_artwork drop constraint ' || quote_ident(conname)
      from pg_constraint
      where conrelid = 'item_artwork'::regclass
        and contype = 'u'
        and array_length(conkey, 1) = 1
        and (
          select attname from pg_attribute
          where attrelid = 'item_artwork'::regclass and attnum = conkey[1]
        ) = 'item_id'
      limit 1
    );
  end if;
end $$;

alter table item_artwork
  drop constraint if exists item_artwork_side_check;

alter table item_artwork
  add constraint item_artwork_side_check
  check (side in ('front', 'back'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'item_artwork'::regclass
      and conname = 'item_artwork_item_id_side_key'
  ) then
    alter table item_artwork
      add constraint item_artwork_item_id_side_key unique (item_id, side);
  end if;
end $$;

-- 2) item_designs: rename printable_area → printable_areas and wrap existing JSON under front
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'item_designs'
      and column_name = 'printable_area'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'item_designs'
      and column_name = 'printable_areas'
  ) then
    alter table item_designs rename column printable_area to printable_areas;
  end if;
end $$;

update item_designs
set printable_areas = jsonb_build_object('front', printable_areas)
where printable_areas is not null
  and (
    printable_areas ? 'areaId'
    or printable_areas ? 'placement'
  )
  and not (printable_areas ? 'front' or printable_areas ? 'back');
