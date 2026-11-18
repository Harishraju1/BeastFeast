# BEAST FEAST — Site audit (2026-11-18)

This audit covers the gamification upgrade (XP ledger, daily reset, ranks, leaderboard), the quiz and performance features, navigation and usability, responsive layout and the line-following simulation.

Method:
- every route was opened in a browser at 1366 × 860 and at phone width (375 × 812), checking for horizontal page overflow, the console and the main flows
- static links were checked against the route list
- type-check, ESLint and the unit tests were run
- three smoke suites ran against the live Supabase project

## Routes checked

| Route | Desktop | Phone (375 px) | Console | Notes |
| --- | --- | --- | --- | --- |
| `/` Command Center | ✅ | ✅ | clean | New "Your next steps" checklist built from the student's real activity |
| `/learn` Beast Topics | ✅ | ✅ | clean | |
| `/learn/[topicId]` | ✅ | ✅ | clean | Exam-style quiz runner (see below) |
| `/learn/history` | ✅ | ✅ | clean | |
| `/learn/performance` (new) | ✅ | ✅ | clean | Category bars with 50/70/85 markers, trend chart, strongest/weakest, recommendations |
| `/challenges` | ✅ | ✅ | clean | Fixed: wrong plurals and out-of-date XP amounts (below). New challenge XP history |
| `/garage`, `/garage/[id]` | ✅ | ✅ | clean | An unknown ID shows "Project not found. Back to the garage" |
| `/projects` | ✅ | ✅ | clean | |
| `/library` | ✅ | ✅ after fix | clean | Fixed: 56 px horizontal overflow on phones |
| `/tracks` | ✅ | ✅ | clean | |
| `/leaderboard` | ✅ | ✅ | clean | Only > 50 XP; shared places on ties; rank badges |
| `/profile` | ✅ | ✅ | clean | Rank card, ladder, rank history, XP history with filters; the table scrolls inside its own panel on phones |
| `/admin` | ✅ | ✅ | clean | Server-gated (roles smoke test 23/23) |
| `/workspace/[id]/…` | ✅ | editors need ≥ 1024 px (documented) | clean | |

Every static `href` in the source points to an existing route.

## Issues found and fixed

| # | Area | Problem | Fix |
| --- | --- | --- | --- |
| 1 | Challenges | Section headings read "Competition quizs" and "Weekly quizs" | Proper plural labels |
| 2 | Challenges | The "Simulation challenges" box still showed old XP amounts (+40 per track, +15 per record, +60 per sumo level), which contradicted the XP rules | It now reads the live amounts that admins set on Admin → XP Rules (currently 150 / 25 / 150) and states that template code earns nothing |
| 3 | Component Library | On phones the page scrolled sideways: the grid had no column template on small screens, so the filter panel grew to 411 px | `grid-cols-1` (minmax(0, 1fr)) on small screens. The same guard was added to the admin, Garage-detail and admin-management grids |
| 4 | Database | `admin_recalculate_rank` only refreshed the stored XP total when the rank level changed, so a ledger correction that kept the same rank left a stale total | Migration `0009_admin_recalc_fix.sql`: it always rewrites lifetime XP, daily XP and the rank from the ledger. Covered by `xp:smoke` |
| 5 | Database | `reset_daily_xp` was rejected by Supabase's safe-update guard (`UPDATE requires a WHERE clause`) | Migration `0008`. Verified: the first run updated every profile, a second run returned −1 (already done) and lifetime XP was unchanged |
| 6 | Ranks | The old 6-rank scale stopped at "Robot Beast", was computed in the browser and could drop after a penalty | 16 ranks set by the database, never lowered by penalties or the reset, with history and a one-time rank-up animation |
| 7 | Leaderboard | Every account was listed, including 0 XP, and the list was sorted in the browser | The database filters to `xp > 50`, sorts by XP then sign-up date, and equal scores share a place |
| 8 | Quizzes | Students could not go back, skip or review before submitting | Previous / Skip / Next, a question palette (answered / skipped / unanswered), a review screen, and a double-submit guard (one attempt, XP once) |
| 9 | Navigation | 13 flat sidebar links with no grouping | Grouped into Learn / Build / Compete, with a hint on every link and `aria-current` on the active page. A footer with the logo. A "next steps" checklist on the home page |
| 10 | Logo | Old logo with a "5.0" badge | Replaced by the new official logo (no "5.0" badge). `npm run brand:assets` builds every image from one source file (`data/source/brand/beast-feast-logo.webp`): the full logo on the sign-in page, the lock-up in the sidebar and footer, the emblem on the loading screen, the favicon, the home-screen icon and the link-preview image. The footer now uses the readable lock-up instead of a 28 px emblem |

