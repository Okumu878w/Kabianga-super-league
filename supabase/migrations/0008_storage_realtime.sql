-- 0008: storage buckets + policies, realtime publication.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('league-logos','league-logos',true,2097152,array['image/png','image/jpeg','image/webp']),
 ('player-photos','player-photos',true,2097152,array['image/png','image/jpeg','image/webp']),
 ('news-covers','news-covers',true,5242880,array['image/png','image/jpeg','image/webp']),
 ('match-documents','match-documents',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- first folder of every manager upload must be the team id they manage: {team_id}/{file}
create or replace function public.storage_team_ok(object_name text) returns boolean language sql stable as $$
  select case when (storage.foldername(object_name))[1] ~ '^[0-9a-fA-F-]{36}$' then public.manages_team(((storage.foldername(object_name))[1])::uuid) else false end; $$;

create policy "public read public buckets" on storage.objects for select using (bucket_id in ('league-logos','player-photos','news-covers'));
create policy "admins write public buckets" on storage.objects for insert with check (bucket_id in ('league-logos','player-photos','news-covers') and public.is_admin());
create policy "admins update public buckets" on storage.objects for update using (bucket_id in ('league-logos','player-photos','news-covers') and public.is_admin());
create policy "admins delete public buckets" on storage.objects for delete using (bucket_id in ('league-logos','player-photos','news-covers') and public.is_admin());
create policy "managers upload team files" on storage.objects for insert with check (bucket_id in ('player-photos','match-documents') and public.storage_team_ok(name));
create policy "managers delete own uploads" on storage.objects for delete using (bucket_id in ('player-photos','match-documents') and owner=auth.uid() and public.storage_team_ok(name));
create policy "match documents read" on storage.objects for select using (bucket_id='match-documents' and (public.is_staff() or public.storage_team_ok(name)));

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.fixtures; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.manager_notifications; exception when duplicate_object then null; end;
  end if; end $$;
-- Realtime respects RLS: unpublished fixtures and other users' notifications are never broadcast to unauthorised clients.
