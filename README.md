# Family Cottage Scheduler

Simple shared web app for coordinating summer stays at a family cottage without overbooking bedrooms.

## Features

- Shared passcode gate (no per-user account management).
- Reservation CRUD for date range, guest count, and sleeping spots.
- Conflict blocking when a sleeping spot is double-booked.
- Capacity warning/block when total guests exceed configured max.
- Mobile-friendly reservation list and form.

## Tech Stack

- Next.js (App Router) on Vercel
- Supabase (Postgres) for data storage
- Vitest for overlap/conflict smoke tests

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy and fill environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. In Supabase SQL editor, run:

   - `supabase/schema.sql`

4. Update the seeded passcode hash in `app_settings`:

   - Set `family_passcode_hash` to SHA256 of your passcode.
   - Example shell command:
     ```bash
     echo -n "your-passcode" | shasum -a 256
     ```

5. Start dev server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FAMILY_SESSION_SECRET` (long random string used for auth session cookie signing)

## Deployment (Vercel + Supabase)

1. Push this project to a Git repo.
2. Import the repo into Vercel.
3. Add the same three env vars in Vercel Project Settings.
4. Deploy.
5. Share the app URL + family passcode.

## Notes

- Reservation date logic is night-based: `end_date` is checkout and not counted as an overnight stay.
- If you need to rotate the passcode, update `app_settings.family_passcode_hash`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; do not expose it to client code.
# ephraimscheduler