## Line-following simulation

A test matrix (`tests/garage/line-matrix.test.ts`, 135 tests) covers five robots: LF-01, LF-02 and LF-03 plus the `line-basic` and `line-pid` templates. It runs each one on 14 tracks:
- straight, 90° left and right, 120° and 135° corners, an S-bend, a 12 mm line and a wide curve
- a mixed closed course, Beginner Oval, Sharp Corners, Figure-8 and Beast Zig-Zag
- the mixed course at three speeds, plus a high-speed 135° corner
- starts 3–5 cm beside the line, and the end of an open line

Before the fix, results were poor:
- 4 of the 5 robots turned the wrong way at 120°–135° corners and then **followed the track backwards**: 2–11 s of wrong-way driving on the mixed course and Zig-Zag.
- Every robot **U-turned and drove 1.6–1.9 m back** at the end of an open line.
- Both templates drove off the track when started beside the line.

The simulator still counted those runs as completed laps, because a lap counts in either direction. The new tests check the direction separately.

Root causes, all in the robot code (no physics or sensor bug was found):
- At an acute corner the remembered "which side is the line" flipped on a brief glimpse of the old line.
- The lost-line search spun without a limit until it found *any* line, usually the one the robot had just come from.
- LF-03's PID took a fake error while lost, which caused derivative spikes and integral wind-up.

Fixes in `src/lib/code/templates.ts` and `src/lib/garage/projects/line.ts` (Garage firmware v1.1.0):
- The remembered side locks for 100–200 ms after an outer-sensor sighting.
- The search is bounded: about 135° toward the remembered side, then about 135° the other way, then the robot stops.
- When the search gives up, the robot brakes hard instead of coasting.
- Speed drops near the edge of the sensor array.
- LF-03's PID pauses while lost and has an anti-windup integral; line-pid gained a clamped integral term.

Pins and Serial tuning commands are unchanged.

After the fix:
- All 5 robots complete every track in the matrix in the right direction.
- None drives backwards for more than 0.3 s.
- They stop at the end of an open line.
- They find the line from a start beside it within 1.3 s.
- The longest line loss at default speed is 0.64 s.
- The Garage report still passes 45/45 required scenarios.

Remaining limits:
- With three digital sensors (LF-01, line-basic) at top speed (230), the robot sometimes searches the wrong way first at a 135° corner. It loses the line for about 1.9 s, then recovers without turning round.
- The ±135° search is time-based, tuned to the simulated motors. Real robots need `sweepTime` re-tuned.
- At 90° corners the robot centre still cuts 5–7 cm inside the line. That comes from the geometry: the sensors sit 11–16 cm ahead of the centre.

## Automated checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `eslint src --quiet` (errors) | clean |
| `npm run xp:smoke` (live database) | 34 / 34 pass |
| `npm run cloud:smoke` (live database) | 19 / 19 pass |
| `npm run roles:smoke` (live database + dev server) | 23 / 23 pass |
| `vitest` | 841 / 841 pass (22 files, including 135 line-matrix tests) |
| `npm run garage:report` | 45 / 45 required scenarios; all 9 Garage robots READY TO SIMULATE |

## Second pass — full website upgrade (2026-11-18, later the same day)

### Brand
- Every visible `BEAST FEAST 5.0` is now **BEAST FEAST**: titles, metadata, sidebar, sign-in page, footer, Garage, home page and docs.
- Technical names are kept so nothing breaks: the repository `BeastFeast`, the Vercel project `beast-feast`, the `bf5.*` browser-storage keys and the empty `beast-feast-5.0/` git pointer.

