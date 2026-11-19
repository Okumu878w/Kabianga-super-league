-- 0007: transactional workflow functions (SECURITY DEFINER with explicit authorization checks).
-- Each function is one transaction: it either completes fully or leaves no trace.

create or replace function public._need_user() returns uuid language plpgsql stable as $$
begin if auth.uid() is null then raise exception 'You must be signed in'; end if; return auth.uid(); end; $$;

create or replace function public._notify(p_user uuid,p_title text,p_body text,p_href text,p_type text default 'general',p_etype text default null,p_eid uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform set_config('ksl.via_rpc','on',true);
  insert into public.manager_notifications(user_id,title,body,href,notification_type,related_entity_type,related_entity_id) values(p_user,p_title,p_body,p_href,p_type,p_etype,p_eid);
end; $$;
create or replace function public._notify_team(p_team uuid,p_title text,p_body text,p_href text,p_type text default 'general',p_etype text default null,p_eid uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  for u in select user_id from public.team_manager_assignments where team_id=p_team and is_active loop
    perform public._notify(u,p_title,p_body,p_href,p_type,p_etype,p_eid); end loop; end; $$;

-- fixture lifecycle notifications ---------------------------------------------------------------
create or replace function public.notify_fixture_change() returns trigger language plpgsql security definer set search_path=public as $$
declare label text;
begin
  select h.name||' v '||a.name into label from public.teams h, public.teams a where h.id=new.home_team_id and a.id=new.away_team_id;
  if tg_op='UPDATE' then
    if old.is_published=false and new.is_published then
      perform public._notify_team(new.home_team_id,'New fixture published',label||' on '||to_char(new.kickoff_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI'),'/manager/fixtures','fixture_published','fixtures',new.id);
      perform public._notify_team(new.away_team_id,'New fixture published',label||' on '||to_char(new.kickoff_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI'),'/manager/fixtures','fixture_published','fixtures',new.id);
    elsif old.is_published and (new.kickoff_at is distinct from old.kickoff_at or new.venue is distinct from old.venue or new.status is distinct from old.status and new.status::text in ('postponed','cancelled')) then
      perform public._notify_team(new.home_team_id,'Fixture updated',label||' now '||to_char(new.kickoff_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' ('||new.status||')','/manager/fixtures','fixture_rescheduled','fixtures',new.id);
      perform public._notify_team(new.away_team_id,'Fixture updated',label||' now '||to_char(new.kickoff_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' ('||new.status||')','/manager/fixtures','fixture_rescheduled','fixtures',new.id);
    end if;
  end if;
  return new; end; $$;
drop trigger if exists notify_fixture_change on public.fixtures;
create trigger notify_fixture_change after update on public.fixtures for each row execute function public.notify_fixture_change();

------------------------------------------------------------------ accounts & assignments
create or replace function public.assign_team_manager(p_user uuid,p_team uuid,p_competition uuid default null,p_season uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare ok boolean; aid uuid; tname text;
begin
  perform public._need_user();
  select (public.is_super() or exists(select 1 from public.competition_teams ct where ct.team_id=p_team and public.can_manage_competition(ct.competition_id)
          and (p_competition is null or ct.competition_id=p_competition))) into ok;
  if not ok then raise exception 'You are not authorised to assign managers to this team'; end if;
  if not exists(select 1 from auth.users where id=p_user) then raise exception 'That user account does not exist. Invite the manager first.'; end if;
  perform set_config('ksl.via_rpc','on',true);
  insert into public.team_manager_assignments(user_id,team_id,competition_id,season_id,assigned_by,is_active) values(p_user,p_team,p_competition,p_season,auth.uid(),true)
    on conflict (user_id,team_id) do update set is_active=true, competition_id=excluded.competition_id, season_id=excluded.season_id, assigned_by=auth.uid() returning id into aid;
  insert into public.user_roles(user_id,role) values(p_user,'team_manager') on conflict do nothing;
  update public.profiles set is_active=true where id=p_user;
  select name into tname from public.teams where id=p_team;
  perform public._notify(p_user,'You have been assigned to '||tname,'You can now manage this team from the manager portal.','/manager','assignment','teams',p_team);
  return aid; end; $$;

create or replace function public.deactivate_team_manager(p_user uuid,p_team uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public._need_user();
  if not (public.is_super() or exists(select 1 from public.competition_teams ct where ct.team_id=p_team and public.can_manage_competition(ct.competition_id))) then
    raise exception 'You are not authorised to change this assignment'; end if;
  update public.team_manager_assignments set is_active=false where user_id=p_user and team_id=p_team;
  if not found then raise exception 'No such assignment'; end if; end; $$;

create or replace function public.set_account_active(p_user uuid,p_active boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public._need_user();
  if p_user=auth.uid() then raise exception 'You cannot change your own account status'; end if;
  if not (public.is_super() or exists(select 1 from public.team_manager_assignments a join public.competition_teams ct on ct.team_id=a.team_id
          where a.user_id=p_user and public.can_manage_competition(ct.competition_id))) then
    raise exception 'You are not authorised to change this account'; end if;
  perform set_config('ksl.via_rpc','on',true);
  update public.profiles set is_active=p_active where id=p_user;
  perform public.log_audit(case when p_active then 'account.activated' else 'account.deactivated' end,'profiles',p_user,'{}'); end; $$;

create or replace function public.send_notification(p_user uuid,p_competition uuid,p_title text,p_body text,p_href text default null) returns int
language plpgsql security definer set search_path=public as $$
declare n int:=0; u uuid;
begin
  perform public._need_user();
  if coalesce(btrim(p_title),'')='' or coalesce(btrim(p_body),'')='' then raise exception 'Title and message are required'; end if;
  if p_user is not null then
    if not public.is_admin() then raise exception 'Not authorised'; end if;
    perform public._notify(p_user,p_title,p_body,p_href,'admin_message'); return 1; end if;
  if p_competition is null then raise exception 'Choose a competition or a manager'; end if;
  if not public.can_manage_competition(p_competition) then raise exception 'Not authorised for this competition'; end if;
  for u in select distinct a.user_id from public.team_manager_assignments a join public.competition_teams ct on ct.team_id=a.team_id
           where a.is_active and ct.competition_id=p_competition loop
    perform public._notify(u,p_title,p_body,p_href,'admin_message'); n:=n+1; end loop;
  return n; end; $$;

------------------------------------------------------------------ players
create or replace function public._activate_registration(p_team uuid,p_season uuid,p_data jsonb,p_player uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid:=p_player; fn text:=btrim(p_data->>'first_name'); ln text:=btrim(p_data->>'last_name'); dob date:=nullif(p_data->>'date_of_birth','')::date;
  sq int:=nullif(p_data->>'squad_number','')::int; pos text:=p_data->>'position'; rid uuid; existing record;
begin
  if not exists(select 1 from public.competition_teams where season_id=p_season and team_id=p_team) then raise exception 'Team is not registered in this competition and season'; end if;
  if pid is null then
    select p.id into pid from public.players p where lower(p.first_name)=lower(fn) and lower(p.last_name)=lower(ln) and (dob is null or p.date_of_birth is null or p.date_of_birth=dob) order by (p.date_of_birth=dob) desc nulls last limit 1;
    if pid is null then
      insert into public.players(first_name,last_name,date_of_birth,nationality,position,photo_url,biography)
      values(fn,ln,dob,coalesce(nullif(p_data->>'nationality',''),'Kenyan'),pos,nullif(p_data->>'photo_url',''),nullif(p_data->>'biography','')) returning id into pid; end if;
  end if;
  select r.id,r.team_id into existing from public.player_registrations r where r.player_id=pid and r.season_id=p_season and r.released_at is null;
  if found then
    if existing.team_id=p_team then raise exception 'Duplicate registration: % % is already registered for this team and season',fn,ln;
    else raise exception 'Duplicate registration: % % is already registered with another team this season. Use a transfer.',fn,ln; end if; end if;
  if sq is not null and exists(select 1 from public.player_registrations r where r.team_id=p_team and r.season_id=p_season and r.released_at is null and r.squad_number=sq and r.status::text='approved') then
    raise exception 'Squad number % is already taken',sq; end if;
  insert into public.player_registrations(player_id,team_id,season_id,squad_number,position,status,reviewed_at) values(pid,p_team,p_season,sq,pos,'approved',now()) returning id into rid;
  return rid; end; $$;

create or replace function public.register_player(p_team uuid,p_season uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform public._need_user();
  if not public.can_manage_competition(public.competition_of_season(p_season)) then raise exception 'You are not authorised to register players for this competition'; end if;
  if coalesce(btrim(p_data->>'first_name'),'')='' or coalesce(btrim(p_data->>'last_name'),'')='' then raise exception 'First name and last name are required'; end if;
  if coalesce(p_data->>'position','') not in ('Goalkeeper','Defender','Midfielder','Forward') then raise exception 'Position must be Goalkeeper, Defender, Midfielder or Forward'; end if;
  return public._activate_registration(p_team,p_season,p_data,null); end; $$;

create or replace function public.transfer_player(p_registration uuid,p_new_team uuid,p_squad_number int default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare r record; rid uuid;
begin
  perform public._need_user();
  select * into r from public.player_registrations where id=p_registration for update;
  if not found or r.released_at is not null then raise exception 'Registration not found or already released'; end if;
  if not public.can_manage_competition(r.competition_id) then raise exception 'Not authorised'; end if;
  if r.team_id=p_new_team then raise exception 'The player is already registered with this team'; end if;
  update public.player_registrations set released_at=now() where id=p_registration;
  rid:=public._activate_registration(p_new_team,r.season_id,jsonb_build_object('squad_number',coalesce(p_squad_number,r.squad_number),'position',r.position,'first_name','x','last_name','x'),r.player_id);
  return rid; end; $$;

create or replace function public.review_player_registration(p_id uuid,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s record; d jsonb; reg uuid; comp uuid; tname text; reg_row record;
begin
  perform public._need_user();
  select * into s from public.player_registration_submissions where id=p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  comp:=public.competition_of_season(s.season_id);
  if not public.can_manage_competition(comp) then raise exception 'You are not authorised to review this submission'; end if;
  if s.submitted_by=auth.uid() then raise exception 'You cannot review your own submission'; end if;
  if p_decision not in ('under_review','approved','rejected','changes_requested') then raise exception 'Unknown decision %',p_decision; end if;
  if s.status::text not in ('submitted','under_review') then raise exception 'This submission is already % and cannot be reviewed again',s.status; end if;
  if p_decision in ('rejected','changes_requested') and coalesce(btrim(p_note),'')='' then raise exception 'A reason is required when rejecting or requesting changes'; end if;
  perform set_config('ksl.via_rpc','on',true);
  d:=s.player_data;
  if p_decision='approved' then
    if s.submission_type='registration' then
      reg:=public._activate_registration(s.team_id,s.season_id,d,null);
      update public.player_registration_submissions set player_id=(select player_id from public.player_registrations where id=reg) where id=p_id;
    elsif s.submission_type='transfer' then
      if s.player_id is null then raise exception 'Transfer requests must reference an existing player'; end if;
      update public.player_registrations set released_at=now() where player_id=s.player_id and season_id=s.season_id and released_at is null;
      reg:=public._activate_registration(s.team_id,s.season_id,d,s.player_id);
    elsif s.submission_type='release' then
      update public.player_registrations set released_at=now() where player_id=s.player_id and team_id=s.team_id and season_id=s.season_id and released_at is null;
      if not found then raise exception 'No active registration to release'; end if;
    elsif s.submission_type='update' then
      select * into reg_row from public.player_registrations where player_id=s.player_id and team_id=s.team_id and season_id=s.season_id and released_at is null;
      if not found then raise exception 'Player has no active registration with this team'; end if;
      update public.players set date_of_birth=coalesce(nullif(d->>'date_of_birth','')::date,date_of_birth), nationality=coalesce(nullif(d->>'nationality',''),nationality),
        photo_url=coalesce(nullif(d->>'photo_url',''),photo_url), biography=coalesce(nullif(d->>'biography',''),biography) where id=s.player_id;
      if nullif(d->>'squad_number','') is not null and (d->>'squad_number')::int is distinct from reg_row.squad_number then
        if exists(select 1 from public.player_registrations r where r.team_id=s.team_id and r.season_id=s.season_id and r.released_at is null and r.squad_number=(d->>'squad_number')::int and r.status::text='approved' and r.id<>reg_row.id) then
          raise exception 'Squad number % is already taken',d->>'squad_number'; end if; end if;
      update public.player_registrations set squad_number=coalesce(nullif(d->>'squad_number','')::int,squad_number), position=coalesce(nullif(d->>'position',''),position) where id=reg_row.id;
    end if;
  end if;
  update public.player_registration_submissions set status=p_decision::public.submission_status, reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now() where id=p_id;
  select name into tname from public.teams where id=s.team_id;
  perform public._notify(s.submitted_by,
    case p_decision when 'approved' then 'Player registration approved' when 'rejected' then 'Player registration rejected' when 'changes_requested' then 'Changes requested on a player registration' else 'Player registration under review' end,
    coalesce(d->>'first_name','')||' '||coalesce(d->>'last_name','')||' ('||tname||')'||coalesce(' — '||nullif(p_note,''),''),
    '/manager/squad','registration_'||p_decision,'player_registration_submissions',p_id);
  perform public.log_audit('registration.'||p_decision,'player_registration_submissions',p_id,jsonb_build_object('team_id',s.team_id,'competition_id',comp,'reason',p_note));
  return jsonb_build_object('status',p_decision,'registration_id',reg); end; $$;

------------------------------------------------------------------ match submissions
create or replace function public.review_match_submission(p_id uuid,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s record; f record;
begin
  perform public._need_user();
  select * into s from public.match_submissions where id=p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  select * into f from public.fixtures where id=s.fixture_id;
  if not public.can_edit_match(f.competition_id) then raise exception 'You are not authorised to review this submission'; end if;
  if s.submitted_by=auth.uid() then raise exception 'You cannot review your own submission'; end if;
  if p_decision not in ('under_review','approved','rejected','changes_requested') then raise exception 'Unknown decision %',p_decision; end if;
  if s.status::text not in ('submitted','under_review') then raise exception 'This submission is already % and cannot be reviewed again',s.status; end if;
  if p_decision in ('rejected','changes_requested') and coalesce(btrim(p_note),'')='' then raise exception 'A reason is required when rejecting or requesting changes'; end if;
  perform set_config('ksl.via_rpc','on',true);
  update public.match_submissions set status=p_decision::public.submission_status, reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now() where id=p_id;
  perform public._notify(s.submitted_by,
    case p_decision when 'approved' then 'Match submission approved' when 'rejected' then 'Match submission rejected' when 'changes_requested' then 'Clarification requested on match submission' else 'Match submission under review' end,
    coalesce(p_note,'Your match information has been reviewed.'),'/manager/submissions','match_submission_'||p_decision,'match_submissions',p_id);
  perform public.log_audit('match_submission.'||p_decision,'match_submissions',p_id,jsonb_build_object('fixture_id',s.fixture_id,'team_id',s.team_id,'reason',p_note));
  return jsonb_build_object('status',p_decision); end; $$;

-- Copies an APPROVED submission into the official match DRAFT (lineup/events, optionally the score). It never publishes.
create or replace function public.apply_match_submission(p_id uuid,p_apply_score boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s record; f record; el jsonb; n_l int:=0; n_e int:=0; hs int; as_ int;
begin
  perform public._need_user();
  select * into s from public.match_submissions where id=p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  select * into f from public.fixtures where id=s.fixture_id;
  if not public.can_edit_match(f.competition_id) then raise exception 'Not authorised'; end if;
  if s.status::text<>'approved' then raise exception 'Only approved submissions can be loaded into the official match record'; end if;
  if f.result_status<>'draft' then raise exception 'The result is already % — return it to draft before loading submissions',f.result_status; end if;
  perform set_config('ksl.via_rpc','on',true);
  delete from public.match_lineups where fixture_id=s.fixture_id and team_id=s.team_id;
  delete from public.match_events where fixture_id=s.fixture_id and team_id=s.team_id;
  perform set_config('ksl.via_rpc','off',true);
  for el in select * from jsonb_array_elements(s.lineup) loop
    insert into public.match_lineups(fixture_id,team_id,player_id,is_starting,is_captain,shirt_number,position,started_minute,ended_minute,formation)
    values(s.fixture_id,s.team_id,(el->>'player_id')::uuid,coalesce((el->>'is_starting')::boolean,true),coalesce((el->>'is_captain')::boolean,false),
           nullif(el->>'shirt_number','')::int,nullif(el->>'position',''),nullif(el->>'started_minute','')::int,nullif(el->>'ended_minute','')::int,s.formation);
    n_l:=n_l+1; end loop;
  for el in select * from jsonb_array_elements(s.events) loop
    insert into public.match_events(fixture_id,team_id,player_id,secondary_player_id,event_type,minute,added_time,notes)
    values(s.fixture_id,s.team_id,nullif(el->>'player_id','')::uuid,nullif(el->>'secondary_player_id','')::uuid,el->>'event_type',nullif(el->>'minute','')::int,nullif(el->>'added_time','')::int,nullif(el->>'notes',''));
    n_e:=n_e+1; end loop;
  insert into public.match_reports(fixture_id) values(s.fixture_id) on conflict (fixture_id) do nothing;
  if p_apply_score and s.home_score is not null and s.away_score is not null then
    update public.match_reports set draft_home_score=s.home_score, draft_away_score=s.away_score where fixture_id=s.fixture_id; end if;
  perform public.log_audit('match_submission.applied','match_submissions',p_id,jsonb_build_object('lineup_rows',n_l,'event_rows',n_e,'score_applied',p_apply_score));
  return jsonb_build_object('lineup_rows',n_l,'event_rows',n_e); end; $$;

------------------------------------------------------------------ team & fixture change requests
create or replace function public.review_team_change(p_id uuid,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record; c jsonb; k text;
begin
  perform public._need_user();
  select * into r from public.team_change_requests where id=p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not (public.is_super() or exists(select 1 from public.competition_teams ct where ct.team_id=r.team_id and public.can_manage_competition(ct.competition_id))) then
    raise exception 'You are not authorised to review this request'; end if;
  if r.submitted_by=auth.uid() then raise exception 'You cannot review your own submission'; end if;
  if p_decision not in ('under_review','approved','rejected','changes_requested') then raise exception 'Unknown decision %',p_decision; end if;
  if r.status::text not in ('submitted','under_review') then raise exception 'This request is already % and cannot be reviewed again',r.status; end if;
  if p_decision in ('rejected','changes_requested') and coalesce(btrim(p_note),'')='' then raise exception 'A reason is required when rejecting or requesting changes'; end if;
  c:=r.changes;
  for k in select jsonb_object_keys(c) loop
    if k not in ('description','home_venue','coach_name','logo_url','contact_email','contact_phone') then raise exception 'Unsupported field "%" in change request',k; end if; end loop;
  perform set_config('ksl.via_rpc','on',true);
  if p_decision='approved' then
    update public.teams set description=coalesce(c->>'description',description), home_venue=coalesce(c->>'home_venue',home_venue),
      coach_name=coalesce(c->>'coach_name',coach_name), logo_url=coalesce(c->>'logo_url',logo_url) where id=r.team_id;
    if c ? 'contact_email' or c ? 'contact_phone' then
      insert into public.team_private_details(team_id,contact_email,contact_phone) values(r.team_id,c->>'contact_email',c->>'contact_phone')
      on conflict (team_id) do update set contact_email=coalesce(excluded.contact_email,team_private_details.contact_email),
        contact_phone=coalesce(excluded.contact_phone,team_private_details.contact_phone), updated_at=now(); end if;
  end if;
  update public.team_change_requests set status=p_decision::public.submission_status, reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now() where id=p_id;
  perform public._notify(r.submitted_by,'Team profile change '||replace(p_decision,'_',' '),coalesce(p_note,'Your team profile request has been reviewed.'),'/manager/team','team_change_'||p_decision,'team_change_requests',p_id);
  perform public.log_audit('team_change.'||p_decision,'team_change_requests',p_id,jsonb_build_object('team_id',r.team_id,'reason',p_note));
  return jsonb_build_object('status',p_decision); end; $$;

create or replace function public.review_fixture_change(p_id uuid,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record; f record;
begin
  perform public._need_user();
  select * into r from public.fixture_change_requests where id=p_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into f from public.fixtures where id=r.fixture_id;
  if not public.can_manage_competition(f.competition_id) then raise exception 'You are not authorised to review this request'; end if;
  if r.submitted_by=auth.uid() then raise exception 'You cannot review your own submission'; end if;
  if p_decision not in ('under_review','approved','rejected','changes_requested') then raise exception 'Unknown decision %',p_decision; end if;
  if r.status::text not in ('submitted','under_review') then raise exception 'This request is already % and cannot be reviewed again',r.status; end if;
  if p_decision in ('rejected','changes_requested') and coalesce(btrim(p_note),'')='' then raise exception 'A reason is required when rejecting or requesting changes'; end if;
  perform set_config('ksl.via_rpc','on',true);
  if p_decision='approved' then
    perform set_config('ksl.via_rpc','off',true);
    if r.request_type='reschedule' then update public.fixtures set kickoff_at=r.requested_kickoff, venue=coalesce(r.requested_venue,venue) where id=r.fixture_id;
    elsif r.request_type='venue' then update public.fixtures set venue=r.requested_venue where id=r.fixture_id;
    elsif r.request_type='postpone' then update public.fixtures set status='postponed' where id=r.fixture_id; end if;
    perform set_config('ksl.via_rpc','on',true);
  end if;
  update public.fixture_change_requests set status=p_decision::public.submission_status, reviewer_id=auth.uid(), reviewer_note=p_note, reviewed_at=now() where id=p_id;
  perform public._notify(r.submitted_by,'Fixture request '||replace(p_decision,'_',' '),coalesce(p_note,'Your fixture request has been reviewed.'),'/manager/fixtures','fixture_request_'||p_decision,'fixture_change_requests',p_id);
  perform public.log_audit('fixture_change.'||p_decision,'fixture_change_requests',p_id,jsonb_build_object('fixture_id',r.fixture_id,'reason',p_note));
  return jsonb_build_object('status',p_decision); end; $$;

------------------------------------------------------------------ result workflow: Draft -> Submitted -> Verified -> Published
create or replace function public.set_result_status(p_fixture uuid,p_to text) returns void language plpgsql security definer set search_path=public as $$
declare f record; rep record;
begin
  perform public._need_user();
  select * into f from public.fixtures where id=p_fixture for update;
  if not found then raise exception 'Fixture not found'; end if;
  if not public.can_edit_match(f.competition_id) then raise exception 'You are not authorised to update this match'; end if;
  if f.result_status='published' then raise exception 'This result is published. Reopen it to make corrections.'; end if;
  perform set_config('ksl.via_rpc','on',true);
  if f.result_status='draft' and p_to='submitted' then
    select * into rep from public.match_reports where fixture_id=p_fixture;
    if not found or rep.draft_home_score is null or rep.draft_away_score is null then raise exception 'Enter the final score before submitting the result'; end if;
    update public.fixtures set result_status='submitted' where id=p_fixture;
  elsif f.result_status='submitted' and p_to='verified' then
    if not public.can_manage_competition(f.competition_id) then raise exception 'Only competition administrators can verify results'; end if;
    update public.fixtures set result_status='verified', verified_by=auth.uid() where id=p_fixture;
  elsif p_to='draft' and f.result_status in ('submitted','verified') then
    update public.fixtures set result_status='draft', verified_by=null where id=p_fixture;
  else raise exception 'Invalid transition from % to %',f.result_status,p_to; end if;
  perform public.log_audit('result.'||p_to,'fixtures',p_fixture,jsonb_build_object('from',f.result_status)); end; $$;

create or replace function public.publish_fixture_result(p_fixture uuid) returns void language plpgsql security definer set search_path=public as $$
declare f record; rep record; hg int; ag int; starters int; tm uuid;
begin
  perform public._need_user();
  select * into f from public.fixtures where id=p_fixture for update;
  if not found then raise exception 'Fixture not found'; end if;
  if not public.can_manage_competition(f.competition_id) then raise exception 'Only competition administrators can publish results'; end if;
  if f.result_status<>'verified' then raise exception 'The result must be verified before it can be published (currently %)',f.result_status; end if;
  select * into rep from public.match_reports where fixture_id=p_fixture;
  if not found or rep.draft_home_score is null or rep.draft_away_score is null then raise exception 'The match report has no final score'; end if;
  if rep.draft_home_score<0 or rep.draft_away_score<0 then raise exception 'Scores cannot be negative'; end if;
  if rep.draft_halftime_home is not null and (rep.draft_halftime_home>rep.draft_home_score or rep.draft_halftime_away>rep.draft_away_score) then
    raise exception 'Half-time score cannot exceed the full-time score'; end if;
  select count(*) filter (where (team_id=f.home_team_id and event_type in ('goal','penalty_scored')) or (team_id=f.away_team_id and event_type='own_goal')),
         count(*) filter (where (team_id=f.away_team_id and event_type in ('goal','penalty_scored')) or (team_id=f.home_team_id and event_type='own_goal'))
    into hg,ag from public.match_events where fixture_id=p_fixture;
  if hg<>rep.draft_home_score or ag<>rep.draft_away_score then
    raise exception 'Score does not match the recorded events: score is %-%, events give %-%',rep.draft_home_score,rep.draft_away_score,hg,ag; end if;
  for tm in select unnest(array[f.home_team_id,f.away_team_id]) loop
    select count(*) into starters from public.match_lineups where fixture_id=p_fixture and team_id=tm and is_starting;
    if starters>11 then raise exception 'A team has % starters; the maximum is 11',starters; end if; end loop;
  perform set_config('ksl.via_rpc','on',true);
  update public.fixtures set home_score=rep.draft_home_score, away_score=rep.draft_away_score, halftime_home_score=rep.draft_halftime_home, halftime_away_score=rep.draft_halftime_away,
    result_status='published', is_published=true, published_at=now(), status='completed' where id=p_fixture;
  update public.match_reports set published_at=now() where fixture_id=p_fixture;
  perform public._notify_team(f.home_team_id,'Result published','Official result is now live.','/manager/reports','result_published','fixtures',p_fixture);
  perform public._notify_team(f.away_team_id,'Result published','Official result is now live.','/manager/reports','result_published','fixtures',p_fixture);
  perform public.log_audit('result.published','fixtures',p_fixture,jsonb_build_object('score',rep.draft_home_score||'-'||rep.draft_away_score)); end; $$;

-- Correcting a published result: reopen (public numbers revert immediately because everything is derived), fix, resubmit, verify, publish.
create or replace function public.reopen_published_result(p_fixture uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare f record;
begin
  perform public._need_user();
  select * into f from public.fixtures where id=p_fixture for update;
  if not found then raise exception 'Fixture not found'; end if;
  if not public.can_manage_competition(f.competition_id) then raise exception 'Only competition administrators can reopen results'; end if;
  if f.result_status<>'published' then raise exception 'Only published results can be reopened'; end if;
  if coalesce(length(btrim(p_reason)),0)<5 then raise exception 'Please give a reason (at least 5 characters)'; end if;
  perform set_config('ksl.via_rpc','on',true);
  update public.fixtures set home_score=null, away_score=null, halftime_home_score=null, halftime_away_score=null, result_status='draft', published_at=null, verified_by=null, status='scheduled' where id=p_fixture;
  update public.match_reports set published_at=null where fixture_id=p_fixture;
  perform public.log_audit('result.reopened','fixtures',p_fixture,jsonb_build_object('reason',p_reason,'previous_score',f.home_score||'-'||f.away_score)); end; $$;

------------------------------------------------------------------ fixture batches (generator / bulk import / manual multi-create)
create or replace function public.create_fixtures_batch(p_season uuid,p_fixtures jsonb,p_job_type text default 'manual',p_config jsonb default '{}',
  p_partial boolean default false,p_replace_unpublished boolean default false,p_file_name text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare comp uuid; el jsonb; i int:=0; ok int:=0; errs jsonb:='[]'; mw uuid; venue text; deleted int:=0;
begin
  perform public._need_user();
  comp:=public.competition_of_season(p_season);
  if comp is null then raise exception 'Season not found'; end if;
  if not public.can_manage_competition(comp) then raise exception 'You are not authorised to create fixtures for this competition'; end if;
  if jsonb_typeof(p_fixtures)<>'array' then raise exception 'Fixtures must be a list'; end if;
  if p_replace_unpublished then
    delete from public.fixtures where season_id=p_season and not is_published and result_status='draft'; get diagnostics deleted=row_count; end if;
  for el in select * from jsonb_array_elements(p_fixtures) loop
    i:=i+1;
    begin
      insert into public.matchweeks(season_id,week_number,label) values(p_season,(el->>'week_number')::int,'Matchweek '||(el->>'week_number')) on conflict (season_id,week_number) do nothing;
      select id into mw from public.matchweeks where season_id=p_season and week_number=(el->>'week_number')::int;
      venue:=coalesce(nullif(el->>'venue',''),(select home_venue from public.teams where id=(el->>'home_team_id')::uuid));
      insert into public.fixtures(competition_id,season_id,matchweek_id,home_team_id,away_team_id,kickoff_at,venue,round_number,notes,created_by,is_published)
      values(comp,p_season,mw,(el->>'home_team_id')::uuid,(el->>'away_team_id')::uuid,(el->>'scheduled_at')::timestamptz,venue,coalesce(nullif(el->>'round_number','')::int,1),nullif(el->>'notes',''),auth.uid(),false);
      ok:=ok+1;
    exception when others then
      if not p_partial then raise exception 'Row %: %',i,sqlerrm; end if;
      errs:=errs||jsonb_build_array(jsonb_build_object('row',coalesce(nullif(el->>'source_row','')::int,i),'message',sqlerrm));
    end;
  end loop;
  if p_job_type='generator' then
    insert into public.fixture_generation_jobs(competition_id,season_id,configuration,status,fixture_count,created_by,completed_at) values(comp,p_season,p_config,'completed',ok,auth.uid(),now());
  elsif p_job_type='import' then
    insert into public.import_jobs(import_type,competition_id,season_id,file_name,status,total_rows,successful_rows,failed_rows,error_report,created_by)
    values('fixtures',comp,p_season,p_file_name,case when jsonb_array_length(errs)=0 then 'completed' else 'completed_with_errors' end,i,ok,jsonb_array_length(errs),errs,auth.uid()); end if;
  return jsonb_build_object('inserted',ok,'failed',jsonb_array_length(errs),'errors',errs,'replaced',deleted); end; $$;

create or replace function public.publish_fixtures(p_season uuid,p_matchweek uuid default null) returns int language plpgsql security definer set search_path=public as $$
declare comp uuid; n int;
begin
  perform public._need_user();
  comp:=public.competition_of_season(p_season);
  if not public.can_manage_competition(comp) then raise exception 'You are not authorised to publish fixtures for this competition'; end if;
  update public.fixtures set is_published=true where season_id=p_season and not is_published and status::text<>'cancelled' and (p_matchweek is null or matchweek_id=p_matchweek);
  get diagnostics n=row_count;
  perform public.log_audit('fixtures.published','seasons',p_season,jsonb_build_object('count',n,'matchweek_id',p_matchweek));
  return n; end; $$;

------------------------------------------------------------------ privileges
do $$ declare fn text; begin
  foreach fn in array array[
    'public._need_user()','public._notify(uuid,text,text,text,text,text,uuid)','public._notify_team(uuid,text,text,text,text,text,uuid)',
    'public._activate_registration(uuid,uuid,jsonb,uuid)','public.log_audit(text,text,uuid,jsonb)','public.notify_fixture_change()','public.audit_row_change()'] loop
    execute format('revoke all on function %s from public, anon, authenticated',fn); end loop;
  foreach fn in array array[
    'public.assign_team_manager(uuid,uuid,uuid,uuid)','public.deactivate_team_manager(uuid,uuid)','public.set_account_active(uuid,boolean)','public.send_notification(uuid,uuid,text,text,text)',
    'public.register_player(uuid,uuid,jsonb)','public.transfer_player(uuid,uuid,int)','public.review_player_registration(uuid,text,text)','public.review_match_submission(uuid,text,text)',
    'public.apply_match_submission(uuid,boolean)','public.review_team_change(uuid,text,text)','public.review_fixture_change(uuid,text,text)','public.set_result_status(uuid,text)',
    'public.publish_fixture_result(uuid)','public.reopen_published_result(uuid,text)','public.create_fixtures_batch(uuid,jsonb,text,jsonb,boolean,boolean,text)','public.publish_fixtures(uuid,uuid)',
    'public.log_auth_event(text)'] loop
    execute format('revoke all on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated',fn); end loop;
  foreach fn in array array['public.get_standings(uuid)','public.get_player_stats(uuid,uuid)','public.suggest_player_of_week(uuid,uuid)'] loop
    execute format('grant execute on function %s to anon, authenticated',fn); end loop;
end $$;
