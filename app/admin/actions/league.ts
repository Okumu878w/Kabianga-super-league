'use server';
import { z } from 'zod';
import { requireWriter, requireAdmin } from '@/lib/auth';
import { act, must, safeBack, str, strOrNull, num, UserError } from '@/lib/action';
import { uploadFile } from '@/lib/upload';
import { revalidatePath } from 'next/cache';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TIEBREAKS: Record<string, string[]> = { gd_gf: ['goal_difference', 'goals_for'], gf_gd: ['goals_for', 'goal_difference'], gd_gf_w: ['goal_difference', 'goals_for', 'wins'], w_gd_gf: ['wins', 'goal_difference', 'goals_for'] };
const competitionSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(80), description: z.string().max(1000).nullable(), format: z.enum(['league', 'knockout', 'group_stage', 'group_knockout']),
  status: z.enum(['draft', 'active', 'completed', 'archived']), points_win: z.number().int().min(0).max(10), points_draw: z.number().int().min(0).max(10), points_loss: z.number().int().min(0).max(10),
  clean_sheet_min_minutes: z.number().int().min(0).max(120), rules: z.string().max(5000).nullable(), start_date: z.string().nullable(), end_date: z.string().nullable(),
}).refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, { message: 'End date cannot be before the start date', path: ['end_date'] });

export async function saveCompetition(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/competitions');
  return act(back, async () => {
    const id = str(fd, 'id'); const v = competitionSchema.parse({ name: str(fd, 'name'), description: strOrNull(fd, 'description'), format: str(fd, 'format') || 'league', status: str(fd, 'status') || 'draft', points_win: num(fd, 'points_win') ?? 3, points_draw: num(fd, 'points_draw') ?? 1, points_loss: num(fd, 'points_loss') ?? 0, clean_sheet_min_minutes: num(fd, 'clean_sheet_min_minutes') ?? 45, rules: strOrNull(fd, 'rules'), start_date: strOrNull(fd, 'start_date'), end_date: strOrNull(fd, 'end_date') });
    const row: any = { ...v, tie_break_rules: TIEBREAKS[str(fd, 'tie_break')] ?? TIEBREAKS.gd_gf, is_published: fd.get('is_published') === 'on' };
    const logo = await uploadFile(s.supabase, 'league-logos', 'competitions', fd.get('logo') as File | null); if (logo) row.logo_url = logo;
    if (id) { must(await s.supabase.from('competitions').update(row).eq('id', id).select('id').single()); }
    else { row.slug = slugify(str(fd, 'slug') || v.name); must(await s.supabase.from('competitions').insert(row).select('id').single()); }
    revalidatePath('/', 'layout'); return id ? 'Competition updated successfully' : 'Competition created successfully';
  }, { limitKey: `comp:${s.user.id}` });
}
export async function saveSeason(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/seasons');
  return act(back, async () => {
    const v = z.object({ competition_id: z.string().uuid('Choose a competition'), name: z.string().min(2).max(40), starts_on: z.string().nullable(), ends_on: z.string().nullable(), status: z.enum(['upcoming', 'active', 'completed', 'archived']) }).refine((x) => !x.starts_on || !x.ends_on || x.ends_on >= x.starts_on, { message: 'End date cannot be before the start date', path: ['ends_on'] })
      .parse({ competition_id: str(fd, 'competition_id'), name: str(fd, 'name'), starts_on: strOrNull(fd, 'starts_on'), ends_on: strOrNull(fd, 'ends_on'), status: str(fd, 'status') || 'upcoming' });
    const id = str(fd, 'id'); const current = fd.get('is_current') === 'on';
    if (current) must(await s.supabase.from('seasons').update({ is_current: false }).eq('competition_id', v.competition_id).select('id'));
    if (id) must(await s.supabase.from('seasons').update({ ...v, is_current: current }).eq('id', id).select('id').single());
    else must(await s.supabase.from('seasons').insert({ ...v, is_current: current }).select('id').single()); // always a NEW row: past seasons are never overwritten
    revalidatePath('/', 'layout'); return id ? 'Season updated successfully' : 'Season created successfully';
  });
}
export async function setSeasonStatus(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/seasons');
  return act(back, async () => { const st = z.enum(['upcoming', 'active', 'completed', 'archived']).parse(str(fd, 'status')); must(await s.supabase.from('seasons').update({ status: st, ...(st === 'completed' || st === 'archived' ? { is_current: false } : {}) }).eq('id', str(fd, 'id')).select('id').single()); revalidatePath('/', 'layout'); return `Season marked ${st}`; });
}
export async function setSeasonTeams(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/seasons');
  return act(back, async () => {
    const seasonId = z.string().uuid().parse(str(fd, 'season_id')); const wanted = new Set(fd.getAll('team_ids').map(String));
    const { data: season } = await s.supabase.from('seasons').select('competition_id').eq('id', seasonId).single(); if (!season) throw new UserError('Season not found');
    const have = new Set(((await s.supabase.from('competition_teams').select('team_id').eq('season_id', seasonId)).data ?? []).map((r: any) => r.team_id));
    const add = [...wanted].filter((t) => !have.has(t)); const remove = [...have].filter((t) => !wanted.has(t));
    if (add.length) must(await s.supabase.from('competition_teams').insert(add.map((team_id) => ({ competition_id: season.competition_id, season_id: seasonId, team_id }))).select('id'));
    for (const t of remove) { const { error } = await s.supabase.from('competition_teams').delete().eq('season_id', seasonId).eq('team_id', t); if (error) throw new UserError('A team that already has fixtures or players in this season cannot be removed. Remove its fixtures first.'); }
    return `Season teams updated (${add.length} added, ${remove.length} removed)`;
  });
}