### Palette
- The page background is back to Forest Sage `#4B5A50`, as chosen on 2026-11-18.
- The sage token values come from before the dark switch, with their original contrast notes: ivory on sage 6.3:1, muted text 5.5:1, labels 4.5:1.
- The browser theme colour is sage.

### Logo
- Clickable, linking home, in the sidebar, the footer and the sign-in page.
- Favicon and home-screen icon are generated from the official logo.
- The link-preview image is now an 82 KB JPEG instead of a 556 KB PNG.

### Footer
- Logo, ROBOTICS CLUB KKH, the tagline and a short description.
- Explore links: Home, Learning Academy, Challenges, Component Library, Project Garage, Leaderboard.
- A `mailto:` link to roboticsclubniat@gmail.com.
- © with the current year.
- No phone number, privacy policy or terms page, because none were provided.

### Metadata
- Title template `%s | BEAST FEAST`; each page has its own title and description.
- Lessons, Garage robots and workspace tabs get dynamic titles.
- Open Graph and Twitter cards are set.
- Canonical URLs only on public pages, on the verified domain.
- Admin and workspace pages are marked noindex.

### Responsive layout
- 15 routes × 10 widths (320–1440 px), checked automatically.
- The only overflow was 3 px in the signed-in header at 320 px. Fixed by hiding the duplicate Help and Settings icons below 640 px.
- Mobile drawer: the backdrop closes it, Escape closes it, the page behind it can't scroll while it's open, and `aria-expanded` is set.
- Admin links stay hidden from students.

### Images
- Unused template SVGs removed from `public/`.
- Profile pictures are lazy-loaded, sized and re-encoded to 256 px WebP.

### Sign-up
- Fields: full name, email, +91 mobile, NIAT ID, password and confirmation, and an optional picture with preview.
- The NIAT ID is validated, upper-cased and unique, with a live availability check.
- Per-field errors, a loading state, and protection against double submits.
- The database re-validates everything.

### Profile
- Picture upload, replace and remove.
- Private account details: email, mobile, and the NIAT ID (locked once set), plus any legacy ID.
- A one-time "Complete your account" prompt for accounts that have no ID.

### Admin
- New **User Management** tab showing avatar, email, phone, NIAT ID or legacy ID, rank, lifetime and daily XP, role, joined date and status.
- Search by name, email, NIAT ID and phone digits; filter by role, status and rank; 20 users per page.
- A detail panel shows recent XP transactions and rank history.
- MAKE AS ADMIN, the audit log and Super Admin protection are unchanged (roles smoke 23/23).

### Security
See SECURITY_REPORT.md:
- private-details table
- database rate limits
- CSP and security headers
- avatar validation
- secret scan of the tree, history and build: clean
- dependency audit

### Tests after this pass
- 861 unit tests pass, including the new `tests/auth/validation.test.ts`.
- `profile:smoke` 24/24, `xp:smoke` 34/34, `roles:smoke` 23/23, `cloud:smoke` 19/19.
- tsc and ESLint are clean, and the production build succeeds.
- No CSP violations on the WebGL views, the Garage, the arena or Monaco.

### Follow-up (same day)

**Password reset.** "Forgot password?" on the sign-in page sends a Supabase reset email.
- The page never says whether the email is registered.
- The link opens `/reset-password`. That page exchanges the one-time code (PKCE, so it must be the same browser) and asks for a new password with confirmation, using the same rules as sign-up.
- Clear messages for expired or used links, with a button to request a new one.
- Supabase allows the redirect on both the live domain and localhost.
- Verified:
  - the new password works and the old one is rejected
  - fake codes are refused
  - all page states were checked in the browser

**NIAT ID format corrected to N00H01X0000.**
- That is N + 2 digits + H01 + **one letter** + 4 digits, e.g. N24H01A0001; regex `^N\d{2}H01[A-Z]\d{4}$`. The first version wrongly expected five digits.
- Migration `0011` fixes the database check, the sign-up trigger, the availability check and `complete_my_details`.
- All 5 existing accounts' IDs already used this format, so they are now their NIAT IDs; the legacy copies are kept.
- An old five-digit ID is now rejected by the database.

## Not changed, and why

- **Phone verification:** numbers are format-checked, not verified by SMS. The UI says so.
