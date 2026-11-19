import Link from 'next/link';
import { adminContext } from '@/lib/admin-ctx';
import { Head, Table, Empty } from '@/components/ui';
import { MatchesChart, TeamsChart } from '@/components/charts';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Overview' };
export default async function Overview({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp); const sb = c.supabase;
  const cnt = async (t: string, f?: (q: any) => any) => { let q = sb.from(t).select('id', { count: 'exact', head: true }); if (f) q = f(q); return (await q).count ?? 0; };
  const [comps, activeSeasons, teams, players, fixtures, done, upcoming, pending] = await Promise.all([cnt('competitions'), cnt('seasons', (q) => q.eq('status', 'active')), cnt('teams'), cnt('player_registrations', (q) => q.eq('status', 'approved').is('released_at', null)), cnt('fixtures'), cnt('fixtures', (q) => q.eq('result_status', 'published')), cnt('fixtures', (q) => q.neq('result_status', 'published').gte('kickoff_at', new Date().toISOString())), cnt('fixtures', (q) => q.in('result_status', ['submitted', 'verified']))]);
  const { data: audit } = await sb.from('audit_logs').select('action,entity_type,created_at').order('created_at', { ascending: false }).limit(8);
  const { data: weeks } = c.season ? await sb.from('fixtures').select('home_score,away_score,matchweek:matchweeks(week_number)').eq('season_id', c.season.id).eq('result_status', 'published') : { data: [] } as any;
  const byWeek = new Map<number, { matches: number; goals: number }>(); for (const f of (weeks ?? []) as any[]) { const k = f.matchweek?.week_number ?? 0; const e = byWeek.get(k) ?? { matches: 0, goals: 0 }; e.matches++; e.goals += f.home_score + f.away_score; byWeek.set(k, e); }
  const chart = [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ label: `MW${k}`, ...v }));
  const { data: st } = c.season ? await sb.rpc('get_standings', { p_season: c.season.id }) : { data: [] } as any;
  const { count: partCount } = await sb.from('competition_teams').select('id', { count: 'exact', head: true });
  const steps = [['Configure league branding', '/admin/settings', true], ['Create a competition', '/admin/competitions', comps > 0], ['Create a season', '/admin/seasons', activeSeasons + (c.seasons.length > 0 ? 1 : 0) > 0], ['Register teams', '/admin/teams', teams > 0], ['Assign teams to the season', '/admin/seasons', (partCount ?? 0) > 0], ['Register players', '/admin/players', players > 0], ['Generate or create fixtures', '/admin/fixtures/generate', fixtures > 0], ['Publish the schedule', '/admin/fixtures', (await cnt('fixtures', (q) => q.eq('is_published', true))) > 0]] as const;
  const metrics: [string, number][] = [['Competitions', comps], ['Active seasons', activeSeasons], ['Registered teams', teams], ['Registered players', players], ['Total fixtures', fixtures], ['Completed matches', done], ['Upcoming matches', upcoming], ['Pending results', pending]];
  return <>
    <Head eyebrow="Dashboard" title="Overview" />
    {fixtures === 0 || comps === 0 ? <div className="card" style={{ marginBottom: 16 }}><h3>Getting started</h3><p className="muted small">Work through these steps to launch the league.</p><div className="stack">{steps.map(([l, h, d], i) => <div key={l} className="row"><span>{d ? '✅' : '⬜'} {i + 1}. {l}</span>{!d && <Link className="btn sm ghost" href={h}>Open</Link>}</div>)}</div></div> : null}
    <div className="grid g4">{metrics.map(([l, v]) => <div key={l} className="card"><div className="metric">{v}</div><div className="muted small">{l}</div></div>)}</div>
    {c.canWrite && <div className="chips" style={{ margin: '16px 0' }}>{[['+ Competition', '/admin/competitions/new'], ['+ Season', '/admin/seasons'], ['+ Team', '/admin/teams'], ['+ Player', '/admin/players'], ['Generate fixtures', '/admin/fixtures/generate'], ['Enter result', '/admin/results'], ['Publish news', '/admin/news']].map(([l, h]) => <Link key={h} className="chip" href={h}>{l}</Link>)}</div>}
    <div className="grid g2"><div className="card"><h3>Matches & goals per matchweek {c.season && <span className="muted small">· {c.season.name}</span>}</h3><MatchesChart data={chart} /></div><div className="card"><h3>Top-performing teams</h3><TeamsChart data={(st ?? []).slice(0, 8).map((t: any) => ({ name: t.short_name || t.team_name, points: t.points }))} /></div></div>
    <div className="grid g2" style={{ marginTop: 14 }}><div className="card"><h3>Competition participation</h3>{c.competitions.length ? <div className="stack">{c.competitions.map((x: any) => <div className="row small" key={x.id}><span>{x.name}</span><span className="badge">{c.seasons.filter((s: any) => s.competition_id === x.id).length} season(s)</span></div>)}</div> : <Empty>No competitions yet.</Empty>}</div>
      <div className="card"><h3>Recent administrative activity</h3>{audit?.length ? <div className="stack small">{audit.map((a: any, i: number) => <div className="row" key={i}><span><b>{a.action}</b> · {a.entity_type}</span><span className="muted">{fmtDateTime(a.created_at)}</span></div>)}</div> : <p className="muted small">Activity appears here for super and competition admins.</p>}</div></div>
  </>;
}
