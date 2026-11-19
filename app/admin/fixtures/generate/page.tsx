import { adminContext, aq } from '@/lib/admin-ctx';
import { Head } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { Generator } from '@/components/generator';
import { requireAdmin } from '@/lib/auth';
export const metadata = { title: 'Generate fixtures' };
export default async function Gen({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireAdmin({ roles: ['super_admin', 'competition_admin'] }); const sp = await searchParams; const c = await adminContext(sp);
  if (!c.season) return <><Head eyebrow="Matches" title="Generate fixtures" /><div className="empty">Create a season first.</div></>;
  const { data: ct } = await c.supabase.from('competition_teams').select('team:teams(id,name)').eq('season_id', c.season.id); const teams = (ct ?? []).map((x: any) => x.team).sort((a: any, b: any) => a.name.localeCompare(b.name));
  const { count } = await c.supabase.from('fixtures').select('id', { count: 'exact', head: true }).eq('season_id', c.season.id).eq('is_published', false);
  const { data: jobs } = await c.supabase.from('fixture_generation_jobs').select('created_at,fixture_count,configuration').eq('season_id', c.season.id).order('created_at', { ascending: false }).limit(5);
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="Automatic fixture generator" /><SeasonPicker base="/admin/fixtures/generate" seasons={c.seasons} competitions={c.competitions} current={c.season.id} />
    <p className="muted">Round-robin engine: every pair meets exactly once per round, byes are inserted for odd team counts, home/away is balanced, and the same settings always give the same schedule.</p>
    {teams.length < 2 ? <div className="empty">Register at least two teams in this season first (Seasons → Teams).</div> : <Generator seasonId={c.season.id} teams={teams} hasUnpublished={(count ?? 0) > 0} />}
    {!!jobs?.length && <section className="section"><h3>Generation history</h3><div className="stack small">{jobs.map((j: any, i: number) => <div key={i} className="card row"><span>{j.fixture_count} fixtures · {(j.configuration as any).legs === 2 ? 'double' : 'single'} round-robin · {(j.configuration as any).teamIds?.length} teams</span><span className="muted">{new Date(j.created_at).toLocaleString('en-GB')}</span></div>)}</div></section>}</>;
}
