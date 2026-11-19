import Link from 'next/link';
import { Flash, Logo, Field } from '@/components/ui';
import { login } from '@/app/auth/actions';
export const metadata = { title: 'Sign in', robots: { index: false } };
export default async function Login({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; next?: string }> }) {
  const sp = await searchParams;
  return <main id="main" className="shell" style={{ maxWidth: 440, paddingTop: 48 }}><Logo /><h1 style={{ margin: '28px 0 6px' }}>Sign in</h1><p className="muted">For league administrators and team managers. Team manager accounts are created by invitation only.</p>
    <Flash ok={sp.ok} err={sp.err} />
    <form action={login} className="form card"><input type="hidden" name="next" value={sp.next ?? ''} /><Field label="Email"><input type="email" name="email" autoComplete="email" required /></Field><Field label="Password"><input type="password" name="password" autoComplete="current-password" required /></Field><button className="btn">Sign in</button><Link href="/forgot-password" className="muted small">Forgot your password?</Link></form>
    <p className="small"><Link href="/" className="muted">← Back to the public site</Link></p></main>;
}
