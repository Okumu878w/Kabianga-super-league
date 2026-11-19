'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { friendlyError, safeBack, str, UserError } from '@/lib/action';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { SITE_URL } from '@/lib/site';

const go = (path: string, key: 'ok' | 'err', msg: string): never => redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
const ip = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
const pw = z.string().min(10, 'Password must be at least 10 characters').max(128).regex(/[A-Za-z]/, 'Password needs a letter').regex(/\d/, 'Password needs a number');

export async function login(fd: FormData) {
  const next = safeBack(fd.get('next'), '');
  try {
    const email = z.string().email('Enter a valid email address').parse(str(fd, 'email').toLowerCase()); const password = str(fd, 'password');
    const rl = rateLimit(`login:${await ip()}:${email}`, 8, 10 * 60_000); if (!rl.ok) throw new UserError(`Too many sign-in attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).`);
    const sb = await createClient(); const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error && (error.name === 'AuthRetryableFetchError' || !error.status || error.status >= 500)) throw new UserError('Could not reach the sign-in server (network problem or timeout). Check your internet connection and try again.');
    if (error || !data.user) throw new UserError('Incorrect email or password.');
    const [{ data: profile }, { data: roles }] = await Promise.all([sb.from('profiles').select('is_active').eq('id', data.user.id).maybeSingle(), sb.from('user_roles').select('role').eq('user_id', data.user.id)]);
    if (profile && profile.is_active === false) { await sb.auth.signOut(); throw new UserError('This account has been deactivated. Contact a league administrator.'); }
    await sb.rpc('log_auth_event', { p_action: 'auth.login' });
    const r = (roles ?? []).map((x: any) => x.role);
    const home = r.some((x: string) => ['super_admin', 'competition_admin', 'editor', 'viewer'].includes(x)) ? '/admin' : r.includes('team_manager') ? '/manager' : null;
    if (!home) { await sb.auth.signOut(); throw new UserError('Your account has no access yet. A league administrator must assign you a role or a team.'); }
    redirect(next && (next.startsWith('/admin') || next.startsWith('/manager')) ? next : home);
  } catch (e) { if (isRedirectError(e)) throw e; go('/login', 'err', friendlyError(e)); }
}
export async function forgotPassword(fd: FormData) {
  try {
    const email = z.string().email('Enter a valid email address').parse(str(fd, 'email').toLowerCase());
    const rl = rateLimit(`reset:${await ip()}`, 5, 15 * 60_000); if (!rl.ok) throw new UserError('Too many requests. Try again later.');
    const sb = await createClient(); await sb.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/callback?next=/auth/set-password` });
  } catch (e) { if (isRedirectError(e)) throw e; go('/forgot-password', 'err', friendlyError(e)); }
  go('/forgot-password', 'ok', 'If that email belongs to an account, a reset link is on its way.'); // same message either way: no account enumeration
}
export async function setPassword(fd: FormData) {
  try {
    const p = pw.parse(str(fd, 'password')); if (p !== str(fd, 'confirm')) throw new UserError('Passwords do not match.');
    const sb = await createClient(); const { data: { user } } = await sb.auth.getUser(); if (!user) throw new UserError('This link has expired. Request a new one.');
    const { error } = await sb.auth.updateUser({ password: p }); if (error) throw new UserError(error.message);
    await sb.rpc('log_auth_event', { p_action: 'auth.password_reset' });
  } catch (e) { if (isRedirectError(e)) throw e; go('/auth/set-password', 'err', friendlyError(e)); }
  redirect('/login?ok=' + encodeURIComponent('Password updated. Sign in with your new password.'));
}
