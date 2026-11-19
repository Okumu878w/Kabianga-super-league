import Link from 'next/link';
import { initials, STATUS_LABEL } from '@/lib/format';

export function Logo({ size = 36, href = '/' }: { size?: number; href?: string }) {
  return <Link href={href} className="brand" aria-label="Kabianga Super League home"><span className="mark" style={{ width: size, height: size }}>KSL</span><span>KABIANGA<small>SUPER LEAGUE</small></span></Link>;
}
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <div className={`flash ${err ? 'err' : 'ok'}`} role={err ? 'alert' : 'status'}>{err || ok}</div>;
}
export function Crest({ team, lg }: { team?: { name?: string; short_name?: string | null; logo_url?: string | null } | null; lg?: boolean }) {
  return <span className={`crest${lg ? ' lg' : ''}`} aria-hidden>{team?.logo_url ? <img src={team.logo_url} alt="" loading="lazy" /> : initials(team?.short_name || team?.name || '?')}</span>;
}
export function Avatar({ src, name, lg }: { src?: string | null; name: string; lg?: boolean }) {
  return <span className={`avatar${lg ? ' lg' : ''}`} aria-hidden>{src ? <img src={src} alt="" loading="lazy" /> : initials(name)}</span>;
}
const TONE: Record<string, string> = { approved: 'green', published: 'green', completed: 'green', active: 'green', verified: 'green', live: 'red', rejected: 'red', cancelled: 'red', abandoned: 'red', submitted: 'blue', pending: 'amber', under_review: 'amber', changes_requested: 'gold', postponed: 'gold', draft: '', scheduled: 'blue', half_time: 'red' };
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
  return <span className={`badge ${TONE[status] ?? ''}`}>{status === 'submitted' ? 'Pending' : label}</span>;
}
export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) { return <div className="empty"><div>{children}</div>{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>; }
export function Field({ label, children, full, hint }: { label: string; children: React.ReactNode; full?: boolean; hint?: string }) {
  return <label className={`field${full ? ' full' : ''}`}><span>{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}
export function Head({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return <div className="head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{children}</div>;
}
export function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) { return <header className="pagehead"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{sub && <p className="lead">{sub}</p>}</header>; }
export function Form({ action, back, children, cols, confirm }: { action: (fd: FormData) => void | Promise<void>; back: string; children: React.ReactNode; cols?: boolean; confirm?: string }) {
  return <form action={action} className={`form${cols ? ' cols' : ''}`}><input type="hidden" name="_back" value={back} />{children}</form>;
}
/** Small inline POST form for single-button actions (delete, publish...). `confirm` shows a native confirmation dialog first. */
export function Inline({ action, back, fields, label, danger, confirm, gold, ghost }: { action: (fd: FormData) => void | Promise<void>; back: string; fields: Record<string, string | number>; label: string; danger?: boolean; confirm?: string; gold?: boolean; ghost?: boolean }) {
  return <form action={action} style={{ display: 'inline' }} {...(confirm ? { 'data-confirm': confirm } : {})}><input type="hidden" name="_back" value={back} />{Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}<button className={`btn sm${danger ? ' danger' : gold ? ' gold' : ghost ? ' ghost' : ''}`} type="submit">{label}</button></form>;
}
export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  return <div className="tw" role="region" tabIndex={0} aria-label="Data table"><table className="t"><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty && <div className="empty" style={{ border: 0 }}>{empty}</div>}</div>;
}
export function FormGuide({ form }: { form: string }) { return <span className="form-dots" aria-label={`Last results: ${form.split('').join(', ')}`}>{form.split('').map((c, i) => <span key={i} className={`dot ${c}`}>{c}</span>)}</span>; }
export function Pager({ base, page, hasMore, params }: { base: string; page: number; hasMore: boolean; params?: Record<string, string | undefined> }) {
  const link = (p: number) => { const sp = new URLSearchParams(); for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v); sp.set('page', String(p)); return `${base}?${sp}`; };
  if (page <= 1 && !hasMore) return null;
  return <nav className="row" style={{ marginTop: 14 }} aria-label="Pagination">{page > 1 ? <Link className="btn ghost sm" href={link(page - 1)}>← Previous</Link> : <span />}<span className="muted small">Page {page}</span>{hasMore ? <Link className="btn ghost sm" href={link(page + 1)}>Next →</Link> : <span />}</nav>;
}
