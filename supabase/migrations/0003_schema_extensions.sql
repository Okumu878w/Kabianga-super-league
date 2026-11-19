-- 0003: schema extensions required by the project brief + team-manager module.
-- Additive only: no existing table is dropped or renamed.

------------------------------------------------------------------ profiles / accounts
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_active boolean not null default true;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name,email)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)),new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

------------------------------------------------------------------ competitions
alter table public.competitions add column if not exists logo_url text;
alter table public.competitions add column if not exists points_win int not null default 3;
alter table public.competitions add column if not exists points_draw int not null default 1;
alter table public.competitions add column if not exists points_loss int not null default 0;
alter table public.competitions add column if not exists tie_break_rules jsonb not null default '["goal_difference","goals_for"]'::jsonb;
alter table public.competitions add column if not exists clean_sheet_min_minutes int not null default 45 check (clean_sheet_min_minutes between 0 and 120);
alter table public.competitions add column if not exists rules text;
alter table public.competitions add column if not exists start_date date;
alter table public.competitions add column if not exists end_date date;
alter table public.competitions add constraint competitions_format_chk check (format in ('league','knockout','group_stage','group_knockout')) not valid;
alter table public.competitions add constraint competitions_tiebreak_chk check (jsonb_typeof(tie_break_rules)='array') not valid;

------------------------------------------------------------------ teams
alter table public.teams add column if not exists coach_name text;
create table if not exists public.team_private_details(
  team_id uuid primary key references public.teams on delete cascade,
  contact_email text, contact_phone text, updated_at timestamptz not null default now());

alter table public.competition_teams add column if not exists registration_status text not null default 'approved';

------------------------------------------------------------------ players & registrations
alter table public.players add column if not exists slug text;
alter table public.players add column if not exists biography text;
alter table public.players add column if not exists full_name text generated always as (first_name||' '||last_name) stored;
create unique index if not exists players_slug_key on public.players(slug);

alter table public.player_registrations add column if not exists competition_id uuid references public.competitions;
alter table public.player_registrations add column if not exists position text;
alter table public.player_registrations add column if not exists released_at timestamptz;
alter table public.player_registrations add column if not exists registered_at timestamptz not null default now();
alter table public.player_registrations add constraint player_registrations_position_chk check (position is null or position in ('Goalkeeper','Defender','Midfielder','Forward')) not valid;
alter table public.player_registrations add constraint player_registrations_squad_chk check (squad_number is null or squad_number between 1 and 99) not valid;
-- A player can be actively registered once per season; a transfer releases the old row first.
alter table public.player_registrations drop constraint if exists player_registrations_player_id_season_id_key;
create unique index if not exists player_reg_one_active on public.player_registrations(player_id,season_id) where released_at is null;
create unique index if not exists player_reg_squad_number on public.player_registrations(team_id,season_id,squad_number) where released_at is null and squad_number is not null and status in ('approved');
create index if not exists player_reg_team_season on public.player_registrations(team_id,season_id);

alter table public.players add constraint players_position_chk check (position is null or position in ('Goalkeeper','Defender','Midfielder','Forward')) not valid;

------------------------------------------------------------------ matchweeks / fixtures
alter table public.matchweeks add column if not exists start_date date;
alter table public.matchweeks add column if not exists end_date date;
alter table public.matchweeks add column if not exists status text not null default 'scheduled';

alter table public.fixtures add column if not exists result_status text not null default 'draft';
alter table public.fixtures add column if not exists halftime_home_score int;
alter table public.fixtures add column if not exists halftime_away_score int;
alter table public.fixtures add column if not exists round_number int not null default 1;
alter table public.fixtures add column if not exists notes text;
alter table public.fixtures add column if not exists verified_by uuid references auth.users;
alter table public.fixtures add column if not exists updated_at timestamptz not null default now();
alter table public.fixtures add constraint fixtures_result_status_chk check (result_status in ('draft','submitted','verified','published')) not valid;
create index if not exists fixtures_season_week on public.fixtures(season_id,matchweek_id);
create index if not exists fixtures_kickoff on public.fixtures(kickoff_at);
create index if not exists fixtures_status on public.fixtures(status,result_status);
create index if not exists fixtures_home on public.fixtures(home_team_id);
create index if not exists fixtures_away on public.fixtures(away_team_id);

-- Draft/unverified scores live here (staff-only) so they can never leak through the public fixtures row.
alter table public.match_reports add column if not exists draft_home_score int;
alter table public.match_reports add column if not exists draft_away_score int;
alter table public.match_reports add column if not exists draft_halftime_home int;
alter table public.match_reports add column if not exists draft_halftime_away int;
alter table public.match_reports add column if not exists match_summary text;
alter table public.match_reports add column if not exists updated_at timestamptz not null default now();

------------------------------------------------------------------ lineups & events
alter table public.match_lineups add column if not exists is_captain boolean not null default false;
alter table public.match_lineups add column if not exists started_minute int;
alter table public.match_lineups add column if not exists ended_minute int;
alter table public.match_lineups add column if not exists formation text;

alter table public.match_events drop constraint if exists match_events_event_type_check;
alter table public.match_events add constraint match_events_event_type_check check (event_type in ('goal','own_goal','assist','yellow_card','red_card','substitution_on','substitution_off','clean_sheet','penalty_scored','penalty_missed','injury'));
alter table public.match_events add constraint match_events_minute_chk check (minute is null or minute between 0 and 150) not valid;

