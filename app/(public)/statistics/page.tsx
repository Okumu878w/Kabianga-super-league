import { getContext, getPlayerStats } from '@/lib/data';
import { PlayerLine } from '@/components/public-parts';
import { Empty, Head, PageHead, Table } from '@/components/ui';
export const metadata = { title: 'Statistics', description: 'Top scorers, assists, discipline and goalkeeper statistics.' };
export default async function Stats({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s);
  if (!season) return <><PageHead eyebrow="Statistics" title="Statistics" /><Empty>No season is available yet.</Empty></>;
  const all = await getPlayerStats(season.id); const top = (k: string, n = 10) => [...all].filter((p: any) => p[k] > 0).sort((a: any, b: any) => b[k] - a[k] || a.appearances - b.appearances || a.player_name.localeCompare(b.player_name)).slice(0, n);
  const T = ({ title, rows, cols }: { title: string; rows: any[]; cols: [string, string][] }) => <section className="section" style={{ paddingTop: 8 }}><Head title={title} />{rows.length ? <Table head={['#', 'Player', 'Team', ...cols.map((c) => c[0])]}>{rows.map((p: any, i: number) => <tr key={p.player_id + p.team_id}><td><span className={`pos${i === 0 ? ' top' : ''}`}>{i + 1}</span></td><td><PlayerLine p={p} /></td><td>{p.team_name}</td>{cols.map(([, k]) => <td key={k} className="num pts">{p[k]}</td>)}</tr>)}</Table> : <Empty>Nothing recorded yet.</Empty>}</section>;
  return <><PageHead eyebrow={`${competition.name} · ${season.name}`} title="Statistics" sub="Calculated from published match reports only." />
    <T title="Top scorers" rows={top('goals')} cols={[['Apps', 'appearances'], ['Goals', 'goals']]} />
    <T title="Top assists" rows={top('assists')} cols={[['Assists', 'assists']]} />
    <T title="Yellow cards" rows={top('yellow_cards')} cols={[['Yellow', 'yellow_cards']]} />
    <T title="Red cards" rows={top('red_cards')} cols={[['Red', 'red_cards']]} />
    <T title="Goalkeepers — clean sheets" rows={all.filter((p: any) => p.pos === 'Goalkeeper' && p.appearances > 0).sort((a: any, b: any) => b.clean_sheets - a.clean_sheets || a.goals_conceded - b.goals_conceded).slice(0, 10)} cols={[['Apps', 'appearances'], ['Conceded', 'goals_conceded'], ['Clean sheets', 'clean_sheets']]} /></>;
}
