-- 0004: authorization helpers, integrity guards, validation and audit triggers.

------------------------------------------------------------------ helpers
create or replace function public.is_super() returns boolean language sql stable security definer set search_path=public as
$$ select public.has_role(array['super_admin']::public.app_role[]); $$;
-- Any administrative account, including read-only viewers.
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as
$$ select public.has_role(array['super_admin','competition_admin','editor','viewer']::public.app_role[]); $$;
create or replace function public.can_manage_competition(target uuid) returns boolean language sql stable security definer set search_path=public as
$$ select public.is_super() or (public.has_role(array['competition_admin']::public.app_role[])
     and exists(select 1 from public.competition_admins ca where ca.user_id=auth.uid() and ca.competition_id=target)); $$;
-- Editors may maintain match information for any competition; competition admins only for their own.
create or replace function public.can_edit_match(target uuid) returns boolean language sql stable security definer set search_path=public as
$$ select public.can_manage_competition(target) or public.has_role(array['editor']::public.app_role[]); $$;
-- Active, explicitly assigned manager of the team (account must not be deactivated).
create or replace function public.manages_team(target_team uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from public.team_manager_assignments a join public.profiles p on p.id=a.user_id
                 where a.user_id=auth.uid() and a.team_id=target_team and a.is_active and p.is_active)
          and public.has_role(array['team_manager']::public.app_role[]); $$;
create or replace function public.competition_of_season(s uuid) returns uuid language sql stable security definer set search_path=public as
$$ select competition_id from public.seasons where id=s; $$;
create or replace function public.via_rpc() returns boolean language sql stable as $$ select coalesce(current_setting('ksl.via_rpc',true),'')='on'; $$;

