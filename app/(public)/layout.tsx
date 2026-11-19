import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui';
import { PublicNav, BottomNav, MobileMenu } from '@/components/public-nav';
import { CompetitionSelector } from '@/components/selector';
import { getContext, getLeagueSettings } from '@/lib/data';
import { SelectorLoader } from '@/components/selector-loader';
// Public pages read the visitor's session cookie and live league data, so they must never be pre-rendered at build time.
export const dynamic = 'force-dynamic';
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // The selector reads ?c=&s= on the client; layouts cannot see searchParams, so it is fed the full list and the URL decides.
  const { competitions } = await getContext();
  const settings = await getLeagueSettings();
  return (
    <>
      <header className="topbar"><div className="shell in">
        <Logo />
        <Suspense fallback={null}><PublicNav /><SelectorLoader competitions={competitions} /><div className="mobile-only"><MobileMenu /></div></Suspense>
      </div></header>
      <main id="main" className="shell">{children}</main>
      <footer className="footer"><div className="shell row wrap">
        <div>© {new Date().getFullYear()} {settings?.league_name ?? 'Kabianga Super League'}. {settings?.contact_email && <>Contact: <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a></>}</div>
        <div className="row gap">{Object.entries((settings?.social_links ?? {}) as Record<string, string>).filter(([, v]) => /^https?:\/\//.test(v)).map(([k, v]) => <a key={k} href={v} rel="noopener noreferrer" target="_blank">{k}</a>)}<Link href="/login">Staff login</Link></div>
      </div></footer>
      <Suspense fallback={null}><BottomNav /></Suspense>
      <style>{`.mobile-only{display:none}@media(max-width:900px){.mobile-only{display:block}}`}</style>
    </>
  );
}
