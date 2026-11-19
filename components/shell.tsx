'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
export type NavItem = { label: string; href: string; group?: string; badge?: number };
/** Shared frame for the admin dashboard and the manager portal: desktop sidebar, mobile drawer + bottom quick-bar. */
export function AppShell({ title, subtitle, items, user, children }: { title: string; subtitle: string; items: NavItem[]; user: string; children: React.ReactNode }) {
  const path = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const cur = (h: string) => (h === '/admin' || h === '/manager' ? path === h : path === h || path.startsWith(h + '/'));
  let last = '';
  return (
    <>
      <div className="mtop"><button className="btn ghost sm" aria-expanded={open} aria-controls="side" onClick={() => setOpen(!open)}>☰ Menu</button><b>{title}</b></div>
      <div className="app">
        <aside id="side" className={`side${open ? ' open' : ''}`} aria-label={`${title} navigation`}>
          <div className="brand"><span className="mark">KSL</span><span>{title}<small>{subtitle}</small></span></div>
          <nav>{items.map((i) => { const g = i.group && i.group !== last ? <div className="grp" key={'g' + i.group}>{i.group}</div> : null; last = i.group ?? last; return <span key={i.href}>{g}<Link className="item" href={i.href} aria-current={cur(i.href) ? 'page' : undefined}>{i.label}{i.badge ? <span className="badge red" style={{ marginLeft: 'auto' }}>{i.badge}</span> : null}</Link></span>; })}</nav>
          <div className="grp">Account</div><div className="small muted" style={{ padding: '4px 10px' }}>{user}</div>
          <Link className="item" href="/">View public site</Link>
          <form action="/auth/signout" method="post"><button className="item" style={{ all: 'unset', cursor: 'pointer', padding: '9px 10px', fontSize: 13, color: '#ffb0b9' }}>Sign out</button></form>
        </aside>
        <div className="main" id="main">{children}</div>
      </div>
    </>
  );
}
