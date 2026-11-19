import Link from 'next/link';
/** Server-rendered season switcher for admin pages (plain links, works without JS). */
export function SeasonPicker({ base, seasons, competitions, current }: { base: string; seasons: any[]; competitions: any[]; current?: string }) {
  const name = (id: string) => competitions.find((c) => c.id === id)?.name ?? '';
  return <div className="chips" aria-label="Season">{seasons.map((s) => <Link key={s.id} className="chip" aria-current={s.id === current} href={`${base}?s=${s.id}`}>{name(s.competition_id)} · {s.name}</Link>)}</div>;
}
