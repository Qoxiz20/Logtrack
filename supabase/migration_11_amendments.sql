-- Run this once in Supabase -> SQL Editor -> New query -> Run

-- Amendment 2: allow "loader" as a third role on the people table, alongside
-- driver and foreman. The constraint below was created inline without an explicit
-- name in the original migration, so Postgres auto-named it <table>_<column>_check.
alter table people drop constraint if exists people_role_check;
alter table people add constraint people_role_check check (role in ('driver', 'foreman', 'loader'));
