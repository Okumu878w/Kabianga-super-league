import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConfirmForms } from '@/components/confirm';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Kabianga Super League | Fixtures, Results, Standings & Stats', template: '%s | Kabianga Super League' },
  description: 'Fixtures, results, league tables, teams, players and statistics for the Kabianga Super League.',
  openGraph: { type: 'website', siteName: 'Kabianga Super League', title: 'Kabianga Super League', description: 'Fixtures, results, league tables, teams, players and statistics.' },
  alternates: { canonical: '/' },
};
export const viewport: Viewport = { themeColor: '#080F1D', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
        <ConfirmForms />
      </body>
    </html>
  );
}