# BEAST FEAST 5.0 — BUILT BY ROBOTICS CLUB KKH

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

## Cloud mode (Supabase)

1. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, or run `supabase db push` with the Supabase CLI. This creates the tables, row-level security, and the `award_xp`, `complete_lesson` and `submit_quiz` functions.
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public anon key only).
   - For seeding only, on your machine: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never prefix the service key with `NEXT_PUBLIC_`, and never commit it.
3. Run `npm run seed:supabase`.
4. In Supabase Auth, enable email/password sign-in. Make your first administrator by running in SQL: `update profiles set role = 'admin' where id = '<user uuid>';`

In cloud mode:
- Projects sync across devices.
- XP amounts come from the `xp_rules` table and are deduplicated per (user, type, reference).
- Quizzes are graded on the server against `quiz_answer_keys`, which students cannot read.
- Every table has RLS. Students can only access their own projects and progress, and only admins can edit content.

## Deployment

Any Node host that runs Next.js 16 works (Vercel, Netlify, a VM with `npm run build && npm start`):

1. Set the two `NEXT_PUBLIC_SUPABASE_*` variables in the host's environment, or leave them unset for local mode.
2. Make sure `npm install` runs `postinstall`, which copies Monaco into `public/monaco`.
3. Build with `npm run build`.

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
  lib/learning/              84 Beast Topics, 350 questions, quizzes, weekly missions
  lib/data/                  Backend interface: LocalBackend (browser) and SupabaseBackend
  app/                       pages: Command Center, projects, workspace/[id]/(design|circuit|code|arena),
                             tracks, library, learn, challenges, leaderboard, profile, admin
supabase/migrations/         schema, RLS, server functions
scripts/                     catalogue import, Supabase seed, Monaco copy, dev launcher
tests/                       vitest suites incl. the 10 required scenarios
```

Data flow in the arena:

student code → interpreter (virtual clock) → controller pin states → circuit graph → driver model → motor voltages → physics → sensor geometry → pin values → code
