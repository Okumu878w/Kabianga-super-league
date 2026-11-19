import Link from 'next/link';
import { Flash, Logo, Field } from '@/components/ui';
import { forgotPassword } from '@/app/auth/actions';
export const metadata = { title: 'Reset password', robots: { index: false } };
export default async function Forgot({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  return <main id="main" className="shell" style={{ maxWidth: 440, paddingTop: 48 }}><Logo /><h1 style={{ margin: '28px 0 6px' }}>Reset your password</h1><Flash ok={sp.ok} err={sp.err} />
    <form action={forgotPassword} className="form card"><Field label="Email"><input type="email" name="email" autoComplete="email" required /></Field><button className="btn">Send reset link</button></form><p className="small"><Link href="/login" className="muted">← Back to sign in</Link></p></main>;
}
