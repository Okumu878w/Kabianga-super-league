import { managerContext } from '@/lib/manager-ctx';
import { Crest, Field, Flash, Form, Head, StatusBadge, Table } from '@/components/ui';
import { saveTeamChange } from '@/app/manager/actions';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'My team' };
const LABEL: Record<string, string> = { description: 'Description', home_venue: 'Home venue', coach_name: 'Coach information', contact_email: 'Contact email (private)', contact_phone: 'Contact phone (private)' };
export default async function MyTeam({ searchParams }: { searchParams: Promise<{ team?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams; const m = await managerContext(sp); const t = m.team;
  const [{ data: priv }, { data: reqs }] = await Promise.all([m.supabase.from('team_private_details').select('contact_email,contact_phone').eq('team_id', t.id).maybeSingle(), m.supabase.from('team_change_requests').select('id,changes,status,reviewer_note,created_at').eq('team_id', t.id).order('created_at', { ascending: false }).limit(10)]);
  const pendingOpen = (reqs ?? []).some((r: any) => ['submitted', 'under_review'].includes(r.status));
  const cur = (k: string) => ((k === 'contact_email' || k === 'contact_phone' ? (priv as any)?.[k] : t[k]) ?? '') as string;
  return <><Head eyebrow="Team profile" title={t.name} /><Flash ok={sp.ok} err={sp.err} />
    <div className="card row gap wrap" style={{ justifyContent: 'flex-start' }}><Crest team={t} lg /><div><b>{t.name}</b> ({t.short_name})<div className="muted small">Official name, short name and competition entries can only be changed by the league.</div></div></div>
    <div className="card" style={{ marginTop: 14 }}><h3>Propose changes</h3><p className="muted small">Changes are reviewed by an administrator. Your public team profile only updates once a request is approved. {pendingOpen && <b>You already have a request awaiting review.</b>}</p>
      <Form action={saveTeamChange} back="/manager/team" cols><input type="hidden" name="team_id" value={t.id} />{Object.keys(LABEL).map((k) => <span key={k} style={{ display: 'contents' }}><input type="hidden" name={`old_${k}`} value={cur(k)} /><Field label={LABEL[k]} full={k === 'description'}>{k === 'description' ? <textarea name={k} defaultValue={cur(k)} /> : <input name={k} defaultValue={cur(k)} type={k === 'contact_email' ? 'email' : 'text'} />}</Field></span>)}
        <Field label="New team crest (PNG/JPG/WebP, max 2 MB)" hint="Subject to approval"><input type="file" name="crest" accept="image/png,image/jpeg,image/webp" /></Field><div className="full"><button className="btn">Submit change request</button></div></Form></div>
    <section className="section"><Head title="Request history" /><Table head={['Submitted', 'Changes', 'Status', 'Reviewer note']} empty={(reqs ?? []).length ? undefined : 'No requests yet.'}>{(reqs ?? []).map((r: any) => <tr key={r.id}><td className="small">{fmtDateTime(r.created_at)}</td><td className="small">{Object.keys(r.changes).map((k) => k.replace(/_/g, ' ')).join(', ')}</td><td><StatusBadge status={r.status} /></td><td className="small">{r.reviewer_note ?? ''}</td></tr>)}</Table></section></>;
}
