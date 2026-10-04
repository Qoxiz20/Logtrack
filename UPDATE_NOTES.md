# LHG Wheels — update: follows the LHG structure (users by tick, names by rule)

Install this as Part D of `GO_LIVE.md` in the LHG Journey package (run migration 13 first).

| File | What changed |
|---|---|
| `components/CrewSelect.js` | NEW. Crew boxes list people by the Journey rules (Driver = Logistics, Foreman = Warehouse, Loader = Officer); older manual entries by their Wheels role; people already on the log hidden |
| `app/new-log/page.js` | Driver, Foreman 1, Foreman 2, Loader use the new crew boxes |
| `app/log/[id]/page.js` | Same when editing a log |
| `app/people/page.js` | Team Roster shows "From LHG Journey" (read-only) above older manual entries |
| `components/AuthGate.js` | "No access" message: ask Liau (access is a tick in Journey) |
| `lib/access.js` | Comment updated (logic unchanged: admin or ticked for Wheels) |
| `supabase/migration_13_journey_phase1.sql` | Copy of the shared database change, for the record (run it ONCE, from either folder) |
| `PROJECT_STATE.md` | Updated summary, including the LHG structure |
