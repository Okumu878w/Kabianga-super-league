import { requireManager } from '@/lib/auth';
import { Empty, Flash, Head, Inline } from '@/components/ui';
import { markRead } from '@/app/manager/actions';
import { fmtDateTime } from '@/lib/format';
import Link from 'next/link';
export const metadata = { title: 'Notifications' };
export default async function Notes({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams; const s = await requireManager();
  const { data } = await s.supabase.from('manager_notifications').select('id,title,body,href,created_at,read_at,notification_type').order('created_at', { ascending: false }).limit(100); const rows = data ?? [];
  return <><Head eyebrow="Inbox" title="Notifications">{rows.some((r: any) => !r.read_at) && <Inline action={markRead} back="/manager/notifications" fields={{}} label="Mark all as read" ghost />}</Head><Flash ok={sp.ok} err={sp.err} />
    {rows.length ? <div className="stack">{rows.map((n: any) => <div key={n.id} className="card" style={n.read_at ? { opacity: 0.7 } : { borderColor: 'var(--green)' }}><div className="row wrap"><b>{n.title}</b><span className="muted small">{fmtDateTime(n.created_at)}</span></div><p className="small muted">{n.body}</p><div className="row gap wrap" style={{ justifyContent: 'flex-start' }}>{n.href && <Link className="btn ghost sm" href={n.href}>Open related record</Link>}{!n.read_at && <Inline action={markRead} back="/manager/notifications" fields={{ id: n.id }} label="Mark as read" ghost />}</div></div>)}</div> : <Empty>No notifications yet.</Empty>}</>;
}
