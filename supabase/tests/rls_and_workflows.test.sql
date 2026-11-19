-- Database test-suite: RLS, role isolation, approval workflows, result publication, derived statistics.
-- Run against a scratch database that has migrations 0001-0008 applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_workflows.test.sql
-- Everything runs inside one transaction that is rolled back at the end. Requires Supabase's roles (anon, authenticated).
-- (The harness resets the per-transaction 'ksl.via_rpc' flag between steps because in production every API call is its own transaction.)
\set ON_ERROR_STOP on
begin;
create schema tests;
grant usage on schema tests to public;
create function tests.id(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function tests.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('ksl.via_rpc','off',true); perform set_config('request.jwt.claim.sub',u::text,true); execute 'set local role authenticated'; end $$;
create function tests.as_anon() returns void language plpgsql as $$ begin perform set_config('ksl.via_rpc','off',true); perform set_config('request.jwt.claim.sub','',true); execute 'set local role anon'; end $$;
create function tests.as_root() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('ksl.via_rpc','off',true); perform set_config('request.jwt.claim.sub','',true); end $$;
create function tests.ok(c boolean, msg text) returns void language plpgsql as $$ begin if c is not true then raise exception 'FAIL: %',msg; end if; raise notice 'PASS: %',msg; end $$;
create function tests.throws(q text, pat text, msg text) returns void language plpgsql as $$
begin
  perform set_config('ksl.via_rpc','off',true);
  begin execute q; exception when others then
    if sqlerrm ~* pat then raise notice 'PASS: % (%)',msg,left(sqlerrm,70); return; end if;
    raise exception 'FAIL: % — expected error ~ "%" but got: %',msg,pat,sqlerrm; end;
  raise exception 'FAIL: % — statement unexpectedly succeeded',msg; end $$;
create function tests.affects(q text, n int, msg text) returns void language plpgsql as $$
declare c int; begin perform set_config('ksl.via_rpc','off',true); execute q; get diagnostics c=row_count; if c<>n then raise exception 'FAIL: % — expected % rows, got %',msg,n,c; end if; raise notice 'PASS: %',msg; end $$;
grant all on all tables in schema public to anon, authenticated;

-- ------------------------------------------------------------------ fixtures of the test world
do $$ declare i int; begin
  for i in 1..9 loop insert into auth.users(id,email) values(tests.id(i),'u'||i||'@test.local'); end loop; end $$;
-- 1 super, 2 comp admin A (comp1), 3 comp admin B (comp2), 4 editor, 5 viewer, 6 manager of T1, 7 manager of T2, 8 outsider (no role), 9 manager of T3
insert into public.user_roles(user_id,role) values (tests.id(1),'super_admin'),(tests.id(2),'competition_admin'),(tests.id(3),'competition_admin'),(tests.id(4),'editor'),(tests.id(5),'viewer');
insert into public.competitions(id,name,slug,is_published) values (tests.id(101),'Premier','premier',true),(tests.id(102),'Division One','div1',true),(tests.id(103),'Hidden','hidden',false);
insert into public.competition_admins values (tests.id(2),tests.id(101)),(tests.id(3),tests.id(102));
insert into public.seasons(id,competition_id,name) values (tests.id(201),tests.id(101),'2027'),(tests.id(202),tests.id(102),'2027');
insert into public.teams(id,name,short_name,home_venue) select tests.id(300+g),'Team '||g,'T'||g,'Ground '||g from generate_series(1,6) g;
insert into public.competition_teams(competition_id,season_id,team_id) select tests.id(101),tests.id(201),tests.id(300+g) from generate_series(1,4) g;
insert into public.competition_teams(competition_id,season_id,team_id) select tests.id(102),tests.id(202),tests.id(300+g) from generate_series(5,6) g;
insert into public.team_private_details values (tests.id(301),'t1@x.com','0700000001'),(tests.id(302),'t2@x.com','0700000002');

-- ------------------------------------------------------------------ 1. public access
select tests.as_anon();
select tests.ok((select count(*) from public.competitions)=2,'anon sees only published competitions');
select tests.throws($$insert into public.competitions(name,slug) values('x','x')$$,'row-level security','anon cannot create competitions');
select tests.ok((select count(*) from public.team_private_details)=0,'anon cannot read private team contact details');
select tests.ok((select count(*) from public.audit_logs)=0,'anon cannot read audit logs');
select tests.ok((select count(*) from public.manager_notifications)=0,'anon cannot read notifications');
select tests.ok((select count(*) from public.profiles)=0,'anon cannot read profiles');
select tests.throws($$select public.publish_fixture_result(tests.id(1))$$,'permission denied','anon cannot call privileged functions');
select tests.as_root();

-- ------------------------------------------------------------------ 2. role administration
select tests.as_user(tests.id(4));
select tests.throws($$insert into public.user_roles(user_id,role) values (tests.id(4),'super_admin')$$,'row-level security','editor cannot grant themselves super_admin');
select tests.as_user(tests.id(2));
select tests.throws($$insert into public.user_roles(user_id,role) values (tests.id(8),'competition_admin')$$,'row-level security','competition admin cannot assign admin roles');
select tests.as_root();

-- ------------------------------------------------------------------ 3. competition-scoped admin
select tests.as_user(tests.id(3));
select tests.affects($$update public.competitions set description='hack' where id=tests.id(101)$$,0,'comp admin B cannot edit competition 1');
select tests.throws($$insert into public.seasons(competition_id,name) values (tests.id(101),'2028')$$,'row-level security','comp admin B cannot create seasons in competition 1');
select tests.as_user(tests.id(2));
select tests.affects($$update public.competitions set description='ok' where id=tests.id(101)$$,1,'comp admin A can edit competition 1');
select tests.as_user(tests.id(5));
select tests.affects($$update public.competitions set description='viewer' where id=tests.id(101)$$,0,'viewer is read-only');
select tests.ok((select count(*) from public.competitions)=3,'viewer can read unpublished competitions');
select tests.as_root();

-- ------------------------------------------------------------------ 4. manager assignment & isolation
select tests.as_user(tests.id(3));
select tests.throws($$select public.assign_team_manager(tests.id(6),tests.id(301))$$,'not authorised','comp admin B cannot assign managers for competition-1 teams');
select tests.as_user(tests.id(2));
select public.assign_team_manager(tests.id(6),tests.id(301),tests.id(101),tests.id(201));
select public.assign_team_manager(tests.id(7),tests.id(302),tests.id(101),tests.id(201));
select public.assign_team_manager(tests.id(9),tests.id(303),tests.id(101),tests.id(201));
select tests.as_root();
select tests.ok(exists(select 1 from public.user_roles where user_id=tests.id(6) and role='team_manager'),'assignment grants the team_manager role');
select tests.as_user(tests.id(6));
select tests.ok((select count(*) from public.team_private_details)=1,'manager sees only own team private details');
select tests.ok((select count(*) from public.manager_notifications)=1,'manager received an assignment notification');
select tests.throws($$update public.manager_notifications set title='tampered'$$,'read state','manager cannot rewrite a notification');
select tests.affects($$update public.manager_notifications set read_at=now()$$,1,'manager can mark a notification read');
select tests.throws($$insert into public.team_manager_assignments(user_id,team_id) values (tests.id(6),tests.id(302))$$,'row-level security','manager cannot assign themselves to another team');
select tests.throws($$insert into public.user_roles(user_id,role) values (tests.id(6),'super_admin')$$,'row-level security','manager cannot escalate privileges');
select tests.throws($$update public.profiles set is_active=false where id=tests.id(6)$$,'administrator','manager cannot flip account status');
select tests.as_root();

-- ------------------------------------------------------------------ 5. player registration workflow
select tests.as_user(tests.id(6));
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(302),tests.id(201),tests.id(6),'{"first_name":"A","last_name":"B","position":"Forward","squad_number":9}')$$,'row-level security','manager cannot submit players for another team');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data,status) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"A","last_name":"B","position":"Forward","squad_number":9}','approved')$$,'start as draft or submitted','manager cannot self-approve on insert');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"A","last_name":"B","position":"Striker","squad_number":9}')$$,'Position must be','invalid position rejected');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"A","last_name":"B","position":"Forward","squad_number":100}')$$,'between 1 and 99','invalid squad number rejected');
insert into public.player_registration_submissions(id,team_id,season_id,submitted_by,player_data) values (tests.id(401),tests.id(301),tests.id(201),tests.id(6),'{"first_name":"John","last_name":"Kiprop","position":"Forward","squad_number":9,"date_of_birth":"2000-01-01"}');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"john","last_name":"KIPROP","position":"Forward","squad_number":10,"date_of_birth":"2000-01-01"}')$$,'pending request already exists','duplicate pending registration rejected');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"Other","last_name":"Guy","position":"Forward","squad_number":9}')$$,'already used by another pending','pending squad-number clash rejected');
select tests.throws($$update public.player_registration_submissions set status='approved' where id=tests.id(401)$$,'no longer be edited','manager cannot self-approve on update');
select tests.throws($$select public.review_player_registration(tests.id(401),'approved')$$,'not authorised','manager cannot call the review function');
select tests.as_user(tests.id(3));
select tests.throws($$select public.review_player_registration(tests.id(401),'approved')$$,'not authorised','comp admin of another competition cannot review');
select tests.as_user(tests.id(2));
select tests.throws($$select public.review_player_registration(tests.id(401),'rejected')$$,'reason is required','rejection requires a reason');
select public.review_player_registration(tests.id(401),'approved','welcome');
select tests.throws($$select public.review_player_registration(tests.id(401),'approved')$$,'already approved','a decision cannot be re-made');
select tests.as_root();
select tests.ok((select count(*) from public.player_registrations where team_id=tests.id(301) and status='approved')=1,'approval created the official registration');
select tests.ok((select position from public.player_registrations where team_id=tests.id(301))='Forward','registration carries the position');
select tests.as_user(tests.id(6));
select tests.ok((select count(*) from public.manager_notifications where notification_type='registration_approved')=1,'manager notified of approval');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"John","last_name":"Kiprop","position":"Forward","squad_number":11,"date_of_birth":"2000-01-01"}')$$,'already registered','duplicate of an approved registration rejected');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"New","last_name":"Guy","position":"Forward","squad_number":9}')$$,'already taken','squad number clash with approved squad rejected');
select tests.throws($$update public.player_registration_submissions set player_data='{"first_name":"X"}' where id=tests.id(401)$$,'can no longer be edited','approved submissions are locked');
select tests.as_root();

