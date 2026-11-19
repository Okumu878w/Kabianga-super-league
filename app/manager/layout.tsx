import { requireManager } from '@/lib/auth';
import { AppShell } from '@/components/shell';
export const metadata = { title: { default: 'Manager portal', template: '%s | KSL Manager' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireManager();
  const { count } = await s.supabase.from('manager_notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  const items = [{ label: 'Overview', href: '/manager' }, { label: 'My Team', href: '/manager/team' }, { label: 'Squad Management', href: '/manager/squad' }, { label: 'Player Registrations', href: '/manager/registrations' }, { label: 'Fixtures', href: '/manager/fixtures' }, { label: 'Match Submissions', href: '/manager/submissions' }, { label: 'Match Reports', href: '/manager/reports' }, { label: 'Notifications', href: '/manager/notifications', badge: count ?? 0 }, { label: 'Profile & Settings', href: '/manager/settings' }];
  return <AppShell title="Team Manager" subtitle={s.teams.map((t: any) => t.team.short_name || t.team.name).join(' · ')} items={items} user={s.profile?.display_name ?? s.user.email ?? ''}>{children}</AppShell>;
}
