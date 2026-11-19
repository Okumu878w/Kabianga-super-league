'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
const ITEMS = [['Home', '/'], ['Competitions', '/competitions'], ['Fixtures', '/fixtures'], ['Results', '/results'], ['League Table', '/standings'], ['Teams', '/teams'], ['Players', '/players'], ['Statistics', '/statistics'], ['News', '/news']] as const;
const BOTTOM: [string, string, string][] = [['Home', '/', 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z'], ['Fixtures', '/fixtures', 'M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z'], ['Table', '/standings', 'M4 6h16M4 12h16M4 18h10'], ['Stats', '/statistics', 'M5 21V10M12 21V3M19 21v-7'], ['News', '/news', 'M4 4h13v16H6a2 2 0 01-2-2zM17 8h3v10a2 2 0 01-2 2M8 8h5M8 12h5M8 16h5']];
const keep = (sp: URLSearchParams) => { const p = new URLSearchParams(); const c = sp.get('c'), s = sp.get('s'); if (c) p.set('c', c); if (s) p.set('s', s); const t = p.toString(); return t ? `?${t}` : ''; };
export function PublicNav() {
  const path = usePathname(); const q = keep(useSearchParams());
  const cur = (h: string) => (h === '/' ? path === '/' : path.startsWith(h)) ? 'page' : undefined;
  return <nav className="nav" aria-label="Primary">{ITEMS.map(([l, h]) => <Link key={h} href={`${h}${q}`} aria-current={cur(h)}>{l}</Link>)}</nav>;
}
export function BottomNav() {
  const path = usePathname(); const q = keep(useSearchParams());
  return <nav className="bottomnav" aria-label="Mobile">{BOTTOM.map(([l, h, d]) => <Link key={h} href={`${h}${q}`} aria-current={(h === '/' ? path === '/' : path.startsWith(h)) ? 'page' : undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>{l}</Link>)}</nav>;
}
export function MobileMenu() {
  const q = keep(useSearchParams());
  return <details className="mm" style={{ position: 'relative' }}><summary className="btn ghost sm" style={{ listStyle: 'none' }} aria-label="More pages">Menu</summary><div className="card" style={{ position: 'absolute', right: 0, top: 40, minWidth: 180, display: 'grid', gap: 8, zIndex: 50 }}>{ITEMS.map(([l, h]) => <Link key={h} href={`${h}${q}`}>{l}</Link>)}<Link href="/login" className="muted">Admin / manager login</Link></div></details>;
}
