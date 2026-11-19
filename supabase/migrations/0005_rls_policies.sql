-- 0005: Row Level Security. Replaces the permissive policies from 0001 with role- and competition-scoped ones.
-- Managers can only *propose*; every state change on a proposal goes through a SECURITY DEFINER review function (0006).

alter table public.team_private_details enable row level security;
alter table public.competition_admins enable row level security;
alter table public.league_settings enable row level security;
alter table public.import_jobs enable row level security;
alter table public.fixture_generation_jobs enable row level security;
alter table public.team_of_week enable row level security;
alter table public.team_of_week_players enable row level security;

-- drop every policy created in 0001 (names are stable) -----------------------------------------
do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' loop
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop; end $$;

drop view if exists public.standings_view;
drop view if exists public.player_statistics_view;
drop function if exists public.generate_round_robin(uuid,timestamptz,int,int);

-- accounts -------------------------------------------------------------------------------------
create policy profiles_read on public.profiles for select using (id=auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy roles_read on public.user_roles for select using (user_id=auth.uid() or public.is_staff());
create policy roles_super_write on public.user_roles for all using (public.is_super()) with check (public.is_super());
create policy comp_admins_read on public.competition_admins for select using (user_id=auth.uid() or public.is_staff());
create policy comp_admins_write on public.competition_admins for all using (public.is_super()) with check (public.is_super());
create policy settings_read on public.league_settings for select using (true);
create policy settings_write on public.league_settings for all using (public.is_super()) with check (public.is_super());

-- competitions / seasons / teams ------------------------------------------------------------------
create policy competitions_read on public.competitions for select using (is_published or public.is_staff());
create policy competitions_insert on public.competitions for insert with check (public.is_super());
create policy competitions_update on public.competitions for update using (public.can_manage_competition(id)) with check (public.can_manage_competition(id));
create policy competitions_delete on public.competitions for delete using (public.is_super());

create policy seasons_read on public.seasons for select using (public.is_staff() or exists(select 1 from public.competitions c where c.id=competition_id and c.is_published));
create policy seasons_write on public.seasons for all using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));

create policy teams_read on public.teams for select using (is_active or public.is_staff() or public.manages_team(id));
create policy teams_write on public.teams for all using (public.has_role(array['super_admin','competition_admin']::public.app_role[])) with check (public.has_role(array['super_admin','competition_admin']::public.app_role[]));
create policy team_private_read on public.team_private_details for select using (public.is_staff() or public.manages_team(team_id));
create policy team_private_write on public.team_private_details for all using (public.has_role(array['super_admin','competition_admin']::public.app_role[])) with check (public.has_role(array['super_admin','competition_admin']::public.app_role[]));

create policy comp_teams_read on public.competition_teams for select using (true);
create policy comp_teams_write on public.competition_teams for all using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));

-- players ---------------------------------------------------------------------------------------
create policy players_read on public.players for select using (
  public.is_staff()
  or exists(select 1 from public.player_registrations r where r.player_id=public.players.id and (r.status::text='approved' or public.manages_team(r.team_id))));
create policy players_write on public.players for all using (public.has_role(array['super_admin','competition_admin']::public.app_role[])) with check (public.has_role(array['super_admin','competition_admin']::public.app_role[]));
create policy registrations_read on public.player_registrations for select using (status::text='approved' or public.is_staff() or public.manages_team(team_id));
create policy registrations_write on public.player_registrations for all using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy assignments_read on public.team_manager_assignments for select using (user_id=auth.uid() or public.is_staff());
create policy assignments_write on public.team_manager_assignments for all using (public.is_super()) with check (public.is_super());

-- schedule & results ----------------------------------------------------------------------------------
create policy matchweeks_read on public.matchweeks for select using (true);
create policy matchweeks_write on public.matchweeks for all
  using (exists(select 1 from public.seasons s where s.id=season_id and public.can_manage_competition(s.competition_id)))
  with check (exists(select 1 from public.seasons s where s.id=season_id and public.can_manage_competition(s.competition_id)));
create policy fixtures_read on public.fixtures for select using (is_published or public.is_staff() or public.manages_team(home_team_id) or public.manages_team(away_team_id));
create policy fixtures_write on public.fixtures for all using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));

create policy lineups_read on public.match_lineups for select using (
  exists(select 1 from public.fixtures f where f.id=fixture_id and f.result_status='published') or public.is_staff() or public.manages_team(team_id));
create policy lineups_write on public.match_lineups for all
  using (exists(select 1 from public.fixtures f where f.id=fixture_id and public.can_edit_match(f.competition_id)))
  with check (exists(select 1 from public.fixtures f where f.id=fixture_id and public.can_edit_match(f.competition_id)));
create policy events_read on public.match_events for select using (
  exists(select 1 from public.fixtures f where f.id=fixture_id and f.result_status='published') or public.is_staff() or public.manages_team(team_id));
