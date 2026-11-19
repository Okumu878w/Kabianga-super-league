-- 0009: one-step result entry (with goal scorers) and bulk import of results for a league that is already under way.
-- Both go through the same core as normal publication, so standings/statistics stay derived and audited.

create or replace function public._record_result(p_fixture uuid, p_home int, p_away int, p_ht_home int, p_ht_away int, p_events jsonb, p_allow_unattributed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare f record; el jsonb; hg int; ag int; n_home text; n_away text;
begin
  select * into f from public.fixtures where id=p_fixture for update;
  if not found then raise exception 'Fixture not found'; end if;
  if f.result_status='published' then raise exception 'This fixture already has a published result. Reopen it first to correct it.'; end if;
  if p_home is null or p_away is null or p_home<0 or p_away<0 or p_home>30 or p_away>30 then raise exception 'Scores must be whole numbers between 0 and 30'; end if;
  if (p_ht_home is null) <> (p_ht_away is null) then raise exception 'Enter both half-time scores or neither'; end if;
  if p_ht_home is not null and (p_ht_home>p_home or p_ht_away>p_away) then raise exception 'Half-time score cannot exceed the full-time score'; end if;
  perform set_config('ksl.via_rpc','on',true);
  delete from public.match_events where fixture_id=p_fixture;
  for el in select * from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) loop
    insert into public.match_events(fixture_id,team_id,player_id,secondary_player_id,event_type,minute,added_time,notes)
    values(p_fixture,(el->>'team_id')::uuid,nullif(el->>'player_id','')::uuid,nullif(el->>'secondary_player_id','')::uuid,el->>'event_type',nullif(el->>'minute','')::int,null,nullif(el->>'notes',''));
  end loop;
  select count(*) filter (where (team_id=f.home_team_id and event_type in ('goal','penalty_scored')) or (team_id=f.away_team_id and event_type='own_goal')),
         count(*) filter (where (team_id=f.away_team_id and event_type in ('goal','penalty_scored')) or (team_id=f.home_team_id and event_type='own_goal'))
    into hg,ag from public.match_events where fixture_id=p_fixture;
  select name into n_home from public.teams where id=f.home_team_id; select name into n_away from public.teams where id=f.away_team_id;
  if hg>p_home then raise exception 'You listed % goal(s) for % but the score is only %',hg,n_home,p_home; end if;
  if ag>p_away then raise exception 'You listed % goal(s) for % but the score is only %',ag,n_away,p_away; end if;
  if not p_allow_unattributed and (hg<>p_home or ag<>p_away) then
    raise exception 'Scorers do not add up to the score: % scorers for % goals (%), % for % (%). List every scorer or tick "some scorers unknown".',hg,p_home,n_home,ag,p_away,n_away; end if;
  insert into public.match_reports(fixture_id,draft_home_score,draft_away_score,draft_halftime_home,draft_halftime_away,published_at)
    values(p_fixture,p_home,p_away,p_ht_home,p_ht_away,now())
    on conflict (fixture_id) do update set draft_home_score=excluded.draft_home_score, draft_away_score=excluded.draft_away_score, draft_halftime_home=excluded.draft_halftime_home, draft_halftime_away=excluded.draft_halftime_away, published_at=now();
  update public.fixtures set home_score=p_home, away_score=p_away, halftime_home_score=p_ht_home, halftime_away_score=p_ht_away,
    result_status='published', is_published=true, published_at=now(), verified_by=auth.uid(), status='completed' where id=p_fixture;
end; $$;
revoke all on function public._record_result(uuid,int,int,int,int,jsonb,boolean) from public, anon, authenticated;

