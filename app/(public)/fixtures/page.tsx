import Link from 'next/link';
import { getContext, getFixtures, getMatchweeks, getSeasonTeams, qs } from '@/lib/data';
import { FixtureCard } from '@/components/public-parts';
import { Empty, PageHead } from '@/components/ui';
import { dayKey, fmtDate } from '@/lib/format';
export const metadata = { title: 'Fixtures', description: 'Upcoming Kabianga Super League fixtures by matchweek and date.' };
export default async function Fixtures({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; team?: string; week?: string; from?: string; to?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  if (!season) return <><PageHead eyebrow="Fixtures" title="Fixtures" /><Empty>No season is available yet.</Empty></>;
  const [rows, weeks, teams] = await Promise.all([getFixtures(season.id, { team: sp.team, week: sp.week, from: sp.from, to: sp.to }), getMatchweeks(season.id), getSeasonTeams(season.id)]);
  const fixtures = rows.filter((f: any) => f.is_published);
  const groups = new Map<string, any[]>(); for (const f of fixtures) { const k = `${f.matchweek?.week_number ?? 0}|${dayKey(f.kickoff_at)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(f); }
  const base = (o: Record<string, string | undefined>) => `/fixtures${qs(competition.slug, season.id, o)}`;
  return <><PageHead eyebrow={`${competition.name} · ${season.name}`} title="Fixtures" />
    <div className="chips" aria-label="Matchweeks"><Link className="chip" aria-current={!sp.week} href={base({ team: sp.team })}>All</Link>{weeks.map((w) => <Link key={w.id} className="chip" aria-current={sp.week === w.id} href={base({ week: w.id, team: sp.team })}>MW {w.week_number}</Link>)}</div>
    <form className="form cols card" style={{ margin: '12px 0' }} action="/fixtures"><input type="hidden" name="c" value={competition.slug} /><input type="hidden" name="s" value={season.id} />
      <label className="field">Team<select name="team" defaultValue={sp.team ?? ''}><option value="">All teams</option>{teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="field">Matchweek<select name="week" defaultValue={sp.week ?? ''}><option value="">All</option>{weeks.map((w) => <option key={w.id} value={w.id}>Matchweek {w.week_number}</option>)}</select></label>
      <label className="field">From<input type="date" name="from" defaultValue={sp.from} /></label><label className="field">To<input type="date" name="to" defaultValue={sp.to} /></label>
      <div><button className="btn sm">Apply filters</button> <Link className="btn ghost sm" href={base({})}>Reset</Link></div></form>
    {fixtures.length === 0 ? <Empty>No fixtures match these filters.</Empty> : [...groups.entries()].map(([k, list]) => { const [wk] = k.split('|'); return <section key={k} className="section" style={{ paddingTop: 10 }}><div className="eyebrow" style={{ marginBottom: 8 }}>{list[0].matchweek?.label || `Matchweek ${wk}`} · {fmtDate(list[0].kickoff_at)}</div><div className="grid g2">{list.map((f: any) => <FixtureCard key={f.id} f={f} c={competition.slug} />)}</div></section>; })}</>;
}