------------------------------------------------------------------ generic triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at:=now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['fixtures','match_reports','news_articles','player_registration_submissions'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s; create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()',t);
  end loop; end $$;

create or replace function public.slugify(txt text) returns text language sql immutable as
$$ select trim(both '-' from regexp_replace(lower(coalesce(txt,'')),'[^a-z0-9]+','-','g')); $$;
create or replace function public.set_player_slug() returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug='' then new.slug:=public.slugify(new.first_name||' '||new.last_name)||'-'||substr(replace(new.id::text,'-',''),1,6); end if;
  return new; end; $$;
drop trigger if exists players_slug on public.players;
create trigger players_slug before insert on public.players for each row execute function public.set_player_slug();
create or replace function public.set_team_slug() returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug='' then new.slug:=public.slugify(new.name); end if; return new; end; $$;
drop trigger if exists teams_slug on public.teams;
create trigger teams_slug before insert on public.teams for each row execute function public.set_team_slug();
update public.players set slug=public.slugify(first_name||' '||last_name)||'-'||substr(replace(id::text,'-',''),1,6) where slug is null;
update public.teams set slug=public.slugify(name) where slug is null;

create or replace function public.fill_registration() returns trigger language plpgsql as $$
begin
  new.competition_id:=public.competition_of_season(new.season_id);
  if new.position is null then select position into new.position from public.players where id=new.player_id; end if;
  if not exists(select 1 from public.competition_teams where season_id=new.season_id and team_id=new.team_id) then
    raise exception 'Team is not registered in this competition and season'; end if;
  return new; end; $$;
drop trigger if exists fill_registration on public.player_registrations;
create trigger fill_registration before insert or update of team_id,season_id on public.player_registrations for each row execute function public.fill_registration();

-- accounts: only administrators may (de)activate accounts; users cannot flip their own flag
create or replace function public.guard_profile() returns trigger language plpgsql as $$
begin
  if new.is_active is distinct from old.is_active and not public.via_rpc() and auth.uid() is not null then
    raise exception 'Account status can only be changed by an administrator'; end if;
  return new; end; $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

------------------------------------------------------------------ fixture validation
create or replace function public.validate_fixture() returns trigger language plpgsql as $$
declare s_comp uuid;
begin
  select competition_id into s_comp from public.seasons where id=new.season_id;
  if s_comp is distinct from new.competition_id then raise exception 'Season does not belong to the selected competition'; end if;
  if new.home_team_id=new.away_team_id then raise exception 'Home and away teams must be different'; end if;
  if not exists(select 1 from public.competition_teams where season_id=new.season_id and team_id=new.home_team_id) then
    raise exception 'Invalid team selection: home team is not registered in this competition and season'; end if;
  if not exists(select 1 from public.competition_teams where season_id=new.season_id and team_id=new.away_team_id) then
    raise exception 'Invalid team selection: away team is not registered in this competition and season'; end if;
  if new.matchweek_id is not null and not exists(select 1 from public.matchweeks where id=new.matchweek_id and season_id=new.season_id) then
    raise exception 'Matchweek belongs to a different season'; end if;
  if tg_op='INSERT' or (new.home_team_id,new.away_team_id,new.season_id,new.round_number) is distinct from (old.home_team_id,old.away_team_id,old.season_id,old.round_number) then
    if exists(select 1 from public.fixtures f where f.id<>new.id and f.season_id=new.season_id and f.round_number=new.round_number
          and least(f.home_team_id,f.away_team_id)=least(new.home_team_id,new.away_team_id)
          and greatest(f.home_team_id,f.away_team_id)=greatest(new.home_team_id,new.away_team_id) and f.status::text<>'cancelled') then
      raise exception 'Duplicate fixture detected: these teams already meet in round %', new.round_number; end if;
  end if;
  if new.status::text not in ('cancelled','postponed','abandoned') and
     (tg_op='INSERT' or new.kickoff_at is distinct from old.kickoff_at or new.home_team_id is distinct from old.home_team_id
      or new.away_team_id is distinct from old.away_team_id or old.status::text in ('cancelled','postponed')) then
    if exists(select 1 from public.fixtures f where f.id<>new.id and f.status::text not in ('cancelled','postponed','abandoned')
          and (f.home_team_id in (new.home_team_id,new.away_team_id) or f.away_team_id in (new.home_team_id,new.away_team_id))
          and abs(extract(epoch from (f.kickoff_at-new.kickoff_at)))<7200) then
      raise exception 'Scheduling conflict: a team already has a fixture within 2 hours of %', new.kickoff_at; end if;
  end if;
  return new; end; $$;
drop trigger if exists validate_fixture on public.fixtures;
create trigger validate_fixture before insert or update on public.fixtures for each row execute function public.validate_fixture();

-- Official results are only ever changed through the result workflow functions.
create or replace function public.guard_fixture_result() returns trigger language plpgsql as $$
begin
  if public.via_rpc() then return coalesce(new,old); end if;
  if tg_op='DELETE' then
    if old.result_status='published' then raise exception 'A fixture with a published result cannot be deleted. Reopen the result first.'; end if;
    return old; end if;
  if tg_op='INSERT' then
    if new.home_score is not null or new.away_score is not null or new.result_status<>'draft' or new.status::text='completed' then
      raise exception 'Results cannot be written directly. Use the result workflow.'; end if;
    return new; end if;
  if (new.home_score,new.away_score,new.halftime_home_score,new.halftime_away_score,new.result_status,new.published_at,new.verified_by)
     is distinct from (old.home_score,old.away_score,old.halftime_home_score,old.halftime_away_score,old.result_status,old.published_at,old.verified_by)
     or (new.status::text='completed' and old.status::text<>'completed') then
    raise exception 'Results can only be changed through the result workflow (submit, verify, publish, reopen).'; end if;
  if old.result_status='published' and new.is_published=false then raise exception 'A fixture with a published result must stay published'; end if;
  return new; end; $$;
drop trigger if exists guard_fixture_result on public.fixtures;
create trigger guard_fixture_result before insert or update or delete on public.fixtures for each row execute function public.guard_fixture_result();

create or replace function public.guard_match_children() returns trigger language plpgsql as $$
declare fx uuid;
begin
  if public.via_rpc() then return coalesce(new,old); end if;
  fx:=coalesce(new.fixture_id,old.fixture_id);
  if tg_table_name='match_reports' and tg_op='UPDATE' then
    if exists(select 1 from public.fixtures where id=fx and result_status='published')
       and (new.draft_home_score,new.draft_away_score,new.draft_halftime_home,new.draft_halftime_away) is distinct from (old.draft_home_score,old.draft_away_score,old.draft_halftime_home,old.draft_halftime_away) then
      raise exception 'This result is published. Reopen it before changing the score.'; end if;
    return new; end if;
  if tg_table_name='match_reports' then return coalesce(new,old); end if;
  if exists(select 1 from public.fixtures where id=fx and result_status='published') then
    raise exception 'This result is published. Reopen it before changing events or lineups.'; end if;
  return coalesce(new,old); end; $$;
do $$ declare t text; begin foreach t in array array['match_events','match_lineups','match_reports'] loop
  execute format('drop trigger if exists guard_%1$s on public.%1$s; create trigger guard_%1$s before insert or update or delete on public.%1$s for each row execute function public.guard_match_children()',t);
end loop; end $$;

-- players in events/lineups must be approved registrations of that team and season
create or replace function public.validate_match_player() returns trigger language plpgsql as $$
declare f record; pid uuid; nm text;
begin
  select season_id,home_team_id,away_team_id into f from public.fixtures where id=new.fixture_id;
  if new.team_id not in (f.home_team_id,f.away_team_id) then raise exception 'Team is not playing in this fixture'; end if;
  foreach pid in array array[new.player_id, nullif(to_jsonb(new)->>'secondary_player_id','')::uuid] loop
    if pid is not null and not exists(select 1 from public.player_registrations r where r.player_id=pid and r.team_id=new.team_id and r.season_id=f.season_id and r.status::text='approved') then
      select full_name into nm from public.players where id=pid;
      raise exception 'Invalid player selection: % is not an approved registration of this team for this season', coalesce(nm,pid::text); end if;
  end loop;
  return new; end; $$;
do $$ declare t text; begin foreach t in array array['match_events','match_lineups'] loop
  execute format('drop trigger if exists validate_%1$s on public.%1$s; create trigger validate_%1$s before insert or update on public.%1$s for each row execute function public.validate_match_player()',t);
end loop; end $$;

------------------------------------------------------------------ manager submission state guard (uniform for 4 tables)
create or replace function public.enforce_submission_state() returns trigger language plpgsql as $$
begin
  if public.via_rpc() or auth.uid() is null then return coalesce(new,old); end if;
  if tg_op='INSERT' then
    if new.status::text not in ('draft','submitted') then raise exception 'New submissions must start as draft or submitted'; end if;
    new.reviewer_id:=null; new.reviewer_note:=null; new.reviewed_at:=null;
    if new.submitted_by is distinct from auth.uid() then raise exception 'Submissions must be made in your own name'; end if;
    return new; end if;
  if old.status::text not in ('draft','changes_requested') then
    raise exception 'This submission is % and can no longer be edited. Create a new submission instead.', old.status; end if;
  if new.status::text not in ('draft','submitted') then raise exception 'Only an administrator can set a submission to %', new.status; end if;
  if new.submitted_by is distinct from old.submitted_by or new.team_id is distinct from old.team_id then raise exception 'Submitter and team cannot be changed'; end if;
  new.reviewer_id:=old.reviewer_id; new.reviewer_note:=old.reviewer_note; new.reviewed_at:=old.reviewed_at;
  return new; end; $$;
do $$ declare t text; begin foreach t in array array['match_submissions','player_registration_submissions','team_change_requests','fixture_change_requests'] loop
  execute format('drop trigger if exists enforce_state on public.%1$s; create trigger enforce_state before insert or update on public.%1$s for each row execute function public.enforce_submission_state()',t);
end loop; end $$;

create or replace function public.validate_match_submission() returns trigger language plpgsql as $$
declare f record; el jsonb; pid uuid; starters int:=0; nm text; ev text;
begin
  select season_id,home_team_id,away_team_id,result_status into f from public.fixtures where id=new.fixture_id;
  if new.team_id not in (f.home_team_id,f.away_team_id) then raise exception 'Your team is not playing in this fixture'; end if;
  if f.result_status='published' then raise exception 'The official result for this fixture is already published'; end if;
  if public.via_rpc() or new.status::text<>'submitted' then return new; end if;
  if jsonb_typeof(new.lineup)<>'array' or jsonb_typeof(new.events)<>'array' then raise exception 'Lineup and events must be lists'; end if;
  for el in select * from jsonb_array_elements(new.lineup) loop
    pid:=nullif(el->>'player_id','')::uuid;
    if pid is null or not exists(select 1 from public.player_registrations r where r.player_id=pid and r.team_id=new.team_id and r.season_id=f.season_id and r.status::text='approved' and r.released_at is null) then
      select full_name into nm from public.players where id=pid;
      raise exception 'Lineup contains a player who is not in your approved squad: %', coalesce(nm,el->>'player_id','(missing player)'); end if;
    if coalesce((el->>'is_starting')::boolean,true) then starters:=starters+1; end if;
  end loop;
  if starters>11 then raise exception 'A starting eleven cannot contain more than 11 players (found %)', starters; end if;
  for el in select * from jsonb_array_elements(new.events) loop
    ev:=el->>'event_type';
    if ev is null or ev not in ('goal','own_goal','yellow_card','red_card','substitution_on','substitution_off','penalty_scored','penalty_missed','injury') then
      raise exception 'Unsupported event type "%". Record assists on the goal event.', coalesce(ev,'(none)'); end if;
    for pid in select nullif(x,'')::uuid from unnest(array[el->>'player_id',el->>'secondary_player_id']) x loop
      if pid is not null and not exists(select 1 from public.player_registrations r where r.player_id=pid and r.team_id=new.team_id and r.season_id=f.season_id and r.status::text='approved') then
        select full_name into nm from public.players where id=pid;
        raise exception 'Event references a player who is not in your approved squad: %', coalesce(nm,pid::text); end if;
    end loop;
  end loop;
  return new; end; $$;
drop trigger if exists validate_match_submission on public.match_submissions;
create trigger validate_match_submission before insert or update on public.match_submissions for each row execute function public.validate_match_submission();

create or replace function public.validate_registration_submission() returns trigger language plpgsql as $$
declare d jsonb:=new.player_data; fn text; ln text; dob date; sq int; pos text; dup record;
begin
  if public.via_rpc() or new.status::text<>'submitted' then return new; end if; -- validate on manager submission only; reviewer decisions must not re-trigger duplicate checks
  if not exists(select 1 from public.competition_teams where season_id=new.season_id and team_id=new.team_id) then
    raise exception 'Your team is not registered in this competition and season'; end if;
  if new.submission_type in ('release') then
    if new.player_id is null then raise exception 'A release request must reference a player'; end if; return new; end if;
  fn:=btrim(coalesce(d->>'first_name','')); ln:=btrim(coalesce(d->>'last_name',''));
  if fn='' or ln='' then raise exception 'First name and last name are required'; end if;
  pos:=d->>'position';
  if pos is null or pos not in ('Goalkeeper','Defender','Midfielder','Forward') then raise exception 'Position must be Goalkeeper, Defender, Midfielder or Forward'; end if;
  begin sq:=nullif(d->>'squad_number','')::int; exception when others then raise exception 'Squad number must be a whole number'; end;
  if sq is null or sq not between 1 and 99 then raise exception 'Squad number must be between 1 and 99'; end if;
  begin dob:=nullif(d->>'date_of_birth','')::date; exception when others then raise exception 'Date of birth must be a valid date (YYYY-MM-DD)'; end;
  if new.submission_type='registration' then
    select p.id into dup from public.players p join public.player_registrations r on r.player_id=p.id and r.season_id=new.season_id and r.released_at is null
      where lower(p.first_name)=lower(fn) and lower(p.last_name)=lower(ln) and (dob is null or p.date_of_birth is null or p.date_of_birth=dob) limit 1;
    if found then raise exception 'Duplicate registration: % % is already registered in this season', fn, ln; end if;
    if exists(select 1 from public.player_registration_submissions s where s.id is distinct from new.id and s.season_id=new.season_id and s.submission_type='registration'
         and s.status::text in ('submitted','under_review','changes_requested') and lower(s.player_data->>'first_name')=lower(fn) and lower(s.player_data->>'last_name')=lower(ln)
         and coalesce(s.player_data->>'date_of_birth','')=coalesce(d->>'date_of_birth','')) then
      raise exception 'Duplicate registration: a pending request already exists for % %', fn, ln; end if;
  end if;
  if exists(select 1 from public.player_registrations r where r.team_id=new.team_id and r.season_id=new.season_id and r.released_at is null and r.squad_number=sq and r.status::text='approved'
        and r.player_id is distinct from new.player_id) then
    raise exception 'Squad number % is already taken in your squad', sq; end if;
  if exists(select 1 from public.player_registration_submissions s where s.id is distinct from new.id and s.team_id=new.team_id and s.season_id=new.season_id
        and s.status::text in ('submitted','under_review','changes_requested') and s.submission_type in ('registration','transfer') and (s.player_data->>'squad_number')::int=sq) then
    raise exception 'Squad number % is already used by another pending request', sq; end if;
  return new; end; $$;
drop trigger if exists validate_registration_submission on public.player_registration_submissions;
create trigger validate_registration_submission before insert or update on public.player_registration_submissions for each row execute function public.validate_registration_submission();

create or replace function public.validate_fixture_change() returns trigger language plpgsql as $$
declare f record;
begin
  select home_team_id,away_team_id,result_status,kickoff_at into f from public.fixtures where id=new.fixture_id;
  if new.team_id not in (f.home_team_id,f.away_team_id) then raise exception 'Your team is not playing in this fixture'; end if;
  if f.result_status='published' then raise exception 'This match already has a published result'; end if;
  if new.request_type='reschedule' and new.requested_kickoff is null then raise exception 'A new kickoff time is required for a reschedule request'; end if;
  if new.request_type='venue' and coalesce(btrim(new.requested_venue),'')='' then raise exception 'A new venue is required for a venue change request'; end if;
  return new; end; $$;
drop trigger if exists validate_fixture_change on public.fixture_change_requests;
create trigger validate_fixture_change before insert or update on public.fixture_change_requests for each row execute function public.validate_fixture_change();

------------------------------------------------------------------ audit trail
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path=public as $$
declare rid uuid; j jsonb;
begin
  j:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  begin rid:=(j->>'id')::uuid; exception when others then rid:=null; end;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_values,new_values,details)
  values(auth.uid(),lower(tg_op),tg_table_name,rid,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end,
         jsonb_build_object('via_function',public.via_rpc()));
  return coalesce(new,old); end; $$;
do $$ declare t text; begin
  foreach t in array array['competitions','seasons','teams','competition_teams','players','player_registrations','matchweeks','fixtures','match_events','match_lineups',
    'match_reports','match_submissions','player_registration_submissions','team_change_requests','fixture_change_requests','team_manager_assignments','user_roles',
    'awards','team_of_week','news_articles','competition_admins','league_settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s; create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row_change()',t);
  end loop; end $$;

create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
begin insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),p_action,p_entity_type,p_entity_id,coalesce(p_details,'{}')); end; $$;
-- Authenticated users may only record their own sign-in events.
create or replace function public.log_auth_event(p_action text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_action not in ('auth.login','auth.logout','auth.password_reset') then raise exception 'Unsupported event'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),p_action,'profiles',auth.uid(),'{}'); end; $$;
