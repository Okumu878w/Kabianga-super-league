-- Kabianga Super League: initial Supabase schema
create extension if not exists pgcrypto;
create type public.app_role as enum ('super_admin','competition_admin','editor','team_manager');
create type public.submission_status as enum ('draft','submitted','under_review','approved','rejected');
create type public.fixture_status as enum ('scheduled','postponed','cancelled','live','completed');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, display_name text, phone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.user_roles(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, role public.app_role not null, created_at timestamptz not null default now(), unique(user_id,role));
create table public.competitions(id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, description text, format text not null default 'league', status text not null default 'draft', is_published boolean not null default false, created_at timestamptz not null default now());
create table public.seasons(id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions on delete cascade, name text not null, starts_on date, ends_on date, is_current boolean not null default false, status text not null default 'upcoming', unique(competition_id,name));
create table public.teams(id uuid primary key default gen_random_uuid(), name text not null unique, short_name text, slug text unique, logo_url text, home_venue text, founded_year int, description text, is_active boolean not null default true, created_at timestamptz not null default now());
create table public.competition_teams(id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions on delete cascade, season_id uuid not null references public.seasons on delete cascade, team_id uuid not null references public.teams on delete cascade, group_name text, unique(season_id,team_id));
create table public.players(id uuid primary key default gen_random_uuid(), first_name text not null, last_name text not null, date_of_birth date, nationality text default 'Kenyan', position text, preferred_foot text, photo_url text, created_at timestamptz not null default now());
create table public.player_registrations(id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players on delete cascade, team_id uuid not null references public.teams on delete cascade, season_id uuid not null references public.seasons on delete cascade, squad_number int, status public.submission_status not null default 'submitted', submitted_by uuid references auth.users, reviewed_by uuid references auth.users, reviewed_at timestamptz, review_note text, created_at timestamptz not null default now(), unique(player_id,season_id));
create table public.team_manager_assignments(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, team_id uuid not null references public.teams on delete cascade, assigned_by uuid references auth.users, is_active boolean not null default true, created_at timestamptz not null default now(), unique(user_id,team_id));
create table public.matchweeks(id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons on delete cascade, week_number int not null, label text, unique(season_id,week_number));
create table public.fixtures(id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.competitions on delete cascade, season_id uuid not null references public.seasons on delete cascade, matchweek_id uuid references public.matchweeks on delete set null, home_team_id uuid not null references public.teams, away_team_id uuid not null references public.teams, kickoff_at timestamptz not null, venue text, status public.fixture_status not null default 'scheduled', home_score int, away_score int, is_published boolean not null default false, published_at timestamptz, created_by uuid references auth.users, created_at timestamptz not null default now(), check(home_team_id<>away_team_id), check((home_score is null and away_score is null) or (home_score>=0 and away_score>=0)));
create table public.match_lineups(id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.fixtures on delete cascade, team_id uuid not null references public.teams, player_id uuid not null references public.players, is_starting boolean not null default true, shirt_number int, position text, unique(fixture_id,team_id,player_id));
create table public.match_events(id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.fixtures on delete cascade, team_id uuid not null references public.teams, player_id uuid references public.players, secondary_player_id uuid references public.players, event_type text not null check(event_type in ('goal','own_goal','assist','yellow_card','red_card','substitution_on','substitution_off','clean_sheet','penalty_scored','penalty_missed')), minute int, added_time int, notes text, created_at timestamptz not null default now());
create table public.match_reports(id uuid primary key default gen_random_uuid(), fixture_id uuid not null unique references public.fixtures on delete cascade, summary text, attendance int, referee text, report_url text, published_at timestamptz, created_at timestamptz not null default now());
create table public.match_submissions(id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.fixtures on delete cascade, team_id uuid not null references public.teams, submitted_by uuid not null references auth.users, status public.submission_status not null default 'draft', home_score int, away_score int, lineup jsonb not null default '[]', events jsonb not null default '[]', report text, evidence_urls text[] not null default '{}', reviewer_id uuid references auth.users, reviewer_note text, submitted_at timestamptz, reviewed_at timestamptz, created_at timestamptz not null default now(), unique(fixture_id,team_id));
create table public.player_registration_submissions(id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams, season_id uuid not null references public.seasons, submitted_by uuid not null references auth.users, player_data jsonb not null, status public.submission_status not null default 'submitted', reviewer_id uuid references auth.users, reviewer_note text, created_at timestamptz not null default now());
create table public.team_change_requests(id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams, submitted_by uuid not null references auth.users, changes jsonb not null, status public.submission_status not null default 'submitted', reviewer_id uuid references auth.users, reviewer_note text, created_at timestamptz not null default now());
create table public.fixture_change_requests(id uuid primary key default gen_random_uuid(), fixture_id uuid not null references public.fixtures, team_id uuid not null references public.teams, submitted_by uuid not null references auth.users, requested_kickoff timestamptz, requested_venue text, reason text not null, status public.submission_status not null default 'submitted', reviewer_id uuid references auth.users, reviewer_note text, created_at timestamptz not null default now());
create table public.awards(id uuid primary key default gen_random_uuid(), season_id uuid references public.seasons on delete cascade, week_number int, award_type text not null, player_id uuid references public.players, team_id uuid references public.teams, title text not null, description text, is_published boolean not null default false, created_at timestamptz not null default now());
create table public.news_articles(id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, excerpt text, body text, cover_image_url text, author_id uuid references auth.users, is_published boolean not null default false, published_at timestamptz, created_at timestamptz not null default now());
create table public.manager_notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, title text not null, body text not null, href text, read_at timestamptz, created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users, action text not null, entity_type text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now());

