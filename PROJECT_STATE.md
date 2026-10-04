# LHG Wheels (formerly LogTrack) — Project State

Last synced against actual source: `LHG_Wheels_Oct4.zip` uploaded 2026-10-04, plus migration 12 package.
Summary for orientation only — for any code change, re-upload the real current files.

## Stack
Next.js 14 (App Router) + Supabase (Postgres, Auth, RLS) + Tailwind. PWA. Hosted on Vercel, deployed by
`git push`. Beginner-friendly: complete-file deliveries only, plain-English explanations.

## Shared LHG platform (decided 4 Oct 2026)
- This Supabase project is the **shared LHG project**: LHG Journey (HR app) will add its tables here.
  One login system for all LHG apps → one phone number + password per person.
- **Login = phone number.** `lib/access.js` turns it into a hidden ID `60XXXXXXXXX@phone.lhg.invalid`
  (".invalid" can never be a real email). Journey uses the same rule.
- **Roles live in `app_metadata`** (only the server can set it). `user_metadata` is no longer used for
  roles (it was user-editable — security hole fixed in migration 12).
- `app_metadata.role = 'admin'` → admin. `app_metadata.apps` = list of apps a person may open
  (e.g. `["wheels"]`). Journey will set `apps` from each person's department.
- DB helpers: `public.is_admin()`, `public.can_use_wheels()` (admin OR apps contains "wheels").
- **Who may open Wheels:** Admin, HR, Operation, Logistics. Enforced in RLS and in `components/AuthGate.js`.
- Accounts today (both admin): Liau `011-3630 8766`, Hin Gen company account `014-618 9180`
  (company account to be removed by Liau once officers have their own logins).
- Blocking/deleting logins: Supabase dashboard (Ban/Delete) until Journey's People page has the buttons
  (only Liau may block).

## Roles in the app
- **Admin**: everything incl. delete logs, untick COMPLETE, manage Team Roster, Collected toggle.
- **Wheels user**: create/edit open logs, tick COMPLETE.

## Folder structure (key paths)
```
app/page.js                     → redirect to /login or /dashboard
app/login/page.js               → phone + password, "Remember me"
app/dashboard/page.js           → month folders
app/dashboard/[month]/page.js   → logs in a month (date-first cards)
app/new-log/page.js             → create log
app/log/[id]/page.js            → full log, editable while open
app/people/page.js              → Team Roster (drivers, foremen, loaders); admin add/deactivate
app/rewards/page.js             → REFERENCE only: "8 Sep · Reward: Yes" per log; points live in Journey
app/rewards/delivery-accuracy   → Logistics errors by driver, monthly accuracy %
app/rewards/outbound-accuracy   → Operation errors by loader, monthly accuracy %
app/rewards/orange-deliveries   → Undelivered DOs by team, monthly total
components/NavDrawer.js         → Home, Team Roster, Rewards (reference)
components/AuthGate.js          → logged in + allowed to use Wheels, on every page
lib/access.js                   → phoneToLoginId, isAdminUser, canUseWheels
lib/reward.js                   → REWARD_THRESHOLD 15000, REWARD_AMOUNT 50, ERROR_TYPES, DEPARTMENTS,
                                  computeRewardEarned()
supabase/ schema, migrations 2, 5 (RECORD ONLY), 6, 7, 8, 9, 10, 11, 12 (+ 12 ROLLBACK)
```

## Database
- **dispatch_logs**: id, driver_name, foreman_1, foreman_2, loader_name, plate_number, header_amount,
  log_date, logged_by, to_delivery_total, reward_earned, completed, created_at.
  Constraint `one_person_one_slot` (migration 12, NOT VALID = new/edited logs only).
- **to_delivery_items**: id, dispatch_log_id, invoice_number, customer, amount, returned,
  resolves_undelivered_id, resolves_error_id
- **from_delivery_items**: id, dispatch_log_id, type cash|stock, customer, do_number, cash_amount (TEXT,
  allows "USD100"), description, collected
- **mission_items**: id, dispatch_log_id, task, done
- **status_errors**: id, dispatch_log_id, invoice_number, error_type, department, description, resolved
- **undelivered_items** (migration 8): id, dispatch_log_id, invoice_number, customer, amount, resolved
- **people**: id, name, role driver|foreman|loader (ONE role per person), active (deactivate only)
- Trigger `trg_prevent_complete_with_unresolved`: can't tick COMPLETE with unresolved errors, uncollected
  cash or undelivered DOs (DO-0 "joker card" exempt).

## Business rules
- RM50 dispatch bonus: To Delivery total > RM15,000, no unresolved errors, no Operation/Logistics error
  at all. `reward_earned` is computed in app code. Split today = driver + foremen (loader excluded).
  Going forward ALL rewards are handled in LHG Journey (bonus will become points; amount TBD).
- One person = one slot per log (driver / foreman 1 / foreman 2 / loader all different).
- Loader dropdown: regular loaders first, then anyone else on the roster (busy days anyone can load).
- No deletes on child rows; only admin deletes a whole log.

## Planned with LHG Journey Phase 1
- Journey tables in this project; People page = the place to create/block/reset/delete logins.
- `people` rows linked to Journey employees; roster managed in Journey (Wheels Team Roster → view-only).
- Trigger: log ticked COMPLETE with reward → Journey Track record entry per crew member; untick → reversal.
- Performance data from Wheels (accuracy, orange deliveries) → Journey Daily duties per department, later.
