-- =====================================================================
-- WHEELS MIGRATION 18 — manual "Mark As Complete" only. No more automatic
-- completion.
--
-- The rule: a log can be marked complete only when EVERYTHING is cleared
-- (every To Delivery ticked back, every Mission ticked, every Cash/Cheque
-- Collected, no unresolved Status error, no pending Undelivered DO). The
-- person presses "Mark As Complete" themselves. Nothing completes a log
-- on its own any more, which also removes the timing problem where a log
-- could finish before From Delivery had been typed in.
--
-- Self-contained: safe to run whether or not Migration 16 / 17 were run.
-- Run ONCE in Supabase -> SQL Editor -> New query -> paste all -> Run.
-- =====================================================================
begin;

-- Part 1 — remove every automatic-completion trigger (from migrations 15,
-- 16 and 17) and the function they shared.
drop trigger if exists trg_autocomplete_to_delivery on to_delivery_items;
drop trigger if exists trg_autocomplete_mission on mission_items;
drop trigger if exists trg_autocomplete_from_delivery on from_delivery_items;
drop trigger if exists trg_autocomplete_status_errors on status_errors;
drop trigger if exists trg_autocomplete_undelivered on undelivered_items;
drop function if exists public.wheels_autocomplete_check() cascade;

-- Part 2 — database-level guard: completing is blocked while any To
-- Delivery item isn't ticked back. (The existing
-- trg_prevent_complete_with_unresolved keeps covering errors, uncollected
-- cash/cheque and undelivered DOs; this adds the To Delivery rule beside it
-- and does not touch it. Mission is enforced on the button in the app.)
drop function if exists public.wheels_require_to_delivery_returned() cascade;
create function public.wheels_require_to_delivery_returned() returns trigger
  language plpgsql security definer set search_path = public as $$
declare unreturned int;
declare undone int;
begin
  if new.completed and not old.completed then
    select count(*) into unreturned from to_delivery_items
      where dispatch_log_id = new.id and returned = false;
    if unreturned > 0 then
      raise exception 'Cannot mark complete: % To Delivery item(s) have not been ticked back yet.', unreturned;
    end if;
    select count(*) into undone from mission_items
      where dispatch_log_id = new.id and done = false;
    if undone > 0 then
      raise exception 'Cannot mark complete: % Mission item(s) are not ticked done yet.', undone;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_to_delivery_returned on dispatch_logs;
create trigger trg_require_to_delivery_returned
  before update on dispatch_logs
  for each row
  execute function public.wheels_require_to_delivery_returned();

commit;
