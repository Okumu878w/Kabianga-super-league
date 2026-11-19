import Link from 'next/link';
import { getContext, getPlayerOfWeek } from '@/lib/data';
import { Avatar, Empty, PageHead } from '@/components/ui';
export const metadata = { title: 'Player of the Week' };
export default async function Potw({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  const list = season ? await getPlayerOfWeek(season.id, 50) : [];
  return <><PageHead eyebrow={competition ? `${competition.name} · ${season?.name}` : 'Awards'} title="Player of the Week" />{list.length ? <div className="grid g2">{list.map((a: any, i: number) => <div key={a.id} className="card row gap" style={{ alignItems: 'flex-start', justifyContent: 'flex-start' }}><Avatar lg src={a.photo_url || a.player?.photo_url} name={a.player?.full_name ?? '?'} /><div><span className={`badge ${i === 0 ? 'gold' : ''}`}>{a.matchweek?.label || `Matchweek ${a.matchweek?.week_number ?? ''}`}</span><h3 style={{ marginTop: 6 }}><Link href={`/players/${a.player?.slug}`}>{a.player?.full_name}</Link></h3><div className="muted small">{a.team?.name} · {a.player?.position}</div><p className="small">{a.description}</p>{Object.entries((a.stats ?? {}) as Record<string, number>).map(([k, v]) => <span key={k} className="chip" style={{ marginRight: 4 }}>{k.replace(/_/g, ' ')}: {v}</span>)}</div></div>)}</div> : <Empty>No Player of the Week has been announced yet.</Empty>}</>;
}
