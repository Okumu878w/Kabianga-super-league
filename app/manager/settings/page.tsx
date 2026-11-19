import { requireManager } from '@/lib/auth';
import { Field, Flash, Form, Head } from '@/components/ui';
import { changePassword } from '@/app/manager/actions';
export const metadata = { title: 'Profile & settings' };
export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams; const s = await requireManager();
  return <><Head eyebrow="Account" title="Profile & settings" /><Flash ok={sp.ok} err={sp.err} />
    <div className="card"><h3>{s.profile?.display_name}</h3><p className="muted small">{s.user.email}</p><p className="small">Teams you manage: {s.teams.map((t: any) => t.team.name).join(', ')}</p><p className="hint">Your email, role and team assignments are managed by league administrators.</p></div>
    <div className="card" style={{ marginTop: 14 }}><h3>Change password</h3><Form action={changePassword} back="/manager/settings"><Field label="New password" hint="At least 10 characters, with a letter and a number"><input type="password" name="password" minLength={10} autoComplete="new-password" required /></Field><Field label="Confirm password"><input type="password" name="confirm" minLength={10} autoComplete="new-password" required /></Field><button className="btn" style={{ justifySelf: 'start' }}>Update password</button></Form></div></>;
}
