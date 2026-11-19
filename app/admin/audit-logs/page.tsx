import { requireAdmin } from '@/lib/auth';
import { Field, Head, Pager, Table } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Audit logs' };
const PAGE = 50;
export default async function Audit({ searchParams }: { searchParams: Promise<{ page?: string; type?: string; q?: string }> }) {
  const sp = await searchParams; const s = await requireAdmin({ roles: ['super_admin', 'competition_admin'] }); const page = Math.max(1, Number(sp.page) || 1);
  let q = s.supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,details,old_values,new_values,created_at').order('created_at', { ascending: false }); if (sp.type) q = q.eq('entity_type', sp.type);
  const { data } = await q.range((page - 1) * PAGE, page * PAGE); const rows = (data ?? []); const ids = [...new Set(rows.map((r: any) => r.actor_id).filter(Boolean))];
  const { data: ps } = ids.length ? await s.supabase.from('profiles').select('id,display_name,email').in('id', ids as string[]) : { data: [] } as any; const who = new Map((ps ?? []).map((p: any) => [p.id, p.display_name || p.email]));
  const types = ['fixtures', 'player_registrations', 'match_submissions', 'player_registration_submissions', 'team_change_requests', 'team_manager_assignments', 'user_roles', 'competitions', 'seasons', 'teams', 'profiles'];
  const diff = (r: any) => { if (!r.new_values) return ''; const o = r.old_values ?? {}; const ch = Object.keys(r.new_values).filter((k) => JSON.stringify(r.new_values[k]) !== JSON.stringify(o[k]) && !['updated_at', 'created_at'].includes(k)); return ch.slice(0, 4).map((k) => `${k}: ${JSON.stringify(o[k] ?? null)?.slice(0, 24)} → ${JSON.stringify(r.new_values[k])?.slice(0, 24)}`).join(' · '); };
  return <><Head eyebrow="System" title="Audit logs" /><form className="form cols card" style={{ marginBottom: 12 }}><Field label="Record type"><select name="type" defaultValue={sp.type ?? ''}><option value="">All</option>{types.map((t) => <option key={t}>{t}</option>)}</select></Field><div><button className="btn sm">Filter</button></div></form>
    <Table head={['When', 'Who', 'Action', 'Record', 'Details']} empty={rows.length ? undefined : 'No activity recorded.'}>{rows.slice(0, PAGE).map((r: any) => <tr key={r.id}><td className="small">{fmtDateTime(r.created_at)}</td><td>{(who.get(r.actor_id) as string) ?? (r.actor_id ? r.actor_id.slice(0, 8) : 'system')}</td><td><b>{r.action}</b></td><td className="small">{r.entity_type}<br /><span className="muted">{r.entity_id?.slice(0, 8)}</span></td><td className="small muted">{r.details?.reason ? `Reason: ${r.details.reason} ` : ''}{diff(r)}</td></tr>)}</Table><Pager base="/admin/audit-logs" page={page} hasMore={rows.length > PAGE} params={{ type: sp.type }} /></>;
}
