import { adminContext } from '@/lib/admin-ctx';
import { Flash, Head, StatusBadge, Table } from '@/components/ui';
import { CompetitionForm } from '@/components/competition-form';
import Link from 'next/link';
export const metadata = { title: 'Competitions' };
export default async function Competitions({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const sp = await searchParams; const c = await adminContext({}); const edit = c.competitions.find((x: any) => x.id === sp.edit);
  return <><Head eyebrow="League" title="Competitions">{c.isSuper && <Link className="btn" href="/admin/competitions/new">+ New competition</Link>}</Head><Flash ok={sp.ok} err={sp.err} />
    <Table head={['Name', 'Type', 'Status', 'Visibility', 'Seasons', 'Points', '']} empty={c.competitions.length ? undefined : 'No competitions yet. Create the first one.'}>{c.competitions.map((x: any) => <tr key={x.id}><td><b>{x.name}</b></td><td>{x.format.replace('_', ' ')}</td><td><StatusBadge status={x.status} /></td><td>{x.is_published ? <span className="badge green">Public</span> : <span className="badge">Hidden</span>}</td><td>{c.seasons.filter((s: any) => s.competition_id === x.id).length}</td><td>{x.points_win}/{x.points_draw}/{x.points_loss}</td><td className="right">{c.canWrite && <Link className="btn ghost sm" href={`/admin/competitions?edit=${x.id}`}>Edit</Link>}</td></tr>)}</Table>
    {edit && c.canWrite && <section className="section"><Head title={`Edit ${edit.name}`} /><div className="card"><CompetitionForm c={edit} back="/admin/competitions" /></div></section>}</>;
}
