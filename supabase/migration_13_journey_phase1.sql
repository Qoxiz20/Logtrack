-- =====================================================================
-- MIGRATION 13 — LHG Journey joins the shared LHG database (Phase 1)
-- Run ONCE in Supabase -> SQL Editor -> New query -> paste all -> Run.
-- Runs as ONE transaction: if anything fails, NOTHING is changed.
-- Safe for LHG Wheels: Wheels keeps working exactly as before until its update is pushed.
--
-- THE STRUCTURE (for every LHG app):
--   1. USERS of an app (open it, fill in, save, complete) = a tick on the person's Journey profile.
--      Only Admin (Liau) can tick. Admin can always use every app.
--   2. NAMES in an app (e.g. the driver on a Wheels log) = automatic, from DEPARTMENT + POSITION,
--      using rules set per app in Journey -> Settings. Appearing in an app does NOT let you open it.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Lists Liau manages in Journey -> Settings
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  name text primary key,
  active boolean not null default true,
  sort int not null default 100
);
insert into public.departments (name, sort) values
  ('Logistics', 1), ('Operation', 2), ('Warehouse', 3), ('Sales', 4),
  ('Purchasing', 5), ('Account', 6), ('Admin', 7), ('HR', 8)
on conflict do nothing;

create table if not exists public.positions (
  name text primary key,
  active boolean not null default true,
  sort int not null default 100
);
-- A starting list; add the rest in Journey -> Settings.
insert into public.positions (name, sort) values ('Officer', 1), ('Driver', 2), ('Foreman', 3)
on conflict do nothing;

-- The LHG apps that people can be ticked to USE. (Journey itself: everyone with a login.)
create table if not exists public.apps (
  key text primary key,          -- short code used by the apps, e.g. 'wheels'
  name text not null,            -- e.g. 'LHG Wheels'
  sort int not null default 100
);
insert into public.apps (key, name, sort) values ('wheels', 'LHG Wheels', 1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Employees: the ONE master list of staff for every LHG app.
--    No wages, IC or bank details are stored here.
-- ---------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique,                                   -- HG ID, e.g. HG19-003 (filled automatically)
  full_name text not null,
  nickname text,                                      -- shown inside apps if filled, e.g. "Asah"
  phone text,                                         -- used to log in
  department text references public.departments(name) on update cascade,
  position text references public.positions(name) on update cascade,
  job_description text,                               -- free text, e.g. "Assistant to admin"
  start_date date not null,
  pay_type text not null default 'monthly' check (pay_type in ('monthly','daily')),
  worker_status text not null default 'normal' check (worker_status in ('normal','part-time')),
  status text not null default 'active' check (status in ('active','resigned')),
  last_day date,
  journey_role text not null default 'employee' check (journey_role in ('employee','hr','admin')),
  track_points boolean not null default true,         -- off for directors/family
  user_id uuid unique references auth.users(id),      -- their login, once created
  login_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- USERS: which apps each person can open (the ticks on their profile).
create table if not exists public.employee_apps (
  employee_id uuid not null references public.employees(id) on delete cascade,
  app_key text not null references public.apps(key) on delete cascade,
  primary key (employee_id, app_key)
);

-- NAMES: who appears where inside an app, by department or position.
-- e.g. ('wheels','driver', department 'Logistics'), ('wheels','loader', position 'Officer')
create table if not exists public.app_name_rules (
  id uuid primary key default gen_random_uuid(),
  app_key text not null references public.apps(key) on delete cascade,
  slot text not null,                                 -- e.g. 'driver', 'foreman', 'loader'
  department text references public.departments(name) on update cascade on delete cascade,
  position text references public.positions(name) on update cascade on delete cascade,
  check ((department is null) <> (position is null)),
  unique nulls not distinct (app_key, slot, department, position)
);
insert into public.app_name_rules (app_key, slot, department) values
  ('wheels', 'driver', 'Logistics'), ('wheels', 'foreman', 'Warehouse')
on conflict do nothing;
insert into public.app_name_rules (app_key, slot, position) values ('wheels', 'loader', 'Officer')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. HG ID: HG + 2-digit start year + next free number for that year (never reused).
-- ---------------------------------------------------------------------
create or replace function public.employees_assign_code() returns trigger
  language plpgsql as $$
declare yy text; n int;
begin
  if new.code is null or new.code = '' then
    yy := to_char(new.start_date, 'YY');
    select coalesce(max(substring(code from 6 for 3)::int), 0) + 1 into n
      from public.employees where code like 'HG' || yy || '-%';
    new.code := 'HG' || yy || '-' || lpad(n::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_employees_assign_code on public.employees;
create trigger trg_employees_assign_code before insert or update on public.employees
  for each row execute function public.employees_assign_code();

-- ---------------------------------------------------------------------
-- 4. Roles and app checks. Admin exists since migration 12. HR is new.
-- ---------------------------------------------------------------------
create or replace function public.is_hr() returns boolean
  language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'hr', false)
$$;

-- Wheels USERS: Admin, or anyone ticked for Wheels. (HR needs the tick like everyone else.)
create or replace function public.can_use_wheels() returns boolean
  language sql stable as $$
  select public.is_admin() or coalesce((auth.jwt() -> 'app_metadata' -> 'apps') ? 'wheels', false)
$$;

-- "Server" = the secure login buttons (service role) or Liau in the Supabase SQL Editor.
create or replace function public.is_server() returns boolean
  language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')
$$;

-- Safety: only Admin changes roles; logins are only linked/blocked by the secure server code.
create or replace function public.employees_guard() returns trigger
  language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.journey_role <> 'employee')
     or (tg_op = 'UPDATE' and new.journey_role is distinct from old.journey_role) then
    if not (public.is_admin() or public.is_server()) then raise exception 'Only Admin can change roles'; end if;
  end if;
  if (tg_op = 'INSERT' and (new.user_id is not null or new.login_blocked))
     or (tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.login_blocked is distinct from old.login_blocked)) then
    if not public.is_server() then raise exception 'Logins are managed with the buttons on the profile'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_employees_guard on public.employees;
