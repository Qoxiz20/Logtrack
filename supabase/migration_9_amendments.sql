-- Run this once in Supabase -> SQL Editor -> New query -> Run

-- Amendment: link a new To Delivery row to the specific Undelivered DO it re-attempts.
-- When the tracker holding this row is marked COMPLETE, the app resolves the
-- linked undelivered_items row automatically (handled in app code, not a trigger,
-- since by the time this runs the original tracker is guaranteed still open —
-- it couldn't have been completed while this item was unresolved).
alter table to_delivery_items add column if not exists resolves_undelivered_id uuid references undelivered_items(id);

-- Amendment: Cash amount can now hold letters too (e.g. "USD100", "SGD 50.20"),
-- since customers sometimes pay in a different currency. Free text instead of a number.
alter table from_delivery_items alter column cash_amount type text;

-- Amendment: DO-0 is a "joker card" — a reusable placeholder DO number that's expected
-- to repeat across many trackers in a month. It's exempt from every unresolved-tracking
-- rule discussed so far: it never counts toward blocking COMPLETE, and it never appears
-- in the Outstanding panel. (Scope: this covers status_errors and undelivered_items —
-- the two places invoice numbers are tracked for resolution. It does NOT touch the
-- Cash/Collected tracking on From Delivery, which is a separate concern about money,
-- not delivery status.)
create or replace function prevent_complete_with_unresolved()
returns trigger as $$
declare
  unresolved_errors int;
  uncollected_cash int;
  unresolved_undelivered int;
begin
  if new.completed = true and old.completed = false then
    select count(*) into unresolved_errors
      from status_errors where dispatch_log_id = new.id and resolved = false and invoice_number <> 'DO-0';

    select count(*) into uncollected_cash
      from from_delivery_items where dispatch_log_id = new.id and type = 'cash' and collected = false;

    select count(*) into unresolved_undelivered
      from undelivered_items where dispatch_log_id = new.id and resolved = false and invoice_number <> 'DO-0';

    if unresolved_errors > 0 or uncollected_cash > 0 or unresolved_undelivered > 0 then
      raise exception 'Cannot mark complete: % unresolved error(s), % uncollected cash entry(ies), % undelivered DO(s) still pending',
        unresolved_errors, uncollected_cash, unresolved_undelivered;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
-- (Trigger itself, trg_prevent_complete_with_unresolved, already exists from the last
-- migration and points at this function — replacing the function body is enough.)
