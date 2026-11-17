-- =====================================================================
-- WHEELS MIGRATION 19 — Wheels no longer keeps its own staff list.
-- Everyone in Wheels' dropdowns now comes from LHG Journey only.
--
-- What it does, in order (all in one transaction — if anything fails,
-- nothing is changed):
--   1. Re-checks every Journey employee against the Wheels rules. This is
--      the same "refresh" Journey already does when rules change, and it
--      LINKS any old hand-typed Wheels name that matches an employee's
--      nickname / full name (so those people keep working, now linked).
--   2. Retires whatever is STILL not linked to Journey (active = false).
--      Nothing is deleted — old logs keep their names, and you can undo
--      this by setting active = true again for a row.
--   3. Adds a guard so a new person can never be typed into Wheels' staff
--      list again — only Journey's own automatic sync can add people.
--
-- Run this ONCE in Supabase -> SQL Editor -> New query -> paste all -> Run.
-- Do this AFTER you've set the Wheels rules in Journey -> Settings
-- (Driver box / Foreman box / Loader box), so people link first.
-- =====================================================================
begin;

-- 1. Link old same-name entries to their Journey employee, where possible.
update public.employees set updated_at = now();

-- 2. Retire the rest (not linked to anyone in Journey).
update public.people set active = false where employee_id is null and active = true;

-- 3. No more adding people from Wheels.
drop function if exists public.wheels_people_only_from_journey() cascade;
create function public.wheels_people_only_from_journey() returns trigger
  language plpgsql as $$
begin
  if new.employee_id is null then
    raise exception 'People are added in LHG Journey, not in Wheels.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_people_only_from_journey on public.people;
create trigger trg_people_only_from_journey
  before insert on public.people
  for each row
  execute function public.wheels_people_only_from_journey();

commit;

-- SEE WHAT IS LEFT UNLINKED AFTERWARDS (optional, run separately):
--   select name, role, active from public.people where employee_id is null order by name;
