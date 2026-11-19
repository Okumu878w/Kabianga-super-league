import Link from 'next/link';
import { getContext, getFixtures, getMatchweeks, qs } from '@/lib/data';
import { FixtureCard } from '@/components/public-parts';
import { Empty, PageHead } from '@/components/ui';
export const metadata = { title: 'Results', description: 'Official Kabianga Super League results by matchweek.' };
export default async function Results({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; week?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  if (!season) return <><PageHead eyebrow="Results" title="Results" /><Empty>No season is available yet.</Empty></>;
  const all = await getFixtures(season.id, { results: true, ascending: false }); const weeks = (await getMatchweeks(season.id)).filter((w) => all.some((f: any) => f.matchweek?.id === w.id));
  const wk = sp.week ?? weeks[weeks.length - 1]?.id; const list = all.filter((f: any) => f.matchweek?.id === wk);
  return <><PageHead eyebrow={`${competition.name} · ${season.name}`} title="Results" sub="Only verified and published results are shown." />
    {weeks.length > 0 && <div className="chips" aria-label="Matchweeks">{weeks.map((w) => <Link key={w.id} className="chip" aria-current={w.id === wk} href={`/results${qs(competition.slug, season.id, { week: w.id })}`}>MW {w.week_number}</Link>)}</div>}
    {list.length ? <div className="grid g2" style={{ marginTop: 12 }}>{list.map((f: any) => <FixtureCard key={f.id} f={f} c={competition.slug} />)}</div> : <Empty>No published results yet.</Empty>}</>;
}