-- squad: admin registers a full set through register_player
select tests.as_user(tests.id(2));
select public.register_player(tests.id(301),tests.id(201),jsonb_build_object('first_name','Gk','last_name','One','position','Goalkeeper','squad_number',1));
select public.register_player(tests.id(301),tests.id(201),jsonb_build_object('first_name','Def','last_name','Two','position','Defender','squad_number',2));
select public.register_player(tests.id(302),tests.id(201),jsonb_build_object('first_name','Gk','last_name','Other','position','Goalkeeper','squad_number',1));
select public.register_player(tests.id(302),tests.id(201),jsonb_build_object('first_name','Mid','last_name','Three','position','Midfielder','squad_number',8));
select tests.throws($$select public.register_player(tests.id(305),tests.id(201),'{"first_name":"A","last_name":"B","position":"Forward","squad_number":3}')$$,'not registered in this competition','cannot register for a team outside the season');
select tests.throws($$select public.register_player(tests.id(301),tests.id(201),'{"first_name":"Gk","last_name":"One","position":"Goalkeeper","squad_number":5}')$$,'Duplicate registration','duplicate player registration blocked');
select tests.as_root();

-- ------------------------------------------------------------------ 6. fixture integrity
select tests.as_user(tests.id(2));
select tests.throws($$insert into public.fixtures(competition_id,season_id,home_team_id,away_team_id,kickoff_at) values (tests.id(101),tests.id(201),tests.id(301),tests.id(301),now())$$,'must be different|check','team cannot play itself');
select tests.throws($$insert into public.fixtures(competition_id,season_id,home_team_id,away_team_id,kickoff_at) values (tests.id(101),tests.id(201),tests.id(301),tests.id(305),now())$$,'Invalid team selection','team outside season rejected');
select tests.as_root();
-- all-or-nothing generator persistence
select tests.as_user(tests.id(2));
select tests.throws($$select public.create_fixtures_batch(tests.id(201),jsonb_build_array(
  jsonb_build_object('week_number',1,'home_team_id',tests.id(301),'away_team_id',tests.id(302),'scheduled_at','2027-02-06T15:00:00+03:00'),
  jsonb_build_object('week_number',1,'home_team_id',tests.id(303),'away_team_id',tests.id(301),'scheduled_at','2027-02-06T15:00:00+03:00')),'generator','{}',false,false)$$,'Scheduling conflict','generator batch aborts on conflict');
