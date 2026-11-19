import Link from 'next/link';
import { getContext, getSeasonTeams, qs } from '@/lib/data';
import { Crest, Empty, PageHead } from '@/components/ui';
export const metadata = { title: 'Teams', description: 'Clubs competing in the Kabianga Super League.' };
export default async function Teams({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  const teams = season ? await getSeasonTeams(season.id) : [];
  return <><PageHead eyebrow={competition ? `${competition.name} · ${season?.name}` : 'Teams'} title="Teams" />
    {teams.length ? <div className="grid g3">{teams.map((t: any) => <Link key={t.id} href={`/teams/${t.slug}${qs(competition?.slug, season?.id)}`} className="card row gap" style={{ justifyContent: 'flex-start' }}><Crest team={t} lg /><div><h3 style={{ fontSize: 17 }}>{t.name}</h3><div className="muted small">{t.home_venue ?? 'Venue TBC'}</div></div></Link>)}</div> : <Empty>No teams are registered for this season yet.</Empty>}</>;
}
