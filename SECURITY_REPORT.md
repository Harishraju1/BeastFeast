# BEAST FEAST — Security audit (2026-11-18)

**Scope:** the Next.js 16 app (it is a Next.js app, not Vite), the Supabase database, auth and storage, the Vercel deployment and the git history.

**Methods:**
- read the code and the migrations
- `npm run secret:scan`
- `npm audit`
- live tests against the production database:
  - `npm run profile:smoke` (24 checks)
  - `npm run roles:smoke` (23)
  - `npm run xp:smoke` (34)
  - `npm run cloud:smoke` (19)
- a local production build checked in a browser for Content-Security-Policy violations

No secret values appear in this report.

## Summary

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | **High** | Every signed-in student could read every other student's student ID (`profiles.student_id`, readable by all) | **Resolved** |
| 2 | **High** | No server-side rate limiting on XP, quiz, lesson, admin or lookup functions | **Resolved** |
| 3 | Medium | No Content-Security-Policy, clickjacking protection or other security headers | **Resolved** |
| 4 | Medium | Profile pictures were stored as unvalidated data URLs (any size, any `data:` content) in a table everyone can read | **Resolved** |
| 5 | Medium | DOMPurify 3.4.15 bundled inside Monaco has DOM-XSS advisories | **Mitigated / follow-up** |
| 6 | Low | The cron endpoint returned raw database error messages | **Resolved** |
| 7 | Low | Dev-only tooling (eslint, vitest, vite) has high-severity advisories | Accepted (not shipped) |
| 8 | Low | Unused Next.js template files in `public/` | **Resolved** |
| 9 | Info | No secrets in the working tree, the git history (552 blobs) or the production bundle | No action needed |
| 10 | Info | A stray nested-repo pointer `beast-feast-5.0/` (git mode 160000, only a README) | Left in place |
| 11 | Info | Sign-in, sign-up and password reset are rate-limited by Supabase Auth, not by this app | Documented |

## Details

### 1. Student IDs were readable by every student (High) — resolved
`profiles` must be readable for leaderboards, and the student ID was a column on it.

Migration `0010` moves phone, NIAT ID and legacy student ID into **`profile_private`**:
- RLS lets only the owner and administrators read it.
- Nobody can insert, update or delete it directly; only the sign-up trigger and `complete_my_details()` write to it.
- The 5 existing IDs were copied there as `legacy_student_id`, then blanked on the public row.
- A backup of every table was taken first, outside the repository: `D:\Claude Folder\beast-feast-backups\2026-11-18T10-45-09-167Z`.

Verified live:
- a student reads exactly 1 private row, their own
- the public row has no ID or phone
- direct writes are refused
- `admin_list_users` is refused for students

### 2. Rate limiting (High) — resolved
`rl_hit(bucket, max, window)` stores counters in the `rate_limits` table, so they hold across serverless instances (no in-memory counters). It keys on the user ID, or on the client IP for anonymous calls. It is called inside:

| Function | Limit |
| --- | --- |
| `award_xp` | 120 per 10 min |
| `submit_quiz` | 30 per 10 min |
| `complete_lesson` | 60 per 10 min |
| `record_learning_activity` | 200 per 10 min |
| `apply_inactivity_penalties` | 30 per 10 min |
| `admin_find_user` | 60 per 10 min |
| `admin_set_role` | 30 per 10 min |
| `admin_list_staff` | 120 per 10 min |
| `admin_list_users` | 300 per 10 min |
| `niat_id_available` (anonymous) | 30 per 10 min per IP |
| `complete_my_details` | 20 per hour |
| profile-picture upload | 10 per hour |

A pg_cron job, `beast-rate-limit-cleanup`, removes old windows daily. Verified live: repeated anonymous NIAT checks are refused with "Too many requests".

Sign-in, sign-up and password-reset requests go directly from the browser to Supabase Auth, which applies its own per-IP limits. Review them in Supabase → Authentication → Rate Limits.

### 3. Security headers (Medium) — resolved
`next.config.ts` adds these headers to production builds (and therefore Vercel):
- **Content-Security-Policy:**
  - `default-src 'self'`
  - scripts only from this site
  - Supabase only for `connect-src`
  - YouTube only for frames
  - `worker-src 'self' blob:` for the code editor
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`
  - `upgrade-insecure-requests`
- **HSTS** (2 years)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Cross-Origin-Opener-Policy: same-origin`
- a restrictive `Permissions-Policy`
- `X-Powered-By` removed and production source maps off

On a local production build, these pages logged no CSP violations:
- the 3D home view (WebGL)
- the Garage 3D view and code view
- the Simulation Arena (WebGL context created)
- Monaco, loaded from `/monaco` and tokenising C++

