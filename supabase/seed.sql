-- DEVELOPMENT-ONLY DEMO DATA. Every record is labelled "[DEMO]". These are NOT real Kabianga Super League records.
-- Remove before production:  delete from public.competitions where name like '[DEMO]%';  delete from public.teams where name like '[DEMO]%';
--                            delete from public.players where first_name like '[DEMO]%';  delete from public.news_articles where slug like 'demo-%';
-- Run in the Supabase SQL editor (runs as postgres, so the result-workflow guards are bypassed through ksl.via_rpc).
select set_config('ksl.via_rpc','on',false);
insert into public.competitions(id,name,slug,description,is_published,status,format) values
 ('d0000000-0000-4000-8000-000000000001','[DEMO] Premier Division','demo-premier','Demonstration competition',true,'active','league'),
 ('d0000000-0000-4000-8000-000000000002','[DEMO] Division One','demo-division-one','Demonstration competition',true,'active','league') on conflict do nothing;
insert into public.seasons(id,competition_id,name,is_current,status) values
 ('d0000000-0000-4000-8000-0000000000a1','d0000000-0000-4000-8000-000000000001','2026/27 [DEMO]',true,'active'),
 ('d0000000-0000-4000-8000-0000000000a2','d0000000-0000-4000-8000-000000000002','2026/27 [DEMO]',true,'active') on conflict do nothing;
insert into public.teams(id,name,short_name,home_venue) select ('d0000000-0000-4000-8000-0000000001'||lpad(g::text,2,'0'))::uuid,'[DEMO] Team '||g,'D'||g,'[DEMO] Ground '||g from generate_series(1,6) g on conflict do nothing;
insert into public.competition_teams(competition_id,season_id,team_id) select 'd0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-0000000000a1',('d0000000-0000-4000-8000-0000000001'||lpad(g::text,2,'0'))::uuid from generate_series(1,4) g on conflict do nothing;
insert into public.competition_teams(competition_id,season_id,team_id) select 'd0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-0000000000a2',('d0000000-0000-4000-8000-0000000001'||lpad(g::text,2,'0'))::uuid from generate_series(5,6) g on conflict do nothing;
with p as (insert into public.players(first_name,last_name,position) select '[DEMO] Player',g::text,(array['Goalkeeper','Defender','Midfielder','Forward'])[1+(g%4)] from generate_series(1,16) g returning id,last_name,position)
insert into public.player_registrations(player_id,team_id,season_id,squad_number,position,status)
 select id,('d0000000-0000-4000-8000-0000000001'||lpad((1+(last_name::int-1)/4)::text,2,'0'))::uuid,'d0000000-0000-4000-8000-0000000000a1',1+((last_name::int-1)%4),position,'approved' from p;
insert into public.news_articles(title,slug,excerpt,body,status,published_at,category) values
 ('[DEMO] Welcome to the platform','demo-welcome','Demonstration article','This is demonstration content and not an official announcement.','published',now(),'Announcements') on conflict do nothing;
select set_config('ksl.via_rpc','off',false);
-- Fixtures and results for the demo are created through the admin UI (Fixtures -> Generate) so you can see the real workflow.
