# BEAST FEAST — BUILT BY ROBOTICS CLUB KKH

**BUILD. CODE. SIMULATE. DOMINATE.**

A virtual robotics lab in the browser. Students pick a competition (Robo Race, Line Following, Robo War / Sumo), build a robot from the club's full component catalogue (552 entries), wire it pin-by-pin, validate it, write Arduino code that is checked against their own circuit, and run that code on a physics simulation of the robot they built. Learning paths, quizzes, XP and leaderboards are included.

See `DEVELOPMENT_STATUS.md` for what is complete, test results and known limitations, and `COMPONENT_CATALOGUE_REPORT.md` for catalogue coverage.

## Quick start (local mode — no backend needed)

Requirements: Node.js 20+ (tested on 26), npm.

```bash
npm install          # also copies the Monaco editor into public/monaco (offline Code Studio)
npm run dev          # http://localhost:3000
```

With no Supabase variables set, the app runs in **local mode**: accounts, projects, tracks and progress are stored in the browser on this device. The **first account created on a device becomes its administrator**. Local mode suits a single workshop machine. It is not tamper-proof, and the leaderboard only shows accounts on that device.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | All vitest suites (catalogue, circuit validation, interpreter, physics, tracks, learning content, end-to-end workflows) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run catalogue:import [file.md]` | Re-imports the master list. Regenerates `src/data/*.generated.*`, `supabase/seed/components.json` and `COMPONENT_CATALOGUE_REPORT.md`, and exits non-zero if any entry is missing |
| `npm run garage:report` | Runs the readiness test and every BEAST PROJECT GARAGE behaviour scenario and writes `GARAGE_TEST_REPORT.md` |
| `npm run roles:smoke [baseUrl]` | Creates temporary student/admin/super-admin accounts and runs 23 checks on role security, email promotion, the audit log and the server-side `/admin` gate against a running app (default `http://localhost:3210`), then deletes them |
| `npm run admin:bootstrap -- <email>` | Makes a registered account the **Super Admin** (server-side, uses the secret key; audited) |
| `npm run brand:assets [logo]` | Rebuilds every logo image (full logo, sidebar/footer lock-up, emblem, favicon, home-screen icon, link preview) from the official logo in `data/source/brand/beast-feast-logo.webp` |
| `npm run profile:smoke [baseUrl]` | 24 live checks of sign-up validation, private details, admin user search, profile-picture uploads through `/api/avatar` and rate limiting (needs the app running; temporary accounts are removed) |
| `npm run secret:scan` | Scans tracked files, every blob in git history, the production build and `public/` for secrets (never prints them) |
| `npm run xp:smoke` | Runs 34 checks against the configured Supabase project with temporary accounts: XP amounts, ledger sources, server-side ranks and rank history, the shown-once rank-up flag, daily penalties, the 11:15 PM daily reset (idempotent, lifetime XP untouched), the leaderboard's > 50 XP boundary (50 out, 51 in) and the admin rank recalculation. Restores every setting it changes |
| `npm run cloud:smoke` | Creates two temporary accounts in the configured Supabase project, runs 19 security and XP checks, then deletes them |
| `npm run db:push` | Applies `supabase/migrations/*.sql` to the database in `SUPABASE_DB_URL` (Supabase CLI) |
| `npm run seed:supabase` | Loads catalogue and learning content (including hidden quiz answer keys) into Supabase |

### Updating the component master list

1. Replace `data/source/components-master-list.md`. Keep the same markdown structure: `## **N. Section**`, `**Subcategory**` lines and numbered items.
2. Run `npm run catalogue:import`. The command fails if any numbered entry would be missing.
3. Add curated pinouts/specs for new parts in `src/lib/catalogue/specs/*.ts`, or let administrators enter them in **Admin → Components**.

## BEAST PROJECT GARAGE

Nine complete reference robots (`/garage`): LF-01/02/03 line followers, RR-01/02/03 racers and RW-01/02/03 sumo robots.

- Each one is a `ProjectTemplate` in `src/lib/garage/projects/*.ts` that lists real catalogue parts, positions, wiring, a pin map, firmware and simulation settings.
- `buildFromTemplate()` turns a template into an ordinary `Project`, so the Designer, Circuit Studio, Code Studio and Arena all use the same object.
- **RUN ORIGINAL PROJECT** opens a read-only instance. Only run-time fields such as the chosen track and results can change.
- **CREATE MY OWN COPY** forks a student-owned project with a new ID.
- A 14-check readiness test (`src/lib/garage/readiness.ts`) validates the circuit, compiles the firmware, checks code against circuit and starts the simulation before a card shows READY TO SIMULATE.
- Behaviour scenarios live in `src/lib/garage/scenarios.ts` and run in `tests/garage`.

To add a reference robot:
1. Add a template next to the others and register it in `src/lib/garage/index.ts`.
2. Bump its `version` whenever you change it; students' read-only originals of the old version are then replaced on the next load.
3. Run `npm test` and `npm run garage:report`.

## Brand colours

The official palette is defined once, as CSS variables, at the top of `src/app/globals.css`. Three.js scenes, SVG drawings and the Monaco editor read the matching constants in `src/lib/theme.ts`. Change colours there, never in components.

| Colour | Hex | Role (about this share of the screen) |
| --- | --- | --- |
| Forest Sage | `#4B5A50` | Dominant background: pages, sidebar, header, sections, cards, 3D/circuit canvases (~70 %) |
| Warm Ivory | `#F1EEE3` | Foreground: headings, text, icons, form inputs, sign-in card, key information cards (~25 %) |
| Signal Red | `#F20B0B` | Attention: primary buttons, active navigation, selected tabs, important badges, alerts, progress, key numbers (~5 %) |

Components use semantic utilities (`bg-panel`, `text-muted`, `bg-accent`, `text-accent-ink` ...).
- **`.bf-on-ivory`:** re-tints those utilities for dark-on-ivory surfaces.
- **`.bf-on-sage`:** gives the deeper sage used by the sidebar and hero bands.
- **Red text on sage:** uses a lighter Signal Red tint (`#FF7B6E`) so it stays legible; solid Signal Red is used for fills, borders and markers.

Physical colours stay true to life: wire colours (red supply, black ground ...), the white line-following board, the black sumo ring, and part materials such as the FR4 green PCB.

## Admin dashboard and roles

Roles: `student` (default), `admin`, `super_admin`. `/admin` has no link in the student navigation; staff see a shield icon in the top bar.

Every layer enforces access:
1. **`src/proxy.ts`** refreshes the session cookie and sends signed-out visitors to the login page.
2. **`src/app/admin/layout.tsx`** (Server Component) verifies the session with Supabase Auth and reads the role from the database for every request. Students get "Access denied".
3. **The database** decides what can happen:
   - RLS and the `is_admin()` / `is_super_admin()` checks.
   - A trigger stops any browser update from changing `role` or `xp`.
   - Role changes go only through `admin_set_role()`. It allows the Super Admin only, refuses changes to your own role, protects super_admin accounts, can only grant `admin`, and writes an append-only `role_audit_log` row.
   - Looking up accounts by email (`admin_find_user()`) is Super Admin only.

**Admin Management, MAKE AS ADMIN**: the Super Admin enters a registered email, sees the name, email and current role, confirms, and clicks **MAKE ADMIN**. Unregistered emails get a "register first" message. Admins can be revoked from the same screen, and the audit log lists every change.

`super_admin` can never be granted from the app. Create it with `npm run admin:bootstrap -- <email>` (secret key, run on your machine) or in the Supabase SQL editor.

Local mode (no Supabase) applies the same rules in the browser, and the first account on a device becomes its Super Admin. Local mode is single-device and not tamper-proof. `node scripts/dev.mjs 3211 --local` runs the app in local mode even when `.env.local` has Supabase settings.

## 4WD robots and off-road racing

### 4WD is the standard
- New Robo Race and Sumo projects start with a 4WD skid-steer drivetrain: four DC geared motors (FL, FR, RL, RR), one wheel on each, no caster.
- The Robot Designer's **4WD drivetrain** panel sets wheel diameter and width, wheelbase, track width, chassis length and width, and ground clearance. It moves the same eight parts, so the wiring is kept.
- "Convert to 4WD…" upgrades an existing 2WD robot. It asks first and can be undone.
- Code: `src/lib/robot/drivetrain4wd.ts`.

### Battery
- **11.1V 2100mAh LiPo Battery (3S)**: 3 cells, 11.1 V nominal, 12.6 V full (standard 3S convention), 23.31 Wh.
- C rating, connector and charging spec are "not specified".
- It is a club platform addition (`src/lib/catalogue/platform.ts`) on top of the 552 master-list parts.
- The designer's power summary shows estimated current draw and runtime.
- Validation flags parts that can't take 12.6 V.

### Garage
| Robot | ID |
| --- | --- |
| 4WD Robo Race Car | RR-04 |
| 4WD Off-Road Rover | RR-05 |
| 4WD Experimental Robot | RR-06 |
| 4WD Sumo Robot | RW-04 |

- RR-02 was already 4WD.
- The earlier 2WD race and sumo robots are kept as "Legacy 2WD", because students' copies reference them.
- The line followers stay 2WD.

### Off-road terrain (`src/lib/track/terrain.ts`)
**Pieces:** rock, rock field, mud, uneven ground (bumps), zigzag raised path, hill, raised platform, block / step, and hurdle row. Every piece has real height and is drawn from the same height map the physics uses.

**Physics:** each wheel samples its own ground height, slope, grip and drag.
- Slopes add a downhill force and reduce wheel load. Whether a robot can climb comes from tyre grip and motor torque (no hard-coded angle).
- Mud lowers grip and adds sinkage drag.
- Rocks and blocks lower than the robot's ground clearance, and lower than what its wheels can climb, are driven over. Taller ones are solid collisions, and distance sensors see them.

**Body motion:** pitch, roll and height come from a plane fitted through the wheel contacts.
- No suspension, tipping or jumps.
- Dynamic load transfer is ignored.
- The chassis underside never gets stuck.

**Track Designer:** an off-road tool group, a terrain inspector with heights in mm, and a **terrain generator** (difficulty, rock density, mud coverage, hurdle rows, zigzag height, hill slope; regenerate or clear).

**Templates:** 8 off-road tracks (Beginner, Intermediate, Advanced, Rock, Mud, Zigzag, Hill Climb, Mixed).

**Arena:**
- terrain under the robot, height, pitch and roll, obstacles crossed, collision count, estimated charge used
- every wheel's rpm and slip
- a **Motor test** tab (each motor on its own, all forward / reverse, pivot)

## Accounts, privacy and security

- **Sign-up fields:** full name, email, a +91 mobile number and the NIAT student ID (format N00H01X0000, regex `^N\d{2}H01[A-Z]\d{4}$`, e.g. N24H01A0001), a password plus its confirmation, and an optional profile picture.
- **Validation:** the form validates instantly; the database validates again in the sign-up trigger, so the form cannot be bypassed.
  - NIAT IDs are upper-cased and trimmed, must be unique, and a student can set theirs only once.
  - Mobile numbers are stored as `+91XXXXXXXXXX`. They are **not** SMS-verified.
- **Private details:** phone, NIAT ID and any earlier student ID live in `profile_private`, which only the student and administrators can read.
  - IDs entered before the format was enforced are kept as a *legacy* ID. All existing IDs already matched N00H01X0000 and became NIAT IDs (migration 0011).
  - Accounts that have neither ID see a one-time "Complete your account" prompt.
- **Announcements & notifications:** `/announcements` lists club news and videos (posted from Admin). The bell opens a side panel with announcements, new videos and recent activity. On canvas pages (workspace, track editor) messages appear in the header or workspace toolbar, never over the canvas.
- **Workspace:** Full screen button (Ctrl+Shift+F) in every workspace tool. The side menu can be hidden (header button, Ctrl+\\).
- **Forgot password:** "Forgot password?" on the sign-in page emails a reset link (Supabase Auth). The link opens `/reset-password`, where the student sets a new password.
- **Profile pictures:** stored in the Supabase Storage bucket `avatars`, in `avatars/<user id>/`, which only that user can write to. They are uploaded through `/api/avatar`, which decodes, resizes and re-encodes every image (JPEG/PNG/WebP, ≤ 5 MB) and is rate limited.
- **Admin → User Management:** search by name, email, NIAT ID or phone; filter by role, status and rank; page through results; open a detail panel with contact details, rank and recent XP. Data comes from `admin_list_users()`, which only administrators can call.
- **Security:**
  - database-backed rate limits on XP, quiz, admin and lookup functions
  - security headers and a Content-Security-Policy on production builds
  - no secrets in the repository (`npm run secret:scan` checks the tree, the whole git history and the build output)
  - details in [SECURITY_REPORT.md](SECURITY_REPORT.md)

## Cloud mode (Supabase)

1. Create a Supabase project, copy `.env.example` to `.env.local` and fill in all five values (step 2). Then run `npm run db:push`. It applies `supabase/migrations/0001–0011`: the tables, row-level security, the XP ledger and the `award_xp`, `complete_lesson`, `submit_quiz`, `apply_inactivity_penalties` and `reset_daily_xp` functions, ranks and rank history, the pg_cron daily reset job, private profile details, the avatars bucket, rate limiting and the table grants.
2. The values in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public anon key only).
   - For seeding only, on your machine: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. For `db:push`: `SUPABASE_DB_URL` (Supabase → Connect → Session pooler URI, with your database password). Never prefix the service key with `NEXT_PUBLIC_`, and never commit it.
3. Run `npm run seed:supabase`.
4. In Supabase Auth, enable email/password sign-in. Make your first administrator by running in SQL: `update profiles set role = 'admin' where id = '<user uuid>';`

In cloud mode:
- Projects sync across devices.
- XP amounts come from the `xp_rules` table and are deduplicated per (user, type, reference).
- Quizzes are graded on the server against `quiz_answer_keys`, which students cannot read.
- Every table has RLS. Students can only access their own projects and progress, and only admins can edit content.

## XP, ranks and the daily reset

- **One ledger.** Every XP change is a row in `xp_events` with a type, a source (Building & Simulation, Topic Quiz, Challenge, Learning, Penalty, Competition), a description and, for quizzes, the attempt it belongs to. Rows are only written by security-definer functions in the database, deduplicated per (user, type, reference). Students cannot insert, edit or delete them.
- **Lifetime XP** = the ledger sum, never below 0. It never resets.
- **Daily XP** = the ledger sum since the most recent **11:15 PM India Standard Time** (Asia/Kolkata, UTC+5:30, no daylight saving), which is **17:45 UTC**. `xp_period_start()` computes the boundary.
- **Daily reset.** A pg_cron job, `beast-daily-xp-reset` with schedule `45 17 * * *` (UTC), calls `reset_daily_xp('pg_cron')`. A Vercel cron (`vercel.json` → `/api/cron/daily-xp-reset`, same schedule) is a backup. Each XP day is recorded once in `xp_reset_runs` (primary key = period start), so a repeated or late run does nothing to lifetime XP and never double-resets. No browser timers are involved. Admins can see the job and its recent runs with `select xp_scheduler_status();`. If `CRON_SECRET` is set in Vercel, the cron route requires it.
- **Ranks.** 16 ranks from Beginner (0 XP) to BEAST (33,000 XP), defined once in `src/lib/ranks.ts` and mirrored in the `ranks` table. The database sets `profiles.rank_level` whenever XP changes and never lowers it: a rank, once earned, survives penalties and the daily reset. Each promotion is written to `rank_history`. The rank-up animation shows unseen promotions once and marks them seen in the database. Only an admin can recalculate a rank downwards (`admin_recalculate_rank`, recorded in rank history).
- **Leaderboard.** Only students with **more than 50** lifetime XP appear. The filter runs in the database (`xp > 50`, also the `leaderboard_eligible` view). Equal scores share a place, and ties are ordered by sign-up date.
- **Where students see it.** Profile: rank card, rank ladder and history, and a searchable, filterable XP history. Challenges: the challenge XP history from the same ledger. Beast Topics → My Performance: accuracy by topic and category, strongest and weakest areas, trend and recommended lessons.

## Deployment

Any Node host that runs Next.js 16 works (Vercel, Netlify, a VM with `npm run build && npm start`):

1. Set the two `NEXT_PUBLIC_SUPABASE_*` variables in the host's environment, or leave them unset for local mode.
2. Make sure `npm install` runs `postinstall`, which copies Monaco into `public/monaco`.
3. Build with `npm run build`.

### Vercel

The two public Supabase values are committed in `.env.production`, which Vercel reads at build time. You can override them with project environment variables. The web app needs nothing else: the secret key and database URL are only for the scripts on your machine, so never add them to Vercel. `vercel.json` registers the backup daily-reset cron (optional `CRON_SECRET` env var). `src/proxy.ts` runs as Next.js Proxy (formerly Middleware). In Supabase, Authentication, URL Configuration, set the Site URL to the Vercel domain.

## Architecture

```
src/
  lib/types.ts               shared domain contracts (catalogue, projects, validation)
  lib/catalogue/             master-list parser, spec patches (datasheet-referenced pinouts), builder, completeness report
  lib/circuit/               connection graph (union-find nets + power propagation) and the rule-based validator
  lib/mech/                  dimensions/mass/centre of mass and mechanical validation
  lib/robot/                 assembly (smart placement), driver channel maps, project→physics model, electrical bridge
  lib/arduino/               sandboxed Arduino-subset interpreter, board profiles, avr8js runner for real .hex files
  lib/code/                  circuit-aware code checks, templates, static code explanation
  lib/sim/                   planar rigid-body physics, motor/tyre/battery models, sensors, AI opponents,
                             session (code ↔ circuit ↔ physics coupling, 1 ms fixed step), debugging assistant
  lib/track/                 track compiler and example tracks
  lib/garage/                Project Garage: template format, 9 reference robots, readiness test, scenarios
  lib/theme.ts               brand colours for 3D / SVG / Monaco (CSS tokens live in app/globals.css)
  lib/roles.ts, lib/supabase role helpers; server-side Supabase client for the /admin gate (proxy.ts is in src/)
  lib/learning/              84 Beast Topics, 350 questions, quizzes, weekly missions, topic categories, performance analysis
  lib/ranks.ts               the 16-rank configuration (mirrored in the database `ranks` table)
  components/ranks, xp/      rank badge/card/rank-up animation; XP and challenge XP history
  lib/data/                  Backend interface: LocalBackend (browser) and SupabaseBackend
  app/                       pages: Command Center, projects, workspace/[id]/(design|circuit|code|arena),
                             tracks, library, learn, challenges, leaderboard, profile, admin
supabase/migrations/         schema, RLS, server functions
scripts/                     catalogue import, Supabase seed, Monaco copy, dev launcher
tests/                       vitest suites incl. the 10 required scenarios
```

Data flow in the arena:

student code → interpreter (virtual clock) → controller pin states → circuit graph → driver model → motor voltages → physics → sensor geometry → pin values → code
