import Link from 'next/link';
import { adminContext } from '@/lib/admin-ctx';
import { Crest, Field, Flash, Form, Head, StatusBadge, Table } from '@/components/ui';
import { saveTeam } from '@/app/admin/actions/league';
export const metadata = { title: 'Teams' };
export default async function Teams({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const sp = await searchParams; const c = await adminContext({});
  const { data: teams } = await c.supabase.from('teams').select('id,name,short_name,logo_url,home_venue,coach_name,description,is_active').order('name');
  const { data: priv } = sp.edit ? await c.supabase.from('team_private_details').select('contact_email,contact_phone').eq('team_id', sp.edit).maybeSingle() : { data: null };
  const { data: ct } = await c.supabase.from('competition_teams').select('team_id,season_id');
  const edit = (teams ?? []).find((t: any) => t.id === sp.edit);
  return <><Head eyebrow="League" title="Teams">{c.canWrite && <Link className="btn ghost" href="/admin/imports">Bulk import</Link>}</Head><Flash ok={sp.ok} err={sp.err} />
    {c.canWrite && <details className="dlg" open={!!edit || !teams?.length}><summary>{edit ? `Edit ${edit.name}` : 'Add a team'}</summary><Form action={saveTeam} back="/admin/teams" cols>{edit && <input type="hidden" name="id" value={edit.id} />}
      <Field label="Team name"><input name="name" defaultValue={edit?.name} required /></Field><Field label="Short name (max 5)"><input name="short_name" defaultValue={edit?.short_name} maxLength={5} required /></Field><Field label="Home venue"><input name="home_venue" defaultValue={edit?.home_venue ?? ''} /></Field><Field label="Coach / manager"><input name="coach_name" defaultValue={edit?.coach_name ?? ''} /></Field>
      <Field label="Crest (PNG/JPG/WebP, max 2 MB)"><input type="file" name="crest" accept="image/png,image/jpeg,image/webp" /></Field><Field label="Contact email (private)"><input type="email" name="contact_email" defaultValue={priv?.contact_email ?? ''} /></Field><Field label="Contact phone (private)"><input name="contact_phone" defaultValue={priv?.contact_phone ?? ''} /></Field>
      <label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="is_active" defaultChecked={edit ? edit.is_active : true} /> Active</label><Field label="Description" full><textarea name="description" defaultValue={edit?.description ?? ''} /></Field><div className="full"><button className="btn">{edit ? 'Save changes' : 'Add team'}</button></div></Form></details>}
    <section className="section"><Table head={['Team', 'Venue', 'Coach', 'Seasons', 'Status', '']} empty={teams?.length ? undefined : 'No teams yet.'}>{(teams ?? []).map((t: any) => <tr key={t.id}><td><span className="row gap" style={{ justifyContent: 'flex-start' }}><Crest team={t} /><b>{t.name}</b> <span className="muted small">{t.short_name}</span></span></td><td>{t.home_venue ?? '—'}</td><td>{t.coach_name ?? '—'}</td><td>{(ct ?? []).filter((x: any) => x.team_id === t.id).length}</td><td><StatusBadge status={t.is_active ? 'active' : 'draft'} /></td><td className="right">{c.canWrite && <Link className="btn ghost sm" href={`/admin/teams?edit=${t.id}`}>Edit</Link>} <Link className="btn ghost sm" href={`/admin/players?team=${t.id}`}>Squad</Link></td></tr>)}</Table></section></>;
}
