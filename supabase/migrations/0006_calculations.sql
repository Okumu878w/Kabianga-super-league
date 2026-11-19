-- 0006: derived calculations. Standings and statistics are NEVER stored; they are computed from
-- published results, so publishing, correcting or reopening a result can never leave stale numbers.

create or replace function public.get_standings(p_season uuid)
returns table(pos int, team_id uuid, team_name text, short_name text, logo_url text, slug text,
  played int, won int, drawn int, lost int, goals_for int, goals_against int, goal_difference int, points int, form text)
language plpgsql stable security invoker set search_path=public as $$
declare c record; order_sql text:='points desc'; rule text;
begin
  select comp.points_win pw, comp.points_draw pd, comp.points_loss pl, comp.tie_break_rules tb into c
    from public.seasons s join public.competitions comp on comp.id=s.competition_id where s.id=p_season;
  if not found then return; end if;
  for rule in select jsonb_array_elements_text(c.tb) loop
    order_sql:=order_sql||case rule
      when 'goal_difference' then ', goal_difference desc' when 'goals_for' then ', goals_for desc'
      when 'wins' then ', won desc' when 'goals_against' then ', goals_against asc'
      when 'fewest_losses' then ', lost asc' else '' end;
  end loop;
  order_sql:=order_sql||', team_name asc';
  return query execute format($q$
    with res as (
      select f.id, f.kickoff_at, f.home_team_id t, f.home_score gf, f.away_score ga from public.fixtures f
        where f.season_id=$1 and f.result_status='published' and f.home_score is not null and f.away_score is not null
      union all
      select f.id, f.kickoff_at, f.away_team_id, f.away_score, f.home_score from public.fixtures f
        where f.season_id=$1 and f.result_status='published' and f.home_score is not null and f.away_score is not null),
    agg as (
      select ct.team_id, count(r.id)::int played,
        (count(*) filter (where r.gf>r.ga))::int won, (count(*) filter (where r.gf=r.ga))::int drawn, (count(*) filter (where r.gf<r.ga))::int lost,
        coalesce(sum(r.gf),0)::int goals_for, coalesce(sum(r.ga),0)::int goals_against
      from public.competition_teams ct left join res r on r.t=ct.team_id where ct.season_id=$1 group by ct.team_id),
    full_rows as (
      select a.team_id, t.name team_name, t.short_name, t.logo_url, t.slug, a.played, a.won, a.drawn, a.lost, a.goals_for, a.goals_against,
        (a.goals_for-a.goals_against)::int goal_difference, (a.won*$2+a.drawn*$3+a.lost*$4)::int points,
        coalesce((select string_agg(x.r,'' order by x.kickoff_at) from (
           select r2.kickoff_at, case when r2.gf>r2.ga then 'W' when r2.gf=r2.ga then 'D' else 'L' end r
           from res r2 where r2.t=a.team_id order by r2.kickoff_at desc limit 5) x),'') form
      from agg a join public.teams t on t.id=a.team_id)
    select (row_number() over (order by %1$s))::int, team_id, team_name, short_name, logo_url, slug, played, won, drawn, lost,
           goals_for, goals_against, goal_difference, points, form
    from full_rows order by %1$s$q$, order_sql) using p_season, c.pw, c.pd, c.pl;
end; $$;

-- Player statistics for a season (optionally restricted to one matchweek). Stats are attributed to the team recorded on the
-- lineup/event row, so a transferred player keeps correct history for each club.
create or replace function public.get_player_stats(p_season uuid, p_matchweek uuid default null)
returns table(player_id uuid, player_name text, slug text, photo_url text, team_id uuid, team_name text, pos text,
  appearances int, goals int, assists int, yellow_cards int, red_cards int, clean_sheets int, goals_conceded int)
language sql stable security invoker set search_path=public as $$
  with fx as (
    select f.id, f.home_team_id, f.away_team_id, f.home_score, f.away_score from public.fixtures f
    where f.season_id=p_season and f.result_status='published' and (p_matchweek is null or f.matchweek_id=p_matchweek)),
  cfg as (select c.clean_sheet_min_minutes m from public.seasons s join public.competitions c on c.id=s.competition_id where s.id=p_season),
  lu as (
    select l.player_id, l.team_id,
      coalesce(l.position, r.position, p.position) pos,
      (case when l.team_id=fx.home_team_id then fx.away_score else fx.home_score end) conceded,
      (coalesce(l.ended_minute,90)-coalesce(l.started_minute,0)) mins,
      (l.is_starting or l.started_minute is not null) played
    from public.match_lineups l join fx on fx.id=l.fixture_id join public.players p on p.id=l.player_id
    left join lateral (select rr.position from public.player_registrations rr where rr.player_id=l.player_id and rr.team_id=l.team_id and rr.season_id=p_season order by rr.registered_at desc limit 1) r on true),
  ev as (select e.player_id, e.secondary_player_id, e.team_id, e.event_type from public.match_events e join fx on fx.id=e.fixture_id),
  keys as (
    select lu.player_id, lu.team_id from lu
    union select ev.player_id, ev.team_id from ev where ev.player_id is not null and ev.event_type in ('goal','penalty_scored','yellow_card','red_card')
    union select ev.secondary_player_id, ev.team_id from ev where ev.secondary_player_id is not null and ev.event_type='goal')
  select p.id, p.full_name, p.slug, p.photo_url, k.team_id, t.name,
    coalesce((select lu.pos from lu where lu.player_id=k.player_id and lu.team_id=k.team_id limit 1),
             (select rr.position from public.player_registrations rr where rr.player_id=k.player_id and rr.team_id=k.team_id and rr.season_id=p_season limit 1), p.position),
    (select count(*) from lu where lu.player_id=k.player_id and lu.team_id=k.team_id and lu.played)::int,
    (select count(*) from ev where ev.player_id=k.player_id and ev.team_id=k.team_id and ev.event_type in ('goal','penalty_scored'))::int,
    (select count(*) from ev where ev.secondary_player_id=k.player_id and ev.team_id=k.team_id and ev.event_type='goal')::int,
    (select count(*) from ev where ev.player_id=k.player_id and ev.team_id=k.team_id and ev.event_type='yellow_card')::int,
    (select count(*) from ev where ev.player_id=k.player_id and ev.team_id=k.team_id and ev.event_type='red_card')::int,
    (select count(*) from lu where lu.player_id=k.player_id and lu.team_id=k.team_id and lu.pos='Goalkeeper' and lu.played and lu.conceded=0 and lu.mins>=(select m from cfg))::int,
    coalesce((select sum(lu.conceded) from lu where lu.player_id=k.player_id and lu.team_id=k.team_id and lu.pos='Goalkeeper' and lu.played),0)::int
  from keys k join public.players p on p.id=k.player_id join public.teams t on t.id=k.team_id;
$$;

-- Suggestion only. Publication of Player of the Week always needs an administrator (awards.is_published).
create or replace function public.suggest_player_of_week(p_season uuid, p_matchweek uuid)
returns table(player_id uuid, player_name text, team_name text, score int, goals int, assists int, clean_sheets int)
language sql stable security invoker set search_path=public as $$
  select s.player_id, s.player_name, s.team_name, (s.goals*4+s.assists*3+s.clean_sheets*3-s.red_cards*3-s.yellow_cards)::int sc, s.goals, s.assists, s.clean_sheets
  from public.get_player_stats(p_season,p_matchweek) s order by sc desc, s.goals desc, s.player_name limit 5;
$$;
