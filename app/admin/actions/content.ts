'use server';
import { z } from 'zod';
import { requireWriter } from '@/lib/auth';
import { act, must, safeBack, str, strOrNull, num, UserError } from '@/lib/action';
import { uploadFile } from '@/lib/upload';
import { revalidatePath } from 'next/cache';

const ALL = ['super_admin', 'competition_admin', 'editor'] as const;
export async function savePotw(fd: FormData) {
  const s = await requireWriter([...ALL]); const back = safeBack(fd.get('_back'), '/admin/awards');
  return act(back, async () => {
    const seasonId = z.string().uuid('Choose a season').parse(str(fd, 'season_id')); const mw = z.string().uuid('Choose a matchweek').parse(str(fd, 'matchweek_id')); const player = z.string().uuid('Choose a player').parse(str(fd, 'player_id'));
    const { data: season } = await s.supabase.from('seasons').select('competition_id').eq('id', seasonId).single(); const { data: week } = await s.supabase.from('matchweeks').select('week_number').eq('id', mw).single();
    const { data: reg } = await s.supabase.from('player_registrations').select('team_id').eq('player_id', player).eq('season_id', seasonId).eq('status', 'approved').order('registered_at', { ascending: false }).limit(1).maybeSingle();
    if (!season || !week || !reg) throw new UserError('That player is not a registered player in this season');
    const stats: Record<string, number> = {}; for (const k of ['goals', 'assists', 'clean_sheets', 'rating']) { const v = num(fd, k); if (v !== null) stats[k] = v; }
    const photo = await uploadFile(s.supabase, 'player-photos', 'awards', fd.get('photo') as File | null);
    const publish = fd.get('publish') === 'on';
    const row: any = { season_id: seasonId, competition_id: season.competition_id, matchweek_id: mw, week_number: week.week_number, award_type: 'player_of_week', player_id: player, team_id: reg.team_id, title: 'Player of the Week', description: strOrNull(fd, 'description'), stats, is_published: publish, published_at: publish ? new Date().toISOString() : null };
    if (photo) row.photo_url = photo;
    const id = str(fd, 'id');
    if (id) must(await s.supabase.from('awards').update(row).eq('id', id).select('id').single()); else must(await s.supabase.from('awards').insert(row).select('id').single());
    revalidatePath('/', 'layout'); return publish ? 'Player of the Week published' : 'Player of the Week saved as draft';
  });
}
export async function togglePublish(fd: FormData) {
  const s = await requireWriter([...ALL]); const back = safeBack(fd.get('_back'), '/admin/awards'); const table = z.enum(['awards', 'team_of_week']).parse(str(fd, 'table'));
  return act(back, async () => { const on = str(fd, 'to') === '1'; const patch = table === 'awards' ? { is_published: on, published_at: on ? new Date().toISOString() : null } : { published: on }; must(await s.supabase.from(table).update(patch).eq('id', str(fd, 'id')).select('id').single()); revalidatePath('/', 'layout'); return on ? 'Published' : 'Unpublished'; });
}
const SLOTS: Record<string, [number, number, number]> = { '4-4-2': [4, 4, 2], '4-3-3': [4, 3, 3], '3-5-2': [3, 5, 2], '4-2-3-1': [4, 5, 1] };
export async function saveTotw(fd: FormData) {
  const s = await requireWriter([...ALL]); const back = safeBack(fd.get('_back'), '/admin/team-of-the-week');
  return act(back, async () => {
    const formation = z.enum(['4-4-2', '4-3-3', '3-5-2', '4-2-3-1']).parse(str(fd, 'formation')); const [d, m, f] = SLOTS[formation];
    const seasonId = z.string().uuid('Choose a season').parse(str(fd, 'season_id')); const mw = z.string().uuid('Choose a matchweek').parse(str(fd, 'matchweek_id'));
    const pick = (k: string, n: number, label: string) => { const ids = fd.getAll(k).map(String).filter(Boolean); if (ids.length !== n) throw new UserError(`${formation} needs exactly ${n} ${label} (you picked ${ids.length})`); return ids; };
    const gk = pick('gk', 1, 'goalkeeper'), def = pick('def', d, 'defenders'), mid = pick('mid', m, 'midfielders'), fwd = pick('fwd', f, 'forwards');
    const all = [...gk, ...def, ...mid, ...fwd]; if (new Set(all).size !== 11) throw new UserError('A player cannot be selected twice');
    const { data: season } = await s.supabase.from('seasons').select('competition_id').eq('id', seasonId).single(); if (!season) throw new UserError('Season not found');
    const { data: regs } = await s.supabase.from('player_registrations').select('player_id,team_id,position').eq('season_id', seasonId).eq('status', 'approved').in('player_id', all);
    const byPlayer = new Map((regs ?? []).map((r: any) => [r.player_id, r])); if (all.some((p) => !byPlayer.has(p))) throw new UserError('Every player must be a registered player of this season');
    const wrongGk = byPlayer.get(gk[0])?.position !== 'Goalkeeper'; if (wrongGk) throw new UserError('The goalkeeper slot needs a registered goalkeeper');
    const { data: existing } = await s.supabase.from('team_of_week').select('id').eq('season_id', seasonId).eq('matchweek_id', mw).maybeSingle();
    const publish = fd.get('publish') === 'on'; let id = existing?.id as string | undefined;
    const row = { competition_id: season.competition_id, season_id: seasonId, matchweek_id: mw, formation, description: strOrNull(fd, 'description'), published: publish };
    if (id) { must(await s.supabase.from('team_of_week').update(row).eq('id', id).select('id').single()); must(await s.supabase.from('team_of_week_players').delete().eq('team_of_week_id', id).select('id')); }
    else id = must(await s.supabase.from('team_of_week').insert(row).select('id').single()).id;
    const slots = [...gk.map((p) => ['GK', p]), ...def.map((p) => ['DEF', p]), ...mid.map((p) => ['MID', p]), ...fwd.map((p) => ['FWD', p])];
    must(await s.supabase.from('team_of_week_players').insert(slots.map(([position_slot, p], i) => ({ team_of_week_id: id!, player_id: p, team_id: byPlayer.get(p)!.team_id, position_slot, display_order: i + 1 }))).select('id'));
    revalidatePath('/', 'layout'); return publish ? 'Team of the Week published' : 'Team of the Week saved as draft';
  });
}
export async function saveArticle(fd: FormData) {
  const s = await requireWriter([...ALL]); const back = safeBack(fd.get('_back'), '/admin/news');
  return act(back, async () => {
    const v = z.object({ title: z.string().min(4, 'Title must be at least 4 characters').max(160), body: z.string().min(10, 'Write the article body'), excerpt: z.string().max(300).nullable(), category: z.string().max(40).nullable(), status: z.enum(['draft', 'scheduled', 'published', 'archived']) }).parse({ title: str(fd, 'title'), body: str(fd, 'body'), excerpt: strOrNull(fd, 'excerpt'), category: strOrNull(fd, 'category'), status: str(fd, 'status') || 'draft' });
    let published_at: string | null = null;
    if (v.status === 'scheduled') { const when = str(fd, 'publish_at'); if (!when) throw new UserError('Choose a publication date and time'); published_at = `${when}:00+03:00`; if (new Date(published_at) <= new Date()) throw new UserError('Scheduled time must be in the future'); }
    if (v.status === 'published') published_at = strOrNull(fd, 'existing_published_at') ?? new Date().toISOString();
    const row: any = { ...v, published_at, is_published: v.status === 'published', is_featured: fd.get('is_featured') === 'on', author_id: s.user.id };
    const cover = await uploadFile(s.supabase, 'news-covers', 'covers', fd.get('cover') as File | null, { maxBytes: 5 * 1024 * 1024 }); if (cover) row.cover_image_url = cover;
    const id = str(fd, 'id');
    if (id) must(await s.supabase.from('news_articles').update(row).eq('id', id).select('id').single());
    else { row.slug = `${v.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)}-${Date.now().toString(36)}`; must(await s.supabase.from('news_articles').insert(row).select('id').single()); }
    revalidatePath('/news'); return { draft: 'Draft saved', scheduled: 'Article scheduled', published: 'Article published', archived: 'Article archived' }[v.status];
  });
}
