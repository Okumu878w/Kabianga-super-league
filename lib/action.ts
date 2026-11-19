import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { rateLimit } from '@/lib/rate-limit';
import { ZodError } from 'zod';

/** Turns database / validation failures into messages that tell the user what went wrong. */
export function friendlyError(e: any): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.') || 'Input'}: ${i.message}`).slice(0, 3).join('; ');
  const code = e?.code as string | undefined; const msg = String(e?.message ?? e ?? 'Unexpected error');
  if (code === 'P0001' || code === 'P0002') return msg;                 // raise exception from our SQL functions: written for humans
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.';
  if (code === '23505') return 'That record already exists (duplicate).';
  if (code === '23503') return 'A related record is missing or still in use.';
  if (code === '23514') return 'One of the values is outside the allowed range.';
  if (e?.userFacing) return msg;
  console.error('[action error]', e);
  return 'Something went wrong. Please try again.';
}
export const safeBack = (v: FormDataEntryValue | null, fallback: string) => { const s = typeof v === 'string' ? v : ''; return s.startsWith('/') && !s.startsWith('//') ? s.split('?')[0] : fallback; };
const withMsg = (path: string, key: 'ok' | 'err', msg: string) => `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(msg.slice(0, 300))}`;
export class UserError extends Error { userFacing = true; }

/** Wrap a server action body: rate-limit, run, redirect back with a flash message. */
export async function act(back: string, fn: () => Promise<string | void>, opts: { limitKey?: string; max?: number; windowMs?: number } = {}): Promise<never> {
  try {
    if (opts.limitKey) { const r = rateLimit(opts.limitKey, opts.max ?? 40, opts.windowMs ?? 60_000); if (!r.ok) throw new UserError(`Too many requests. Try again in ${r.retryAfter}s.`); }
    const msg = await fn();
    redirect(withMsg(back, 'ok', msg || 'Saved'));
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect(withMsg(back, 'err', friendlyError(e)));
  }
}
/** Supabase calls return {error}; turn it into a thrown error carrying the Postgres code. */
export function must(res: { data: any; error: any }): any { if (res.error) throw res.error; return res.data; }
export const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
export const strOrNull = (fd: FormData, k: string) => str(fd, k) || null;
export const num = (fd: FormData, k: string) => { const v = str(fd, k); return v === '' ? null : Number(v); };
