-- Run this once in Supabase -> SQL Editor -> New query -> Run
-- (Your tables already exist — this only adds what's new.)

-- Amendment 1: track whether each To Delivery invoice has been confirmed
-- as "arrived back" when the driver returns to the warehouse.
alter table to_delivery_items add column if not exists returned boolean default false;

-- Amendment 5: only admin accounts can delete a dispatch log.
-- The old policy allowed ANY logged-in user to do everything (including delete),
-- so we replace it with separate policies: everyone can view/create/edit,
-- but only accounts marked as admin can delete.
drop policy if exists "Logged-in users can do everything on dispatch_logs" on dispatch_logs;

create policy "Logged-in users can view dispatch_logs"
  on dispatch_logs for select using (auth.role() = 'authenticated');

create policy "Logged-in users can insert dispatch_logs"
  on dispatch_logs for insert with check (auth.role() = 'authenticated');

create policy "Logged-in users can update dispatch_logs"
  on dispatch_logs for update using (auth.role() = 'authenticated');

create policy "Only admins can delete dispatch_logs"
  on dispatch_logs for delete
  using ( (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' );

-- IMPORTANT — do this manually for YOUR (main) account only:
-- Supabase Dashboard -> Authentication -> Users -> click your user ->
-- scroll to "User Metadata" -> edit the raw JSON to:
--   { "role": "admin" }
-- Save. Do NOT do this for staff accounts — leave their metadata empty.
-- You must log out and log back in on your account afterwards for the change to take effect.
