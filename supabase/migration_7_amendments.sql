-- Run this once in Supabase -> SQL Editor -> New query -> Run

-- Previously: staff could update an open log but were blocked from setting
-- completed = true themselves (only admin could tick it).
-- Now: staff CAN tick a log complete (it's their job, per your note) — but because
-- this policy's USING clause only matches rows where completed is CURRENTLY false,
-- staff structurally can never touch a row once it's already completed, which means
-- they can never un-tick it either. Only the separate admin policy can do that.

drop policy if exists "Logged-in users can update open dispatch_logs" on dispatch_logs;

create policy "Logged-in users can update open dispatch_logs"
  on dispatch_logs for update
  using (completed = false)
  with check (true);

-- "Admins can update any dispatch_logs" is untouched — admin can still tick
-- or un-tick any log at any time, which is how reopening a completed log works.
