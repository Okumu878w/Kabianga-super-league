import { adminContext } from '@/lib/admin-ctx';
import { Head } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { StandingsTable } from '@/components/public-parts';
import { ExportLinks } from '@/components/export-links';
export const metadata = { title: 'League tables' };
export default async function Tables({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp); if (!c.season) return <><Head eyebrow="Stats" title="League tables" /><div className="empty">Create a season first.</div></>;
  const { data } = await c.supabase.rpc('get_standings', { p_season: c.season.id });
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="League table"><ExportLinks kind="standings" season={c.season.id} /></Head><SeasonPicker base="/admin/standings" seasons={c.seasons} competitions={c.competitions} current={c.season.id} />
    <p className="muted small">Calculated automatically from published results using this competition&apos;s points rules ({c.competition?.points_win}/{c.competition?.points_draw}/{c.competition?.points_loss}). It cannot be edited by hand — publish, correct or reopen results to change it. Competition summary: <ExportLinks kind="summary" season={c.season.id} formats={['pdf', 'xlsx']} /></p><StandingsTable rows={data ?? []} /></>;
}
