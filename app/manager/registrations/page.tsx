import { managerContext } from '@/lib/manager-ctx';
import { Empty, Flash, Head, Inline, StatusBadge } from '@/components/ui';
import { deleteDraft, submitDraft } from '@/app/manager/actions';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Player registrations' };
export default async function Regs({ searchParams }: { searchParams: Promise<{ team?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams; const m = await managerContext(sp); const back = `/manager/registrations${m.teamQ}`;
  const { data } = await m.supabase.from('player_registration_submissions').select('id,submission_type,player_data,status,reviewer_note,created_at,season:seasons(name)').eq('team_id', m.team.id).order('created_at', { ascending: false }).limit(100);
  const rows = (data ?? []) as any[]; const group = (s: string[]) => rows.filter((r) => s.includes(r.status));
  const Card = ({ r }: { r: any }) => <div className="card"><div className="row wrap"><div><b>{r.player_data.first_name ? `${r.player_data.first_name} ${r.player_data.last_name}` : 'Player release'}</b> <span className="badge blue">{r.submission_type}</span><div className="small muted">{r.season.name} · {fmtDateTime(r.created_at)}{r.player_data.position ? ` · ${r.player_data.position} #${r.player_data.squad_number}` : ''}</div></div><StatusBadge status={r.status} /></div>
    {r.reviewer_note && <p className="small" style={{ marginTop: 8 }}><span className="muted">Administrator:</span> {r.reviewer_note}</p>}
    <div className="row gap wrap" style={{ justifyContent: 'flex-start', marginTop: 8 }}>{['draft', 'changes_requested'].includes(r.status) && <Inline action={submitDraft} back={back} fields={{ table: 'player_registration_submissions', id: r.id }} label="Submit" />}{r.status === 'draft' && <Inline action={deleteDraft} back={back} fields={{ table: 'player_registration_submissions', id: r.id }} label="Delete draft" danger confirm="Delete this draft?" />}</div></div>;
  const groups: [string, string[]][] = [['Awaiting action from you', ['draft', 'changes_requested']], ['Pending review', ['submitted', 'under_review']], ['Decided', ['approved', 'rejected']]];
  return <><Head eyebrow="Squad" title="Player registrations" /><Flash ok={sp.ok} err={sp.err} /><p className="muted small">Draft → Submitted → Under review → Approved / Rejected.</p>
    {groups.map(([l, s]) => <section key={l} className="section" style={{ paddingTop: 8 }}><Head title={l} />{group(s).length ? <div className="stack">{group(s).map((r) => <Card key={r.id} r={r} />)}</div> : <Empty>None.</Empty>}</section>)}</>;
}
