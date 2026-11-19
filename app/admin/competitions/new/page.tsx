import { requireAdmin } from '@/lib/auth';
import { CompetitionForm } from '@/components/competition-form';
import { Flash, Head } from '@/components/ui';
export const metadata = { title: 'New competition' };
export default async function NewCompetition({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireAdmin({ roles: ['super_admin'] }); const sp = await searchParams;
  return <><Head eyebrow="League" title="New competition" /><Flash err={sp.err} /><div className="card"><CompetitionForm back="/admin/competitions/new" /></div><p className="muted small">After creating a competition, add a season and register its teams.</p></>;
}