const teamSchema = z.object({ name: z.string().min(2, 'Team name is required').max(60), short_name: z.string().min(2, 'Short name is required').max(5, 'Short name can be at most 5 characters'), home_venue: z.string().max(120).nullable(), coach_name: z.string().max(80).nullable(), description: z.string().max(1500).nullable() });
export async function saveTeam(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/teams');
  return act(back, async () => {
    const id = str(fd, 'id'); const v = teamSchema.parse({ name: str(fd, 'name'), short_name: str(fd, 'short_name').toUpperCase(), home_venue: strOrNull(fd, 'home_venue'), coach_name: strOrNull(fd, 'coach_name'), description: strOrNull(fd, 'description') });
    const row: any = { ...v, is_active: fd.get('is_active') === 'on' };
    let teamId = id;
    if (id) must(await s.supabase.from('teams').update(row).eq('id', id).select('id').single());
    else teamId = must(await s.supabase.from('teams').insert({ ...row, slug: slugify(v.name) }).select('id').single()).id;
    const crest = await uploadFile(s.supabase, 'league-logos', `teams/${teamId}`, fd.get('crest') as File | null); if (crest) must(await s.supabase.from('teams').update({ logo_url: crest }).eq('id', teamId).select('id').single());
    const email = strOrNull(fd, 'contact_email'), phone = strOrNull(fd, 'contact_phone');
    if (email || phone) must(await s.supabase.from('team_private_details').upsert({ team_id: teamId, contact_email: email, contact_phone: phone, updated_at: new Date().toISOString() }).select('team_id'));
    revalidatePath('/', 'layout'); return id ? 'Team updated successfully' : 'Team created successfully';
  });
}

const playerData = z.object({ first_name: z.string().min(1, 'First name is required').max(60), last_name: z.string().min(1, 'Last name is required').max(60), position: z.enum(['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], { message: 'Choose a position' }), squad_number: z.number().int().min(1, 'Squad number must be 1–99').max(99, 'Squad number must be 1–99'), date_of_birth: z.string().nullable(), nationality: z.string().max(60).nullable() });
export async function registerPlayer(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/players');
  return act(back, async () => {
    const d = playerData.parse({ first_name: str(fd, 'first_name'), last_name: str(fd, 'last_name'), position: str(fd, 'position'), squad_number: num(fd, 'squad_number'), date_of_birth: strOrNull(fd, 'date_of_birth'), nationality: strOrNull(fd, 'nationality') });
    const photo = await uploadFile(s.supabase, 'player-photos', 'admin', fd.get('photo') as File | null);
    must(await s.supabase.rpc('register_player', { p_team: z.string().uuid('Choose a team').parse(str(fd, 'team_id')), p_season: z.string().uuid('Choose a season').parse(str(fd, 'season_id')), p_data: { ...d, photo_url: photo } }));
    return 'Player registered successfully';
  }, { limitKey: `reg:${s.user.id}`, max: 60 });
}
export async function updatePlayer(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/players');
  return act(back, async () => {
    const row: any = { first_name: str(fd, 'first_name'), last_name: str(fd, 'last_name'), nationality: strOrNull(fd, 'nationality'), date_of_birth: strOrNull(fd, 'date_of_birth'), biography: strOrNull(fd, 'biography') };
    if (!row.first_name || !row.last_name) throw new UserError('First and last name are required');
    const photo = await uploadFile(s.supabase, 'player-photos', 'admin', fd.get('photo') as File | null); if (photo) row.photo_url = photo;
    must(await s.supabase.from('players').update(row).eq('id', str(fd, 'id')).select('id').single()); return 'Player updated successfully';
  });
}
export async function transferPlayer(fd: FormData) {
  await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/players');
  return act(back, async () => { const s = await requireAdmin(); must(await s.supabase.rpc('transfer_player', { p_registration: str(fd, 'registration_id'), p_new_team: z.string().uuid('Choose the new team').parse(str(fd, 'new_team_id')), p_squad_number: num(fd, 'squad_number') })); return 'Player transferred. Historical statistics stay with the previous team.'; });
}
export async function releasePlayer(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const back = safeBack(fd.get('_back'), '/admin/players');
  return act(back, async () => { must(await s.supabase.from('player_registrations').update({ released_at: new Date().toISOString() }).eq('id', str(fd, 'registration_id')).select('id').single()); return 'Registration deactivated'; });
}
export async function saveSettings(fd: FormData) {
  const s = await requireWriter(['super_admin']); const back = safeBack(fd.get('_back'), '/admin/settings');
  return act(back, async () => {
    const social: Record<string, string> = {}; for (const k of ['facebook', 'x', 'instagram', 'youtube', 'tiktok']) { const v = str(fd, k); if (v) { if (!/^https:\/\//.test(v)) throw new UserError(`${k} link must start with https://`); social[k] = v; } }
    const row: any = { league_name: str(fd, 'league_name') || 'Kabianga Super League', contact_email: strOrNull(fd, 'contact_email'), contact_phone: strOrNull(fd, 'contact_phone'), social_links: social, updated_at: new Date().toISOString() };
    const logo = await uploadFile(s.supabase, 'league-logos', 'league', fd.get('logo') as File | null); if (logo) row.logo_url = logo;
    must(await s.supabase.from('league_settings').update(row).eq('id', true).select('id').single()); revalidatePath('/', 'layout'); return 'Settings saved';
  });
}