create trigger trg_employees_guard before insert or update on public.employees
  for each row execute function public.employees_guard();

-- ---------------------------------------------------------------------
-- 5. Keep each login in step with the profile: role + apps it may open.
--    apps = 'journey' + every ticked app (nothing at all once resigned).
-- ---------------------------------------------------------------------
create or replace function public.employees_sync_login() returns trigger
  language plpgsql security definer set search_path = public as $$
declare apps jsonb;
begin
  if new.user_id is not null then
    if new.status = 'active' then
      select to_jsonb(array['journey'] || coalesce(array_agg(ea.app_key order by ea.app_key), '{}'))
        into apps from public.employee_apps ea where ea.employee_id = new.id;
    else
      apps := '[]'::jsonb;
    end if;
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('role', new.journey_role, 'apps', apps, 'employee_id', new.id)
     where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_employees_sync_login on public.employees;
create trigger trg_employees_sync_login after insert or update on public.employees
  for each row execute function public.employees_sync_login();

-- Ticking/unticking an app refreshes that person's login.
create or replace function public.employee_apps_touch() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.employees set updated_at = now() where id = coalesce(new.employee_id, old.employee_id);
  return null;
end $$;
drop trigger if exists trg_employee_apps_touch on public.employee_apps;
create trigger trg_employee_apps_touch after insert or delete on public.employee_apps
  for each row execute function public.employee_apps_touch();

