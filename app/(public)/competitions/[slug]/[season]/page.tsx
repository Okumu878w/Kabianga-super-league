import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext, getStandings, getFixtures, getSeasonTeams, qs } from '@/lib/data';
import { StandingsTable, FixtureCard } from '@/components/public-parts';
import { Crest, Empty, Head, PageHead } from '@/components/ui';
export default async function CompSeason({ params }: { params: Promise<{ slug: string; season: string }> }) {
  const { slug, season: sid } = await params; const { competition, seasons, season } = await getContext(slug, sid);
  if (!competition || competition.slug !== slug || !season || season.id !== sid) notFound();
  const [table, next, last, teams] = await Promise.all([getStandings(sid), getFixtures(sid, { results: false, limit: 4 }).then((r) => r.filter((f: any) => f.is_published)), getFixtures(sid, { results: true, limit: 4, ascending: false }), getSeasonTeams(sid)]);
  const q = qs(slug, sid);
  return <><PageHead eyebrow={`${competition.name} · ${season.name}`} title={competition.name} sub={competition.description} />
    <div className="chips" aria-label="Seasons">{seasons.map((s) => <Link key={s.id} className="chip" aria-current={s.id === sid} href={`/competitions/${slug}/${s.id}`}>{s.name}{s.status === 'completed' ? ' (archive)' : ''}</Link>)}</div>
    <section className="section"><Head title="Standings"><Link className="chip" href={`/standings${q}`}>Full table</Link></Head><StandingsTable rows={table} c={slug} compact /></section>
    <section className="section grid g2"><div><Head title="Next up" />{next.length ? <div className="stack">{next.map((f: any) => <FixtureCard key={f.id} f={f} c={slug} />)}</div> : <Empty>Nothing scheduled.</Empty>}</div><div><Head title="Latest results" />{last.length ? <div className="stack">{last.map((f: any) => <FixtureCard key={f.id} f={f} c={slug} />)}</div> : <Empty>No results yet.</Empty>}</div></section>
    <section className="section"><Head title={`Teams (${teams.length})`} /><div className="chips">{teams.map((t: any) => <Link key={t.id} href={`/teams/${t.slug}${q}`} className="chip"><Crest team={t} />&nbsp;{t.name}</Link>)}</div></section>
    {competition.rules && <section className="section"><Head title="Competition rules" /><div className="card" style={{ whiteSpace: 'pre-wrap' }}>{competition.rules}</div><p className="muted small">Points: win {competition.points_win}, draw {competition.points_draw}, loss {competition.points_loss}. Tie-breaks: {(competition.tie_break_rules as string[]).map((r) => r.replace(/_/g, ' ')).join(', then ')}.</p></section>}</>;
}
