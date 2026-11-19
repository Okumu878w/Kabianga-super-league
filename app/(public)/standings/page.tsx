import { getContext, getStandings } from '@/lib/data';
import { StandingsTable } from '@/components/public-parts';
import { Empty, PageHead } from '@/components/ui';
export const metadata = { title: 'League Table', description: 'Live Kabianga Super League standings, calculated from published results.' };
export default async function Standings({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  if (!season) return <><PageHead eyebrow="Standings" title="League table" /><Empty>No season is available yet.</Empty></>;
  const rows = await getStandings(season.id);
  return <><PageHead eyebrow={`${competition.name} · ${season.name}`} title="League table" sub={`Win ${competition.points_win} · Draw ${competition.points_draw} · Loss ${competition.points_loss}. Ties broken by ${(competition.tie_break_rules as string[]).map((r) => r.replace(/_/g, ' ')).join(', then ')}.`} />
    <StandingsTable rows={rows} c={competition.slug} /><p className="muted small">P played · W won · D drawn · L lost · GF goals for · GA goals against · GD goal difference · Form: last five results, oldest to newest.</p></>;
}