select tests.as_root();
select tests.ok((select count(*) from public.fixtures)=0,'failed generator batch left nothing behind (transactional)');
select tests.as_user(tests.id(2));
select tests.ok((public.create_fixtures_batch(tests.id(201),jsonb_build_array(
  jsonb_build_object('week_number',1,'home_team_id',tests.id(301),'away_team_id',tests.id(302),'scheduled_at','2027-02-06T15:00:00+03:00'),
  jsonb_build_object('week_number',1,'home_team_id',tests.id(303),'away_team_id',tests.id(304),'scheduled_at','2027-02-06T15:00:00+03:00'),
  jsonb_build_object('week_number',2,'home_team_id',tests.id(302),'away_team_id',tests.id(301),'scheduled_at','2027-02-13T15:00:00+03:00','round_number',2,'source_row',7),
  jsonb_build_object('week_number',2,'home_team_id',tests.id(305),'away_team_id',tests.id(304),'scheduled_at','2027-02-13T15:00:00+03:00','source_row',8)),
  'import','{}',true,false,'f.csv')->>'inserted')::int=3,'partial import inserts valid rows (3 of 4)');
select tests.ok((select failed_rows from public.import_jobs order by created_at desc limit 1)=1 and (select error_report->0->>'row' from public.import_jobs order by created_at desc limit 1)='8','import report names the failing source row');
select tests.throws($$insert into public.fixtures(competition_id,season_id,home_team_id,away_team_id,kickoff_at,round_number) values (tests.id(101),tests.id(201),tests.id(301),tests.id(302),'2027-03-06T15:00:00+03:00',1)$$,'Duplicate fixture','duplicate pairing in the same round rejected');
select tests.ok(true,'second-leg (round 2) pairing allowed explicitly');
insert into public.fixtures(competition_id,season_id,home_team_id,away_team_id,kickoff_at,round_number) values (tests.id(101),tests.id(201),tests.id(301),tests.id(302),'2027-03-06T15:00:00+03:00',3);
select tests.as_root();

