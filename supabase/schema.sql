-- Run this once in Supabase -> SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

-- One row per dispatch log (the whole form submission)
create table dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  header_amount numeric(12,2) not null,     -- the "how much in RM" field at the top
  log_date date not null,
  logged_by uuid references auth.users(id),
  to_delivery_total numeric(12,2) default 0, -- auto-calculated sum of To Delivery rows
  reward_earned boolean default false,       -- auto-calculated RM50 bonus flag
  created_at timestamptz default now()
);

-- Rows for the "To Delivery" section
create table to_delivery_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_log_id uuid references dispatch_logs(id) on delete cascade,
  invoice_number text not null,
  customer text not null,
  amount numeric(12,2) not null
);

-- Rows for the "From Delivery" section
create table from_delivery_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_log_id uuid references dispatch_logs(id) on delete cascade,
  description text not null
);

-- Rows for the "Mission" checklist
create table mission_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_log_id uuid references dispatch_logs(id) on delete cascade,
  task text not null,
  done boolean default false
);

-- Rows for the "Status" error flags
create table status_errors (
  id uuid primary key default gen_random_uuid(),
  dispatch_log_id uuid references dispatch_logs(id) on delete cascade,
  invoice_number text not null,
  error_type text not null,
  department text not null,
  resolved boolean default false,
  created_at timestamptz default now()
);

-- Security: only logged-in dispatchers can read/write data
alter table dispatch_logs enable row level security;
alter table to_delivery_items enable row level security;
alter table from_delivery_items enable row level security;
alter table mission_items enable row level security;
alter table status_errors enable row level security;

create policy "Logged-in users can do everything on dispatch_logs"
  on dispatch_logs for all using (auth.role() = 'authenticated');
create policy "Logged-in users can do everything on to_delivery_items"
  on to_delivery_items for all using (auth.role() = 'authenticated');
create policy "Logged-in users can do everything on from_delivery_items"
  on from_delivery_items for all using (auth.role() = 'authenticated');
create policy "Logged-in users can do everything on mission_items"
  on mission_items for all using (auth.role() = 'authenticated');
create policy "Logged-in users can do everything on status_errors"
  on status_errors for all using (auth.role() = 'authenticated');
