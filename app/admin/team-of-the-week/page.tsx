import { adminContext, aq } from '@/lib/admin-ctx';
import { Field, Flash, Form, Head, Inline, StatusBadge, Table } from '@/components/ui';
import { SeasonPicker } from '@/components/season-picker';
import { Pitch } from '@/components/public-parts';
import { saveTotw, togglePublish } from '@/app/admin/actions/content';
export const metadata = { title: 'Team of the Week' };
const FORM: Record<string, [number, number, number]> = { '4-4-2': [4, 4, 2], '4-3-3': [4, 3, 3], '3-5-2': [3, 5, 2], '4-2-3-1': [4, 5, 1] };
export default async function Totw({ searchParams }: { searchParams: Promise<{ s?: string; w?: string; f?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams; const c = await adminContext(sp); const back = `/admin/team-of-the-week${aq(c.season)}`;
  if (!c.season) return <><Head eyebrow="Stats" title="Team of the Week" /><div className="empty">Create a season first.</div></>;
  const formation = FORM[sp.f ?? ''] ? sp.f! : '4-4-2'; const [d, m, f] = FORM[formation];
  const [{ data: weeks }, { data: regs }, { data: list }] = await Promise.all([c.supabase.from('matchweeks').select('id,week_number').eq('season_id', c.season.id).order('week_number'), c.supabase.from('player_registrations').select('player_id,position,team:teams(short_name,name),player:players(full_name)').eq('season_id', c.season.id).eq('status', 'approved').is('released_at', null),
    c.supabase.from('team_of_week').select('id,formation,published,matchweek:matchweeks(week_number),players:team_of_week_players(position_slot,display_order,player:players(full_name,slug,photo_url),team:teams(name,short_name))').eq('season_id', c.season.id).order('created_at', { ascending: false })]);
  const wk = sp.w ?? (weeks ?? [])[(weeks ?? []).length - 1]?.id; const all = ((regs ?? []) as any[]).sort((a, b) => a.player.full_name.localeCompare(b.player.full_name));
  const Pick = ({ name, n, pos }: { name: string; n: number; pos: string[] }) => <>{Array.from({ length: n }, (_, i) => <label key={i} className="field"><span>{name.toUpperCase()} {i + 1}</span><select name={name} required><option value="">Select…</option>{all.filter((p) => pos.includes(p.position)).map((p) => <option key={p.player_id} value={p.player_id}>{p.player.full_name} ({p.team.short_name || p.team.name})</option>)}</select></label>)}</>;
  return <><Head eyebrow={`${c.competition?.name} · ${c.season.name}`} title="Team of the Week" /><SeasonPicker base="/admin/team-of-the-week" seasons={c.seasons} competitions={c.competitions} current={c.season.id} /><Flash ok={sp.ok} err={sp.err} />
    {c.canWrite && wk && <div className="card" style={{ marginTop: 12 }}><div className="chips" aria-label="Formation">{Object.keys(FORM).map((x) => <a key={x} className="chip" aria-current={x === formation} href={`/admin/team-of-the-week${aq(c.season, { f: x, w: wk })}`}>{x}</a>)}</div>
      <div className="chips" style={{ marginTop: 8 }}>{(weeks ?? []).map((w: any) => <a key={w.id} className="chip" aria-current={w.id === wk} href={`/admin/team-of-the-week${aq(c.season, { f: formation, w: w.id })}`}>MW {w.week_number}</a>)}</div>
      <Form action={saveTotw} back={`${back}`} cols><input type="hidden" name="season_id" value={c.season.id} /><input type="hidden" name="matchweek_id" value={wk} /><input type="hidden" name="formation" value={formation} />
        <Pick name="gk" n={1} pos={['Goalkeeper']} /><Pick name="def" n={d} pos={['Defender']} /><Pick name="mid" n={m} pos={['Midfielder']} /><Pick name="fwd" n={f} pos={['Forward']} />
        <Field label="Why these players?" full><textarea name="description" /></Field><label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="publish" /> Publish</label><div className="full"><button className="btn">Save Team of the Week ({formation})</button></div></Form></div>}
    <section className="section"><Head title="Previous selections" />{(list ?? []).length ? <div className="grid g2">{((list ?? []) as any[]).map((t) => <div key={t.id} className="card"><div className="row"><b>MW {t.matchweek?.week_number} · {t.formation}</b><StatusBadge status={t.published ? 'published' : 'draft'} /></div><Pitch formation={t.formation} players={t.players} />{c.canWrite && <div style={{ marginTop: 8 }}><Inline action={togglePublish} back={back} fields={{ table: 'team_of_week', id: t.id, to: t.published ? 0 : 1 }} label={t.published ? 'Unpublish' : 'Publish'} ghost /></div>}</div>)}</div> : <div className="empty">None yet.</div>}</section></>;
}
