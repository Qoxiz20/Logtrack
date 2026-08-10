-- Run this once in Supabase -> SQL Editor -> New query -> Run

-- Amendment 1: COMPLETE lock
alter table dispatch_logs add column if not exists completed boolean not null default false;

-- Amendment 3: vehicle plate number (free text, optional)
alter table dispatch_logs add column if not exists plate_number text;

-- Amendment 6: From Delivery becomes Cash or Stock
alter table from_delivery_items add column if not exists type text not null default 'stock' check (type in ('cash','stock'));
alter table from_delivery_items add column if not exists customer text;
alter table from_delivery_items add column if not exists do_number text;
alter table from_delivery_items add column if not exists cash_amount numeric(12,2);
alter table from_delivery_items add column if not exists collected boolean not null default false;
-- "description" is now only used for Stock entries, so it can no longer be required on every row
alter table from_delivery_items alter column description drop not null;

-- ============================================================
-- RLS rewrite: enforce the COMPLETE lock and admin-only rules
-- at the database level, not just by hiding buttons in the UI.
-- ============================================================

-- ---- dispatch_logs ----
drop policy if exists "Logged-in users can view dispatch_logs" on dispatch_logs;
drop policy if exists "Logged-in users can insert dispatch_logs" on dispatch_logs;
drop policy if exists "Logged-in users can update dispatch_logs" on dispatch_logs;
-- "Only admins can delete dispatch_logs" is untouched — still admin-only, unrelated to this change.

create policy "Logged-in users can view dispatch_logs"
  on dispatch_logs for select using (auth.role() = 'authenticated');

create policy "Logged-in users can insert dispatch_logs"
  on dispatch_logs for insert with check (auth.role() = 'authenticated');

-- Anyone logged in can update a log WHILE it is not completed, but they can never
-- be the one to flip "completed" to true themselves (with check enforces it stays false).
create policy "Logged-in users can update open dispatch_logs"
  on dispatch_logs for update
  using (completed = false)
  with check (completed = false);

-- Admins can update ANY log at any time — this is how ticking/un-ticking COMPLETE works,
-- and gives admin an override even on a completed log.
create policy "Admins can update any dispatch_logs"
  on dispatch_logs for update
  using ( (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' );

-- ---- to_delivery_items, from_delivery_items, mission_items, status_errors ----
-- Same shape for all four: view always allowed; insert/update allowed only while the
-- PARENT log is not completed, unless you're admin. No delete policy on any of them —
-- matches "can't delete an invoice / from-delivery entry, only add" across the board.

drop policy if exists "Logged-in users can do everything on to_delivery_items" on to_delivery_items;
drop policy if exists "Logged-in users can do everything on from_delivery_items" on from_delivery_items;
drop policy if exists "Logged-in users can do everything on mission_items" on mission_items;
drop policy if exists "Logged-in users can do everything on status_errors" on status_errors;

create policy "View to_delivery_items" on to_delivery_items for select using (auth.role() = 'authenticated');
create policy "View from_delivery_items" on from_delivery_items for select using (auth.role() = 'authenticated');
create policy "View mission_items" on mission_items for select using (auth.role() = 'authenticated');
create policy "View status_errors" on status_errors for select using (auth.role() = 'authenticated');

create policy "Insert to_delivery_items on open logs" on to_delivery_items for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);
create policy "Update to_delivery_items on open logs" on to_delivery_items for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);

create policy "Insert from_delivery_items on open logs" on from_delivery_items for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);
create policy "Update from_delivery_items on open logs" on from_delivery_items for update using (
  -- Note: this also covers the "Collected" checkbox. It's admin-only in the app's UI,
  -- but the completed-lock check here is the same for everyone regardless.
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);

create policy "Insert mission_items on open logs" on mission_items for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);
create policy "Update mission_items on open logs" on mission_items for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);

create policy "Insert status_errors on open logs" on status_errors for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);
create policy "Update status_errors on open logs" on status_errors for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (select 1 from dispatch_logs d where d.id = dispatch_log_id and d.completed = false)
);

-- IMPORTANT: because the "Collected" checkbox is restricted to admin only at the app
-- level (not by a separate database rule), a determined staff user could technically
-- call the update API directly to tick it themselves while the log is still open.
-- If you want this locked at the database level too, tell me and I'll add a stricter
-- policy that checks the JWT role specifically for the "collected" column.
