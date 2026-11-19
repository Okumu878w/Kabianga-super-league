import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { hasSupabase } from '@/lib/site';

/** Safe wrapper: public pages degrade to empty states if Supabase is unreachable or not yet configured. */
async function q<T>(fn: (s: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ data: T | null; error: any }>, fallback: T): Promise<T> {
  if (!hasSupabase()) return fallback;
  try { const s = await createClient(); const { data, error } = await fn(s); if (error) { console.error('[data]', error.message); return fallback; } return data ?? fallback; }catch (e: any) { if (e?.digest === 'DYNAMIC_SERVER_USAGE' || e?.digest === 'NEXT_STATIC_GEN_BAILOUT') throw e; console.error('[data]', e); return fallback; }
}
const TEAM = 'id,name,short_name,slug,logo_url,home_venue';
export const FIXTURE_SELECT = `id,kickoff_at,venue,status,home_score,away_score,halftime_home_score,halftime_away_score,round_number,result_status,is_published,competition_id,season_id,matchweek:matchweeks(id,week_number,label),home:teams!fixtures_home_team_id_fkey(${TEAM}),away:teams!fixtures_away_team_id_fkey(${TEAM}),competition:competitions(name,slug)`;

export type Ctx = { competitions: any[]; competition: any | null; seasons: any[]; season: any | null };
/** Resolves ?c=<slug>&s=<seasonId> into the selected competition + season (defaults: first competition, its current season). */
export const getContext = cache(async (c?: string, s?: string): Promise<Ctx> => {
  const competitions = await q((sb) => sb.from('competitions').select('id,name,slug,description,format,status,logo_url,start_date,end_date,points_win,points_draw,points_loss,tie_break_rules,rules').eq('is_published', true).order('name'), [] as any[]);
  const competition = competitions.find((x) => x.slug === c) ?? competitions[0] ?? null;
  const seasons = competition ? await q((sb) => sb.from('seasons').select('id,name,is_current,status,starts_on,ends_on').eq('competition_id', competition.id).order('starts_on', { ascending: false, nullsFirst: false }), [] as any[]) : [];
  const season = seasons.find((x) => x.id === s) ?? seasons.find((x) => x.is_current) ?? seasons[0] ?? null;
  return { competitions, competition, seasons, season };
});
export const qs = (c?: string | null, s?: string | null, extra: Record<string, string | undefined> = {}) => { const p = new URLSearchParams(); if (c) p.set('c', c); if (s) p.set('s', s); for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v); const t = p.toString(); return t ? `?${t}` : ''; };

export const getStandings = (seasonId: string) => q((sb) => sb.rpc('get_standings', { p_season: seasonId }), [] as any[]);
export const getPlayerStats = (seasonId: string, matchweek?: string) => q((sb) => sb.rpc('get_player_stats', { p_season: seasonId, p_matchweek: matchweek ?? null }), [] as any[]);
export const getFixtures = (seasonId: string, o: { published?: boolean; team?: string; week?: string; from?: string; to?: string; results?: boolean; limit?: number; ascending?: boolean } = {}) => q((sb) => {
  let x = sb.from('fixtures').select(FIXTURE_SELECT).eq('season_id', seasonId);
  if (o.results) x = x.eq('result_status', 'published'); else if (o.results === false) x = x.neq('result_status', 'published');
  if (o.team) x = x.or(`home_team_id.eq.${o.team},away_team_id.eq.${o.team}`);
  if (o.week) x = x.eq('matchweek_id', o.week);
  if (o.from) x = x.gte('kickoff_at', `${o.from}T00:00:00+03:00`);
  if (o.to) x = x.lte('kickoff_at', `${o.to}T23:59:59+03:00`);
  x = x.order('kickoff_at', { ascending: o.ascending ?? true });
  if (o.limit) x = x.limit(o.limit);
  return x;
}, [] as any[]);
export const getMatchweeks = (seasonId: string) => q((sb) => sb.from('matchweeks').select('id,week_number,label,start_date,end_date,status').eq('season_id', seasonId).order('week_number'), [] as any[]);
export const getSeasonTeams = (seasonId: string) => q((sb) => sb.from('competition_teams').select(`team:teams(${TEAM},coach_name,description)`).eq('season_id', seasonId), [] as any[]).then((r) => r.map((x: any) => x.team).filter(Boolean).sort((a: any, b: any) => a.name.localeCompare(b.name)));
export const getNews = (o: { limit?: number; featured?: boolean } = {}) => q((sb) => { let x = sb.from('news_articles').select('id,title,slug,excerpt,cover_image_url,category,published_at,is_featured').in('status', ['published', 'scheduled']).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }); if (o.featured) x = x.eq('is_featured', true); if (o.limit) x = x.limit(o.limit); return x; }, [] as any[]);
export const getLeagueSettings = cache(() => q((sb) => sb.from('league_settings').select('league_name,logo_url,contact_email,contact_phone,social_links').maybeSingle(), null as any));
export const getPlayerOfWeek = (seasonId: string, limit = 1) => q((sb) => sb.from('awards').select('id,title,description,photo_url,stats,week_number,published_at,player:players(id,full_name,slug,photo_url,position),team:teams(name,short_name,logo_url),matchweek:matchweeks(week_number,label)').eq('season_id', seasonId).eq('award_type', 'player_of_week').eq('is_published', true).order('published_at', { ascending: false, nullsFirst: false }).limit(limit), [] as any[]);
export const getTeamsOfWeek = (seasonId: string, limit = 1) => q((sb) => sb.from('team_of_week').select('id,formation,description,matchweek:matchweeks(week_number,label),players:team_of_week_players(position_slot,display_order,player:players(id,full_name,slug,photo_url),team:teams(name,short_name))').eq('season_id', seasonId).eq('published', true).order('created_at', { ascending: false }).limit(limit), [] as any[]);
