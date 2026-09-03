-- Run this once in Supabase -> SQL Editor -> New query -> Run

-- Amendment: a To Delivery row can now also resolve an unresolved Status error
-- (not just an Undelivered DO) by re-delivering it — same idea, second source.
alter table to_delivery_items add column if not exists resolves_error_id uuid references status_errors(id);
