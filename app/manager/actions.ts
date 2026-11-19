'use server';
import { z } from 'zod';
import { requireManager } from '@/lib/auth';
import { act, must, safeBack, str, strOrNull, num, UserError } from '@/lib/action';
import { uploadFile } from '@/lib/upload';
import { createClient } from '@/lib/supabase/server';

const owns = (s: Awaited<ReturnType<typeof requireManager>>, teamId: string) => { if (!s.teams.some((t: any) => t.team_id === teamId)) throw new UserError('You can only act for your own team.'); return teamId; };
const POS = z.enum(['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], { message: 'Choose a position' });
const status = (fd: FormData) => (str(fd, 'intent') === 'draft' ? 'draft' : 'submitted');

export async function submitPlayer(fd: FormData) {
  const s = await requireManager(); const back = safeBack(fd.get('_back'), '/manager/squad');
  return act(back, async () => {
    const team = owns(s, str(fd, 'team_id')); const season = z.string().uuid('Choose a season').parse(str(fd, 'season_id')); const type = z.enum(['registration', 'update', 'release', 'transfer']).parse(str(fd, 'type') || 'registration');
    const playerId = strOrNull(fd, 'player_id'); let data: Record<string, unknown> = {};
    if (type !== 'release') {
      const d = z.object({ first_name: z.string().min(1, 'First name is required').max(60), last_name: z.string().min(1, 'Last name is required').max(60), position: POS, squad_number: z.number().int().min(1, 'Squad number must be 1–99').max(99, 'Squad number must be 1–99'), date_of_birth: z.string().nullable(), nationality: z.string().max(60).nullable() })
        .parse({ first_name: str(fd, 'first_name'), last_name: str(fd, 'last_name'), position: str(fd, 'position'), squad_number: num(fd, 'squad_number'), date_of_birth: strOrNull(fd, 'date_of_birth'), nationality: strOrNull(fd, 'nationality') });
      const photo = await uploadFile(s.supabase, 'player-photos', team, fd.get('photo') as File | null); data = { ...d, ...(photo ? { photo_url: photo } : {}) };
    } else if (!playerId) throw new UserError('Choose the player to release');
    must(await s.supabase.from('player_registration_submissions').insert({ team_id: team, season_id: season, submitted_by: s.user.id, status: status(fd), submission_type: type, player_id: playerId, player_data: { ...data, ...(type === 'release' ? { reason: strOrNull(fd, 'reason') } : {}) } }).select('id').single());
    return type === 'release' ? 'Release request submitted for approval' : status(fd) === 'draft' ? 'Saved as a draft' : 'Registration submitted for approval';
  }, { limitKey: `mgr-player:${s.user.id}`, max: 60 });
}
export async function submitDraft(fd: FormData) {
  const s = await requireManager(); const back = safeBack(fd.get('_back'), '/manager/registrations'); const table = z.enum(['player_registration_submissions', 'match_submissions', 'team_change_requests', 'fixture_change_requests']).parse(str(fd, 'table'));
  return act(back, async () => { must(await s.supabase.from(table).update({ status: 'submitted', ...(table === 'match_submissions' ? { submitted_at: new Date().toISOString() } : {}) }).eq('id', str(fd, 'id')).select('id').single()); return 'Submitted for review'; });
}
export async function deleteDraft(fd: FormData) {
  const s = await requireManager(); const back = safeBack(fd.get('_back'), '/manager/registrations'); const table = z.enum(['player_registration_submissions', 'match_submissions']).parse(str(fd, 'table'));
  return act(back, async () => { must(await s.supabase.from(table).delete().eq('id', str(fd, 'id')).select('id').single()); return 'Draft deleted'; });
}
export async function saveTeamChange(fd: FormData) {
  const s = await requireManager(); const back = safeBack(fd.get('_back'), '/manager/team');
  return act(back, async () => {
    const team = owns(s, str(fd, 'team_id')); const changes: Record<string, string> = {};
    for (const k of ['description', 'home_venue', 'coach_name', 'contact_email', 'contact_phone']) { const v = str(fd, k); if (v && v !== str(fd, `old_${k}`)) changes[k] = v; }
    if (changes.contact_email) z.string().email('Enter a valid contact email').parse(changes.contact_email);
    const crest = await uploadFile(s.supabase, 'player-photos', `${team}`, fd.get('crest') as File | null); if (crest) changes.logo_url = crest;
    if (!Object.keys(changes).length) throw new UserError('Nothing has changed.');
    must(await s.supabase.from('team_change_requests').insert({ team_id: team, submitted_by: s.user.id, changes, status: 'submitted', change_type: 'profile' }).select('id').single());
    return 'Change request submitted. An administrator will review it; your team profile only changes once approved.';
  }, { limitKey: `mgr-team:${s.user.id}`, max: 20 });
}
export async function submitFixtureRequest(fd: FormData) {
  const s = await requireManager(); const back = safeBack(fd.get('_back'), '/manager/fixtures');
  return act(back, async () => {
    const team = owns(s, str(fd, 'team_id')); const type = z.enum(['reschedule', 'venue', 'postpone']).parse(str(fd, 'request_type')); const reason = str(fd, 'reason'); if (reason.length < 10) throw new UserError('Please explain the reason (at least 10 characters)');
    must(await s.supabase.from('fixture_change_requests').insert({ fixture_id: z.string().uuid().parse(str(fd, 'fixture_id')), team_id: team, submitted_by: s.user.id, request_type: type, requested_kickoff: str(fd, 'kickoff') ? `${str(fd, 'kickoff')}:00+03:00` : null, requested_venue: strOrNull(fd, 'venue'), reason, status: 'submitted' }).select('id').single());
    return 'Request sent to the administrators. The official fixture is unchanged until it is approved.';
  }, { limitKey: `mgr-fx:${s.user.id}`, max: 20 });
}
const payload = z.object({ lineup: z.array(z.object({ player_id: z.string().uuid(), is_starting: z.boolean(), is_captain: z.boolean().optional(), position: z.string().nullable().optional(), shirt_number: z.number().nullable().optional(), started_minute: z.number().nullable().optional(), ended_minute: z.number().nullable().optional() })).max(30),
  events: z.array(z.object({ event_type: z.enum(['goal', 'own_goal', 'penalty_scored', 'penalty_missed', 'yellow_card', 'red_card', 'substitution_on', 'substitution_off', 'injury']), player_id: z.string().uuid().nullable(), secondary_player_id: z.string().uuid().nullable().optional(), minute: z.number().int().min(0).max(150), added_time: z.number().nullable().optional(), notes: z.string().max(200).nullable().optional() })).max(80) });
export async function saveMatchSubmission(fd: FormData) {
  const s = await requireManager(); const fixtureId = z.string().uuid().parse(str(fd, 'fixture_id')); const back = safeBack(fd.get('_back'), `/manager/submissions/${fixtureId}`);
  return act(back, async () => {
    const team = owns(s, str(fd, 'team_id')); const p = payload.parse(JSON.parse(str(fd, 'payload') || '{}'));
    const hs = num(fd, 'home_score'), as_ = num(fd, 'away_score'); for (const v of [hs, as_]) if (v !== null && (!Number.isInteger(v) || v < 0 || v > 30)) throw new UserError('Scores must be whole numbers between 0 and 30');
    const docs: string[] = []; for (const f of fd.getAll('documents') as File[]) { const path = await uploadFile(s.supabase, 'match-documents', `${team}/${fixtureId}`, f, { allowPdf: true, maxBytes: 8 * 1024 * 1024 }); if (path) docs.push(path); }
    const { data: open } = await s.supabase.from('match_submissions').select('id,evidence_urls,version').eq('fixture_id', fixtureId).eq('team_id', team).in('status', ['draft', 'changes_requested']).maybeSingle();
    const { data: latest } = await s.supabase.from('match_submissions').select('version').eq('fixture_id', fixtureId).eq('team_id', team).order('version', { ascending: false }).limit(1).maybeSingle();
    const row: any = { fixture_id: fixtureId, team_id: team, submitted_by: s.user.id, status: status(fd), home_score: hs, away_score: as_, formation: strOrNull(fd, 'formation'), observations: strOrNull(fd, 'observations'), lineup: p.lineup, events: p.events, submitted_at: status(fd) === 'submitted' ? new Date().toISOString() : null };
    if (open) { row.evidence_urls = [...(open.evidence_urls ?? []), ...docs]; must(await s.supabase.from('match_submissions').update(row).eq('id', open.id).select('id').single()); }
    else { row.evidence_urls = docs; row.version = (latest?.version ?? 0) + 1; must(await s.supabase.from('match_submissions').insert(row).select('id').single()); }
    return status(fd) === 'draft' ? 'Draft saved' : 'Match information submitted for administrator review. It does not change the official result.';
  }, { limitKey: `mgr-ms:${s.user.id}`, max: 40 });
}
export async function markRead(fd: FormData) {
  const s = await requireManager(); const back = safeBack(fd.get('_back'), '/manager/notifications');
  return act(back, async () => { const id = strOrNull(fd, 'id'); let q = s.supabase.from('manager_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null); if (id) q = q.eq('id', id); must(await q.select('id')); return id ? 'Marked as read' : 'All notifications marked as read'; });
}
export async function changePassword(fd: FormData) {
  await requireManager(); const back = '/manager/settings';
  return act(back, async () => {
    const p = z.string().min(10, 'Password must be at least 10 characters').regex(/[A-Za-z]/, 'Password needs a letter').regex(/\d/, 'Password needs a number').parse(str(fd, 'password')); if (p !== str(fd, 'confirm')) throw new UserError('Passwords do not match');
    const sb = await createClient(); const { error } = await sb.auth.updateUser({ password: p }); if (error) throw new UserError(error.message); return 'Password updated';
  }, { limitKey: 'pw', max: 10 });
}
