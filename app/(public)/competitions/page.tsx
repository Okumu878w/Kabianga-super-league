import Link from 'next/link';
import { getContext } from '@/lib/data';
import { Empty, PageHead } from '@/components/ui';
export const metadata = { title: 'Competitions', description: 'All Kabianga Super League competitions and seasons.' };
const TYPE: Record<string, string> = { league: 'League', knockout: 'Knockout', group_stage: 'Group stage', group_knockout: 'Group stage + knockout' };
export default async function Competitions() {
  const { competitions } = await getContext();
  return <><PageHead eyebrow="Competitions" title="Competitions" sub="Every competition run under the Kabianga Super League banner." />
    {competitions.length ? <div className="grid g3">{competitions.map((c) => <Link key={c.id} href={`/competitions/${c.slug}`} className="card"><span className="badge green">{TYPE[c.format] ?? c.format}</span><h3 style={{ marginTop: 10, fontSize: 18 }}>{c.name}</h3><p className="muted small">{c.description}</p></Link>)}</div> : <Empty>No competitions have been published yet.</Empty>}</>;
}
