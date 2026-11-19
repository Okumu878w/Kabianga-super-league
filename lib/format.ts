import { format } from 'date-fns';
const TZ = 'Africa/Nairobi';
export const fmtDate = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');
export const fmtTime = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—');
export const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
export const fmtShort = (d: Date) => format(d, 'dd MMM yyyy');
export const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
/** value for <input type="datetime-local"> in Nairobi time */
export const toLocalInput = (iso: string) => { const p = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)); return p.replace(' ', 'T'); };
export const fromLocalInput = (v: string) => `${v}:00+03:00`;
export const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', live: 'Live', half_time: 'Half-time', completed: 'Full-time', postponed: 'Postponed', cancelled: 'Cancelled', abandoned: 'Abandoned' };