`script-src` still needs `'unsafe-inline'` for Next.js's inline bootstrap scripts. A nonce-based CSP would remove it, but it needs every page rendered dynamically. That is a possible follow-up.

The dev server does not send these headers, so local tooling can embed it.

### 4. Profile pictures (Medium) — resolved
Pictures go to a Supabase Storage bucket, `avatars`:
- public read
- 5 MB limit
- JPEG, PNG and WebP only
- RLS lets a user write only inside `avatars/<their id>/`

They are uploaded through `/api/avatar`, which:
- checks the session with Supabase Auth
- refuses cross-site requests
- rate-limits uploads
- **decodes the file with sharp**, so a renamed SVG, HTML or executable fails
- stores a freshly encoded 256 × 256 WebP, so no original bytes or metadata survive

`profiles.avatar` must now be an `https://` URL of at most 500 characters (database constraint), so no `data:` or `javascript:` URLs are accepted. Every case was verified live.

### 5. DOMPurify inside Monaco (Medium) — mitigated, follow-up
`monaco-editor@0.57.0`, the latest stable release, bundles DOMPurify 3.4.15. The fixed 3.4.18 only exists in Monaco's 0.58 development builds, which should not be shipped.

Exposure is low:
- Monaco sanitises markdown hovers, which come from our own completion provider and from the student's own code.
- Projects are private.
- The new CSP blocks external scripts.

**Follow-up:** upgrade `@monaco-editor/react` / `monaco-editor` once 0.58 is released (`npm run postinstall` re-copies `public/monaco`).

### 6. Cron endpoint errors (Low) — resolved
`/api/cron/daily-xp-reset` now returns `"reset failed"` and logs the detail on the server only. The upload route returns user-level messages only.

### 7. Dev dependencies (Low) — accepted
`npm audit` reports high-severity advisories in eslint plugins, vitest, vite, picomatch and fast-glob. They run only on developer machines and in CI, and none is bundled into the site. `npm audit fix` (non-breaking) was applied. The remaining fixes need major version changes, which should be scheduled with a test run.

### 8. Unused files (Low) — resolved
`public/` held five unused Next.js template SVGs; they were removed. `public/` now contains only the self-hosted Monaco editor. No backups, dumps, logs, keys or test credentials are tracked. The test-account file `.env.local-test.local` is git-ignored.

### 9. Secrets (Info)
`npm run secret:scan` checks:
- tracked files
- every blob ever committed on any branch
- `.next/static` (what browsers download)
- `public/`

It looks for:
- service-role JWTs (decoded to tell them from the public anon key)
- `sb_secret_` keys
- Postgres URLs with passwords
- private keys
- GitHub, Vercel and AWS tokens
- the literal values from `.env.local`

**Result: nothing found.**

The only Supabase key in the repository is the public publishable key in `.env.production`. It is designed to be public: RLS decides what it can do. `.env.local` (secret key, database URL) is git-ignored and never deployed. No credential rotation is needed.

### 10. Nested repo pointer (Info)
`beast-feast-5.0/` is a git entry with mode 160000 and no `.gitmodules`: an empty repo that was committed by accident. It only contains a README, is not served, and nothing uses it. It was left in place because removing it changes repository history users may have cloned. It can be removed with `git rm --cached beast-feast-5.0` if wanted.

### 11. Authentication (Info)
- Supabase Auth manages passwords (bcrypt) and sessions (HTTP cookies via `@supabase/ssr`). There is no home-made password handling.
- New accounts must use a password of at least 8 characters with letters and a number (enforced by the form). Supabase itself enforces 6, which can be raised under Authentication → Policies.
- Admin pages are protected in three places:
  - **server:** `proxy.ts` plus `app/admin/layout.tsx`, which read the role from the database
  - **database:** every admin function checks `is_admin()` / `is_super_admin()`
  - **RLS** on the tables
- Students cannot raise their own role.
- The Super Admin cannot be demoted from the app (`roles:smoke`, 23/23).
- There is no password-reset flow in the app yet.

### CORS
The app's own API routes (`/api/avatar`, `/api/cron/daily-xp-reset`) send no CORS headers, so browsers allow only same-origin calls. `/api/avatar` also rejects requests whose `Origin` is another site. CORS for Supabase itself is managed by Supabase. As usual, CORS is not treated as authentication; every route checks the session.

## Manual actions for the club
1. Supabase → Authentication → Rate Limits: confirm the sign-in and sign-up limits suit a classroom, where many students share one IP.
2. Optionally raise the minimum password length to 8 under Authentication → Policies.
3. Optionally set `CRON_SECRET` in Vercel, so only Vercel's scheduler can call the backup cron route. The route is safe either way: the reset is idempotent.
4. Upgrade Monaco when 0.58 is released (item 5).
