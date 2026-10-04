-- =====================================================================
-- MIGRATION 12 — Phone-number login + security fix + anti-abuse check
-- Run this ONCE in Supabase -> SQL Editor -> New query -> paste all -> Run
-- It runs as ONE transaction: if anything fails, NOTHING is changed.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- PART 1 — Turn the 2 existing accounts into phone-number logins.
-- Behind the scenes, each phone number becomes a hidden login ID like
-- 601136308766@phone.lhg.invalid. People only ever type their phone number.
-- (".invalid" is a reserved ending that can never be a real email address,
--  so no email can ever be sent to or received for these IDs.)
-- Passwords stay the same. All history stays linked to the same account.
-- ---------------------------------------------------------------------
update auth.users set email = '601136308766@phone.lhg.invalid', phone = '601136308766'
  where email = 'liauchenhong20@gmail.com';
update auth.users set email = '60146189180@phone.lhg.invalid', phone = '60146189180'
  where email = 'hingen.sdnbhd@gmail.com';

-- Keep the login record that sits next to each account in step.
update auth.identities
  set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(u.email))
  from auth.users u
  where auth.identities.user_id = u.id
    and auth.identities.provider = 'email'
    and u.email in ('601136308766@phone.lhg.invalid', '60146189180@phone.lhg.invalid');

-- ---------------------------------------------------------------------
-- PART 2 — SECURITY FIX: move "admin" to a place users can't edit.
-- Before: the admin flag lived in user_metadata, which a logged-in user can
-- change themselves. Now it lives in app_metadata, which only the database/
-- server can set. Both accounts are admin (as requested).
-- ---------------------------------------------------------------------
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'role'
  where email in ('601136308766@phone.lhg.invalid', '60146189180@phone.lhg.invalid');

-- Two small helpers every security rule below uses.
-- is_admin():       true if this login is an admin.
-- can_use_wheels(): true if admin, OR the login has been given the "wheels" app
--                   (LHG Journey will set this automatically for Admin, HR,
--                    Operation and Logistics staff later).
create or replace function public.is_admin() returns boolean
  language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create or replace function public.can_use_wheels() returns boolean
  language sql stable as $$
  select public.is_admin()
      or coalesce((auth.jwt() -> 'app_metadata' -> 'apps') ? 'wheels', false)
$$;

-- ---------------------------------------------------------------------
-- PART 3 — Rebuild every security rule on the Wheels tables to use the
-- helpers above. Old rules are removed first (whatever their names were),
-- so nothing old is left behind.
-- ---------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('dispatch_logs','to_delivery_items','from_delivery_items',
                        'mission_items','status_errors','undelivered_items','people')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.people enable row level security;

-- dispatch_logs
create policy "Wheels users view logs"   on dispatch_logs for select using (public.can_use_wheels());
create policy "Wheels users create logs" on dispatch_logs for insert with check (public.can_use_wheels());
-- Staff can edit a log only while it's open (and may tick COMPLETE); never once completed.
create policy "Wheels users edit open logs" on dispatch_logs for update
  using (public.can_use_wheels() and completed = false) with check (public.can_use_wheels());
-- Admin can edit any log at any time (this is how un-ticking COMPLETE works).
create policy "Admin edits any log"   on dispatch_logs for update using (public.is_admin());
create policy "Admin deletes logs"    on dispatch_logs for delete using (public.is_admin());

-- Child tables: view always (for Wheels users); add/edit only while the parent log is open,
-- unless admin. No delete rule anywhere = nobody can delete rows (same as before).
create policy "View to_delivery_items" on to_delivery_items for select using (public.can_use_wheels());
create policy "Add to_delivery_items"  on to_delivery_items for insert with check (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));
create policy "Edit to_delivery_items" on to_delivery_items for update using (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));

create policy "View from_delivery_items" on from_delivery_items for select using (public.can_use_wheels());
create policy "Add from_delivery_items"  on from_delivery_items for insert with check (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));
create policy "Edit from_delivery_items" on from_delivery_items for update using (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));

create policy "View mission_items" on mission_items for select using (public.can_use_wheels());
create policy "Add mission_items"  on mission_items for insert with check (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));
create policy "Edit mission_items" on mission_items for update using (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));

create policy "View status_errors" on status_errors for select using (public.can_use_wheels());
create policy "Add status_errors"  on status_errors for insert with check (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));
create policy "Edit status_errors" on status_errors for update using (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));

create policy "View undelivered_items" on undelivered_items for select using (public.can_use_wheels());
create policy "Add undelivered_items"  on undelivered_items for insert with check (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));
create policy "Edit undelivered_items" on undelivered_items for update using (public.is_admin() or (public.can_use_wheels() and exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)));

-- people (Team Roster): everyone in Wheels can see it; only admin can add/deactivate.
create policy "View people"  on people for select using (public.can_use_wheels());
create policy "Admin adds people"  on people for insert with check (public.is_admin());
create policy "Admin edits people" on people for update using (public.is_admin());

-- ---------------------------------------------------------------------
-- PART 4 — Anti-abuse: one person can't fill two slots in the same log
-- (e.g. Asah as driver AND loader). "not valid" = checks every NEW or EDITED
-- log from now on, without touching old logs.
-- ---------------------------------------------------------------------
alter table dispatch_logs drop constraint if exists one_person_one_slot;
alter table dispatch_logs add constraint one_person_one_slot check (
  (coalesce(foreman_1, '') = '' or foreman_1 <> driver_name)
  and (coalesce(foreman_2, '') = '' or (foreman_2 <> driver_name and foreman_2 is distinct from foreman_1))
  and (coalesce(loader_name, '') = '' or (loader_name <> driver_name
        and loader_name is distinct from foreman_1 and loader_name is distinct from foreman_2))
) not valid;

commit;

-- After running: on EVERY device, log out of Wheels and log back in with your
-- PHONE NUMBER and your usual password (this loads the new admin flag).
