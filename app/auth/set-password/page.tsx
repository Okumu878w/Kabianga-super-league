import { redirect } from 'next/navigation';
import { Flash, Logo, Field } from '@/components/ui';
import { setPassword } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
export const metadata = { title: 'Set password', robots: { index: false } };
export default async function SetPassword({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sb = await createClient(); const { data: { user } } = await sb.auth.getUser(); if (!user) redirect('/login?err=' + encodeURIComponent('That link has expired. Request a new one.'));
  const sp = await searchParams;
  return <main id="main" className="shell" style={{ maxWidth: 440, paddingTop: 48 }}><Logo /><h1 style={{ margin: '28px 0 6px' }}>Choose a password</h1><p className="muted">At least 10 characters with a letter and a number.</p><Flash err={sp.err} />
    <form action={setPassword} className="form card"><Field label="New password"><input type="password" name="password" autoComplete="new-password" minLength={10} required /></Field><Field label="Confirm password"><input type="password" name="confirm" autoComplete="new-password" minLength={10} required /></Field><button className="btn">Save password</button></form></main>;
}
