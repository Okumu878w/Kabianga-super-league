import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getContext, getStandings, getFixtures, getPlayerStats } from '@/lib/data';
import { FixtureCard, PlayerLine } from '@/components/public-parts';
import { Crest, Empty, FormGuide, Head, Table } from '@/components/ui';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return { title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), alternates: { canonical: `/teams/${slug}` } }; }
export default async function Team({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; s?: string }> }) {
  const { slug } = await params; const sp = await searchParams; const sb = await createClient();
  const { data: team } = await sb.from('teams').select('id,name,short_name,slug,logo_url,description,home_venue,coach_name').eq('slug', slug).maybeSingle();
  if (!team) notFound();
  let { competition, season } = await getContext(sp.c, sp.s);
  const { data: part } = await sb.from('competition_teams').select('season_id,competition_id').eq('team_id', team.id);
  if (season && !part?.some((p: any) => p.season_id === season!.id) && part?.length) { const ctx = await getContext(undefined, part[0].season_id); competition = ctx.competition; season = ctx.season; }
  const [table, upcoming, results, stats] = season ? await Promise.all([getStandings(season.id), getFixtures(season.id, { team: team.id, results: false, limit: 4 }).then((r) => r.filter((f: any) => f.is_published)), getFixtures(season.id, { team: team.id, results: true, limit: 5, ascending: false }), getPlayerStats(season.id)]) : [[], [], [], []];
  const row = table.find((t: any) => t.team_id === team.id);
  const squad = stats.filter((p: any) => p.team_id === team.id);
  const { data: regs } = season ? await sb.from('player_registrations').select('squad_number,position,player:players(full_name,slug,photo_url)').eq('team_id', team.id).eq('season_id', season.id).is('released_at', null).eq('status', 'approved').order('squad_number') : { data: [] } as any;
  return <><header className="pagehead row gap" style={{ justifyContent: 'flex-start' }}><Crest team={team} lg /><div><div className="eyebrow">{competition?.name} · {season?.name}</div><h1>{team.name}</h1><div className="muted small">{team.home_venue}{team.coach_name ? ` · Coach: ${team.coach_name}` : ''}</div></div></header>
    {team.description && <p className="lead">{team.description}</p>}
    {row && <div className="grid g4" style={{ margin: '14px 0' }}><div className="card"><div className="metric">{row.pos}<span className="muted small">/{table.length}</span></div><div className="muted small">League position</div></div><div className="card"><div className="metric">{row.points}</div><div className="muted small">Points from {row.played}</div></div><div className="card"><div className="metric">{row.goals_for}:{row.goals_against}</div><div className="muted small">Goals scored : conceded</div></div><div className="card">{row.form ? <FormGuide form={row.form} /> : <span className="muted">No form yet</span>}<div className="muted small" style={{ marginTop: 6 }}>Recent form</div></div></div>}
    <section className="section grid g2"><div><Head title="Upcoming fixtures" />{upcoming.length ? <div className="stack">{upcoming.map((f: any) => <FixtureCard key={f.id} f={f} c={competition?.slug} />)}</div> : <Empty>No upcoming fixtures.</Empty>}</div><div><Head title="Recent results" />{results.length ? <div className="stack">{results.map((f: any) => <FixtureCard key={f.id} f={f} c={competition?.slug} />)}</div> : <Empty>No results yet.</Empty>}</div></section>
    <section className="section"><Head title="Squad" />{regs?.length ? <Table head={['#', 'Player', 'Position', 'Apps', 'Goals', 'Assists', 'YC', 'RC']}>{regs.map((r: any) => { const s = squad.find((x: any) => x.slug === r.player.slug) ?? {}; return <tr key={r.player.slug}><td>{r.squad_number ?? '–'}</td><td><PlayerLine p={r.player} /></td><td>{r.position}</td><td className="num">{s.appearances ?? 0}</td><td className="num">{s.goals ?? 0}</td><td className="num">{s.assists ?? 0}</td><td className="num">{s.yellow_cards ?? 0}</td><td className="num">{s.red_cards ?? 0}</td></tr>; })}</Table> : <Empty>The squad has not been published yet.</Empty>}</section></>;
}
