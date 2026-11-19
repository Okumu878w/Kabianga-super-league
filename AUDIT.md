# Audit of the delivered codebase against the two specifications

**Method.** I unzipped `kabianga-super-league.zip`, read every file, applied its migration to a real PostgreSQL 16 instance (with a Supabase auth/storage stub) and probed it. Then I built the missing parts and verified what I could in this environment.

## 0. Verdict on the code you uploaded

The upload was a **~350-line starter, not the platform**: Next.js shell, a login page, a placeholder page per route ("Phase 2…"), one SQL migration, and a basic Team-Manager scaffold. Roughly **10–15 %** of the two specifications existed. Concrete defects found in it:

| # | Defect | Effect | Fixed in |
|---|---|---|---|
| 1 | `generate_round_robin()` rotated the team array wrongly. Test: 6 teams → 15 fixtures but only **9 distinct pairings** | Duplicate pairings, missing matches | Removed; replaced by tested TS engine (`lib/fixtures`) + transactional `create_fixtures_batch()` |
| 2 | Manager RLS let a manager `INSERT` a registration/match submission with `status='approved'` | **Self-approval hole** | `0004` `enforce_submission_state` trigger + `0005` (no policy can approve) + `0007` review functions |
| 3 | Admin "approve" updated the row from the client; no player registration was created, no notification, no audit | Approvals did nothing official | `review_player_registration()` etc. |
| 4 | `player_statistics_view` counted events of **unpublished** fixtures (left join with the filter in `ON`) | Draft data in statistics | `get_player_stats()` filters published fixtures |
| 5 | Standings ignored competition points rules / tie-breaks, showed no form, hid teams with 0 games | Wrong table | `get_standings()` |
| 6 | Same-column `id` ambiguity trap in my own new `players` policy (found by test, fixed) | Players invisible | `0005` |
| 7 | Any admin/editor could write everything (no competition scoping); any admin could forge audit rows | Privilege problems | `can_manage_competition()`, `competition_admins`, audit insert policy removed |
| 8 | Brand colours differed from the spec; most pages were stubs | — | New CSS + all pages |

## 1. Requirement matrix

Legend: ✅ built **and verified here** · 🟡 built, compiles, **not exercised against a live Supabase** · ⚠️ partial · ❌ not done

### Spec 1 — Kabianga Super League platform
| Area | Status | Notes |
|---|---|---|
| Stack: Next.js App Router, TS, Tailwind, Supabase, Recharts, Vercel | ✅/🟡 | builds (`next build`), type-checks |
| shadcn/ui, React Hook Form, TanStack Table, Sonner | ❌ | **Deliberately not used**: plain accessible forms, server actions + zod, HTML tables, flash messages. Same UX goals, fewer dependencies. Say so if you require them. |
| Brand palette, dark UI, text logo, logo/crest/photo upload | 🟡 | palette per spec; uploads validated by magic bytes + size |
| Public nav, competition & season selector, mobile bottom nav | 🟡 | |
| Homepage (hero, fixtures, table, scorers, POTW, TOTW, news, stats, footer) | 🟡 | all data from Supabase; empty states when no data (smoke-tested unconfigured) |
| Competitions / Fixtures (filters) / Results (by matchweek) / League table / Teams / Players / Statistics / Awards / News | 🟡 | |
| Match centre | 🟡 | events timeline, lineups, report — only for **published** results |
| Competition types league/knockout/group | ⚠️ | stored + selectable; only **league** logic exists (spec said prioritise league) |
| Points rules, configurable tie-breaks | ✅ | goal diff, goals for, wins, goals against, fewest losses. **Head-to-head not implemented** |
| Form guide, auto-updating table | ✅ | tested in SQL suite (publish, reopen, republish) |
| Mobile scroll tables / no overflow | 🟡 | CSS written for 360–1440px; **not browser-tested** |
| Admin: all 18 sections | 🟡 | Overview, Competitions(+new), Seasons, Teams, Players, Fixtures(+generate,+import), Matchweeks, Results, Match Reports, League Tables, Player Statistics, Awards, Team of the Week, News, Imports & Exports, Users, Audit Logs, Settings (+Team Managers, Approval Queue) |
| Season history never overwritten | ✅ | new seasons are new rows; archive status |
| Player ≠ registration; transfers keep history | ✅ | tested (`transfer_player`, release) |
| Manual fixtures + validations (teams differ, in season, conflicts ±2h, duplicates) | ✅ | DB triggers, tested |
| Bulk fixture upload with preview/errors/partial import/error report | ✅/🟡 | parsing+validation unit-tested; commit path SQL-tested; UI 🟡 |
| Round-robin generator: single/double, byes, balance, determinism, dates/times/venues/rest/availability | ✅ | 100 unit tests (2–20 teams) |
| Generator: transactional, preview/edit/swap/regenerate unpublished, never touches published | ✅/🟡 | SQL-tested (atomic abort); UI 🟡 |
| Match report: score, HT, events, lineups, referee, attendance | 🟡 | substitutions are on/off events; formation stored on lineups |
| Result workflow Draft→Submitted→Verified→Published, atomic publish, reopen/correct, audit | ✅ | tested incl. score-vs-events validation, immutability, instant reversal |
| Stats: goals (own goals excluded), assists, apps, cards, clean sheets (min-minutes rule) | ✅ | tested |
| Player of the Week (suggest → admin approves), Team of the Week (4 formations, pitch) | ✅/🟡 | POTW uses `awards` table, TOTW uses new tables |
| News: draft/schedule/publish/archive, share links | ✅/🟡 | scheduled posts appear automatically (RLS time check; tested) |
| RLS on every table, roles, competition scoping, no escalation | ✅ | 113 assertions in `supabase/tests/rls_and_workflows.test.sql` |
| Service-role key server-only | ✅ | `server-only` import; only used for invitations |
| Rate limiting | ⚠️ | in-memory (see README §4) |
| Imports/exports CSV+XLSX, templates; PDF summary | ✅/🟡 | formula-injection-safe exports; PDF is a basic table report |
| Realtime | ⚠️ | `fixtures` & notifications are in the realtime publication and RLS-safe, **but no client subscription UI** was written |
| SEO: metadata, sitemap, robots, canonical, JSON-LD | 🟡 | |
| Supabase generated types | ❌ | needs your project: `npm run types`. Code currently uses loose row types |
| Seed data, README, .env.example, deploy + onboarding docs | ✅ | |

