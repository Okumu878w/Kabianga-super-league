'use server';
import { z } from 'zod';
import { requireWriter } from '@/lib/auth';
import { act, must, safeBack, str, strOrNull, num, UserError } from '@/lib/action';
import { buildSchedule, type GeneratedFixture } from '@/lib/fixtures/schedule';
import { revalidatePath } from 'next/cache';

const COMP = ['super_admin', 'competition_admin'] as const;
export async function createFixture(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/fixtures');
  return act(back, async () => {
    const v = z.object({ season_id: z.string().uuid('Choose a season'), home: z.string().uuid('Choose the home team'), away: z.string().uuid('Choose the away team'), week: z.number().int().min(1).max(200), at: z.string().min(16, 'Choose a match date and kickoff time'), round: z.number().int().min(1).max(4) })
      .refine((x) => x.home !== x.away, { message: 'Home and away teams must be different' })
      .parse({ season_id: str(fd, 'season_id'), home: str(fd, 'home_team_id'), away: str(fd, 'away_team_id'), week: num(fd, 'week_number'), at: str(fd, 'kickoff'), round: num(fd, 'round_number') ?? 1 });
    const r = must(await s.supabase.rpc('create_fixtures_batch', { p_season: v.season_id, p_fixtures: [{ week_number: v.week, home_team_id: v.home, away_team_id: v.away, scheduled_at: `${v.at}:00+03:00`, venue: strOrNull(fd, 'venue'), round_number: v.round, notes: strOrNull(fd, 'notes') }], p_job_type: 'manual', p_config: {}, p_partial: false, p_replace_unpublished: false, p_file_name: null })) as any;
    if (fd.get('publish') === 'on') must(await s.supabase.rpc('publish_fixtures', { p_season: v.season_id, p_matchweek: null }));
    return r.inserted === 1 ? (fd.get('publish') === 'on' ? 'Fixture created and published' : 'Fixture created successfully (saved as draft)') : 'No fixture created';
  });
}
export async function updateFixture(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/fixtures');
  return act(back, async () => {
    const id = str(fd, 'id'); const row: any = {};
    if (fd.get('swap') === '1') { const { data: f } = await s.supabase.from('fixtures').select('home_team_id,away_team_id').eq('id', id).single(); if (!f) throw new UserError('Fixture not found'); row.home_team_id = f.away_team_id; row.away_team_id = f.home_team_id; }
    if (str(fd, 'kickoff')) row.kickoff_at = `${str(fd, 'kickoff')}:00+03:00`;
    if (fd.has('venue')) row.venue = strOrNull(fd, 'venue');
    if (str(fd, 'status')) row.status = z.enum(['scheduled', 'live', 'half_time', 'postponed', 'cancelled', 'abandoned']).parse(str(fd, 'status'));
    if (fd.has('notes')) row.notes = strOrNull(fd, 'notes');
    if (!Object.keys(row).length) throw new UserError('Nothing to change');
    must(await s.supabase.from('fixtures').update(row).eq('id', id).select('id').single()); return fd.get('swap') === '1' ? 'Home and away teams swapped' : 'Fixture updated successfully';
  });
}
export async function deleteFixture(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/fixtures');
  return act(back, async () => { must(await s.supabase.from('fixtures').delete().eq('id', str(fd, 'id')).eq('is_published', false).select('id').single()); return 'Draft fixture deleted'; });
}
export async function publishFixtures(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/fixtures');
  return act(back, async () => { const n = must(await s.supabase.rpc('publish_fixtures', { p_season: str(fd, 'season_id'), p_matchweek: strOrNull(fd, 'matchweek_id') })); revalidatePath('/', 'layout'); return `${n} fixture(s) published`; });
}
export async function saveMatchweek(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/matchweeks');
  return act(back, async () => {
    const row = { label: strOrNull(fd, 'label'), start_date: strOrNull(fd, 'start_date'), end_date: strOrNull(fd, 'end_date'), status: z.enum(['scheduled', 'in_progress', 'completed']).parse(str(fd, 'status') || 'scheduled') };
    if (row.start_date && row.end_date && row.end_date < row.start_date) throw new UserError('End date cannot be before the start date');
    must(await s.supabase.from('matchweeks').update(row).eq('id', str(fd, 'id')).select('id').single()); return 'Matchweek updated successfully';
  });
}

// ---------- generator ----------
const genSchema = z.object({
  seasonId: z.string().uuid(), teamIds: z.array(z.string().uuid()).min(2, 'Select at least two teams'), legs: z.number().int().min(1).max(4), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
  matchDays: z.array(z.number().int().min(0).max(6)).min(1, 'Choose at least one match day'), kickoffTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1, 'Add at least one kickoff time'), intervalWeeks: z.number().int().min(1).max(8),
  minRestDays: z.number().int().min(0).max(14), venueMode: z.enum(['home_ground', 'fixed', 'rotate']), venues: z.array(z.string().max(120)).optional(), firstMatchweek: z.number().int().min(1).max(200).optional(), unavailable: z.record(z.string(), z.array(z.string())).optional(),
});
export type GenInput = z.infer<typeof genSchema>;
export async function previewGenerator(input: GenInput) {
  try {
    const s = await requireWriter([...COMP]); const v = genSchema.parse(input);
    const { data: ct } = await s.supabase.from('competition_teams').select('team:teams(id,name,short_name,home_venue)').eq('season_id', v.seasonId);
    const teams = (ct ?? []).map((x: any) => x.team); const allowed = new Set(teams.map((t: any) => t.id));
    if (v.teamIds.some((t) => !allowed.has(t))) throw new UserError('A selected team is not registered in this season');
    const res = buildSchedule({ ...v, utcOffset: '+03:00', homeVenues: Object.fromEntries(teams.map((t: any) => [t.id, t.home_venue])) });
    const names = Object.fromEntries(teams.map((t: any) => [t.id, t.name]));
    return { ok: true as const, fixtures: res.fixtures, warnings: res.warnings, byes: res.byes.map((b) => ({ ...b, name: names[b.team_id] })), names, matchesPerTeam: res.matchesPerTeam };
  } catch (e: any) { return { ok: false as const, error: e?.issues ? e.issues.map((i: any) => i.message).join('; ') : e?.message ?? 'Could not generate fixtures' }; }
}
export async function saveGenerated(seasonId: string, fixtures: GeneratedFixture[], config: GenInput, replaceUnpublished: boolean, publish: boolean) {
  try {
    const s = await requireWriter([...COMP]);
    if (!fixtures.length) throw new UserError('There are no fixtures to save');
    const rows = fixtures.map((f) => ({ week_number: f.week_number, home_team_id: f.home_team_id, away_team_id: f.away_team_id, scheduled_at: f.scheduled_at, venue: f.venue, round_number: f.round_number }));
    const r = must(await s.supabase.rpc('create_fixtures_batch', { p_season: seasonId, p_fixtures: rows, p_job_type: 'generator', p_config: config, p_partial: false, p_replace_unpublished: replaceUnpublished, p_file_name: null })) as any;
    if (publish) must(await s.supabase.rpc('publish_fixtures', { p_season: seasonId, p_matchweek: null }));
    revalidatePath('/', 'layout');
    return { ok: true as const, message: `${r.inserted} fixtures saved${publish ? ' and published' : ' as drafts'}${r.replaced ? ` (replaced ${r.replaced} unpublished)` : ''}` };
  } catch (e: any) { return { ok: false as const, error: e?.message ?? 'Could not save fixtures' }; }
}
