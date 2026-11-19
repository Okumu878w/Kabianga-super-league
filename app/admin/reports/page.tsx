import Link from 'next/link';
import { adminContext } from '@/lib/admin-ctx';
import { Head, StatusBadge, Table } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { ExportLinks } from '@/components/export-links';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Match reports' };
export default async function Reports({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp); if (!c.season) return <><Head eyebrow="Matches" title="Match reports" /><div className="empty">Create a season first.</div></>;
  const { data } = await c.supabase.from('match_reports').select('id,referee,attendance,draft_home_score,draft_away_score,fixture:fixtures!inner(id,kickoff_at,season_id,result_status,home:teams!fixtures_home_team_id_fkey(name),away:teams!fixtures_away_team_id_fkey(name))').eq('fixture.season_id', c.season.id).order('created_at', { ascending: false }).limit(200);
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="Match reports"><ExportLinks kind="match-reports" season={c.season.id} formats={['csv', 'xlsx', 'pdf']} /></Head><SeasonPicker base="/admin/reports" seasons={c.seasons} competitions={c.competitions} current={c.season.id} />
    <div style={{ marginTop: 12 }}><Table head={['Kickoff', 'Fixture', 'Score', 'Referee', 'Attendance', 'Status', '']} empty={(data ?? []).length ? undefined : 'No match reports yet. Open a match from Fixtures or Results to start one.'}>{((data ?? []) as any[]).map((r) => <tr key={r.id}><td className="small">{fmtDateTime(r.fixture.kickoff_at)}</td><td>{r.fixture.home.name} v {r.fixture.away.name}</td><td>{r.draft_home_score ?? '–'}–{r.draft_away_score ?? '–'}</td><td>{r.referee ?? '—'}</td><td>{r.attendance ?? '—'}</td><td><StatusBadge status={r.fixture.result_status} /></td><td className="right"><Link className="btn ghost sm" href={`/admin/matches/${r.fixture.id}`}>Open</Link></td></tr>)}</Table></div></>;
}
