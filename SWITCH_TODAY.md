# LHG Wheels — switch to phone login (Sunday 4 Oct 2026)

Takes about 15 minutes. Do the steps in order.

## Before you start
- Make sure you know the **passwords** of both accounts (yours and the Hin Gen company account).
  They stay the same — only the login changes from email to phone number.
- Tell anyone who might use Wheels today to log out and wait 15 minutes.

## Step 1 — Copy the new files into your project
Unzip this package and copy everything into your **LHG Wheels** project folder, keeping the
same folders. Say **Replace** whenever asked. Files in this package:

| File | New or changed | What it does |
|---|---|---|
| `lib/access.js` | NEW | Phone → login, who is admin, who may open Wheels |
| `components/AuthGate.js` | NEW | Checks every page: logged in? allowed? |
| `app/layout.js` | changed | Turns the check above on for every page |
| `app/login/page.js` | changed | Phone number instead of email |
| `app/people/page.js` | changed | Uses the new, safe admin check |
| `app/log/[id]/page.js` | changed | Safe admin check; loader is now a dropdown when editing; one person = one slot |
| `app/new-log/page.js` | changed | Loader dropdown lists regular loaders, then everyone else; one person = one slot |
| `app/rewards/page.js` | changed | Simple list: "8 Sep · Reward: Yes". Details live in LHG Journey |
| `components/NavDrawer.js` | changed | Menu label "Rewards (reference)" |
| `supabase/migration_12_amendments.sql` | NEW | The database change (Step 3) |
| `supabase/migration_12_ROLLBACK.sql` | NEW | Only if something goes wrong |
| `supabase/migration_5_RECORD_ONLY.sql` | NEW | Record of the old missing file. **Do not run** |
| `PROJECT_STATE.md` | changed | Updated summary for Claude |

Your `.env.local` is not in this package and is not touched.

## Step 2 — Put the new code online
In a terminal inside the project folder:
```
git add -A
git commit -m "Phone login, security fix, loader dropdowns, simpler rewards"
git push
```
Open Vercel → your LHG Wheels project → **Deployments**. Wait until the newest one says **Ready** (1–2 minutes).
(For these few minutes nobody can log in with a phone number yet — that's normal, Step 3 fixes it.)

## Step 3 — Change the database
1. Supabase → your project → **SQL Editor** → **New query**.
2. Open `supabase/migration_12_amendments.sql`, copy **all** of it, paste, click **Run**.
3. It should say **Success**. (It runs as one block: if anything fails, nothing is changed — just send me the error.)

## Step 4 — Log in with your phone number
On **every** phone/computer that uses Wheels:
1. Open LHG Wheels. If you're still logged in, open the menu and log out (or clear the site data).
2. Log in:
   - **You:** phone `011-3630 8766`, your usual password
   - **Hin Gen company account:** phone `014-618 9180`, its usual password
3. Check it worked: open **Team Roster** — you should see the **Add** and **Deactivate** buttons (that means admin works).

You can type the number any way: `0113630 8766`, `+60113630 8766`, `011-3630 8766` all work.

## If you can't log in
1. Supabase → SQL Editor → run `supabase/migration_12_ROLLBACK.sql` (puts the Gmail logins back).
2. Vercel → Deployments → the deployment from **before** today → **⋯** → **Promote to Production**.
3. Log in with your Gmail as before, and send me a screenshot of the error.

## Blocking or removing a login (until LHG Journey is online)
Supabase → **Authentication** → **Users** → search the number (e.g. `60146189180`) → click the user:
- **Ban user** = blocked from logging in (lost phone, resigned, suspended). You can unban later.
- **Delete user** = removes the account. ⚠️ Supabase may refuse if that account created dispatch logs,
  because logs remember who created them — use **Ban** instead in that case.
When LHG Journey goes live, these become simple buttons on each person's profile (only you can use them).

## Adding a new Wheels login (until LHG Journey is online)
Ask me — it needs the person's phone number and one small SQL step to mark which apps they can open.
