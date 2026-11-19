import { requireManager } from '@/lib/auth';
/** Resolves the manager's active team (?team=<id>, only among teams assigned to them) plus its seasons. */
export async function managerContext(sp: { team?: string } = {}) {
  const s = await requireManager();
  const assignment = s.teams.find((t: any) => t.team_id === sp.team) ?? s.teams[0]; const team = (assignment as any).team;
  const { data: ct } = await s.supabase.from('competition_teams').select('season:seasons(id,name,is_current,status,competition:competitions(id,name,slug))').eq('team_id', team.id);
  const seasons = ((ct ?? []) as any[]).map((x) => x.season).filter(Boolean).sort((a, b) => Number(b.is_current) - Number(a.is_current));
  const season = seasons.find((x) => x.is_current) ?? seasons[0] ?? null;
  return { ...s, team, seasons, season, teamQ: s.teams.length > 1 ? `?team=${team.id}` : '' };
}