create or replace function public.has_role(roles public.app_role[]) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=auth.uid() and role=any(roles)); $$;
create or replace function public.manages_team(target_team uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.team_manager_assignments where user_id=auth.uid() and team_id=target_team and is_active); $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select public.has_role(array['super_admin','competition_admin','editor']::public.app_role[]); $$;

-- Public can read published league content. All writes require explicit roles.
alter table public.profiles enable row level security; alter table public.user_roles enable row level security;
alter table public.competitions enable row level security; alter table public.seasons enable row level security; alter table public.teams enable row level security; alter table public.competition_teams enable row level security; alter table public.players enable row level security; alter table public.player_registrations enable row level security; alter table public.team_manager_assignments enable row level security; alter table public.matchweeks enable row level security; alter table public.fixtures enable row level security; alter table public.match_lineups enable row level security; alter table public.match_events enable row level security; alter table public.match_reports enable row level security; alter table public.match_submissions enable row level security; alter table public.player_registration_submissions enable row level security; alter table public.team_change_requests enable row level security; alter table public.fixture_change_requests enable row level security; alter table public.awards enable row level security; alter table public.news_articles enable row level security; alter table public.manager_notifications enable row level security; alter table public.audit_logs enable row level security;
create policy "profiles own or admin read" on public.profiles for select using(id=auth.uid() or public.is_admin());
create policy "profiles own update" on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy "roles admin read" on public.user_roles for select using(user_id=auth.uid() or public.is_admin());
create policy "roles admin manage" on public.user_roles for all using(public.has_role(array['super_admin']::public.app_role[])) with check(public.has_role(array['super_admin']::public.app_role[]));
create policy "published competitions read" on public.competitions for select using(is_published or public.is_admin()); create policy "admins competitions write" on public.competitions for all using(public.is_admin()) with check(public.is_admin());
create policy "seasons read" on public.seasons for select using(exists(select 1 from public.competitions c where c.id=competition_id and (c.is_published or public.is_admin()))); create policy "admins seasons write" on public.seasons for all using(public.is_admin()) with check(public.is_admin());
create policy "active teams read" on public.teams for select using(is_active or public.is_admin()); create policy "admins teams write" on public.teams for all using(public.is_admin()) with check(public.is_admin());
create policy "competition teams read" on public.competition_teams for select using(true); create policy "admins competition teams write" on public.competition_teams for all using(public.is_admin()) with check(public.is_admin());
create policy "players read" on public.players for select using(true); create policy "admins players write" on public.players for all using(public.is_admin()) with check(public.is_admin());
create policy "registrations read" on public.player_registrations for select using(status='approved' or public.is_admin() or public.manages_team(team_id)); create policy "admins registrations write" on public.player_registrations for all using(public.is_admin()) with check(public.is_admin());
create policy "manager assignments read" on public.team_manager_assignments for select using(user_id=auth.uid() or public.is_admin()); create policy "admins assignments manage" on public.team_manager_assignments for all using(public.is_admin()) with check(public.is_admin());
create policy "matchweeks read" on public.matchweeks for select using(true); create policy "admins matchweeks write" on public.matchweeks for all using(public.is_admin()) with check(public.is_admin());
create policy "published fixtures read" on public.fixtures for select using(is_published or public.is_admin() or public.manages_team(home_team_id) or public.manages_team(away_team_id)); create policy "admins fixtures write" on public.fixtures for all using(public.is_admin()) with check(public.is_admin());
create policy "lineups read" on public.match_lineups for select using(exists(select 1 from public.fixtures f where f.id=fixture_id and (f.is_published or public.is_admin() or public.manages_team(f.home_team_id) or public.manages_team(f.away_team_id)))); create policy "admins lineups write" on public.match_lineups for all using(public.is_admin()) with check(public.is_admin());
create policy "events read" on public.match_events for select using(exists(select 1 from public.fixtures f where f.id=fixture_id and (f.is_published or public.is_admin()))); create policy "admins events write" on public.match_events for all using(public.is_admin()) with check(public.is_admin());
create policy "reports read" on public.match_reports for select using(published_at is not null or public.is_admin()); create policy "admins reports write" on public.match_reports for all using(public.is_admin()) with check(public.is_admin());
create policy "manager submissions read" on public.match_submissions for select using(submitted_by=auth.uid() or public.is_admin()); create policy "manager submissions insert" on public.match_submissions for insert with check(submitted_by=auth.uid() and public.manages_team(team_id) and exists(select 1 from public.fixtures f where f.id=fixture_id and (f.home_team_id=team_id or f.away_team_id=team_id))); create policy "manager submissions update draft" on public.match_submissions for update using(submitted_by=auth.uid() and public.manages_team(team_id) and status in ('draft','rejected')) with check(submitted_by=auth.uid() and public.manages_team(team_id) and status in ('draft','submitted') and exists(select 1 from public.fixtures f where f.id=fixture_id and (f.home_team_id=team_id or f.away_team_id=team_id))); create policy "admin review submissions" on public.match_submissions for update using(public.is_admin()) with check(public.is_admin());
create policy "registration submissions read" on public.player_registration_submissions for select using(submitted_by=auth.uid() or public.is_admin()); create policy "manager registration submit" on public.player_registration_submissions for insert with check(submitted_by=auth.uid() and public.manages_team(team_id)); create policy "admin registration review" on public.player_registration_submissions for update using(public.is_admin()) with check(public.is_admin());
create policy "team change requests read" on public.team_change_requests for select using(submitted_by=auth.uid() or public.is_admin()); create policy "manager team change submit" on public.team_change_requests for insert with check(submitted_by=auth.uid() and public.manages_team(team_id)); create policy "admin team change review" on public.team_change_requests for update using(public.is_admin()) with check(public.is_admin());
create policy "fixture requests read" on public.fixture_change_requests for select using(submitted_by=auth.uid() or public.is_admin()); create policy "manager fixture request" on public.fixture_change_requests for insert with check(submitted_by=auth.uid() and public.manages_team(team_id) and exists(select 1 from public.fixtures f where f.id=fixture_id and (f.home_team_id=team_id or f.away_team_id=team_id))); create policy "admin fixture request review" on public.fixture_change_requests for update using(public.is_admin()) with check(public.is_admin());
create policy "published awards read" on public.awards for select using(is_published or public.is_admin()); create policy "admins awards write" on public.awards for all using(public.is_admin()) with check(public.is_admin());
create policy "published news read" on public.news_articles for select using(is_published or public.is_admin()); create policy "admins news write" on public.news_articles for all using(public.is_admin()) with check(public.is_admin());
create policy "own notifications" on public.manager_notifications for select using(user_id=auth.uid()); create policy "own notifications update" on public.manager_notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "audit admins read" on public.audit_logs for select using(public.is_admin()); create policy "audit admin insert" on public.audit_logs for insert with check(public.is_admin());