-- Enter a result and its scorers in one step (Draft→Submitted→Verified→Published collapsed for an administrator who is entitled to do all of them).
create or replace function public.quick_publish_result(p_fixture uuid, p_home int, p_away int, p_ht_home int, p_ht_away int, p_events jsonb, p_allow_unattributed boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare f record;
begin
  perform public._need_user();
  select * into f from public.fixtures where id=p_fixture;
  if not found then raise exception 'Fixture not found'; end if;
  if not public.can_manage_competition(f.competition_id) then raise exception 'Only a super administrator or the competition administrator can publish results'; end if;
  perform public._record_result(p_fixture,p_home,p_away,p_ht_home,p_ht_away,p_events,p_allow_unattributed);
  perform public._notify_team(f.home_team_id,'Result published','Official result is now live.','/manager/reports','result_published','fixtures',p_fixture);
  perform public._notify_team(f.away_team_id,'Result published','Official result is now live.','/manager/reports','result_published','fixtures',p_fixture);
  perform public.log_audit('result.quick_published','fixtures',p_fixture,jsonb_build_object('score',p_home||'-'||p_away,'events',jsonb_array_length(coalesce(p_events,'[]'::jsonb)),'unattributed_allowed',p_allow_unattributed));
end; $$;

-- Bulk import of already-played matches (creates the fixture when it does not exist, then records + publishes the result). Row-level errors do not stop other rows.
create or replace function public.import_historical_results(p_season uuid, p_rows jsonb, p_file_name text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare comp uuid; el jsonb; i int:=0; ok int:=0; errs jsonb:='[]'; fid uuid; mw uuid; rnd int; hid uuid; aid uuid; ex record;
begin
  perform public._need_user();
  comp:=public.competition_of_season(p_season);
  if comp is null then raise exception 'Season not found'; end if;
  if not public.can_manage_competition(comp) then raise exception 'Only a super administrator or the competition administrator can import results'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Rows must be a list'; end if;
  for el in select * from jsonb_array_elements(p_rows) loop
    i:=i+1;
    begin
      hid:=(el->>'home_team_id')::uuid; aid:=(el->>'away_team_id')::uuid; rnd:=coalesce(nullif(el->>'round_number','')::int,1);
      select f.id,f.home_team_id,f.result_status into ex from public.fixtures f where f.season_id=p_season and f.round_number=rnd and f.status::text<>'cancelled'
        and least(f.home_team_id,f.away_team_id)=least(hid,aid) and greatest(f.home_team_id,f.away_team_id)=greatest(hid,aid);
      if found then
        if ex.result_status='published' then raise exception 'This pairing already has a published result (round %)',rnd; end if;
        if ex.home_team_id<>hid then raise exception 'A fixture for these teams already exists with home and away the other way round'; end if;
        fid:=ex.id;
      else
        insert into public.matchweeks(season_id,week_number,label) values(p_season,(el->>'week_number')::int,'Matchweek '||(el->>'week_number')) on conflict (season_id,week_number) do nothing;
        select id into mw from public.matchweeks where season_id=p_season and week_number=(el->>'week_number')::int;
        insert into public.fixtures(competition_id,season_id,matchweek_id,home_team_id,away_team_id,kickoff_at,venue,round_number,created_by,is_published)
          values(comp,p_season,mw,hid,aid,(el->>'scheduled_at')::timestamptz,coalesce(nullif(el->>'venue',''),(select home_venue from public.teams where id=hid)),rnd,auth.uid(),true) returning id into fid;
      end if;
      perform public._record_result(fid,(el->>'home_score')::int,(el->>'away_score')::int,null,null,coalesce(el->'events','[]'::jsonb),true);
      ok:=ok+1;
    exception when others then
      errs:=errs||jsonb_build_array(jsonb_build_object('row',coalesce(nullif(el->>'source_row','')::int,i),'message',sqlerrm));
    end;
  end loop;
  insert into public.import_jobs(import_type,competition_id,season_id,file_name,status,total_rows,successful_rows,failed_rows,error_report,created_by)
    values('results',comp,p_season,p_file_name,case when jsonb_array_length(errs)=0 then 'completed' else 'completed_with_errors' end,i,ok,jsonb_array_length(errs),errs,auth.uid());
  perform public.log_audit('results.imported','seasons',p_season,jsonb_build_object('imported',ok,'failed',jsonb_array_length(errs),'file',p_file_name));
  return jsonb_build_object('inserted',ok,'failed',jsonb_array_length(errs),'errors',errs); end; $$;

do $$ declare fn text; begin
  foreach fn in array array['public.quick_publish_result(uuid,int,int,int,int,jsonb,boolean)','public.import_historical_results(uuid,jsonb,text)'] loop
    execute format('revoke all on function %s from public, anon',fn); execute format('grant execute on function %s to authenticated',fn); end loop; end $$;