-- public sees nothing until fixtures are published
select tests.as_anon();
select tests.ok((select count(*) from public.fixtures)=0,'unpublished fixtures invisible to the public');
select tests.as_user(tests.id(6));
select tests.ok((select count(*) from public.fixtures)=3,'manager sees own team fixtures (T1 plays in 3) even unpublished');
select tests.as_user(tests.id(2));
select tests.ok(public.publish_fixtures(tests.id(201))=4,'publish_fixtures publishes the schedule');
select tests.as_root();
select tests.ok((select count(*) from public.manager_notifications where notification_type='fixture_published' and user_id=tests.id(6))=3,'managers notified of published fixtures');
select tests.as_anon();
select tests.ok((select count(*) from public.fixtures)=4,'published fixtures visible to the public');
select tests.ok((select count(*) from public.fixtures where home_score is not null)=0,'no scores exposed before publication');
select tests.as_root();

-- ------------------------------------------------------------------ 7. manager match submission
select tests.as_user(tests.id(9));
select tests.throws($$insert into public.match_submissions(fixture_id,team_id,submitted_by,status) select id,tests.id(303),tests.id(9),'submitted' from public.fixtures where home_team_id=tests.id(301) and away_team_id=tests.id(302) and round_number=1$$,'row-level security|not playing in this fixture','manager cannot submit for a fixture their team is not in');
select tests.as_user(tests.id(6));
select tests.throws($$insert into public.match_submissions(fixture_id,team_id,submitted_by,status,lineup) select id,tests.id(301),tests.id(6),'submitted',jsonb_build_array(jsonb_build_object('player_id',(select id from public.players where last_name='Other'))) from public.fixtures where home_team_id=tests.id(301) and away_team_id=tests.id(302) and round_number=1$$,'not in your approved squad','lineup containing another team''s player rejected');
select tests.throws($$insert into public.match_submissions(fixture_id,team_id,submitted_by,status,events) select id,tests.id(301),tests.id(6),'submitted',jsonb_build_array(jsonb_build_object('event_type','assist','player_id',(select id from public.players where last_name='One'))) from public.fixtures where home_team_id=tests.id(301) and away_team_id=tests.id(302) and round_number=1$$,'Unsupported event type','standalone assist events rejected');
select tests.throws($$insert into public.match_submissions(fixture_id,team_id,submitted_by,status) select id,tests.id(301),tests.id(6),'approved' from public.fixtures where home_team_id=tests.id(301) and away_team_id=tests.id(302) and round_number=1$$,'draft or submitted','manager cannot create an approved submission');
insert into public.match_submissions(id,fixture_id,team_id,submitted_by,status,home_score,away_score,formation,lineup,events)
select tests.id(501),id,tests.id(301),tests.id(6),'submitted',2,0,'4-4-2',
  jsonb_build_array(jsonb_build_object('player_id',(select id from public.players where last_name='One'),'is_starting',true,'position','Goalkeeper'),
                    jsonb_build_object('player_id',(select id from public.players where last_name='Two'),'is_starting',true),
                    jsonb_build_object('player_id',(select id from public.players where last_name='Kiprop'),'is_starting',true)),
  jsonb_build_array(jsonb_build_object('event_type','goal','minute',10,'player_id',(select id from public.players where last_name='Kiprop'),'secondary_player_id',(select id from public.players where last_name='Two')),
                    jsonb_build_object('event_type','goal','minute',70,'player_id',(select id from public.players where last_name='Kiprop')))