-- Standings are derived from published, completed fixtures; never manually edited.
create or replace view public.standings_view with (security_invoker=true) as
with played as (select f.season_id,f.competition_id,t.id team_id,t.name team_name,
 case when t.id=f.home_team_id then f.home_score else f.away_score end gf,
 case when t.id=f.home_team_id then f.away_score else f.home_score end ga
 from public.fixtures f join public.teams t on t.id in (f.home_team_id,f.away_team_id)
 where f.is_published and f.status='completed' and f.home_score is not null and f.away_score is not null),
agg as(select season_id,competition_id,team_id,team_name,count(*) played,count(*) filter(where gf>ga) won,count(*) filter(where gf=ga) drawn,count(*) filter(where gf<ga) lost,sum(gf) goals_for,sum(ga) goals_against,sum(gf-ga) goal_difference,sum(case when gf>ga then 3 when gf=ga then 1 else 0 end) points from played group by season_id,competition_id,team_id,team_name)
select * from agg;

-- Profile bootstrap. Roles are assigned by a trusted administrator only.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Derived player statistics from published match events.
create or replace view public.player_statistics_view with (security_invoker=true) as
select p.id player_id, p.first_name || ' ' || p.last_name player_name, p.position,
 count(*) filter(where e.event_type in ('goal','penalty_scored')) goals,
 count(*) filter(where e.event_type='assist') assists,
 count(*) filter(where e.event_type='yellow_card') yellow_cards,
 count(*) filter(where e.event_type='red_card') red_cards