-- ---------------------------------------------------------------------
-- 6. NAMES in LHG Wheels. Wheels' crew list ("people") follows Journey automatically:
--    matches any Wheels name rule (department or position) and is active -> in the list
--    otherwise -> taken out (old logs keep the name).
--    An existing, unlinked Wheels entry with the same name (nickname or full name) is linked
--    instead of creating a duplicate, so old logs and reports keep matching.
-- ---------------------------------------------------------------------
alter table public.people add column if not exists employee_id uuid unique references public.employees(id);
alter table public.people add column if not exists department text;
alter table public.people add column if not exists position text;
alter table public.people alter column role drop not null;   -- Journey-linked people get boxes from the rules

create or replace function public.employees_sync_wheels() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  shown text := coalesce(nullif(trim(new.nickname), ''), new.full_name);
  linked boolean := new.status = 'active' and exists (
    select 1 from public.app_name_rules r
     where r.app_key = 'wheels' and (r.department = new.department or r.position = new.position));
  pid uuid;
begin
  select id into pid from public.people where employee_id = new.id;
  if pid is null and linked then
    select id into pid from public.people
      where employee_id is null and lower(trim(name)) = lower(shown)
      order by active desc limit 1;
  end if;
  if linked then
    if pid is null then
      insert into public.people (name, active, employee_id, department, position)
      values (shown, true, new.id, new.department, new.position);
    else
      update public.people set name = shown, active = true, employee_id = new.id,
             department = new.department, position = new.position
       where id = pid;
    end if;
  elsif pid is not null then
    update public.people set active = false, department = new.department, position = new.position where id = pid;
  end if;
  return new;
end $$;
drop trigger if exists trg_employees_sync_wheels on public.employees;
create trigger trg_employees_sync_wheels after insert or update on public.employees
  for each row execute function public.employees_sync_wheels();

-- When the Wheels name rules change in Settings, re-check everyone.
create or replace function public.app_name_rules_refresh() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.employees set updated_at = now();
  return null;
end $$;
drop trigger if exists trg_app_name_rules_refresh on public.app_name_rules;
create trigger trg_app_name_rules_refresh after insert or update or delete on public.app_name_rules
  for each statement execute function public.app_name_rules_refresh();

-- ---------------------------------------------------------------------
-- 7. Security rules
-- ---------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.apps enable row level security;
alter table public.employees enable row level security;
alter table public.employee_apps enable row level security;
alter table public.app_name_rules enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('departments','positions','apps','employees','employee_apps','app_name_rules')
  loop execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- Lists and rules: every logged-in user can read (apps need them); only Admin changes them.
create policy "Read departments" on public.departments for select using (auth.role() = 'authenticated');
create policy "Admin manages departments" on public.departments for all using (public.is_admin()) with check (public.is_admin());
create policy "Read positions" on public.positions for select using (auth.role() = 'authenticated');
create policy "Admin manages positions" on public.positions for all using (public.is_admin()) with check (public.is_admin());
create policy "Read apps" on public.apps for select using (auth.role() = 'authenticated');
create policy "Admin manages apps" on public.apps for all using (public.is_admin()) with check (public.is_admin());
create policy "Read name rules" on public.app_name_rules for select using (auth.role() = 'authenticated');
create policy "Admin manages name rules" on public.app_name_rules for all using (public.is_admin()) with check (public.is_admin());

-- Employees: Admin and HR see and manage everyone; staff see only themselves. Nobody deletes.
create policy "Admin and HR see everyone, staff see themselves" on public.employees
  for select using (public.is_admin() or public.is_hr() or user_id = auth.uid());
create policy "Admin and HR add employees" on public.employees for insert with check (public.is_admin() or public.is_hr());
create policy "Admin and HR edit employees" on public.employees for update using (public.is_admin() or public.is_hr());

-- App ticks: only Admin grants or removes. Admin/HR can see them; staff see their own.
create policy "See app ticks" on public.employee_apps for select using (
  public.is_admin() or public.is_hr()
  or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid()));
create policy "Admin grants apps" on public.employee_apps for insert with check (public.is_admin());
create policy "Admin removes apps" on public.employee_apps for delete using (public.is_admin());

commit;