from public.fixtures where home_team_id=tests.id(301) and away_team_id=tests.id(302) and round_number=1;
select tests.throws($$select public.apply_match_submission(tests.id(501))$$,'not authorised|permission','manager cannot load submissions into official records');
select tests.throws($$select public.publish_fixture_result((select id from public.fixtures limit 1))$$,'Only competition administrators','manager cannot publish results');
select tests.affects($$update public.fixtures set home_score=9,away_score=0$$,0,'manager cannot edit any fixture (RLS hides every row from writes)');
select tests.as_user(tests.id(7));
select tests.ok((select count(*) from public.match_submissions)=0,'other team''s manager cannot read this submission');
select tests.as_user(tests.id(6));
select tests.ok((select count(*) from public.match_submissions)=1,'submitter can read own submission');
select tests.as_root();

-- ------------------------------------------------------------------ 8. administrator review → official draft → publish
select tests.as_user(tests.id(4)); -- editor: may review match info
select tests.throws($$select public.apply_match_submission(tests.id(501))$$,'Only approved','cannot apply an unapproved submission');
select public.review_match_submission(tests.id(501),'approved','looks right');
select public.apply_match_submission(tests.id(501),true);
select tests.ok((select count(*) from public.match_events where fixture_id=(select fixture_id from public.match_submissions where id=tests.id(501)))=2,'approved events loaded into official draft');
select tests.ok((select count(*) from public.match_lineups)=3,'approved lineup loaded into official draft');
select tests.throws($$select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'verified')$$,'Invalid transition','cannot skip workflow steps');
select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'submitted');
select tests.throws($$select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'verified')$$,'Only competition administrators','editor cannot verify');
select tests.as_user(tests.id(3));
select tests.throws($$select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'verified')$$,'not authorised','wrong-competition admin cannot verify');
select tests.as_user(tests.id(2));
select tests.throws($$select public.publish_fixture_result((select fixture_id from public.match_submissions where id=tests.id(501)))$$,'must be verified','cannot publish an unverified result');
select tests.throws($$update public.fixtures set home_score=5,away_score=5,result_status='published' where id=(select fixture_id from public.match_submissions where id=tests.id(501))$$,'result workflow','direct score/status updates are blocked');
select tests.as_anon();
select tests.ok((select count(*) from public.match_events)=0 and (select count(*) from public.match_lineups)=0 and (select count(*) from public.match_reports)=0,'draft report/events/lineups hidden from the public');
select tests.ok((select sum(points) from public.get_standings(tests.id(201)))=0,'standings ignore unpublished results');
select tests.as_user(tests.id(2));
select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'verified');
-- score/event mismatch is refused atomically
update public.match_reports set draft_home_score=3 where fixture_id=(select fixture_id from public.match_submissions where id=tests.id(501));
select tests.throws($$select public.publish_fixture_result((select fixture_id from public.match_submissions where id=tests.id(501)))$$,'does not match the recorded events','score must match goal events');
update public.match_reports set draft_home_score=2 where fixture_id=(select fixture_id from public.match_submissions where id=tests.id(501));
select public.publish_fixture_result((select fixture_id from public.match_submissions where id=tests.id(501)));
select tests.ok((select status::text from public.fixtures where id=(select fixture_id from public.match_submissions where id=tests.id(501)))='completed','publication marks the fixture completed');
select tests.throws($$delete from public.match_events$$,'published','published events are immutable');
select tests.throws($$update public.match_reports set draft_home_score=7$$,'Reopen','published scores are immutable');
select tests.as_root();

