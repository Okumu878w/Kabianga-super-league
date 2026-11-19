# Kabianga Super League

Multi-competition football league platform: public website + administrator dashboard + **team-manager portal**.
Next.js (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, Realtime, RLS) · deploy on Vercel.

> **Read `AUDIT.md` first.** It lists, requirement by requirement, what was already in the starter, what was built, what was fixed, what was tested, and what is still missing.

## 1. Run it locally

```bash
npm install
cp .env.example .env.local        # fill in the three Supabase values
npm run dev                        # http://localhost:3000
npm test                           # unit tests (round-robin engine, scheduling, import validation)
DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db   # SQL: RLS, workflows, standings, stats (scratch Postgres)
npm run typecheck && npm run build
```

## 2. Supabase setup

1. Create a project at supabase.com. Copy *Project URL*, *anon key*, *service_role key* into `.env.local` (and into Vercel — see §4).
2. Apply the migrations **in order** (SQL Editor, or `supabase db push` with the CLI): `supabase/migrations/0001` … `0008`.
   `0002` only adds enum values and must run (and commit) before `0003+`; do not merge it into another file.
3. **Auth → URL configuration**: set *Site URL* to your site URL and add `<SITE_URL>/auth/callback` to *Redirect URLs* (used by invitations and password resets).
4. **Auth → Providers → Email**: keep *Confirm email* on; disable public sign-ups (**Auth → Settings → "Allow new users to sign up" = off**) — team managers are created by invitation only. Configure a real SMTP sender for production (the built-in one is rate-limited).
5. Storage buckets (`league-logos`, `player-photos`, `news-covers`, `match-documents`) and their policies are created by migration `0008`. `match-documents` is private; the others are public-read.
6. (Optional, development only) run `supabase/seed.sql` for clearly-labelled **[DEMO]** data. Remove it before production — instructions are at the top of the file.

## 3. First-time administrator onboarding

There are **no default credentials**. Create the first super administrator yourself:

1. Supabase → **Authentication → Users → Add user** (enter your email + a strong password, tick *auto-confirm*).
2. SQL Editor — grant the role (replace the email):
   ```sql
   insert into public.user_roles(user_id, role)
   select id, 'super_admin' from auth.users where email = 'you@example.com';
   ```
3. Sign in at `/login` → you land on `/admin`. The overview shows a getting-started checklist:
   **Settings** (branding, upload official logo) → **Competitions** → **Seasons** → **Teams** → *Seasons → Teams* (assign teams to the season) → **Players** → **Fixtures → Generate** (or manual / bulk upload) → **Publish schedule**.
4. **Team Managers → Invite**: choose a team and enter the manager's email. They receive an invitation, set a password, and see only that team in `/manager`.
5. Match day: manager submits lineup/events (optional) → admin reviews in **Results → Open match** → *Submit → Verify → Publish*. Standings and statistics update instantly because they are derived from published results.

Roles: `super_admin` (everything) · `competition_admin` (only competitions assigned in *Users & Permissions*) · `editor` (match information, news, awards) · `viewer` (read-only) · `team_manager` (own team only).

### Entering results for a league that is already under way
* **Past results in bulk:** Admin → Imports & Exports → **Past results**. CSV/Excel columns: `match_date, home_team, away_team, home_score, away_score` (+ optional `home_scorers, away_scorers, kickoff_time, matchweek, round, venue`). Missing fixtures are created, results are published, and the league table updates. Re-uploading the same file is safe (same teams + date = same match).
* **One match at a time with scorers:** Admin → Results → Open match → **Quick result** (super admin / competition admin). Scorer lines look like `Peter Otieno 23`, `John Kamau (p) 67`, `Brian Mwangi (og) 80`, `Peter Otieno (2)`.
* Scorers must already be registered players (Players → Register, or the Players import). Leave scorers blank if unknown; the score still counts for the table but no player statistics are credited.

## 4. Deploy to Vercel

1. Push the repo to GitHub → *Import Project* in Vercel (framework: Next.js, no custom build settings).
2. Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (your https domain), `SUPABASE_SERVICE_ROLE_KEY` (**mark as sensitive; server-only**).
3. Deploy, then update Supabase *Site URL / Redirect URLs* to the production domain.
4. Rate limiting is in-process (`lib/rate-limit.ts`). On Vercel's many short-lived instances this is a speed bump, not a guarantee — move it to Upstash Redis for strict limits.

## 5. Architecture in one page

| Concern | Where |
|---|---|
| Schema, constraints | `supabase/migrations/0001` (starter) + `0003` (extensions) |
| Integrity guards, audit triggers | `0004` |
| RLS policies (replace the permissive starter ones) | `0005` |
| Standings, player statistics, Player-of-the-Week suggestions (derived, never stored) | `0006` |
| Transactional workflows: manager approvals, result publish/reopen, fixture batches | `0007` |
| Storage + realtime | `0008` |
| Round-robin engine / scheduler | `lib/fixtures/` (pure, unit-tested) |
| CSV/XLSX parsing + validation + templates | `lib/imports/` |
| Server actions (mutations) | `app/admin/actions/*`, `app/manager/actions.ts`, `app/actions/imports.ts` |
| Auth gates | `lib/auth.ts`, `middleware.ts`, per-page `requireAdmin/requireManager` |

Key design decisions
* **Nothing derived is stored.** League table, form, top scorers, assists, cards, clean sheets = SQL functions over *published* results. Publishing, correcting (`reopen_published_result`) and reversing are therefore always consistent.
* **Draft scores never touch the public `fixtures` row.** They live in `match_reports` (staff-only) and are copied on publication, so RLS cannot leak them.
* **Managers can only propose.** RLS lets them insert/update *their own* proposals; a trigger blocks any status other than draft/submitted; only `SECURITY DEFINER` review functions can approve, and they refuse self-approval.
* **Transfers keep history**: a registration is closed (`released_at`) and a new one opened; stats attach to the team recorded on each lineup/event row.
* Fixtures use `round_number` (leg) so a second meeting of the same teams is explicit, never an accidental duplicate.

## 6. Known gaps
See the **"Not done / partially done"** section of `AUDIT.md`. Please read it before going live.
