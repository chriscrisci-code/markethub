-- Front/back artwork sides + printable_areas map on designs

-- 1) item_artwork: allow one row per side
alter table item_artwork
  add column if not exists side text not null default 'front';

alter table item_artwork
  drop constraint if exists item_artwork_item_id_key;

alter table item_artwork
  drop constraint if exists item_artwork_item_id_unique;

-- In case the unique was created as a constraint with a different name
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

alter table item_artwork
  add constraint item_artwork_item_id_side_key unique (item_id, side);

-- 2) item_designs: rename printable_area → printable_areas and wrap existing JSON under front
alter table item_designs
  rename column printable_area to printable_areas;

update item_designs
set printable_areas = jsonb_build_object('front', printable_areas)
where printable_areas ? 'areaId'
   or printable_areas ? 'placement';