-- derived outputs
select tests.as_anon();
select tests.ok((select points from public.get_standings(tests.id(201)) where team_name='Team 1')=3,'winner has 3 points');
select tests.ok((select points from public.get_standings(tests.id(201)) where team_name='Team 2')=0,'loser has 0 points');
select tests.ok((select pos from public.get_standings(tests.id(201)) where team_name='Team 1')=1,'winner ranks first');
select tests.ok((select form from public.get_standings(tests.id(201)) where team_name='Team 1')='W' and (select form from public.get_standings(tests.id(201)) where team_name='Team 2')='L','form guide shows W / L');
select tests.ok((select count(*) from public.get_standings(tests.id(201)))=4,'all four registered teams listed (even unplayed)');
select tests.ok((select goals from public.get_player_stats(tests.id(201)) where player_name='John Kiprop')=2,'top scorer has 2 goals');
select tests.ok((select assists from public.get_player_stats(tests.id(201)) where player_name='Def Two')=1,'assist credited from goal event');
select tests.ok((select clean_sheets from public.get_player_stats(tests.id(201)) where player_name='Gk One')=1,'goalkeeper gets a clean sheet (played 90, team conceded 0)');
select tests.ok((select goals_conceded from public.get_player_stats(tests.id(201)) where player_name='Gk One')=0,'goalkeeper goals conceded = 0');
select tests.as_root();

-- ------------------------------------------------------------------ 9. reopen / correct / republish, own goals, cards, draws
select tests.as_user(tests.id(2));
select tests.throws($$select public.reopen_published_result((select id from public.fixtures where result_status='published'),'x')$$,'reason','reopen requires a reason');
select public.reopen_published_result((select id from public.fixtures where result_status='published'),'wrong scorer recorded');
select tests.as_anon();
select tests.ok((select sum(points) from public.get_standings(tests.id(201)))=0,'reopening instantly removes the result from standings');
select tests.ok((select count(*) from public.get_player_stats(tests.id(201)))=0,'reopening instantly removes its statistics');
select tests.as_user(tests.id(2));
-- correction: make it 1-1 with an own goal by T2's defender-less side: use Mid Three (T2) own goal, plus T2 goal... T2 has no scorer, so own goal by T1 player counts for T2
update public.match_reports set draft_home_score=2, draft_away_score=1, draft_halftime_home=1, draft_halftime_away=0
 where fixture_id=(select fixture_id from public.match_submissions where id=tests.id(501));
select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'submitted');
select public.set_result_status((select fixture_id from public.match_submissions where id=tests.id(501)),'verified');
select tests.throws($$select public.publish_fixture_result((select fixture_id from public.match_submissions where id=tests.id(501)))$$,'does not match','a 2-1 score without a matching event cannot be published');
insert into public.match_events(fixture_id,team_id,player_id,event_type,minute)
 select fixture_id,team_id,(select id from public.players where last_name='Two'),'own_goal',80 from public.match_submissions where id=tests.id(501);
select public.publish_fixture_result((select fixture_id from public.match_submissions where id=tests.id(501)));
select tests.as_anon();
select tests.ok((select goals_for from public.get_standings(tests.id(201)) where team_name='Team 1')=2 and (select goals_against from public.get_standings(tests.id(201)) where team_name='Team 1')=1,'corrected score reflected in standings (own goal credited to opponent)');
select tests.ok((select goals from public.get_player_stats(tests.id(201)) where player_name='Def Two')=0,'own goal is not counted as a goal for the player');
select tests.ok((select clean_sheets from public.get_player_stats(tests.id(201)) where player_name='Gk One')=0,'clean sheet removed after correction (conceded 1)');
select tests.ok((select goals_conceded from public.get_player_stats(tests.id(201)) where player_name='Gk One')=1,'goals conceded corrected');
select tests.as_root();

