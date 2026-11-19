import Link from 'next/link';
import { Logo } from '@/components/ui';
export const metadata = { title: 'Access denied', robots: { index: false } };
export default async function Unauthorized({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const msg = reason === 'deactivated' ? 'Your account has been deactivated.' : reason === 'no-team' ? 'No team has been assigned to your account yet. A league administrator needs to assign you to a team before you can use the manager portal.' : 'You do not have permission to view that page.';
  return <main id="main" className="shell" style={{ maxWidth: 520, paddingTop: 60, textAlign: 'center' }}><Logo /><h1 style={{ margin: '28px 0 8px' }}>Access denied</h1><p className="muted">{msg}</p><div className="row gap" style={{ justifyContent: 'center', marginTop: 18 }}><Link className="btn" href="/">Public site</Link><form action="/auth/signout" method="post"><button className="btn ghost">Sign out</button></form></div></main>;
}
