# DEVELOPMENT STATUS — BEAST FEAST

Last updated: 2026-11-27 (component management, light canvas with function-coloured wires, functional models + self-test for every supported part, live 3D, coverage dashboard)

## Completed modules

> **2026-11-27 (later), component management + functional simulation for every supported part:**
> - **Circuit Studio editing:** selection toolbar (move, rotate ±90°, duplicate, delete, properties); Shift+click and
>   Shift+drag box multi-select; group drag; Delete/Backspace, Ctrl+D, Escape and arrow keys. Deleting a part with
>   4 or more wires asks first, and every delete shows an Undo bar. Deleting removes the part's wires and wheel
>   attachments (`src/lib/robot/edit.ts`, also used by the Robot Designer), so the netlist, validator and
>   simulator update at once.
> - **Light circuit canvas** (#F5F6F8). Wires are coloured by their electrical role, derived from the net
>   (`src/lib/circuit/wireRole.ts`: battery +, 5 V, 3.3 V, GND, PWM, analog, digital, I²C, UART, SPI, motor).
>   It also has a legend, a wire tooltip (ends, role, live V/A), high-contrast mode and a "my colours" switch.
> - **New models:**
>   - capacitors (RC, polarity, voltage rating)
>   - LDR (lux → resistance, read through dividers)
>   - potentiometers (wiper position)
>   - servos (slew to the commanded angle)
>   - regulators and buck converters (efficiency, current limit, heat)
>   - DHT11/22 through an emulated DHT library
>   - character LCDs (LiquidCrystal and LiquidCrystal_I2C) and OLEDs (Adafruit_SSD1306, text only), shown on the
>     wired display
>   - battery temperature, runtime, low-voltage and over-current warnings
>   - switches that can be clicked while the bench runs
> - **One shared simulation** (`src/lib/store/bench.ts`) for Circuit Studio and the Robot Designer. "Run live" in
>   the Designer spins the wheels at the simulated rpm and lights LEDs. Servo horns, display text, battery charge
>   bars and driver channel LEDs also follow the simulation (`src/lib/sim/live3d.ts`).
> - **New procedural 3D models** (`components/three/models/electronics.tsx`): resistor (real colour bands),
>   capacitors, LED, push button, toggle, breadboard, LDR, DHT, TO-92, OLED/LCD with live text, buck/TO-220/AMS1117
>   regulators. The 18650 cells now have terminals, insulator rings, labels and holder leads.
> - **Coverage audit:** `npm run sim:coverage` writes `SIM_COVERAGE_REPORT.md` and the Library → "Simulation
>   coverage" tab. Every component gets a functional self-test (`src/lib/sim/selftest.ts`). Result: 195 fully
>   supported, 306 partial, 57 not yet; 153 self-tests pass, 0 fail. Wheels, casters and chassis are covered by
>   the physics tests.
> - **Fixes found by the audit:**
>   - switch-type bumpers and limit switches ignored presses (also in the arena)
>   - potentiometers were never solved
>   - LM317, DIP and rotary switches and rheostats were wrongly marked fully simulated
>   - ESP32, NodeMCU and Pico boards run code but were marked limited
> - **L298N:** the 5 V-jumper rule now uses the 78M05's real limits (35 V input, ≈1 W of heat), so 3S LiPo +
>   jumper is a warning that shows the heat figure. Unwired 4WD motors say they came from the drivetrain, and FIX IT
>   wires them in parallel with the motor on that side. Brushless motors get "needs an ESC".

> **2026-11-27, intelligent mentor upgrade** (details: DEPLOYMENT_CHECKLIST.md for auth/email):
> - **Circuit bench** (Circuit Studio → Run / Pause / Stop / Reset): the student's code runs against the real
>   electrical bridge with no chassis. Motors spin with speed, direction and current from their data. The battery
>   sags with load and drains. LEDs and resistors are solved by a DC nodal solver (`src/lib/sim/dc.ts`). Wires
>   show the direction of conventional current. Pins show live voltages and HIGH/LOW/PWM levels. Students set
>   sensor inputs with sliders. A short circuit halts the bench and offers the fix.
>   Code: `src/lib/sim/bench.ts`, `components/workspace/circuit/BenchPanel.tsx`.
> - **FIX IT repair assistant** (`src/lib/circuit/repair.ts`, `RepairPlayer.tsx`). It has 21 repairable
>   rules, including enable/PWM/IN pins, grounds, supplies, L298N logic, jumpers, polarity, shorts, half-wired
>   motors, analog pins, I²C/UART swaps, LED resistors and BMS. Each repair is an animated plan (Identify →
>   Disconnect → Select pin → Connect → Test) with Play / Pause / Next / Previous / Restart / Skip. The repair is
>   applied, re-validated, reported and can be undone with Ctrl+Z. Pins already defined in the code
>   (`#define ENA 5`) are reused.
> - **Recommendation engine** (`src/lib/circuit/recommend.ts`). It sorts each part into one of six categories:
>   compatible, compatible with limitations, needs extras, not recommended, unsafe, unsupported. The checks use
>   real numbers: voltage, per-channel current with parallel motors summed, stall vs peak, drop, heat, logic
>   supply and PWM. Right-sized alternatives come from the catalogue, with a fallback to "Create custom component".
> - **Custom components** (`src/lib/catalogue/custom.ts`, saved in `project.customComponents`). Generic parts
>   get wiring and voltage checks. Motor and dual H-bridge templates are fully simulated with the student's values.
> - **Support registry** (`src/lib/components/support.ts`). Every part is fully simulated, limited or not yet
>   supported, each with an explanation and an alternative. There is no "PENDING" any more. Limited and
>   unsupported parts in a circuit are named by the validator.
> - **Learning mode** (`src/lib/components/learn.ts`, `LearnPanel.tsx`) gives beginner lessons. They are
>   hand-written for the L298N, TB6612FNG, Arduino, DC motor, 18650 packs, IR sensor, ultrasonic, LED, resistor,
>   switch and buck converter, and generated from the pin data for every other part.
> - **18650 packs, 1–5 cells**: series, parallel and series-parallel arrangements from the student's cell ratings;
>   BMS warning for series packs; a switch is optional (platform additions: 552 + 6).
> - **L298N**: the simulator now agrees with the validator when the logic supply is missing (jumper removed or VS
>   too low for the 78M05). 16 scenario tests: `tests/robot/l298n.test.ts`.
> - **Validation report** now has four levels: critical, warning, improvement suggestion, and passed check groups.
>   Each issue has Explain / FIX IT / Better alternative.
> - **Auth**: per-device email cooldowns, duplicate sign-up detection, resend confirmation, messages for expired
>   links, sign-in back-off on per-network limits, optional Google sign-in (`NEXT_PUBLIC_AUTH_GOOGLE=1`), and
>   `npm run accounts:bulk` (confirmed accounts with no email). The 2/hour email limit itself is Supabase's
>   built-in mailer and needs a custom SMTP in the dashboard.

> **2026-11-20, 4WD and off-road upgrade:**
> - 4WD skid-steer is the default for Robo Race and Sumo (4WD drivetrain helper and designer panel).
> - New 11.1V 2100mAh 3S LiPo battery.
> - Four 4WD Garage robots: RR-04, RR-05, RR-06, RW-04.
> - Off-road terrain physics: height map, slopes, mud, drivable or solid rocks, zigzag paths, hills, blocks, hurdles, platforms.
> - 8 off-road tracks, plus a terrain tool group and generator in the Track Designer.
> - 3D terrain rendering.
> - 4-motor telemetry and a motor test panel in the arena.
>
> The details and limitations are in README → "4WD robots and off-road racing".

| Module | State | Notes |
| --- | --- | --- |
| Design system & app shell | ✅ | Dark forest theme (page #131A16, Forest Sage panels, Warm Ivory text, Signal Red accents), Space Grotesk / Inter / JetBrains Mono. Sidebar grouped into Learn / Build / Compete with hints on every link; top bar with search (Ctrl K), notifications, help and settings; footer with the logo; logo on the loading screen |
| Command Center | ✅ | Interactive 3D hero robot; workspace stats; continue building; weekly missions; achievements & streaks; featured tutorials; leaderboard preview; competition updates |
| Authentication & profiles | ✅ local / ✅ Supabase connected | Local mode uses salted SHA-256 hashes in browser storage. Cloud mode uses Supabase Auth; the profile row is created by a database trigger |
| Component catalogue | ✅ | 552/552 master-list entries, 0 missing, 0 duplicate IDs, + 1 platform addition (11.1V 2100mAh LiPo Battery (3S), counted separately). Classes A/B/C. Honest GREEN/BLUE/YELLOW/GREY status. 75 datasheet-referenced pinouts, 220 function-standard pinouts. In-app completeness validator (can compare a newly uploaded list) |
| Component library UI | ✅ | Category tree, search by model/category/manufacturer, filters (voltage, protocol, competition, simulation status, class). Inspector with generated pinout, front/side/top/3D procedural views, specs (unknown = "unverified"), compatibility, datasheet link. Workshop-equipment tab |
| 3D Robot Designer | ✅ | Add by click or drag-drop; move/rotate gizmo (snapping); duplicate/delete; wheels snap onto motor shafts; chassis builder (19 chassis types, size, material, mounting holes); exploded view with assembly order; assembly tree / console / warnings |
| Mechanical validation | ✅ | Wheel attachment, motor orientation, one-sided drive, axle alignment, wheel size mismatch, overlaps, wheel/chassis interference, ground clearance, centre of mass vs support polygon, sensor height/placement, sumo size/mass limits (admin configurable) |
| Circuit Studio | ✅ | Pin-to-pin wiring, colour conventions, labels, delete, pin inspector (live voltages and peers), animated flow on powered nets, zoom/pan/fit, grid snap, undo/redo, JSON netlist export |
| Electrical validation engine | ✅ | ~35 rules: missing components, short circuits, supply conflicts, reverse polarity, over/under-voltage (full-charge aware), missing power/ground, no common ground, motor on GPIO, motor wiring, driver inputs/enables/standby, L298N jumper logic, PWM assignment, duplicate GPIO, analog vs digital pins, logic-level mismatch, I²C/SPI/UART wiring, current limits, LEDs without resistors, suggestions. Scores computed from issues. FIX IT navigates and highlights the part/pin |
| Code Studio | ✅ | Monaco (self-hosted, works offline), Arduino autocomplete, live diagnostics, format, templates (8), versions, .ino download/import, static explanation, pin-map panel. Circuit-aware checks (pin mismatch, unwired pins, writing to sensor outputs, missing pinMode …). Unlocked only after validation passes |
| Code execution | ✅ | **BEAST interpreter**: sandboxed tree-walking interpreter for a documented Arduino C/C++ subset (no eval, step and time limits, unsupported features reported). **AVR emulator**: real compiled .hex for Uno R3/Nano via avr8js |
| Physics & simulation arena | ✅ | Planar rigid-body dynamics, DC motor model, tyre friction circle, battery sag, collisions, ramps; 1 ms fixed step separate from rendering; 4 cameras; START/PAUSE/STOP/RESTART/RESET/step; 0.25–4× speed; telemetry, sensor bars, controller pins, serial monitor; WASD/SHIFT/SPACE/↑↓ plus on-screen controller; keys sent to Bluetooth Serial when an HC-05/06 is wired |
| Robo Race | ✅ | Laps, checkpoints in order, off-track, collisions, lap times, max/avg speed, records, ghost of best run |
| Line Following | ✅ | Reflectance sensors sample the real track under each sensor footprint; analog/digital/array outputs reach the code only through the wired pins. Verified: the PID template completes a lap; with sensors unplugged it cannot |
| Sumo | ✅ | Circular/rectangular arenas, ring-out, wedge load transfer, match timer, start delay; 4 AI opponents (search/approach/attack/retreat/edge-avoid using only their own sensors) |
| Debugging assistant | ✅ | Runtime errors, compile failures, runtime warnings, motors not responding (only when code commands motion), wrong motor direction, off-track, ring-out, battery low, collisions. Separates verified facts from possible causes; can pause the simulation |
| Track Designer | ✅ | Race/line/sumo tools, endpoint snapping, drag/rotate/resize/duplicate/delete, undo/redo, zoom/pan, free-draw lines, surface friction, difficulty, laps, arena settings, 3D preview, save/load/import/export, 9 example tracks |
| Beast Topics | ✅ | 84 topics (30 line, 28 race, 26 sumo), all required sections, generated diagrams, mark complete, bookmark, continue reading, YouTube search links and admin-curated embeds |
| Quiz & challenge engine | ✅ | 350 questions across all 10 types; topic quizzes, 3 competition quizzes, 2 weekly quizzes, 3 engineering challenges, final exam. Exam-style runner: Previous / Skip / Next, palette of answered/skipped/unanswered questions, review before submit, results with explanations and XP. Each attempt carries a client-generated attempt id; `submit_quiz` (0012) returns the stored result for a repeated id, so double clicks, retries, timeouts, refreshes and simultaneous requests award XP once (`npm run quiz-xp:smoke`, `tests/xp`). The result screen shows question XP and the pass bonus separately. `npm run xp:audit` is a read-only duplicate check |
| Gamification | ✅ | One XP ledger (`xp_events`: source, description, attempt). Lifetime XP never resets. Daily XP resets at 11:15 PM IST via pg_cron (Vercel cron backup), idempotent per day. 16 ranks (Beginner → BEAST) set on the server, never lowered by penalties, with rank history and a one-time rank-up animation. The leaderboard shows only students above 50 XP (filtered in the database; ties share a place). Profile XP history with search/source/quiz/date filters and totals; challenge XP history; 9 achievements; streaks |
| Performance analysis | ✅ | `/learn/performance`: accuracy per topic and per category (9 categories covering all 84 topics). Bands: Needs Improvement < 50, Developing 50–69, Good 70–84, Excellent 85+, shown only after 5+ answers. Strongest/weakest areas, trend chart, recommended lessons |
| Brand colour system | ✅ | Forest Sage dominant / Warm Ivory foreground / Signal Red accents, defined once as CSS tokens (`globals.css`) and `src/lib/theme.ts` for 3D, SVG and Monaco. Applied to every page, including the 3D viewports, schematic canvas, track designer, diagrams and code editor. An automated colour audit found no old-palette colours on any route. |
| Roles & admin security | ✅ | student / admin / super_admin. The `/admin` route is gated on the server (`proxy.ts` plus a Server Component layout that reads the role from the database). The database enforces everything else: RLS, `admin_set_role` / `admin_find_user` / `admin_list_staff` functions, a protect-profile trigger and an append-only `role_audit_log`. MAKE AS ADMIN by email (Super Admin only), revoke, and audit log UI. The Super Admin is bootstrapped server-side (`npm run admin:bootstrap`). |
| Admin dashboard | ✅ | Students and roles, component editing (images, 3D URL, datasheet, verification, pin JSON), lesson overrides and extra questions, videos, weekly missions, announcements, competition rules, featured projects, analytics |
| BEAST PROJECT GARAGE | ✅ | 13 reference robots (4WD is the club standard for race and sumo: RR-04, RR-05, RR-06, RW-04 plus RR-02; RR-01, RR-03, RW-01..03 kept as Legacy 2WD) built from catalogue parts through the normal project pipeline; Garage page with Line Following Lab / Robo Race Garage / Sumo Battle Workshop; VIEW / LOAD / SIMULATE NOW / CUSTOMISE; project view with OVERVIEW, 3D ASSEMBLY, CIRCUIT, CODE, SIMULATION, COMPONENTS tabs; 12-step loader that really builds, compiles, validates and starts the simulation; read-only originals + student copies; 14-check readiness test (all 13: READY TO SIMULATE); live tuning panel (sliders send the firmware's own Serial commands) and firmware telemetry panel; keyboard → Bluetooth serial → firmware for the manual racers |
| Supabase schema | ✅ applied (0001–0009, 2026-11-18) | Tables for all 25 entities, normalised project tables kept in sync by trigger, RLS on every table, `award_xp` / `complete_lesson` / `submit_quiz` security-definer functions, leaderboard view, seed script |

## In progress / pending

- **Supabase project connected (2026-11-17).** Migrations 0001–0003 were applied with `npm run db:push`, and the content was seeded with `npm run seed:supabase`: 552 components, 1,636 pins, 84 topics, 350 questions with hidden answer keys, 9 quizzes and 7 missions. A visitor who is not signed in was confirmed to be denied components, answer keys, profiles, projects and `award_xp`. The app runs in cloud mode (sidebar shows CLOUD SYNC · SUPABASE). **Cloud smoke test** (`npm run cloud:smoke`): creates two temporary confirmed accounts, runs 19 checks through the app's own `SupabaseBackend`, then deletes the accounts. 19 / 19 pass:
  - **Accounts and projects:** the profile trigger runs on sign-up; a Garage LF-03 copy saves and reloads intact (12 parts, 35 wires); the normalised project tables are filled.
  - **XP:** `award_xp` takes amounts from the server and ignores duplicates; the client cannot award quiz XP itself.
  - **Quizzes and lessons:** quizzes are graded against the hidden answer keys with XP awarded once; lesson XP is awarded once; progress is recorded.
  - **Profile protection:** students can rename themselves but cannot make themselves admin or set their XP.
  - **Isolation between students:** another student cannot read, change or forge someone else's project, cannot read answer keys and cannot insert XP events.
  - **Leaderboard:** shows the server-side XP total.
  The first run found two schema bugs, fixed in `0004_fix_xp_totals_and_progress.sql`:
  - XP totals never rose, because the profile-protection trigger also reverted updates made by the trusted XP functions.
  - A first quiz taken before any progress row existed lost its correct answers.
  Sign-in through the browser UI with a real account has not been exercised by an automated test.
- **Accurate 3D models and verified photos.** None exist yet (0/552). Every part uses a clearly labelled procedural model built from its dimensions. Admins can attach images and glTF URLs; the glTF URL is stored but the designer does not load glTF files yet.
- **Pinouts for 257 entries** (mostly mechanical/workshop items, plus some boards: ESP32-S3/C3, XIAO, STM32, Teensy, nRF52840, VNH-series drivers). These are shown as "pending verification". Admins can add them in Admin → Components.
- **Admin sign-off.** "Datasheet-referenced" values were entered from manufacturer documentation but are not yet marked admin-verified.
- **Wokwi integration** was not used (licensing); the AVR path uses the open-source avr8js core directly.
- **Persisted achievements in Supabase.** Achievements are derived client-side from XP events; the `user_achievements` table is not written yet.

## BEAST PROJECT GARAGE — test results

Full report: `GARAGE_TEST_REPORT.md` (`npm run garage:report`).
- **Readiness:** all 13 reference projects (9 original incl. 5 legacy 2WD + 4 new 4WD) pass all 14 checks (READY TO SIMULATE).
- **Required behaviour scenarios:** 67 / 67 passing (45 original + 22 for the 4WD robots).
- **Line:** straight, curves, sharp turns, 12 mm and 30 mm lines, intersections, lost-line recovery and calibration.
- **Race:** forward, reverse, left, right and stop over Bluetooth; acceleration and braking; collisions; custom track; encoder accuracy; autonomous laps.
- **Sumo:** edge detection, boundary recovery, detection, attack and distance accuracy.
- **Observed-behaviour runs:** 16 recorded (custom 18 cm-radius student course for each line robot, RR-03 on the obstacle course, all sumo robots against every AI level); 15 succeeded.
- **Browser checks:** Garage readiness badges, the 12-step loader, autostart, live Kp change confirmed from the firmware's own telemetry (0.090 → 0.300), read-only original refusing a delete, fork + edit, and all six project-view tabs.

Simulator fixes found while building the Garage:
- **Encoder edges.** Encoders used to fire their interrupt on every quadrature count, regardless of the attachInterrupt mode, and the ISR read the pin levels at the end of the physics step. The bridge now emits real per-pin rising/falling edges, honours RISING/FALLING/CHANGE, and runs each ISR while the pins show their state at that edge. Quadrature decoding is now exact.
- **Code check.** "Wired but unused" warnings are no longer raised when the firmware accesses pins through arrays or variables, which can't be resolved statically.
- **Sharp IR outputs.** These now carry their datasheet output range (≈3.1 V max), so logic-level checks on 3.3 V boards are correct.

## Roles & admin — test results

`npm run roles:smoke`: **23 / 23 pass** against the live Supabase project and the running app, using four temporary accounts that are deleted afterwards.
- **Students:** cannot look up accounts, promote anyone, change their own role (via the function or a direct update), read or write the audit log, or list staff.
- **Super Admin:**
  - finds users by email (case-insensitive), and an unregistered email returns nothing
  - promotes to admin, with an audit row recording the actor, old role and new role
  - cannot grant super_admin, change their own role, or demote another super_admin
  - can revoke admin access, which is also audited
- **Admins:** can list staff and read the audit log; cannot look up accounts by email, promote others, or raise their own role.
- **`/admin` route:** sends signed-out visitors to login (307), shows "Access denied" to a signed-in student, and opens for an admin and for the Super Admin.

`npm run cloud:smoke` still passes 19 / 19. In local mode, the MAKE AS ADMIN flow was also run in the browser: unregistered email gave "No account found"; registered email, then confirm, then MAKE ADMIN gave role Admin plus an audit-log row. A student saw no admin link, and `/admin` refused them.

## Testing results

`npm test` → **865 tests in 23 files, all passing** (2026-11-18, including the 135-test line-following matrix; see AUDIT_REPORT.md). `tsc` and ESLint are clean, and `next build` succeeds.

| Required scenario | Automated test | Browser check |
| --- | --- | --- |
| 1. 2WD robot (Uno, L298N, 2 DC motors, wheels, battery) | `tests/circuit/validation.test.ts` | Built from an empty project in the UI, wired pin by pin, validated → "ROBOT SYSTEMS VERIFIED", scores 100/100/96/98 |
| 2. IR sensor array line follower | validation + `tests/integration/workflow.test.ts` (PID template completes a lap; fails with sensors unplugged) | Arena: PID code reaches 99% of the oval using the 5-channel array |
| 3. Incorrect motor driver wiring | missing common ground, ENA on non-PWM pin, IN1 open, motor on GPIO, reverse polarity, short circuit, over-voltage | UI report lists the exact pin; FIX IT jumps to Circuit Studio and highlights it |
| 4. Code GPIO differs from circuit | `C_PIN_MISMATCH` test | Monaco shows "Circuit: D5 → DRV1 ENA. Code (line 2): ENA = 11 (D11)" |
| 5. Manual WASD driving | session test (forward, right turn, e-stop; no power without ground) | W 0.5 m/s forward, D turns right, SPACE stops, page does not scroll |
| 6. Custom race track | custom TrackDef test | Track built in the Track Designer (snapping confirmed), robot driven on it, obstacle collision registered |
| 7. Sumo vs opponent | sumo template vs AI | Sumo code waits 5 s, then beats the Intermediate opponent ("VICTORY!") |
| 8. Save → log out → log in | — | Projects, verification state and XP persist (local mode, same device) |
| 9. Topic + quiz → XP & progress | `tests/learning` (content integrity) | Lesson +20 XP; quiz XP only for newly correct answers (+25, then +50, then +0 on retry); topic marked complete |
| 10. Catalogue vs master list | `tests/catalogue/completeness.test.ts` | Library → Completeness report: COMPLETE 552/552 |

Bugs found and fixed during browser testing:
- Global keyboard shortcuts crashed on non-element event targets.
- The debugger raised a false "motors not responding" alarm during a sumo start delay.
- FIX IT camera focus was overridden by fit-to-view.
- Wheel labels were duplicated.
- The arena loop stalled when animation frames are throttled.
- Circuit Studio layout was cramped at laptop widths.

## Technical limitations (stated honestly in the UI too)

- **Session change (2026-11-17):** cloud sessions moved from browser storage to cookies so the server can verify roles. Everyone has to sign in once more after this update.
- **Local-mode admin:** in local mode the `/admin` gate and role rules run in the browser only. Server-side protection applies in cloud (Supabase) mode.
- **Lint:** 12 ESLint warnings remain (hook dependency hints, `<img>` usage). There are no errors.

- **Garage sumo matches:** the reference sumo robots (25GA370 motors, sticky sumo tyres, wedge) out-push the built-in AI opponent robots, so head-on matches are usually won in the first push. That outcome comes from the physics, not a script.
- **RR-03 on obstacles:** RR-03 keeps itself on the road with two floor sensors but has no obstacle sensor, so it hits obstacles on the obstacle tracks. This is documented in the project as an extension exercise.
- **Tight student tracks:** line robots can lose the line on very tight custom curves (18 cm radius). They then search for it, as a real robot would.

- **Physics** is planar (top-down 2.5D). There is no tipping, wheel lift-off or dynamic weight transfer. Ramps are force zones. Floor sensors do not see robots. Parameters marked "estimated" (motor curves, tyre μ) are typical values, editable per part.
- **The interpreter** runs a subset of Arduino C/C++. Classes, structs, pointers, templates, most libraries (Wire, SoftwareSerial, QTRSensors, VL53L0X …) and sprintf are reported as unsupported. Timing is approximate, not cycle-accurate. For full C++, upload a compiled .hex (Uno R3/Nano only).
- **QTR-RC timing sensors, I²C sensors (ToF, IMU) and servos** are design/connection-supported (BLUE) but not simulated.
- **Local mode** is per-browser and not tamper-proof. Use Supabase for real competitions.
- **Dev server quirk:** with Turbopack, newly added Tailwind classes occasionally do not appear until the dev server restarts. Production builds are unaffected.
- The UI is optimised for laptop/desktop. Phones can browse, learn and take quizzes; the 3D/circuit editors need a mouse and ≥1024 px width.

## Update 2026-11-27 — wiring colours, battery options, NIAT/campus, streaks, video library (not yet deployed)

Code done, tested locally (1,331 unit tests, typecheck, lint 0 errors, production build, secret scan, browser check in local mode):
- Circuit: wires use three colours only (red +, black GND, blue #2878B5 signal). Motor-driver outputs follow the live H-bridge state. Junction dots appear on pins with 2+ wires. Light-grey canvas; "Lite" low-performance mode.
- Validation: issues grouped into Safety / Electrical / Power / Compatibility / Mechanical / Simulation / Code. New L298N checks: continuous current, motor pair reversed, left/right on one bridge, uncertain current (once per project). The jumper rule now reads the real regulator option. FIX IT changes nothing until "Apply this fix".
- Bench: manual LOW/HIGH/PWM pin control when no firmware runs.
- 18650 packs: chemistry (Li-ion / LiFePO4 sets its voltages), cut-off voltage, internal resistance (mΩ) and starting charge. New safety checks: E_CELL_OVERCHARGE and W_CELL_OVERDISCHARGE.
- 3D: models for diodes, TO-92 / TO-220 / SOT-23 transistors and MOSFETs, Seeed XIAO boards, brackets, soil probe and MAX30102. The selected part gets a pin-name card (wired pins marked).
- NIAT ID `^N[0-9]{2}H([0-9]{3}|[0-9]{2}[A-Z])[0-9]{4}$` with the official error text; campus / college name is mandatory.
  - Admins: campus column, edit, search, filter and CSV export; a NIAT/campus review list (read-only); set an ID after checking it (logged).
- Streak: the day ends at 23:59 in the student's timezone (default Asia/Kolkata), computed on the server (streak_days + my_streak()), with history kept.
- Video library: upload MP4/WebM/MOV (≤50 MB) with progress, cancel and retry into a private bucket, played through signed URLs.
  - Links from YouTube / Shorts / Vimeo / Dailymotion / Instagram / Facebook play only via official embed templates. X is link-only, and anything else shows "Preview unavailable. Open the original video."
  - /api/oembed (admins only, fixed endpoints). Drafts are hidden from students. The CSP is extended.

Pending (needs authorization — production changes):
1. Deploy the frontend first (it works with or without the new migrations).
2. Then `npm run db:backup` and apply `supabase/migrations/0015_niat_campus_streaks.sql` and `0016_video_library.sql`. Migration 0015 makes NIAT ID + campus mandatory in the sign-up trigger, so the old frontend must not be live when it runs.
3. Then run `npx tsx scripts/profile-smoke.ts https://<site>` (new NIAT / campus / streak / admin checks).
Existing accounts are not modified: IDs stay as they are (the new pattern accepts every previously valid ID). Missing campus names are asked from the student on next visit.