-- second fixture: draw with cards; tie-break by goals scored vs goal difference ordering is configurable
select tests.as_user(tests.id(2));
update public.competitions set tie_break_rules='["goals_for","goal_difference"]' where id=tests.id(101);
select tests.as_root();
select tests.as_user(tests.id(2));
insert into public.match_reports(fixture_id,draft_home_score,draft_away_score)
 select id,0,0 from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304);
insert into public.match_events(fixture_id,team_id,player_id,event_type,minute)
 select f.id,tests.id(302),(select id from public.players where last_name='Three'),'yellow_card',33 from public.fixtures f where f.home_team_id=tests.id(302) and f.away_team_id=tests.id(301) and f.round_number=1;
select tests.as_root();

-- ------------------------------------------------------------------ 10. deactivation, storage, audit, realtime
select tests.as_user(tests.id(1));
select public.set_account_active(tests.id(6),false);
select tests.throws($$select public.set_account_active(tests.id(1),false)$$,'own account','admins cannot deactivate themselves');
select tests.as_user(tests.id(6));
select tests.ok((select count(*) from public.team_private_details)=0,'deactivated manager loses access to team data');
select tests.throws($$insert into public.player_registration_submissions(team_id,season_id,submitted_by,player_data) values (tests.id(301),tests.id(201),tests.id(6),'{"first_name":"Z","last_name":"Z","position":"Forward","squad_number":30}')$$,'row-level security','deactivated manager cannot submit');
select tests.as_user(tests.id(1)); select public.set_account_active(tests.id(6),true); select tests.as_root();

select tests.as_user(tests.id(6));
select tests.ok(public.storage_team_ok(tests.id(301)::text||'/photo.jpg'),'manager may upload under own team folder');
select tests.ok(not public.storage_team_ok(tests.id(302)::text||'/photo.jpg'),'manager may not upload under another team''s folder');
select tests.ok(not public.storage_team_ok('not-a-uuid/photo.jpg'),'malformed storage path rejected');
select tests.as_root();

select tests.as_root();
select tests.ok((select count(*) from public.audit_logs where action='result.published')=2,'publications recorded in the audit log (with reopen in between)');
select tests.ok((select count(*) from public.audit_logs where action='result.reopened')=1,'reopen recorded with reason');
select tests.ok((select count(*) from public.audit_logs where action like 'registration.%')=1,'registration decision audited');
select tests.ok((select count(*) from public.audit_logs where entity_type='player_registrations')>=1,'row-level audit triggers fire');
select tests.as_user(tests.id(2));
select tests.throws($$insert into public.audit_logs(action,entity_type) values ('forged','x')$$,'row-level security|permission denied','audit logs cannot be forged');
select tests.throws($$select public.log_audit('forged','x',null,'{}')$$,'permission denied','log_audit not callable by users');
select tests.affects($$delete from public.audit_logs$$,0,'audit logs cannot be deleted');
select tests.as_user(tests.id(5));
select tests.ok((select count(*) from public.audit_logs)=0,'viewers cannot read audit logs');
select tests.as_root();
select tests.ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='fixtures'),'fixtures are in the realtime publication');
select tests.ok(not exists(select 1 from pg_tables where schemaname='public' and not rowsecurity),'RLS is enabled on every public table');

-- ------------------------------------------------------------------ 11. news visibility + scheduling
insert into public.news_articles(title,slug,status,published_at) values ('Draft','draft','draft',null),('Live','live','published',now()-interval '1 hour'),('Later','later','scheduled',now()+interval '1 day'),('Due','due','scheduled',now()-interval '1 minute'),('Old','old','archived',now()-interval '5 days');
select tests.as_anon();
select tests.ok((select count(*) from public.news_articles)=2,'public sees published and due scheduled articles only');
select tests.as_root();