------------------------------------------------------------------ team-manager module
alter table public.team_manager_assignments add column if not exists competition_id uuid references public.competitions;
alter table public.team_manager_assignments add column if not exists season_id uuid references public.seasons;

alter table public.player_registration_submissions add column if not exists player_id uuid references public.players;
alter table public.player_registration_submissions add column if not exists submission_type text not null default 'registration';
alter table public.player_registration_submissions add column if not exists reviewed_at timestamptz;
alter table public.player_registration_submissions add column if not exists updated_at timestamptz not null default now();
alter table public.player_registration_submissions add constraint prs_type_chk check (submission_type in ('registration','update','release','transfer')) not valid;

alter table public.match_submissions add column if not exists version int not null default 1;
alter table public.match_submissions drop constraint if exists match_submissions_fixture_id_team_id_key;
create unique index if not exists match_submissions_one_open on public.match_submissions(fixture_id,team_id) where status in ('draft','submitted','under_review','changes_requested');
alter table public.match_submissions add column if not exists observations text;
alter table public.match_submissions add column if not exists formation text;

alter table public.team_change_requests add column if not exists reviewed_at timestamptz;
alter table public.team_change_requests add column if not exists change_type text not null default 'profile';
alter table public.fixture_change_requests add column if not exists reviewed_at timestamptz;
alter table public.fixture_change_requests add column if not exists request_type text not null default 'reschedule';
alter table public.fixture_change_requests add constraint fcr_type_chk check (request_type in ('reschedule','venue','postpone')) not valid;

alter table public.manager_notifications add column if not exists notification_type text not null default 'general';
alter table public.manager_notifications add column if not exists related_entity_type text;
alter table public.manager_notifications add column if not exists related_entity_id uuid;
create index if not exists notif_user_unread on public.manager_notifications(user_id,read_at,created_at desc);

-- reviewer bookkeeping columns must exist on every submission table (uniform trigger below relies on them)
alter table public.match_submissions add column if not exists reviewer_id uuid references auth.users;
alter table public.match_submissions add column if not exists reviewer_note text;

------------------------------------------------------------------ audit
alter table public.audit_logs add column if not exists old_values jsonb;
alter table public.audit_logs add column if not exists new_values jsonb;
create index if not exists audit_entity on public.audit_logs(entity_type,entity_id,created_at desc);

------------------------------------------------------------------ awards & editorial
alter table public.awards add column if not exists competition_id uuid references public.competitions;
alter table public.awards add column if not exists matchweek_id uuid references public.matchweeks;
alter table public.awards add column if not exists photo_url text;
alter table public.awards add column if not exists stats jsonb not null default '{}'::jsonb;
alter table public.awards add column if not exists published_at timestamptz;
create unique index if not exists awards_potw_unique on public.awards(season_id,matchweek_id) where award_type='player_of_week' and matchweek_id is not null;

create table if not exists public.team_of_week(
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions on delete cascade,
  season_id uuid not null references public.seasons on delete cascade,
  matchweek_id uuid not null references public.matchweeks on delete cascade,
  formation text not null check (formation in ('4-4-2','4-3-3','3-5-2','4-2-3-1')),
  description text, published boolean not null default false,
  created_by uuid references auth.users, created_at timestamptz not null default now(),
  unique(season_id,matchweek_id));
create table if not exists public.team_of_week_players(
  id uuid primary key default gen_random_uuid(),
  team_of_week_id uuid not null references public.team_of_week on delete cascade,
  player_id uuid not null references public.players,
  team_id uuid not null references public.teams,
  position_slot text not null check (position_slot in ('GK','DEF','MID','FWD')),
  display_order int not null,
  unique(team_of_week_id,display_order), unique(team_of_week_id,player_id));

alter table public.news_articles add column if not exists status text not null default 'draft';
alter table public.news_articles add column if not exists category text;
alter table public.news_articles add column if not exists is_featured boolean not null default false;
alter table public.news_articles add column if not exists updated_at timestamptz not null default now();
alter table public.news_articles add constraint news_status_chk check (status in ('draft','scheduled','published','archived')) not valid;

------------------------------------------------------------------ operations
create table if not exists public.import_jobs(
  id uuid primary key default gen_random_uuid(), import_type text not null,
  competition_id uuid references public.competitions, season_id uuid references public.seasons,
  file_name text, status text not null default 'completed',
  total_rows int not null default 0, successful_rows int not null default 0, failed_rows int not null default 0,
  error_report jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users, team_id uuid references public.teams, created_at timestamptz not null default now());
create table if not exists public.fixture_generation_jobs(
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions, season_id uuid not null references public.seasons,
  configuration jsonb not null, status text not null default 'completed', fixture_count int not null default 0,
  created_by uuid references auth.users, created_at timestamptz not null default now(), completed_at timestamptz);
create table if not exists public.competition_admins(
  user_id uuid not null references auth.users on delete cascade,
  competition_id uuid not null references public.competitions on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,competition_id));
create table if not exists public.league_settings(
  id boolean primary key default true check (id), league_name text not null default 'Kabianga Super League',
  logo_url text, contact_email text, contact_phone text, social_links jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now());
insert into public.league_settings(id) values (true) on conflict do nothing;
