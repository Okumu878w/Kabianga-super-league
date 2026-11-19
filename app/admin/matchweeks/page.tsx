import { adminContext, aq } from '@/lib/admin-ctx';
import { Flash, Form, Head, StatusBadge, Table, Inline } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { saveMatchweek, publishFixtures } from '@/app/admin/actions/fixtures';
export const metadata = { title: 'Matchweeks' };
export default async function Matchweeks({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp); const back = `/admin/matchweeks${aq(c.season)}`;
  if (!c.season) return <><Head eyebrow="Matches" title="Matchweeks" /><div className="empty">Create a season first.</div></>;
  const [{ data: weeks }, { data: fx }] = await Promise.all([c.supabase.from('matchweeks').select('id,week_number,label,start_date,end_date,status').eq('season_id', c.season.id).order('week_number'), c.supabase.from('fixtures').select('matchweek_id,is_published,result_status').eq('season_id', c.season.id)]);
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="Matchweeks" /><SeasonPicker base="/admin/matchweeks" seasons={c.seasons} competitions={c.competitions} current={c.season.id} /><Flash ok={sp.ok} err={sp.err} />
    <p className="muted small">Matchweeks are created automatically when fixtures are generated, imported or created. Rename them or set their date windows here.</p>
    <div className="stack">{(weeks ?? []).map((w: any) => { const f = (fx ?? []).filter((x: any) => x.matchweek_id === w.id); return <div key={w.id} className="card"><div className="row wrap"><b>Matchweek {w.week_number}</b><span className="small muted">{f.length} fixtures · {f.filter((x: any) => x.is_published).length} published · {f.filter((x: any) => x.result_status === 'published').length} results</span><StatusBadge status={w.status} /></div>
      {c.canWrite && <Form action={saveMatchweek} back={back} cols><input type="hidden" name="id" value={w.id} /><label className="field">Label<input name="label" defaultValue={w.label ?? ''} /></label><label className="field">Status<select name="status" defaultValue={w.status}><option>scheduled</option><option>in_progress</option><option>completed</option></select></label><label className="field">Starts<input type="date" name="start_date" defaultValue={w.start_date ?? ''} /></label><label className="field">Ends<input type="date" name="end_date" defaultValue={w.end_date ?? ''} /></label><div className="row gap wrap" style={{ justifyContent: 'flex-start' }}><button className="btn sm">Save</button></div></Form>}
      {c.canWrite && f.some((x: any) => !x.is_published) && <div style={{ marginTop: 8 }}><Inline action={publishFixtures} back={back} fields={{ season_id: c.season!.id, matchweek_id: w.id }} label="Publish this matchweek's fixtures" gold confirm="Publish this matchweek's fixtures?" /></div>}</div>; })}{!(weeks ?? []).length && <div className="empty">No matchweeks yet.</div>}</div></>;
}
