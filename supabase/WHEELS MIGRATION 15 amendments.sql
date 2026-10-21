-- =====================================================================
-- WHEELS MIGRATION 15 — Cheque support, auto-complete, and a real fix for
-- Reopen / Collected / Delete (they were calling database functions
-- that were never actually created — see note at the very bottom).
--
-- Numbered separately from Journey's shared migrations (now at 23) so the
-- two don't collide — "Wheels Migration" + its own number, from now on.
--
-- Run this ONCE in Supabase -> SQL Editor -> New query -> paste all -> Run.
-- It runs as ONE transaction: if anything fails, NOTHING is changed.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- PART 1 — From Delivery can now be "Cheque" as well as Cash/Stock.
-- Cheque gets its own number (free text — one cheque can cover several
-- DOs, so it isn't tied to a single invoice the way Cash's DO is).
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class t on t.oid = con.conrelid
    where t.relname = 'from_delivery_items' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%cash%stock%'
  loop
    execute format('alter table from_delivery_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table from_delivery_items add constraint from_delivery_items_type_check
  check (type in ('cash', 'cheque', 'stock'));
alter table from_delivery_items add column if not exists cheque_number text;

-- ---------------------------------------------------------------------
-- PART 2 — "does this login have a given power?" is already answered by
-- Journey's own has_power(text) function — it's load-bearing for a dozen
-- of Journey's own policies (employees, leave_requests, warnings, etc.),
-- so this migration does NOT touch it at all: not drop, not replace.
-- A function's parameter NAME only matters when you redefine it — calling
-- it (as the three functions below do, with has_power('wheels_delete'))
-- works the same regardless of what Journey happens to call that
-- parameter internally. Nothing to do here; this section is just a note.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- PART 3 — The three actions the app already calls but that were never
-- actually built in the database: wheels_reopen_log, wheels_set_collected,
-- wheels_delete_log. Right now, clicking Reopen, toggling Collected, or
-- deleting a log all fail, because these simply didn't exist yet.
-- Each one is "security definer" — it runs with the power to make the
-- change itself, AFTER checking the caller is allowed to, so a non-admin
-- power-holder can use it even though the plain RLS rules are admin-only.
-- ---------------------------------------------------------------------
drop function if exists public.wheels_reopen_log(uuid);
create function public.wheels_reopen_log(log_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.has_power('wheels_delete') then
    raise exception 'You do not have permission to reopen a completed log.';
  end if;
  update dispatch_logs set completed = false where id = log_id;
end;
$$;

drop function if exists public.wheels_set_collected(uuid, boolean);
create function public.wheels_set_collected(item_id uuid, val boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.has_power('wheels_cash') then
    raise exception 'You do not have permission to confirm cash/cheque collected.';
  end if;
  update from_delivery_items set collected = val
    where id = item_id and type in ('cash', 'cheque');
end;
$$;

drop function if exists public.wheels_delete_log(uuid);
create function public.wheels_delete_log(log_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.has_power('wheels_delete') then
    raise exception 'You do not have permission to delete a dispatch log.';
  end if;
  delete from dispatch_logs where id = log_id;
end;
$$;

grant execute on function public.wheels_reopen_log(uuid) to authenticated;
grant execute on function public.wheels_set_collected(uuid, boolean) to authenticated;
grant execute on function public.wheels_delete_log(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- PART 4 — Auto-complete. The "Mark As Complete" button is gone from the
-- app now; a log completes itself the moment everything on it is done:
-- every Mission item ticked, every Cash/Cheque entry Collected, no active
-- Status error, no pending Undelivered DO (DO-0 "joker card" excepted, as
-- always). This only checks right after someone ticks/confirms/resolves
-- something — never on first creating a row — so a brand-new log with
-- nothing filled in yet can never auto-complete itself by accident.
-- Reopening a completed log is still a manual, admin/power-only action
-- (wheels_reopen_log above) — nothing here ever flips it back to open.
-- ---------------------------------------------------------------------
drop function if exists public.wheels_autocomplete_check() cascade;
create function public.wheels_autocomplete_check() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  target_log_id uuid;
  already_done boolean;
  undone_missions int;
  uncollected_money int;
  unresolved_errors int;
  unresolved_undelivered int;
begin
  target_log_id := coalesce(new.dispatch_log_id, old.dispatch_log_id);
  if target_log_id is null then
    return coalesce(new, old);
  end if;

  select completed into already_done from dispatch_logs where id = target_log_id;
  if already_done is null or already_done then
    return coalesce(new, old);
  end if;

  select count(*) into undone_missions
    from mission_items where dispatch_log_id = target_log_id and done = false;
  select count(*) into uncollected_money
    from from_delivery_items where dispatch_log_id = target_log_id and type in ('cash', 'cheque') and collected = false;
  select count(*) into unresolved_errors
    from status_errors where dispatch_log_id = target_log_id and resolved = false and invoice_number <> 'DO-0';
  select count(*) into unresolved_undelivered
    from undelivered_items where dispatch_log_id = target_log_id and resolved = false and invoice_number <> 'DO-0';

  if undone_missions = 0 and uncollected_money = 0 and unresolved_errors = 0 and unresolved_undelivered = 0 then
    update dispatch_logs set completed = true where id = target_log_id and completed = false;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_autocomplete_mission on mission_items;
create trigger trg_autocomplete_mission
  after update on mission_items
  for each row
  when (old.done = false and new.done = true)
  execute function public.wheels_autocomplete_check();

drop trigger if exists trg_autocomplete_from_delivery on from_delivery_items;
create trigger trg_autocomplete_from_delivery
  after update on from_delivery_items
  for each row
  when (old.collected = false and new.collected = true)
  execute function public.wheels_autocomplete_check();

drop trigger if exists trg_autocomplete_status_errors on status_errors;
create trigger trg_autocomplete_status_errors
  after update on status_errors
  for each row
  when (old.resolved = false and new.resolved = true)
  execute function public.wheels_autocomplete_check();

drop trigger if exists trg_autocomplete_undelivered on undelivered_items;
create trigger trg_autocomplete_undelivered
  after update on undelivered_items
  for each row
  when (old.resolved = false and new.resolved = true)
  execute function public.wheels_autocomplete_check();

commit;

-- WHAT WAS ACTUALLY WRONG BEFORE THIS MIGRATION:
-- app/log/[id]/page.js has been calling supabase.rpc('wheels_reopen_log', ...),
-- ('wheels_set_collected', ...) and ('wheels_delete_log', ...) for a while, but
-- none of those three functions were ever created in any migration you've run.
-- So right now, in your live app: ticking "Collected" on a Cash entry, trying to
-- Reopen a completed log, and deleting a log ALL fail with a database error
-- ("function ... does not exist") — for everyone, including you as admin.
-- This migration creates them for real. After running it, all three will work.
