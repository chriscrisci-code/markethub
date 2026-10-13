alter table orders
  add column if not exists archived_at timestamptz;
