# BEAST FEAST 5.0 — Site audit (2026-11-18)

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

_Pending: results from the line-following test matrix are added here when that work finishes._

## Automated checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `eslint src --quiet` (errors) | clean |
| `npm run xp:smoke` (live database) | 34 / 34 pass |
| `npm run cloud:smoke` (live database) | 19 / 19 pass |
| `npm run roles:smoke` (live database + dev server) | 23 / 23 pass |
| `vitest` | see DEVELOPMENT_STATUS.md for the final count |

## Not changed, and why

- **Palette:** the spec lists the Forest Sage / Ivory / Red palette. The site keeps the *dark* Forest variant (page `#131A16`) because the dark background was asked for explicitly earlier. The colours are the same family; only the page background is darker.
