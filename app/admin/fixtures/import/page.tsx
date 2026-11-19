import { adminContext } from '@/lib/admin-ctx';
import { Head } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { ImportWizard } from '@/components/import-wizard';
import { requireAdmin } from '@/lib/auth';
export const metadata = { title: 'Bulk fixture upload' };
export default async function Imp({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireAdmin({ roles: ['super_admin', 'competition_admin'] }); const sp = await searchParams; const c = await adminContext(sp);
  return <><Head eyebrow="Matches" title="Bulk fixture upload" /><p className="muted">Required columns: matchweek, home_team, away_team, match_date, kickoff_time, venue. Optional: round (use 2 for second meetings).</p>
    {c.season ? <><SeasonPicker base="/admin/fixtures/import" seasons={c.seasons} competitions={c.competitions} current={c.season.id} /><div className="card" style={{ marginTop: 12 }}><ImportWizard key={c.season.id} kind="fixtures" scope="admin" seasons={[{ id: c.season.id, name: `${c.competition?.name} ${c.season.name}` }]} templates /></div><p className="hint">Imported fixtures are saved as drafts. Publish them from the Fixtures page.</p></> : <div className="empty">Create a season first.</div>}</>;
}
