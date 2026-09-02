-- Run this once in Supabase -> SQL Editor -> New query -> Run

-- New table: DOs that were assigned to a driver but never even attempted
create table if not exists undelivered_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_log_id uuid references dispatch_logs(id) on delete cascade,
  invoice_number text not null,
  customer text not null,
  amount numeric(12,2) not null,
  resolved boolean not null default false,
  created_at timestamptz default now()
);

alter table undelivered_items enable row level security;

create policy "View undelivered_items" on undelivered_items for select using (auth.role() = 'authenticated');

create policy "Insert undelivered_items on open logs" on undelivered_items for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);
create policy "Update undelivered_items on open logs" on undelivered_items for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);
-- No delete policy — matches every other child table (add/resolve only, never delete).

-- ============================================================
-- Block marking COMPLETE while anything is unresolved.
-- This is a database TRIGGER, not an RLS policy, because it needs to fire at
-- the exact moment "completed" flips from false to true — and unlike RLS,
-- a trigger applies to EVERY update including admin's, with no bypass at all.
-- ============================================================

create or replace function prevent_complete_with_unresolved()
returns trigger as $$
declare
  unresolved_errors int;
  uncollected_cash int;
  unresolved_undelivered int;
begin
  if new.completed = true and old.completed = false then
    select count(*) into unresolved_errors
      from status_errors where dispatch_log_id = new.id and resolved = false;

    select count(*) into uncollected_cash
      from from_delivery_items where dispatch_log_id = new.id and type = 'cash' and collected = false;

    select count(*) into unresolved_undelivered
      from undelivered_items where dispatch_log_id = new.id and resolved = false;

    if unresolved_errors > 0 or uncollected_cash > 0 or unresolved_undelivered > 0 then
      raise exception 'Cannot mark complete: % unresolved error(s), % uncollected cash entry(ies), % undelivered DO(s) still pending',
        unresolved_errors, uncollected_cash, unresolved_undelivered;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_complete_with_unresolved on dispatch_logs;
create trigger trg_prevent_complete_with_unresolved
  before update on dispatch_logs
  for each row
  execute function prevent_complete_with_unresolved();
