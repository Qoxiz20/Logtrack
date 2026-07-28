# LogTrack — setup guide (beginner friendly)

This is a Next.js web app. It works as a normal website, and can be "installed"
on phone/desktop like an app (a PWA) — no app store needed.

## What you need first

1. **Node.js** installed on your computer — download from https://nodejs.org (LTS version).
2. A free **Supabase** account — https://supabase.com (this is your database + login system).

## Step 1 — Create your Supabase project

1. Go to supabase.com, sign up, click "New project."
2. Once it's created, go to the **SQL Editor** (left sidebar) → "New query."
3. Open the file `supabase/schema.sql` from this project, copy all of it, paste it in, click **Run**.
   This creates your 5 tables: dispatch_logs, to_delivery_items, from_delivery_items, mission_items, status_errors.
4. Go to **Authentication → Users** (left sidebar) → "Add user" → create a login
   (email + password) for yourself and each dispatcher. They don't sign up themselves —
   you create their accounts here.
5. Go to **Project Settings → API**. You'll see a "Project URL" and an "anon public" key —
   you need both for the next step.

## Step 2 — Connect the app to Supabase

1. In this project folder, find `.env.local.example`.
2. Make a copy of it named exactly `.env.local` (same folder).
3. Paste in your Project URL and anon public key from Supabase.

## Step 3 — Install and run

Open a terminal in this project folder and run:

```
npm install
npm run dev
```

Then open http://localhost:3000 in your browser. Log in with the account you created in Step 1.

## Step 4 — "Install" it like an app

Once it's running (later you'll host it online — e.g. Vercel, free tier — so it's not just
on your own computer), open it in Chrome/Edge and click the **Install** icon in the address bar.
This puts an app icon on your desktop or phone home screen. Same for other dispatchers.

## How the reward rule works

A log automatically earns the RM50 bonus when BOTH are true:
- The total of all "To Delivery" invoice amounts is over RM15,000
- Zero errors have been flagged in the Status section for that log

If this isn't quite right (for example, if you meant the RM15,000 should be compared
against something else, or "no error" should refer to the Mission checklist instead of
Status), tell me and I'll adjust the one line of code that controls it.

## What's built so far

- Login (dispatcher accounts only, created by you in Supabase)
- Dashboard: list of all logs, with reward badge and active-error count per log
- New Dispatch Log form: all 5 sections (Header, To Delivery, From Delivery, Mission, Status)
  with add/remove rows and a live reward preview as you type

## Not built yet (next steps we can tackle)

- Marking a flagged error as "resolved"
- Editing an existing log
- A rewards summary per driver (total RM50 bonuses earned over time)
- Hosting it online so it's not just on your computer (I recommend Vercel — free, and made
  by the same team as Next.js)
