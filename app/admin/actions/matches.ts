'use server';
import { z } from 'zod';
import { requireWriter } from '@/lib/auth';
import { act, must, safeBack, str, strOrNull, num, UserError } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { buildEvents, type SquadPlayer } from '@/lib/results/scorers';

const ALL = ['super_admin', 'competition_admin', 'editor'] as const;
const back = (fd: FormData, id: string) => safeBack(fd.get('_back'), `/admin/matches/${id}`);
const fx = (fd: FormData) => z.string().uuid('Invalid fixture').parse(str(fd, 'fixture_id'));

export async function saveReport(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => {
    const hs = num(fd, 'home'), as_ = num(fd, 'away'), hh = num(fd, 'ht_home'), ha = num(fd, 'ht_away');
    for (const [n, v] of [['Home score', hs], ['Away score', as_], ['Half-time home', hh], ['Half-time away', ha]] as const) if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) throw new UserError(`${n} must be a whole number between 0 and 30`);
    if ((hh === null) !== (ha === null)) throw new UserError('Enter both half-time scores or neither');
    const row = { fixture_id: id, referee: strOrNull(fd, 'referee'), attendance: num(fd, 'attendance'), match_summary: strOrNull(fd, 'summary'), draft_home_score: hs, draft_away_score: as_, draft_halftime_home: hh, draft_halftime_away: ha };
    must(await s.supabase.from('match_reports').upsert(row, { onConflict: 'fixture_id' }).select('id')); return 'Match report saved';
  });
}
const EVENT_TYPES = ['goal', 'own_goal', 'penalty_scored', 'penalty_missed', 'yellow_card', 'red_card', 'substitution_on', 'substitution_off', 'injury'] as const;
export async function addEvent(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => {
    const t = z.enum(EVENT_TYPES, { message: 'Choose an event type' }).parse(str(fd, 'event_type')); const minute = num(fd, 'minute');
    if (minute === null || minute < 0 || minute > 150) throw new UserError('Match minute must be between 0 and 150');
    must(await s.supabase.from('match_events').insert({ fixture_id: id, team_id: z.string().uuid('Choose a team').parse(str(fd, 'team_id')), player_id: strOrNull(fd, 'player_id'), secondary_player_id: ['goal'].includes(t) ? strOrNull(fd, 'secondary_player_id') : null, event_type: t, minute, added_time: num(fd, 'added_time'), notes: strOrNull(fd, 'notes') }).select('id').single());
    return 'Event recorded';
  });
}
export async function deleteRow(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd); const table = z.enum(['match_events', 'match_lineups']).parse(str(fd, 'table'));
  return act(back(fd, id), async () => { must(await s.supabase.from(table).delete().eq('id', str(fd, 'id')).select('id').single()); return 'Removed'; });
}
export async function addLineup(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => {
    must(await s.supabase.from('match_lineups').insert({ fixture_id: id, team_id: z.string().uuid('Choose a team').parse(str(fd, 'team_id')), player_id: z.string().uuid('Choose a player').parse(str(fd, 'player_id')), is_starting: fd.get('is_starting') === 'on', is_captain: fd.get('is_captain') === 'on', shirt_number: num(fd, 'shirt_number'), position: strOrNull(fd, 'position'), started_minute: fd.get('is_starting') === 'on' ? 0 : num(fd, 'started_minute'), ended_minute: num(fd, 'ended_minute') }).select('id').single());
    return 'Lineup entry added';
  });
}
export async function setResultStatus(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => { const to = z.enum(['submitted', 'verified', 'draft']).parse(str(fd, 'to')); must(await s.supabase.rpc('set_result_status', { p_fixture: id, p_to: to })); return to === 'submitted' ? 'Result submitted for verification' : to === 'verified' ? 'Result verified' : 'Result returned to draft'; });
}
export async function publishResult(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => { must(await s.supabase.rpc('publish_fixture_result', { p_fixture: id })); revalidatePath('/', 'layout'); return 'Results published successfully. Standings and statistics are updated.'; });
}
export async function reopenResult(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => { must(await s.supabase.rpc('reopen_published_result', { p_fixture: id, p_reason: str(fd, 'reason') })); revalidatePath('/', 'layout'); return 'Result reopened. Public standings and statistics no longer include it until it is published again.'; });
}
export async function reviewMatchSubmission(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => { const d = z.enum(['under_review', 'approved', 'rejected', 'changes_requested']).parse(str(fd, 'decision')); must(await s.supabase.rpc('review_match_submission', { p_id: str(fd, 'id'), p_decision: d, p_note: strOrNull(fd, 'note') })); return `Submission ${d.replace('_', ' ')}`; });
}
export async function applySubmission(fd: FormData) {
  const s = await requireWriter([...ALL]); const id = fx(fd);
  return act(back(fd, id), async () => { const r = must(await s.supabase.rpc('apply_match_submission', { p_id: str(fd, 'id'), p_apply_score: fd.get('apply_score') === 'on' })) as any; return `Loaded ${r.lineup_rows} lineup rows and ${r.event_rows} events into the official match draft. Nothing is published yet.`; });
}

/** One-step result entry: score + scorers -> published. For super admins / the competition admin only (enforced again inside the SQL function). */
export async function quickResult(fd: FormData) {
  const s = await requireWriter(['super_admin', 'competition_admin']); const id = fx(fd);
  return act(back(fd, id), async () => {
    const hs = num(fd, 'home'), as_ = num(fd, 'away'), hh = num(fd, 'ht_home'), ha = num(fd, 'ht_away');
    if (hs === null || as_ === null) throw new UserError('Enter both final scores');
    const { data: f } = await s.supabase.from('fixtures').select('season_id,home_team_id,away_team_id').eq('id', id).single(); if (!f) throw new UserError('Fixture not found');
    const { data: regs } = await s.supabase.from('player_registrations').select('team_id,player:players(id,full_name)').eq('season_id', f.season_id).eq('status', 'approved').in('team_id', [f.home_team_id, f.away_team_id]);
    const squads = new Map<string, SquadPlayer[]>(); for (const r of (regs ?? []) as any[]) (squads.get(r.team_id) ?? squads.set(r.team_id, []).get(r.team_id)!).push({ player_id: r.player.id, name: r.player.full_name });
    const h = buildEvents(f.home_team_id, f.away_team_id, str(fd, 'home_scorers'), squads); const a = buildEvents(f.away_team_id, f.home_team_id, str(fd, 'away_scorers'), squads);
    const errs = [...h.errors.map((e) => `Home scorers: ${e}`), ...a.errors.map((e) => `Away scorers: ${e}`)]; if (errs.length) throw new UserError(errs[0]);
    must(await s.supabase.rpc('quick_publish_result', { p_fixture: id, p_home: hs, p_away: as_, p_ht_home: hh, p_ht_away: ha, p_events: [...h.events, ...a.events], p_allow_unattributed: fd.get('unknown') === 'on' }));
    revalidatePath('/', 'layout'); return 'Result and scorers published. Standings and statistics are updated.';
  }, { limitKey: `quick:${s.user.id}`, max: 60 });
}
