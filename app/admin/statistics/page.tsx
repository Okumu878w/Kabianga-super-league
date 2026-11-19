import { adminContext } from '@/lib/admin-ctx';
import { Head, Table } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { ExportLinks } from '@/components/export-links';
export const metadata = { title: 'Player statistics' };
export default async function Stats({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp); if (!c.season) return <><Head eyebrow="Stats" title="Player statistics" /><div className="empty">Create a season first.</div></>;
  const { data } = await c.supabase.rpc('get_player_stats', { p_season: c.season.id, p_matchweek: null }); const rows = ((data ?? []) as any[]).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="Player statistics"><ExportLinks kind="player-stats" season={c.season.id} formats={['csv', 'xlsx']} /></Head><SeasonPicker base="/admin/statistics" seasons={c.seasons} competitions={c.competitions} current={c.season.id} />
    <p className="muted small">Derived live from published results (not stored). Own goals are not credited to the scorer; a clean sheet needs a goalkeeper to play ≥ {c.competition?.clean_sheet_min_minutes} minutes while the team concedes none.</p>
    <Table head={['Player', 'Team', 'Pos', 'Apps', 'Goals', 'Assists', 'YC', 'RC', 'CS', 'GA']} empty={rows.length ? undefined : 'No published results yet.'}>{rows.map((r) => <tr key={r.player_id + r.team_id}><td><b>{r.player_name}</b></td><td>{r.team_name}</td><td>{r.pos}</td><td className="num">{r.appearances}</td><td className="num pts">{r.goals}</td><td className="num">{r.assists}</td><td className="num">{r.yellow_cards}</td><td className="num">{r.red_cards}</td><td className="num">{r.clean_sheets}</td><td className="num">{r.goals_conceded}</td></tr>)}</Table></>;
}
