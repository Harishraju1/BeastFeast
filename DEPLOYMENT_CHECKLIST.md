# Deployment checklist — workshop readiness (≈1,000 students)

Last updated: 2026-11-27.

## Where the "2 emails per hour" limit comes from

| Layer | Limit | Ours? |
| --- | --- | --- |
| **Supabase Auth built-in mailer** | **2 emails per hour, for the whole project**, and only delivered to the project's team members | **This is the limit.** Only the dashboard can change it. |
| Supabase Auth rate limits | Configurable per project: emails/hour (only above 2 once a custom SMTP is set), sign-ins and sign-ups per IP per 5 min, token refreshes, OTP verifications | Dashboard setting |
| SMTP provider | Whatever the plan allows per day | Chosen by you |
| BEAST FEAST app | One email of each kind per address per device per minute (stops double clicks and repeat sign-ups) | Code (this release) |
| Vercel serverless / database | No email involvement | — |

Email is sent ONLY for (1) the one-time sign-up confirmation and (2) password resets. Students stay signed in
(cookie session, refreshed automatically) and never need an email to come back.

## Option A (recommended for the workshop): pre-created accounts — no email at all

```powershell
npm run accounts:bulk -- students.csv            # dry run: checks every row
npm run accounts:bulk -- students.csv --apply    # creates confirmed accounts
```

`students.csv` columns: `name,email,niat_id,phone` (niat_id and phone optional). The script writes a credentials file
with temporary passwords **outside the repository** (`../beast-feast-backups/`). Hand it out privately, then delete
it. Uses `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` on this machine only. Verified 2026-11-27: the accounts it
creates can sign in immediately, and the profile trigger runs.

## Option B: let students register themselves — needs a custom SMTP provider

1. Pick a provider that allows ≥ 1,000 emails **per day**. Free tiers are usually too small (around 100–300 a day);
   paid entry plans (Resend, Brevo, Amazon SES, Postmark, Google Workspace SMTP) are enough. Verify the sending
   domain (SPF/DKIM) with the provider.
2. Supabase Dashboard → **Authentication → Emails → SMTP Settings** → enable custom SMTP, enter host, port, user,
   password, sender address and name. The SMTP password is entered only there, never in this repository or in
   Vercel.
3. Supabase Dashboard → **Authentication → Rate Limits** → "Rate limit for sending emails" → e.g. **300 per hour**.
4. **Authentication → URL Configuration** → keep the Site URL `https://beast-feast-pi.vercel.app` and make sure the
   redirect allow-list contains `https://beast-feast-pi.vercel.app/**` (the confirmation link now returns to
   `/login?confirmed=1`).
5. Send one test sign-up to a non-team address and confirm the email arrives.

## Sign-in limit per network (important for a classroom)

Supabase limits **sign-ins and sign-ups per IP address**. A classroom behind one Wi-Fi router shares one public IP.
The load test (`npm run load:test -- --auth`) measures this from a single machine (see the results in
DEVELOPMENT_STATUS.md). Before the workshop:

- Supabase Dashboard → **Authentication → Rate Limits** → raise **"sign-ups and sign-ins"** (per 5 minutes per IP)
  to cover a whole room (e.g. 1,000).
- Ask students to sign in **before** the session starts (sessions persist on the device).
- The sign-in page now shows "Lots of people on this network are signing in at once…" with a countdown instead of
  a raw error.

## Optional: "Continue with Google"

1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. Supabase Dashboard → **Authentication → Providers → Google** → enable, paste the client ID and secret.
3. Vercel → Project → Settings → Environment Variables → add `NEXT_PUBLIC_AUTH_GOOGLE=1` (Production) and redeploy.
   The button stays hidden until this is set. Google users are asked for their NIAT ID and phone after signing in.

Passkeys are not offered: Supabase Auth has no passkey sign-in for this project's setup.

## Environment variables

| Variable | Where | Secret? | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.production` (committed) | No | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.production` (committed) | No | Publishable key; RLS protects data |
| `NEXT_PUBLIC_AUTH_GOOGLE` | Vercel env (optional) | No | `1` shows the Google button |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` on the admin machine only | **Yes** | Scripts only (`accounts:bulk`, `load:test`, smoke tests). Never in Vercel or the repo |
| `SUPABASE_DB_URL` | `.env.local` only | **Yes** | `db:push`, `db:backup` |
| `CRON_SECRET` | Vercel env | **Yes** | Used by the backup daily-XP-reset cron route (`/api/cron/…`); check it exists in Vercel |
| SMTP credentials | Supabase dashboard only | **Yes** | Never in code |

## Release steps

1. `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`
2. `npm run secret:scan`
3. Commit and push to `main` (Vercel deploys automatically)
4. Check the live site: sign-in page, Circuit Studio → Run, Validate → FIX IT, library 18650 packs
