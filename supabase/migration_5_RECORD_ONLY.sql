-- =====================================================================
-- RECORD ONLY — DO NOT RUN. This was already applied to the live database
-- at some point, but the original file was never saved. This copy rebuilds
-- what it did, for the record, so the history of the database is complete.
-- (If it were ever run by accident, "if not exists" makes it harmless.)
-- =====================================================================

-- Team Roster: one row per person. Deactivate only, never delete
-- (old logs keep the person's name as plain text).
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('driver', 'foreman')),   -- 'loader' added in migration 11
  active boolean not null default true
);

-- Dispatch header: up to two foremen and an optional loader, stored as names.
alter table dispatch_logs add column if not exists foreman_1 text;
alter table dispatch_logs add column if not exists foreman_2 text;
alter table dispatch_logs add column if not exists loader_name text;

-- Status errors: a free-text description, written once and never edited.
alter table status_errors add column if not exists description text;

-- Security rules for "people" were also created here; migration 12 replaces
-- them all, so they are not repeated in this record.