### Spec 2 — Team Manager module
| Area | Status | Notes |
|---|---|---|
| TEAM_MANAGER role, invitation-only accounts, password reset, deactivation | ✅/🟡 | assign/deactivate/set-active SQL-tested; invite email flow 🟡 (needs SMTP + service key) |
| Managers limited to assigned teams (RLS + server) | ✅ | tested (cross-team reads/writes blocked, deactivated manager loses access) |
| Dashboard: overview, my team, squad, registrations, fixtures, submissions, reports, notifications, settings | 🟡 | |
| Team profile changes via approval (incl. crest) | ✅/🟡 | `review_team_change`; private contact details in `team_private_details` |
| Squad management, single + bulk import, duplicate/squad-number checks | ✅/🟡 | |
| Player registration approval (approve/reject/under review/changes requested; creates official registration) | ✅ | tested; also update / release / transfer requests |
| No self-approval | ✅ | tested (trigger + function) |
| Only approved players in lineups/events | ✅ | trigger, tested |
| Fixture access + reschedule/venue/postpone requests | ✅/🟡 | |
| Match info submission (lineup, captain, formation, events, observations, documents) | ✅/🟡 | versioned history; private `match-documents` bucket with signed URLs |
| Admin compares both teams, approves/rejects, then **loads into official draft** (never publishes) | ✅ | tested |
| Notifications (all listed triggers) + admin broadcast | ✅ | tested for assignment, approval, publication |
| Audit trail incl. login/logout | ✅ | row triggers + `log_auth_event` |
| Approval queue with filters | 🟡 | |

## 2. What was actually tested here

| Suite | Result |
|---|---|
| `npm test` (Vitest): round-robin 2–20 teams × single/double, byes, balance, determinism, scheduler, CSV/XLSX parsing, import validators | **115 passed** |
| `supabase/tests/rls_and_workflows.test.sql` on PostgreSQL 16 (Supabase auth/storage/roles stubbed): RLS isolation, role escalation, manager workflows, fixture integrity, atomic generation, result workflow, derived stats, reopen/correct, audit, news | **113 passed** |
| `tsc --noEmit`, `next build` | clean |
| Production-server smoke test with no Supabase configured | public pages 200 with empty states; `/admin`,`/manager` redirect to `/login`; export endpoint 403 |
| Playwright specs (`e2e/`), responsive 360/390/768/1440 | **written, NOT run** (no browser here) |

## 3. Not done / partially done — read before launch

1. **The UI and server actions have never run against a real Supabase project.** They compile and the database layer they call is tested, but expect small integration bugs (column names in selects, form edge cases) on first run. Treat first deployment as a staging exercise.
2. Playwright/UI tests and real-device responsive checks not executed.
3. Realtime subscriptions in the UI; live-score flow (statuses live/half-time exist, no minute-by-minute scoring).
4. Knockout / group-stage engines; head-to-head tie-break; "awarded results" rules for abandoned matches (admin can publish an awarded score manually).
5. shadcn/ui, React Hook Form, TanStack Table, Sonner not adopted (see matrix).
6. Generated Supabase types; per-instance rate limiter.
7. Naming differences from the written schema (functionally equivalent): `fixtures.kickoff_at` (not `scheduled_at`), players store `first_name/last_name` with generated `full_name`, `awards` (type `player_of_week`) instead of a `player_of_week` table, submission tables use `player_data` / `lineup`+`events` JSONB, assignments use `is_active`, TOTW stores `player_id` rather than a registration id.
8. Manager crest proposals are stored in the public `player-photos` bucket under `{team_id}/` until approved (unlinked, but technically public by URL).
9. Editors are global (not competition-scoped) for match information, news and awards.
