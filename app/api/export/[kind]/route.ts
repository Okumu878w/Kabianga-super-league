import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSession, ADMIN_ROLES } from '@/lib/auth';
import { toCsv, toXlsx } from '@/lib/exports';
import { rateLimit } from '@/lib/rate-limit';
import { fmtDateTime } from '@/lib/format';

const KINDS = ['standings', 'fixtures', 'results', 'squads', 'player-stats', 'top-scorers', 'match-reports', 'summary'];
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params; const s = await getSession();
  if (!s.user || !s.roles.some((r) => ADMIN_ROLES.includes(r))) return new NextResponse('Forbidden', { status: 403 });
  if (!KINDS.includes(kind)) return new NextResponse('Not found', { status: 404 });
  if (!rateLimit(`export:${s.user.id}`, 30, 60_000).ok) return new NextResponse('Too many requests', { status: 429 });
  const season = req.nextUrl.searchParams.get('s') ?? ''; const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  if (!/^[0-9a-f-]{36}$/i.test(season)) return new NextResponse('Missing season', { status: 400 });
  const sb = s.supabase;
  const { data: se } = await sb.from('seasons').select('name,competition:competitions(name)').eq('id', season).maybeSingle() as any; if (!se) return new NextResponse('Season not found', { status: 404 });
  const title = `${se.competition.name} ${se.name}`;
  const fx = async (results: boolean | null) => { let q = sb.from('fixtures').select('kickoff_at,venue,status,home_score,away_score,result_status,round_number,matchweek:matchweeks(week_number),home:teams!fixtures_home_team_id_fkey(name),away:teams!fixtures_away_team_id_fkey(name)').eq('season_id', season).order('kickoff_at'); if (results === true) q = q.eq('result_status', 'published'); return ((await q).data ?? []) as any[]; };
  const fixtureRows = (l: any[]) => l.map((f) => ({ Matchweek: f.matchweek?.week_number, Round: f.round_number, Kickoff: fmtDateTime(f.kickoff_at), Home: f.home.name, Away: f.away.name, Score: f.result_status === 'published' ? `${f.home_score}-${f.away_score}` : '', Venue: f.venue ?? '', Status: f.status, Result: f.result_status }));
  let sheets: Record<string, Record<string, unknown>[]> = {};
  if (kind === 'standings' || kind === 'summary') { const { data } = await sb.rpc('get_standings', { p_season: season }); sheets.Standings = (data ?? []).map((r: any) => ({ Pos: r.pos, Team: r.team_name, P: r.played, W: r.won, D: r.drawn, L: r.lost, GF: r.goals_for, GA: r.goals_against, GD: r.goal_difference, Pts: r.points, Form: r.form })); }
  if (kind === 'fixtures') sheets.Fixtures = fixtureRows(await fx(null));
  if (kind === 'results' || kind === 'summary') sheets.Results = fixtureRows(await fx(true));
  if (kind === 'player-stats' || kind === 'top-scorers' || kind === 'summary') { const { data } = await sb.rpc('get_player_stats', { p_season: season, p_matchweek: null }); let rows = (data ?? []) as any[]; if (kind !== 'player-stats') rows = rows.filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals); sheets[kind === 'player-stats' ? 'Player stats' : 'Top scorers'] = rows.map((r) => ({ Player: r.player_name, Team: r.team_name, Position: r.pos, Apps: r.appearances, Goals: r.goals, Assists: r.assists, Yellow: r.yellow_cards, Red: r.red_cards, 'Clean sheets': r.clean_sheets, Conceded: r.goals_conceded })); }
  if (kind === 'squads') { const { data } = await sb.from('player_registrations').select('squad_number,position,status,team:teams(name),player:players(full_name,nationality,date_of_birth)').eq('season_id', season).is('released_at', null).order('team_id'); sheets.Squads = ((data ?? []) as any[]).map((r) => ({ Team: r.team.name, Number: r.squad_number, Player: r.player.full_name, Position: r.position, Nationality: r.player.nationality ?? '', 'Date of birth': r.player.date_of_birth ?? '', Status: r.status })); }
  if (kind === 'match-reports') { const { data } = await sb.from('match_reports').select('referee,attendance,match_summary,draft_home_score,draft_away_score,fixture:fixtures!inner(kickoff_at,season_id,result_status,home:teams!fixtures_home_team_id_fkey(name),away:teams!fixtures_away_team_id_fkey(name))').eq('fixture.season_id', season); sheets.Reports = ((data ?? []) as any[]).map((r) => ({ Kickoff: fmtDateTime(r.fixture.kickoff_at), Home: r.fixture.home.name, Away: r.fixture.away.name, Score: `${r.draft_home_score ?? ''}-${r.draft_away_score ?? ''}`, Referee: r.referee ?? '', Attendance: r.attendance ?? '', Status: r.fixture.result_status, Summary: r.match_summary ?? '' })); }
  const file = `ksl-${kind}-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' }); doc.setFontSize(16); doc.text(`Kabianga Super League — ${title}`, 14, 16); let y = 24;
    for (const [name, rows] of Object.entries(sheets)) { doc.setFontSize(12); doc.text(name, 14, y); if (rows.length) autoTable(doc, { startY: y + 3, head: [Object.keys(rows[0])], body: rows.map((r) => Object.values(r).map((v) => String(v ?? ''))), styles: { fontSize: 8 }, headStyles: { fillColor: [22, 199, 132], textColor: 0 } }); y = ((doc as any).lastAutoTable?.finalY ?? y) + 12; if (y > 180) { doc.addPage(); y = 16; } }
    return new NextResponse(doc.output('arraybuffer') as any, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}.pdf"` } });
  }
  if (format === 'xlsx') return new NextResponse(toXlsx(sheets) as any, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${file}.xlsx"` } });
  const first = Object.values(sheets)[0] ?? [];
  return new NextResponse(toCsv(first), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}.csv"` } });
}
