import Link from 'next/link';
import { managerContext } from '@/lib/manager-ctx';
import { Crest, Empty, Head } from '@/components/ui';
import { FixtureCard } from '@/components/public-parts';
import { FIXTURE_SELECT } from '@/lib/data';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Overview' };
export default async function Overview({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const sp = await searchParams; const m = await managerContext(sp); const sb = m.supabase; const t = m.team;
  const [{ count: players }, { count: pendingReg }, { count: pendingMs }, { data: next }, { data: last }, { data: notes }] = await Promise.all([
    sb.from('player_registrations').select('id', { count: 'exact', head: true }).eq('team_id', t.id).eq('status', 'approved').is('released_at', null),
    sb.from('player_registration_submissions').select('id', { count: 'exact', head: true }).eq('team_id', t.id).in('status', ['submitted', 'under_review', 'changes_requested']),
    sb.from('match_submissions').select('id', { count: 'exact', head: true }).eq('team_id', t.id).in('status', ['draft', 'submitted', 'under_review', 'changes_requested']),
    sb.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${t.id},away_team_id.eq.${t.id}`).neq('result_status', 'published').neq('status', 'cancelled').gte('kickoff_at', new Date(Date.now() - 4 * 3600000).toISOString()).order('kickoff_at').limit(3),
    sb.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${t.id},away_team_id.eq.${t.id}`).eq('result_status', 'published').order('kickoff_at', { ascending: false }).limit(3),
    sb.from('manager_notifications').select('id,title,body,created_at,read_at').order('created_at', { ascending: false }).limit(4)]);
  return <><header className="row gap wrap" style={{ justifyContent: 'flex-start', marginBottom: 18 }}><Crest team={t} lg /><div><div className="eyebrow">{m.season ? `${m.season.competition.name} · ${m.season.name}` : 'No competition yet'}</div><h1 style={{ fontSize: 30 }}>{t.name}</h1></div></header>
    <div className="grid g4"><div className="card"><div className="metric">{players ?? 0}</div><div className="muted small">Registered players</div></div><div className="card"><div className="metric">{pendingReg ?? 0}</div><div className="muted small">Pending player registrations</div></div><div className="card"><div className="metric">{pendingMs ?? 0}</div><div className="muted small">Open match submissions</div></div><div className="card"><div className="metric">{(notes ?? []).filter((n: any) => !n.read_at).length}</div><div className="muted small">Unread notifications</div></div></div>
    {!m.season && <div style={{ marginTop: 14 }}><Empty>Your team is not registered in a competition season yet. An administrator will add it.</Empty></div>}
    <section className="section grid g2" style={{ alignItems: 'start' }}><div><Head title="Upcoming fixtures"><Link className="chip" href="/manager/fixtures">All →</Link></Head>{(next ?? []).length ? <div className="stack">{((next ?? []) as any[]).map((f) => <div key={f.id}><FixtureCard f={f} /><Link className="chip" style={{ marginTop: 6 }} href={`/manager/submissions/${f.id}`}>Submit match information →</Link></div>)}</div> : <Empty>No upcoming fixtures.</Empty>}</div>
      <div><Head title="Recent results" />{(last ?? []).length ? <div className="stack">{((last ?? []) as any[]).map((f) => <FixtureCard key={f.id} f={f} />)}</div> : <Empty>No published results yet.</Empty>}</div></section>
    <section className="section"><Head title="Notifications from administrators"><Link className="chip" href="/manager/notifications">All →</Link></Head>{(notes ?? []).length ? <div className="stack">{(notes ?? []).map((n: any) => <div key={n.id} className="card"><div className="row"><b>{n.title}</b>{!n.read_at && <span className="badge red">new</span>}</div><p className="small muted">{n.body}</p><span className="hint">{fmtDateTime(n.created_at)}</span></div>)}</div> : <Empty>Nothing yet.</Empty>}</section></>;
}
