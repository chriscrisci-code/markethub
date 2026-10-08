-- Site sign-in (username/password), separate from storefront checkout.
-- Idempotent: safe to re-run.

create table if not exists site_access (
  id integer primary key default 1 check (id = 1),
  username text not null default 'admin',
  password text not null default 'admin',
  updated_at timestamptz not null default now()
);

insert into site_access (id, username, password)
values (1, 'admin', 'admin')
on conflict (id) do nothing;

alter table site_access enable row level security;
