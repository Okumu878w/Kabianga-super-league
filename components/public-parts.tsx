import Link from 'next/link';
import { Crest, FormGuide, StatusBadge, Avatar, Table } from '@/components/ui';
import { fmtDate, fmtTime } from '@/lib/format';

export function FixtureCard({ f, c }: { f: any; c?: string }) {
  const done = f.result_status === 'published' && f.home_score != null;
  const q = c ? `?c=${c}` : '';
  return (
    <Link href={`/fixtures/${f.id}${q}`} className="card" style={{ display: 'block' }} aria-label={`${f.home?.name} versus ${f.away?.name}`}>
      <div className="row small muted"><span>{f.matchweek ? (f.matchweek.label || `Matchweek ${f.matchweek.week_number}`) : f.competition?.name}</span><StatusBadge status={done ? 'completed' : f.status} /></div>
      <div className="fx" style={{ marginTop: 12 }}>
        <div className="team"><Crest team={f.home} /><span>{f.home?.short_name || f.home?.name}</span></div>
        <div className={`score${done ? '' : ' pending'}`}>{done ? `${f.home_score} – ${f.away_score}` : fmtTime(f.kickoff_at)}</div>
        <div className="team away"><span>{f.away?.short_name || f.away?.name}</span><Crest team={f.away} /></div>
      </div>
      <div className="row small muted" style={{ marginTop: 10 }}><span>{fmtDate(f.kickoff_at)}</span><span>{f.venue ?? ''}</span></div>
    </Link>
  );
}
export function StandingsTable({ rows, limit, c, compact }: { rows: any[]; limit?: number; c?: string; compact?: boolean }) {
  const data = limit ? rows.slice(0, limit) : rows;
  return (
    <Table head={['#', 'Team', 'P', ...(compact ? [] : ['W', 'D', 'L', 'GF', 'GA']), 'GD', 'Pts', ...(compact ? [] : ['Form'])]} empty={rows.length ? undefined : 'No teams are registered for this season yet.'}>
      {data.map((r: any) => (
        <tr key={r.team_id}>
          <td><span className={`pos${r.pos <= 3 && r.played > 0 ? ' top' : ''}`}>{r.pos}</span></td>
          <td><Link href={`/teams/${r.slug}${c ? `?c=${c}` : ''}`} className="row gap" style={{ justifyContent: 'flex-start' }}><Crest team={{ name: r.team_name, short_name: r.short_name, logo_url: r.logo_url }} /><b>{r.team_name}</b></Link></td>
          <td className="num">{r.played}</td>
          {!compact && <><td className="num">{r.won}</td><td className="num">{r.drawn}</td><td className="num">{r.lost}</td><td className="num">{r.goals_for}</td><td className="num">{r.goals_against}</td></>}
          <td className="num">{r.goal_difference > 0 ? '+' : ''}{r.goal_difference}</td><td className="num pts">{r.points}</td>
          {!compact && <td>{r.form ? <FormGuide form={r.form} /> : <span className="muted">—</span>}</td>}
        </tr>
      ))}
    </Table>
  );
}
export function PlayerLine({ p, extra }: { p: any; extra?: React.ReactNode }) {
  return <Link href={`/players/${p.slug}`} className="row gap" style={{ justifyContent: 'flex-start' }}><Avatar src={p.photo_url} name={p.player_name || p.full_name} /><span><b>{p.player_name || p.full_name}</b>{extra && <span className="muted small" style={{ display: 'block' }}>{extra}</span>}</span></Link>;
}
export function Pitch({ formation, players }: { formation: string; players: any[] }) {
  const [d, ...rest] = formation.split('-').map(Number); const mids = formation === '4-2-3-1' ? [2, 3] : formation === '4-3-3' ? [3] : formation === '3-5-2' ? [5] : [4];
  const fwd = formation === '4-2-3-1' ? 1 : Number(formation.split('-').pop());
  const by = (s: string) => players.filter((p) => p.position_slot === s).sort((a, b) => a.display_order - b.display_order);
  const lines: [string, any[]][] = [['FWD', by('FWD')], ['MID', by('MID')], ['DEF', by('DEF')], ['GK', by('GK')]];
  void d; void rest; void mids; void fwd;
  return (
    <div className="pitch" role="img" aria-label={`Team of the week in a ${formation} formation`}>
      {lines.map(([slot, ps]) => ps.length > 0 && <div className="line" key={slot}>{ps.map((p) => <Link href={`/players/${p.player?.slug}`} className="pl" key={p.display_order}><Avatar src={p.player?.photo_url} name={p.player?.full_name ?? '?'} /><b>{p.player?.full_name}</b><span className="muted" style={{ color: '#d8f5e8' }}>{p.team?.short_name || p.team?.name}</span></Link>)}</div>)}
    </div>
  );
}
