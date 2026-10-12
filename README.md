# Courtside

A static basketball team hub backed by Supabase. It includes email accounts, team creation and invite codes, match scheduling and live status, scorekeeping, player portfolios, tagged plays, private video clips, and realtime score updates.

## Deploy with Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import **contact-shahade/my-website** from GitHub.
3. Use the repository root as the root directory. This is a plain HTML/CSS/JavaScript site; leave the framework as **Other** and the build command blank.
4. Deploy. Vercel will give you a `*.vercel.app` address. Later commits to `main` should redeploy automatically if Git integration is enabled.

## Supabase Auth redirect setup

In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to your deployed Vercel address and add that address to **Redirect URLs**. For local use, also add `http://127.0.0.1:8000/**` and `http://localhost:8000/**`. Email confirmation links must return to an allowed address.

The Supabase browser URL and publishable key are in `app.js`. The publishable key is designed for browser apps. Never put a secret/service-role key in this repository. All application tables use row-level security; keep those policies enabled.

## Local preview

From this folder, run:

```sh
python -m http.server 8000
```

Then open `http://127.0.0.1:8000`.

## First use

1. Register with an email and password, then confirm the email if Supabase asks.
2. Create a team and save the invite code. Teammates register separately, choose **Join a team**, and use that code.
3. Add players and matches. Open a match to start it; log plays to update the scoreboard, player stats, tags, and optional private clips. Finish the match when done.

This first release uses manual scoring and match entry; it does not pull schedules or scores from a third-party live sports feed.
