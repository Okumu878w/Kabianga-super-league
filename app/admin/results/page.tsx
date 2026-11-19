import Link from 'next/link';
import { adminContext, aq } from '@/lib/admin-ctx';
import { Head, StatusBadge, Table } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { FIXTURE_SELECT } from '@/lib/data';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Results' };
export default async function Results({ searchParams }: { searchParams: Promise<{ s?: string; f?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp);
  if (!c.season) return <><Head eyebrow="Matches" title="Results" /><div className="empty">Create a season first.</div></>;
  const { data } = await c.supabase.from('fixtures').select(FIXTURE_SELECT).eq('season_id', c.season.id).neq('status', 'cancelled').order('kickoff_at', { ascending: false }).limit(300);
  const all = (data ?? []) as any[]; const f = sp.f ?? 'pending'; const now = Date.now();
  const rows = all.filter((x) => f === 'all' || (f === 'pending' ? x.result_status !== 'published' && new Date(x.kickoff_at).getTime() < now + 3600000 : x.result_status === f));
  const filters = [['pending', 'Awaiting result'], ['draft', 'Draft'], ['submitted', 'Submitted'], ['verified', 'Verified'], ['published', 'Published'], ['all', 'All']];
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="Results" /><SeasonPicker base="/admin/results" seasons={c.seasons} competitions={c.competitions} current={c.season.id} />
    <div className="chips" style={{ margin: '10px 0' }}>{filters.map(([k, l]) => <Link key={k} className="chip" aria-current={f === k} href={`/admin/results${aq(c.season, { f: k })}`}>{l}</Link>)}</div>
    <p className="muted small">Workflow: Draft → Submitted → Verified → Published. Only published results reach the public site, league table and statistics.</p>
    <Table head={['Kickoff', 'Fixture', 'Workflow', 'Score', '']} empty={rows.length ? undefined : 'Nothing in this view.'}>{rows.map((x) => <tr key={x.id}><td className="small">{fmtDateTime(x.kickoff_at)}</td><td><b>{x.home.name}</b> v <b>{x.away.name}</b></td><td><StatusBadge status={x.result_status} /></td><td>{x.result_status === 'published' ? `${x.home_score}–${x.away_score}` : '—'}</td><td className="right"><Link className="btn ghost sm" href={`/admin/matches/${x.id}`}>Open match</Link></td></tr>)}</Table></>;
}
