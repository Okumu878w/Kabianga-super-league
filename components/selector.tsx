'use client';
import { useRouter, usePathname } from 'next/navigation';
export function CompetitionSelector({ competitions, seasons, c, s }: { competitions: { slug: string; name: string }[]; seasons: { id: string; name: string }[]; c?: string; s?: string }) {
  const router = useRouter(); const path = usePathname();
  if (!competitions.length) return null;
  const go = (comp: string, season?: string) => router.push(`${path}?c=${comp}${season ? `&s=${season}` : ''}`);
  return (
    <div className="selector" role="group" aria-label="Competition and season">
      <select aria-label="Competition" value={c} onChange={(e) => go(e.target.value)}>{competitions.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</select>
      {seasons.length > 0 && <select aria-label="Season" value={s} onChange={(e) => go(c!, e.target.value)}>{seasons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
    </div>
  );
}
