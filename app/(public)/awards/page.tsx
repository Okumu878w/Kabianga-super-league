import Link from 'next/link';
import { PageHead } from '@/components/ui';
export const metadata = { title: 'Awards' };
export default async function Awards({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const sp = await searchParams; const q = sp.c ? `?c=${sp.c}${sp.s ? `&s=${sp.s}` : ''}` : '';
  return <><PageHead eyebrow="Awards" title="League awards" /><div className="grid g2"><Link className="card" href={`/player-of-the-week${q}`}><h3>Player of the Week</h3><p className="muted small">Weekly standout performer, with full history.</p></Link><Link className="card" href={`/team-of-the-week${q}`}><h3>Team of the Week</h3><p className="muted small">The best XI of every matchweek on the pitch.</p></Link></div></>;
}
