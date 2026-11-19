import Link from 'next/link';
import { getContext, getFixtures, getStandings, getPlayerStats, getPlayerOfWeek, getTeamsOfWeek, getNews, qs } from '@/lib/data';
import { FixtureCard, StandingsTable, PlayerLine, Pitch } from '@/components/public-parts';
import { Avatar, Empty, Head } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import './ksl-home.css';

export const metadata = { title: 'Kabianga Super League — Fixtures, Results, Standings & Stats' };
type SP = Promise<{ c?: string; s?: string }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  // ---- DATA / LOGIC (unchanged) ----
  const sp = await searchParams;
  const { competition, season } = await getContext(sp.c, sp.s);
  const [upcoming, results, table, stats, potw, totw, news] = season
    ? await Promise.all([getFixtures(season.id, { results: false, limit: 4 }).then((r) => r.filter((f) => f.is_published && f.status !== 'cancelled')), getFixtures(season.id, { results: true, limit: 4, ascending: false }), getStandings(season.id), getPlayerStats(season.id), getPlayerOfWeek(season.id), getTeamsOfWeek(season.id), getNews({ limit: 3 })])
    : [[], [], [], [], [], [], await getNews({ limit: 3 })];
  const q = qs(competition?.slug, season?.id);
  const scorers = [...stats].sort((a: any, b: any) => b.goals - a.goals || a.appearances - b.appearances).filter((s: any) => s.goals > 0).slice(0, 5);
  const nextWeek = upcoming[0]?.matchweek;
  const played = table.reduce((n: number, t: any) => n + t.played, 0) / 2;
  const goals = table.reduce((n: number, t: any) => n + t.goals_for, 0);

  // ---- UI ----
  return (
    <div className="ksl-home">
      {/* HERO */}
      <section className="ksl-hero">
        <div className="ksl-hero-copy">
          <div className="ksl-eyebrow"><i />University of Kabianga<i /></div>
          <h1><span className="w">KABIANGA</span><span className="c">SUPER LEAGUE</span></h1>
          <p className="ksl-tag">Play <b>•</b> Compete <b>•</b> Belong</p>
          <p className="ksl-lead">Fixtures, results, tables and player statistics — updated as soon as results are verified and published.</p>
          <div className="ksl-cta">
            <Link className="btn ksl-btn" href={`/fixtures${q}`}>⚽ View Fixtures</Link>
            <Link className="btn ghost" href={`/results${q}`}>Results</Link>
            <Link className="btn ghost" href={`/standings${q}`}>League table</Link>
          </div>
        </div>

        <aside className="ksl-trophy">
          <svg viewBox="0 0 64 64" aria-hidden="true" className="ksl-cup">
            <path d="M18 8h28v14c0 9-6 15-14 15S18 31 18 22V8z" fill="currentColor" />
            <path d="M18 12H8c0 9 4 15 11 16M46 12h10c0 9-4 15-11 16" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M29 37h6v8h-6zM21 48h22v6H21z" fill="currentColor" />
          </svg>
          <div className="ksl-trophy-name">{competition?.name ?? 'KSL Championship'}</div>
          <div className="ksl-trophy-sub">{season?.name ?? 'Dream Bigger. Play Harder.'}</div>
          <div className="ksl-trophy-stats">
            <span className="badge green">{season?.status === 'completed' ? 'Season complete' : season ? 'Season in progress' : 'Coming soon'}</span>
            <div><b>{Math.floor(played)}</b> matches played</div>
            <div><b>{goals}</b> goals scored{nextWeek ? ` · next: ${nextWeek.label || `Matchweek ${nextWeek.week_number}`}` : ''}</div>
          </div>
        </aside>
      </section>

      {!competition && <Empty action={<Link className="btn" href="/login">Administrator sign in</Link>}>No competition has been published yet. Once an administrator creates and publishes a competition, it will appear here.</Empty>}

      {competition && <>
        {/* ROW 1: results · standings · fixtures */}
        <section className="ksl-grid ksl-row1">
          <div className="ksl-panel">
            <Head eyebrow="Latest" title="Latest results"><Link className="chip" href={`/results${q}`}>View all →</Link></Head>
            {results.length ? <div className="ksl-list">{results.map((f: any) => <FixtureCard key={f.id} f={f} c={competition.slug} />)}</div> : <Empty>Results appear here once they have been verified and published.</Empty>}
          </div>
          <div className="ksl-panel">
            <Head eyebrow="Standings" title="League standings"><Link className="chip" href={`/standings${q}`}>View full table →</Link></Head>
            <StandingsTable rows={table} limit={5} c={competition.slug} compact />
          </div>
          <div className="ksl-panel">
            <Head eyebrow="Matchday" title="Upcoming fixtures"><Link className="chip" href={`/fixtures${q}`}>View all →</Link></Head>
            {upcoming.length ? <div className="ksl-list">{upcoming.map((f: any) => <FixtureCard key={f.id} f={f} c={competition.slug} />)}</div> : <Empty>No upcoming fixtures have been published for this season.</Empty>}
          </div>
        </section>
      </>}

      {/* ROW 2: scorers · news · banner */}
      <section className="ksl-grid ksl-row2">
        {competition && (
          <div className="ksl-panel">
            <Head eyebrow="Golden boot" title="Top scorers"><Link className="chip" href={`/statistics${q}`}>View all →</Link></Head>
            {scorers.length
              ? <div className="ksl-scorers">{scorers.map((p: any, i: number) => <div className="row" key={p.player_id + p.team_id}><span className="row gap"><span className="pos">{i + 1}</span><PlayerLine p={p} extra={p.team_name} /></span><b className="ksl-goals">{p.goals}</b></div>)}</div>
              : <Empty>No goals recorded yet.</Empty>}
          </div>
        )}
        <div className="ksl-panel ksl-news">
          <Head eyebrow="Newsroom" title="Latest news"><Link className="chip" href="/news">View all →</Link></Head>
          {news.length
            ? <div className="ksl-news-list">{news.map((n: any) => <Link key={n.id} href={`/news/${n.slug}`} className="ksl-news-item"><h3>{n.title}</h3><div className="muted small">{fmtDate(n.published_at)} · {n.category ?? 'News'}</div><p className="muted small">{n.excerpt}</p></Link>)}</div>
            : <Empty>No news published yet.</Empty>}
        </div>
        <div className="ksl-banner" aria-hidden="true">
          <p>More than a Game…<br /><em>A University Passion!</em></p>
          <span>Kabianga Super League</span>
        </div>
      </section>

      {competition && <>
        {/* AWARDS */}
        <section className="ksl-grid ksl-row-awards">
          <div className="ksl-panel">
            <Head eyebrow="Award" title="Player of the Week"><Link className="chip" href={`/player-of-the-week${q}`}>History →</Link></Head>
            {potw[0] ? <div className="row gap" style={{ alignItems: 'flex-start' }}><Avatar lg src={potw[0].photo_url || potw[0].player?.photo_url} name={potw[0].player?.full_name ?? '?'} /><div><span className="badge gold">{potw[0].matchweek?.label || `Matchweek ${potw[0].matchweek?.week_number ?? ''}`}</span><h3 style={{ marginTop: 8, fontSize: 20 }}><Link href={`/players/${potw[0].player?.slug}`}>{potw[0].player?.full_name}</Link></h3><div className="muted small">{potw[0].team?.name} · {potw[0].player?.position}</div><p className="small">{potw[0].description}</p><div className="row gap wrap" style={{ justifyContent: 'flex-start' }}>{Object.entries((potw[0].stats ?? {}) as Record<string, number>).map(([k, v]) => <span key={k} className="chip">{k.replace(/_/g, ' ')}: {v}</span>)}</div></div></div> : <Empty>The first Player of the Week will be announced after a matchweek is completed.</Empty>}
          </div>
          <div className="ksl-panel">
            <Head eyebrow="Award" title="Team of the Week"><Link className="chip" href={`/team-of-the-week${q}`}>History →</Link></Head>
            {totw[0] ? <><Pitch formation={totw[0].formation} players={totw[0].players} /><p className="muted small">{totw[0].matchweek?.label || `Matchweek ${totw[0].matchweek?.week_number}`} · {totw[0].formation}</p></> : <Empty>The Team of the Week has not been published yet.</Empty>}
          </div>
        </section>

        {/* STATS STRIP */}
        <section className="ksl-strip">
          <div><b>{Math.floor(played)}</b><span>Matches played</span></div>
          <div><b>{goals}</b><span>Goals scored</span></div>
          <div><b>{played ? (goals / played).toFixed(2) : '0.00'}</b><span>Goals per match</span></div>
          <div><b>{table.length}</b><span>Teams</span></div>
        </section>
      </>}
    </div>
  );
}