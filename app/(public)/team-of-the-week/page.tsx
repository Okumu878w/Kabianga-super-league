import Link from 'next/link';
import { getContext, getTeamsOfWeek } from '@/lib/data';
import { Pitch } from '@/components/public-parts';
import { Empty, PageHead } from '@/components/ui';
export const metadata = { title: 'Team of the Week' };
export default async function Totw({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; id?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  const list = season ? await getTeamsOfWeek(season.id, 50) : []; const cur = list.find((t: any) => t.id === sp.id) ?? list[0];
  return <><PageHead eyebrow={competition ? `${competition.name} · ${season?.name}` : 'Awards'} title="Team of the Week" />
    {cur ? <><div className="chips">{list.map((t: any) => <Link key={t.id} className="chip" aria-current={t.id === cur.id} href={`/team-of-the-week?c=${competition.slug}&s=${season.id}&id=${t.id}`}>{t.matchweek?.label || `MW ${t.matchweek?.week_number}`}</Link>)}</div><div style={{ maxWidth: 560, margin: '14px auto' }}><Pitch formation={cur.formation} players={cur.players} /><p className="muted small center">Formation {cur.formation}</p>{cur.description && <div className="card">{cur.description}</div>}</div></> : <Empty>No Team of the Week has been published yet.</Empty>}</>;
}
