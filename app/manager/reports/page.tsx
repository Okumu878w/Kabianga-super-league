import Link from 'next/link';
import { managerContext } from '@/lib/manager-ctx';
import { Empty, Head } from '@/components/ui';
import { FixtureCard } from '@/components/public-parts';
import { FIXTURE_SELECT } from '@/lib/data';
export const metadata = { title: 'Match reports' };
export default async function Reports({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const sp = await searchParams; const m = await managerContext(sp); const t = m.team;
  const { data } = await m.supabase.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${t.id},away_team_id.eq.${t.id}`).eq('result_status', 'published').order('kickoff_at', { ascending: false }).limit(50);
  return <><Head eyebrow={t.name} title="Match reports" /><p className="muted small">Official, published match reports for your fixtures (read-only).</p>{(data ?? []).length ? <div className="grid g2">{((data ?? []) as any[]).map((f) => <div key={f.id}><FixtureCard f={f} /><Link className="chip" style={{ marginTop: 6 }} href={`/fixtures/${f.id}`}>Open public match report →</Link></div>)}</div> : <Empty>No published reports yet.</Empty>}</>;
}
