'use server';
import { z } from 'zod';
import { requireWriter } from '@/lib/auth';
import { act, must, safeBack, str, strOrNull, UserError } from '@/lib/action';
import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/site';

const COMP = ['super_admin', 'competition_admin'] as const;
export async function inviteManager(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/managers');
  return act(back, async () => {
    const email = z.string().email('Enter a valid email address').parse(str(fd, 'email').toLowerCase()); const teamId = z.string().uuid('Choose a team').parse(str(fd, 'team_id'));
    // authorise BEFORE touching the service-role client: only someone allowed to manage this team may invite for it
    const { data: ct } = await s.supabase.from('competition_teams').select('competition_id,season_id').eq('team_id', teamId).order('season_id', { ascending: false });
    if (!s.isSuper && !(ct ?? []).length) throw new UserError('That team is not registered in any competition you manage');
    const admin = createAdminClient(); let userId: string | null = null; let invited = false;
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle(); userId = existing?.id ?? null;
    if (!userId) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${SITE_URL}/auth/callback?next=/auth/set-password`, data: { display_name: strOrNull(fd, 'name') ?? email.split('@')[0] } });
      if (error || !data.user) throw new UserError(error?.message ?? 'Could not send the invitation'); userId = data.user.id; invited = true;
    }
    must(await s.supabase.rpc('assign_team_manager', { p_user: userId, p_team: teamId, p_competition: strOrNull(fd, 'competition_id'), p_season: strOrNull(fd, 'season_id') }));
    return invited ? `Invitation sent to ${email}. They must set a password before signing in.` : `${email} has been assigned to the team`;
  }, { limitKey: `invite:${s.user.id}`, max: 20, windowMs: 3_600_000 });
}
export async function deactivateAssignment(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/managers');
  return act(back, async () => { must(await s.supabase.rpc('deactivate_team_manager', { p_user: str(fd, 'user_id'), p_team: str(fd, 'team_id') })); return 'Team assignment deactivated'; });
}
export async function setAccountActive(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/managers');
  return act(back, async () => { const on = str(fd, 'active') === '1'; must(await s.supabase.rpc('set_account_active', { p_user: str(fd, 'user_id'), p_active: on })); return on ? 'Account activated' : 'Account deactivated'; });
}
export async function sendNotification(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/managers');
  return act(back, async () => { const n = must(await s.supabase.rpc('send_notification', { p_user: strOrNull(fd, 'user_id'), p_competition: strOrNull(fd, 'competition_id'), p_title: str(fd, 'title'), p_body: str(fd, 'body'), p_href: null })); return `Notification sent to ${n} manager(s)`; });
}
export async function grantRole(fd: FormData) {
  const s = await requireWriter(['super_admin']); const back = safeBack(fd.get('_back'), '/admin/users');
  return act(back, async () => {
    const role = z.enum(['super_admin', 'competition_admin', 'editor', 'viewer']).parse(str(fd, 'role')); const email = str(fd, 'email').toLowerCase();
    const { data: p } = await s.supabase.from('profiles').select('id').eq('email', email).maybeSingle(); if (!p) throw new UserError('No account with that email. Ask the person to be invited first.');
    must(await s.supabase.from('user_roles').insert({ user_id: p.id, role }).select('user_id'));
    const comp = strOrNull(fd, 'competition_id'); if (role === 'competition_admin' && comp) must(await s.supabase.from('competition_admins').upsert({ user_id: p.id, competition_id: comp }).select('user_id'));
    return `Role ${role.replace('_', ' ')} granted`;
  });
}
export async function revokeRole(fd: FormData) {
  const s = await requireWriter(['super_admin']); const back = safeBack(fd.get('_back'), '/admin/users');
  return act(back, async () => { const uid = str(fd, 'user_id'); if (uid === s.user.id && str(fd, 'role') === 'super_admin') throw new UserError('You cannot remove your own super admin role'); must(await s.supabase.from('user_roles').delete().eq('user_id', uid).eq('role', str(fd, 'role')).select('user_id').single()); return 'Role removed'; });
}
export async function setCompetitionAdmin(fd: FormData) {
  const s = await requireWriter(['super_admin']); const back = safeBack(fd.get('_back'), '/admin/users');
  return act(back, async () => { const q = s.supabase.from('competition_admins'); if (str(fd, 'remove') === '1') must(await q.delete().eq('user_id', str(fd, 'user_id')).eq('competition_id', str(fd, 'competition_id')).select('user_id')); else must(await q.upsert({ user_id: str(fd, 'user_id'), competition_id: str(fd, 'competition_id') }).select('user_id')); return 'Competition access updated'; });
}
const decision = z.enum(['under_review', 'approved', 'rejected', 'changes_requested']);
export async function reviewRegistration(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/approvals');
  return act(back, async () => { const d = decision.parse(str(fd, 'decision')); must(await s.supabase.rpc('review_player_registration', { p_id: str(fd, 'id'), p_decision: d, p_note: strOrNull(fd, 'note') })); return d === 'approved' ? 'Player registered successfully. The player is now on the official squad list.' : `Registration ${d.replace('_', ' ')}`; });
}
export async function reviewTeamChange(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/approvals');
  return act(back, async () => { const d = decision.parse(str(fd, 'decision')); must(await s.supabase.rpc('review_team_change', { p_id: str(fd, 'id'), p_decision: d, p_note: strOrNull(fd, 'note') })); return `Team change ${d.replace('_', ' ')}`; });
}
export async function reviewFixtureChange(fd: FormData) {
  const s = await requireWriter([...COMP]); const back = safeBack(fd.get('_back'), '/admin/approvals');
  return act(back, async () => { const d = decision.parse(str(fd, 'decision')); must(await s.supabase.rpc('review_fixture_change', { p_id: str(fd, 'id'), p_decision: d, p_note: strOrNull(fd, 'note') })); return `Fixture request ${d.replace('_', ' ')}`; });
}
