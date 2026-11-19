import { requireAdmin } from '@/lib/auth';
import { AppShell, type NavItem } from '@/components/shell';
export const metadata = { title: { default: 'Admin', template: '%s | KSL Admin' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  const [{ count: pending }, { count: pm }] = await Promise.all([
    s.supabase.from('player_registration_submissions').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']),
    s.supabase.from('match_submissions').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review'])]);
  const items: NavItem[] = [
    { label: 'Overview', href: '/admin' },
    { group: 'League', label: 'Competitions', href: '/admin/competitions' }, { group: 'League', label: 'Seasons', href: '/admin/seasons' }, { group: 'League', label: 'Teams', href: '/admin/teams' }, { group: 'League', label: 'Players', href: '/admin/players' },
    { group: 'Matches', label: 'Fixtures', href: '/admin/fixtures' }, { group: 'Matches', label: 'Matchweeks', href: '/admin/matchweeks' }, { group: 'Matches', label: 'Results', href: '/admin/results' }, { group: 'Matches', label: 'Match Reports', href: '/admin/reports' },
    { group: 'Stats & awards', label: 'League Tables', href: '/admin/standings' }, { group: 'Stats & awards', label: 'Player Statistics', href: '/admin/statistics' }, { group: 'Stats & awards', label: 'Awards', href: '/admin/awards' }, { group: 'Stats & awards', label: 'Team of the Week', href: '/admin/team-of-the-week' },
    { group: 'Content', label: 'News Management', href: '/admin/news' },
    { group: 'Team managers', label: 'Approval Queue', href: '/admin/approvals', badge: (pending ?? 0) + (pm ?? 0) },
    { group: 'Team managers', label: 'Team Managers', href: '/admin/managers' },
    { group: 'System', label: 'Imports & Exports', href: '/admin/imports' }, { group: 'System', label: 'Users & Permissions', href: '/admin/users' }, { group: 'System', label: 'Audit Logs', href: '/admin/audit-logs' }, { group: 'System', label: 'Settings', href: '/admin/settings' },
  ];
  return <AppShell title="KSL Admin" subtitle={s.roles.join(', ').replace(/_/g, ' ')} items={items} user={s.profile?.display_name ?? s.user.email ?? ''}>{!s.canWrite && <div className="flash ok">You have read-only (viewer) access.</div>}{children}</AppShell>;
}