from public.players p left join public.match_events e on e.player_id=p.id
left join public.fixtures f on f.id=e.fixture_id and f.is_published and f.status='completed'
group by p.id,p.first_name,p.last_name,p.position;

-- Round-robin fixture generator. Admin-only; supports an odd or even number of clubs.
create or replace function public.generate_round_robin(target_season uuid, first_kickoff timestamptz, interval_days int default 7, match_hour int default 15)
returns integer language plpgsql security invoker set search_path=public as $$
declare clubs uuid[]; n int; rounds int; i int; j int; home_id uuid; away_id uuid; round_no int; inserted int:=0; kickoff timestamptz;
begin
 if not public.is_admin() then raise exception 'Not authorised'; end if;
 select array_agg(team_id order by team_id) into clubs from public.competition_teams where season_id=target_season;
 if clubs is null or array_length(clubs,1)<2 then raise exception 'At least two registered teams are required'; end if;
 n:=array_length(clubs,1); if n%2=1 then clubs:=array_append(clubs,null); n:=n+1; end if; rounds:=n-1;
 for round_no in 1..rounds loop
  kickoff:=date_trunc('day',first_kickoff)+(round_no-1)*interval_days*interval '1 day'+match_hour*interval '1 hour';
  for i in 1..(n/2) loop
   home_id:=clubs[i]; away_id:=clubs[n-i+1];
   if home_id is not null and away_id is not null then
    insert into public.fixtures(competition_id,season_id,home_team_id,away_team_id,kickoff_at,status)
    select s.competition_id,target_season,home_id,away_id,kickoff,'scheduled' from public.seasons s where s.id=target_season;
    inserted:=inserted+1;
   end if;
  end loop;
  -- Keep the first club fixed and rotate the remaining clubs one position.
  for k in reverse n..3 loop clubs[k]:=clubs[k-1]; end loop;
  clubs[2]:=clubs[n];
 end loop;
 return inserted;
end; $$;