create policy events_write on public.match_events for all
  using (exists(select 1 from public.fixtures f where f.id=fixture_id and public.can_edit_match(f.competition_id)))
  with check (exists(select 1 from public.fixtures f where f.id=fixture_id and public.can_edit_match(f.competition_id)));
create policy reports_read on public.match_reports for select using (published_at is not null or public.is_staff());
create policy reports_write on public.match_reports for all
  using (exists(select 1 from public.fixtures f where f.id=fixture_id and public.can_edit_match(f.competition_id)))
  with check (exists(select 1 from public.fixtures f where f.id=fixture_id and public.can_edit_match(f.competition_id)));

-- manager proposals: managers insert/update their own; NO policy lets anyone approve — review functions do that ------------
create policy msub_read on public.match_submissions for select using (submitted_by=auth.uid() or public.is_staff());
create policy msub_insert on public.match_submissions for insert with check (submitted_by=auth.uid() and public.manages_team(team_id)
  and exists(select 1 from public.fixtures f where f.id=fixture_id and (f.home_team_id=team_id or f.away_team_id=team_id)));
create policy msub_update on public.match_submissions for update using (submitted_by=auth.uid() and public.manages_team(team_id)) with check (submitted_by=auth.uid() and public.manages_team(team_id));
create policy msub_delete on public.match_submissions for delete using (submitted_by=auth.uid() and public.manages_team(team_id) and status::text='draft');

create policy prs_read on public.player_registration_submissions for select using (submitted_by=auth.uid() or public.is_staff());
create policy prs_insert on public.player_registration_submissions for insert with check (submitted_by=auth.uid() and public.manages_team(team_id));
create policy prs_update on public.player_registration_submissions for update using (submitted_by=auth.uid() and public.manages_team(team_id)) with check (submitted_by=auth.uid() and public.manages_team(team_id));
create policy prs_delete on public.player_registration_submissions for delete using (submitted_by=auth.uid() and public.manages_team(team_id) and status::text='draft');

create policy tcr_read on public.team_change_requests for select using (submitted_by=auth.uid() or public.is_staff());
create policy tcr_insert on public.team_change_requests for insert with check (submitted_by=auth.uid() and public.manages_team(team_id));
create policy tcr_update on public.team_change_requests for update using (submitted_by=auth.uid() and public.manages_team(team_id)) with check (submitted_by=auth.uid() and public.manages_team(team_id));

create policy fcr_read on public.fixture_change_requests for select using (submitted_by=auth.uid() or public.is_staff());
create policy fcr_insert on public.fixture_change_requests for insert with check (submitted_by=auth.uid() and public.manages_team(team_id)
  and exists(select 1 from public.fixtures f where f.id=fixture_id and (f.home_team_id=team_id or f.away_team_id=team_id)));
create policy fcr_update on public.fixture_change_requests for update using (submitted_by=auth.uid() and public.manages_team(team_id)) with check (submitted_by=auth.uid() and public.manages_team(team_id));

-- awards & editorial ---------------------------------------------------------------------------------
create policy awards_read on public.awards for select using (is_published or public.is_staff());
create policy awards_write on public.awards for all using (public.is_admin()) with check (public.is_admin());
create policy totw_read on public.team_of_week for select using (published or public.is_staff());
create policy totw_write on public.team_of_week for all using (public.is_admin()) with check (public.is_admin());
create policy totwp_read on public.team_of_week_players for select using (exists(select 1 from public.team_of_week t where t.id=team_of_week_id and (t.published or public.is_staff())));
create policy totwp_write on public.team_of_week_players for all using (public.is_admin()) with check (public.is_admin());
create policy news_read on public.news_articles for select using ((status in ('published','scheduled') and published_at<=now()) or public.is_staff());
create policy news_write on public.news_articles for all using (public.is_admin()) with check (public.is_admin());

-- notifications: recipients read and mark-as-read; creation only via send_notification()/review functions ----------------------
create policy notif_read on public.manager_notifications for select using (user_id=auth.uid());
create policy notif_update on public.manager_notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create or replace function public.guard_notification() returns trigger language plpgsql as $$
begin
  if public.via_rpc() or auth.uid() is null then return new; end if;
  if (new.user_id,new.title,new.body,new.href,new.created_at,new.notification_type) is distinct from (old.user_id,old.title,old.body,old.href,old.created_at,old.notification_type) then
    raise exception 'Only the read state of a notification can be changed'; end if;
  return new; end; $$;
drop trigger if exists guard_notification on public.manager_notifications;
create trigger guard_notification before update on public.manager_notifications for each row execute function public.guard_notification();

-- operations ------------------------------------------------------------------------------------------
create policy audit_read on public.audit_logs for select using (public.has_role(array['super_admin','competition_admin']::public.app_role[]));
create policy import_read on public.import_jobs for select using (created_by=auth.uid() or public.is_staff());
create policy import_insert on public.import_jobs for insert with check (created_by=auth.uid() and (public.is_admin() or (team_id is not null and public.manages_team(team_id))));
create policy gen_read on public.fixture_generation_jobs for select using (public.is_staff());