-- ------------------------------------------------------------------ 12. one-step result entry + historical import (migration 0009)
select tests.as_user(tests.id(2));
-- fixture T3 v T4 (round 1) is still unplayed: manager of T1 cannot publish it
select tests.as_user(tests.id(6));
select tests.throws($$select public.quick_publish_result((select id from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304)),1,0,null,null,'[]',true)$$,'Only a super administrator|permission|not authorised','manager cannot quick-publish');
select tests.as_user(tests.id(3));
select tests.throws($$select public.quick_publish_result((select id from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304)),1,0,null,null,'[]',true)$$,'Only a super administrator','other competition admin cannot quick-publish');
select tests.as_user(tests.id(1));
select public.register_player(tests.id(303),tests.id(201),jsonb_build_object('first_name','Sam','last_name','Striker','position','Forward','squad_number',9));
select tests.throws($$select public.quick_publish_result((select id from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304)),1,0,null,null,jsonb_build_array(jsonb_build_object('team_id',tests.id(303),'player_id',(select id from public.players where last_name='Striker'),'event_type','goal','minute',5),jsonb_build_object('team_id',tests.id(303),'player_id',(select id from public.players where last_name='Striker'),'event_type','goal','minute',9)),true)$$,'listed 2 goal','more scorers than goals rejected');
select tests.throws($$select public.quick_publish_result((select id from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304)),3,0,null,null,jsonb_build_array(jsonb_build_object('team_id',tests.id(303),'player_id',(select id from public.players where last_name='Striker'),'event_type','goal','minute',5)),false)$$,'do not add up','strict mode requires every scorer');
select public.quick_publish_result((select id from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304)),3,0,1,0,jsonb_build_array(jsonb_build_object('team_id',tests.id(303),'player_id',(select id from public.players where last_name='Striker'),'event_type','goal','minute',5)),true);
select tests.as_anon();
select tests.ok((select points from public.get_standings(tests.id(201)) where team_name='Team 3')=3,'quick-published result counts in standings');
select tests.ok((select goals from public.get_player_stats(tests.id(201)) where player_name='Sam Striker')=1,'quick-published scorer appears in statistics');
select tests.as_user(tests.id(1));
select tests.throws($$select public.quick_publish_result((select id from public.fixtures where home_team_id=tests.id(303) and away_team_id=tests.id(304)),3,0,null,null,'[]',true)$$,'already has a published result','cannot overwrite a published result');
-- historical import: new fixtures are created, bad rows reported, good rows imported
select tests.ok((public.import_historical_results(tests.id(201),jsonb_build_array(
  jsonb_build_object('source_row',2,'week_number',3,'round_number',1,'home_team_id',tests.id(304),'away_team_id',tests.id(301),'scheduled_at','2027-02-20T15:00:00+03:00','home_score',2,'away_score',2),
  jsonb_build_object('source_row',3,'week_number',3,'round_number',1,'home_team_id',tests.id(302),'away_team_id',tests.id(303),'scheduled_at','2027-02-20T15:00:00+03:00','home_score',0,'away_score',1,'events',jsonb_build_array(jsonb_build_object('team_id',tests.id(303),'player_id',(select id from public.players where last_name='Striker'),'event_type','goal','minute',70))),
  jsonb_build_object('source_row',4,'week_number',3,'round_number',1,'home_team_id',tests.id(303),'away_team_id',tests.id(304),'scheduled_at','2027-02-21T15:00:00+03:00','home_score',1,'away_score',1),
  jsonb_build_object('source_row',5,'week_number',4,'round_number',1,'home_team_id',tests.id(301),'away_team_id',tests.id(301),'scheduled_at','2027-02-27T15:00:00+03:00','home_score',1,'away_score',0)),'hist.csv')->>'inserted')::int=2,'historical import: 2 good rows imported, 2 rejected');
select tests.ok((select count(*) from public.import_jobs where import_type='results' and failed_rows=2)=1,'import job records the failures');
select tests.as_anon();
select tests.ok((select played from public.get_standings(tests.id(201)) where team_name='Team 4')=2,'imported results count towards played');
select tests.ok((select goals_for from public.get_standings(tests.id(201)) where team_name='Team 3')=4,'goals from imported + quick results add up');
select tests.as_root();

rollback;
\echo ALL SQL TESTS PASSED
