'use server';
import { getSession, requireAdmin } from '@/lib/auth';
import { parseTable } from '@/lib/imports/parse';
import { validateFixtureRows, validatePlayerRows, validateTeamRows } from '@/lib/imports/validate';
import { validateResultRows } from '@/lib/imports/results';
import { rateLimit } from '@/lib/rate-limit';
import { friendlyError } from '@/lib/action';

export type ImportKind = 'fixtures' | 'players' | 'teams' | 'results';
export type ImportResult = { ok: boolean; error?: string; total?: number; valid?: any[]; errors?: { row: number; message: string }[]; fatal?: boolean; committed?: { inserted: number; failed: number; errors: { row: number; message: string }[] } };

/** One code path for preview and commit: the file is ALWAYS re-parsed and re-validated on the server, never trusted from the browser. */
async function run(kind: ImportKind, scope: 'admin' | 'manager', fd: FormData, commit: boolean): Promise<ImportResult> {
  try {
    const ctx = scope === 'admin' ? await requireAdmin({ roles: ['super_admin', 'competition_admin'] }) : await getSession();
    if (!ctx.user) return { ok: false, error: 'Please sign in again.' };
    const rl = rateLimit(`import:${ctx.user.id}`, commit ? 20 : 60, 3_600_000); if (!rl.ok) return { ok: false, error: `Too many imports. Try again in ${Math.ceil(rl.retryAfter / 60)} minutes.` };
    const file = fd.get('file') as File | null; if (!file || !file.size) return { ok: false, error: 'Choose a CSV or Excel file first.' };
    const { rows, headers } = parseTable(file.name, await file.arrayBuffer());
    if (!rows.length) return { ok: false, error: 'The file has no data rows.' };
    const sb = ctx.supabase; const seasonId = String(fd.get('season_id') ?? '');
    let res: { valid: any[]; errors: any[]; total: number; fatal: boolean };
    let managerTeam: string | undefined;
    if (scope === 'manager') {
      if (kind !== 'players') return { ok: false, error: 'Managers can only import players.' };
      managerTeam = String(fd.get('team_id') ?? ''); if (!(ctx as any).teams.some((t: any) => t.team_id === managerTeam)) return { ok: false, error: 'You can only import players for your own team.' };
    }
    if (kind === 'teams') {
      const { data: teams } = await sb.from('teams').select('id,name,short_name'); res = validateTeamRows(rows, headers, teams ?? []);
    } else {
      if (!/^[0-9a-f-]{36}$/i.test(seasonId)) return { ok: false, error: 'Choose a season.' };
      const { data: ct } = await sb.from('competition_teams').select('team:teams(id,name,short_name)').eq('season_id', seasonId); const teams = (ct ?? []).map((x: any) => x.team).filter(Boolean);
      if (kind === 'results') {
        const [{ data: ex }, { data: regs }] = await Promise.all([sb.from('fixtures').select('home_team_id,away_team_id,round_number,kickoff_at,status,result_status').eq('season_id', seasonId), sb.from('player_registrations').select('team_id,player:players(id,full_name)').eq('season_id', seasonId).eq('status', 'approved')]);
        const squads = new Map<string, { player_id: string; name: string }[]>(); for (const r of (regs ?? []) as any[]) (squads.get(r.team_id) ?? squads.set(r.team_id, []).get(r.team_id)!).push({ player_id: r.player.id, name: r.player.full_name });
        res = validateResultRows(rows, headers, { seasonTeams: teams, squads, existing: ex ?? [] });
      } else if (kind === 'fixtures') { const { data: ex } = await sb.from('fixtures').select('home_team_id,away_team_id,round_number,kickoff_at,status').eq('season_id', seasonId); res = validateFixtureRows(rows, headers, { seasonTeams: teams, existing: ex ?? [] }); }
      else {
        const [{ data: regs }, { data: pend }] = await Promise.all([sb.from('player_registrations').select('team_id,squad_number,player:players(first_name,last_name,date_of_birth)').eq('season_id', seasonId).is('released_at', null),
          sb.from('player_registration_submissions').select('team_id,player_data').eq('season_id', seasonId).in('status', ['submitted', 'under_review', 'changes_requested'])]);
        res = validatePlayerRows(rows, headers, { teams, registered: (regs ?? []).map((r: any) => ({ ...r.player, team_id: r.team_id, squad_number: r.squad_number })), pending: (pend ?? []).map((p: any) => ({ first_name: p.player_data.first_name, last_name: p.player_data.last_name, date_of_birth: p.player_data.date_of_birth, team_id: p.team_id, squad_number: Number(p.player_data.squad_number) })), onlyTeamId: managerTeam });
      }
    }
    if (!commit) return { ok: true, total: res.total, valid: res.valid, errors: res.errors, fatal: res.fatal };
    if (res.fatal) return { ok: false, error: res.errors[0]?.message };
    const errors: { row: number; message: string }[] = [...res.errors]; let inserted = 0;
    if (kind === 'results') {
      const r: any = await sb.rpc('import_historical_results', { p_season: seasonId, p_rows: res.valid.map((v: any) => ({ source_row: v.source_row, week_number: v.week_number, round_number: v.round_number, home_team_id: v.home_team_id, away_team_id: v.away_team_id, scheduled_at: v.scheduled_at, venue: v.venue, home_score: v.home_score, away_score: v.away_score, events: v.events })), p_file_name: file.name });
      if (r.error) throw r.error; inserted = r.data.inserted; errors.push(...r.data.errors);
    } else if (kind === 'fixtures') {
      const r: any = (await sb.rpc('create_fixtures_batch', { p_season: seasonId, p_fixtures: res.valid.map((v) => ({ week_number: v.week_number, home_team_id: v.home_team_id, away_team_id: v.away_team_id, scheduled_at: v.scheduled_at, venue: v.venue, round_number: v.round_number, source_row: v.source_row })), p_job_type: 'import', p_config: {}, p_partial: true, p_replace_unpublished: false, p_file_name: file.name }));
      if (r.error) throw r.error; inserted = r.data.inserted; errors.push(...r.data.errors);
    } else {
      for (const v of res.valid) {
        try {
          if (kind === 'teams') {
            const { data: t, error } = await sb.from('teams').insert({ name: v.name, short_name: v.short_name, home_venue: v.home_venue, coach_name: v.coach_name, description: v.description, slug: v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }).select('id').single(); if (error) throw error;
            if (seasonId && /^[0-9a-f-]{36}$/i.test(seasonId)) { const { data: se } = await sb.from('seasons').select('competition_id').eq('id', seasonId).single(); if (se) await sb.from('competition_teams').insert({ competition_id: se.competition_id, season_id: seasonId, team_id: t!.id }); }
          } else if (scope === 'admin') {
            const { error } = await sb.rpc('register_player', { p_team: v.team_id, p_season: seasonId, p_data: { first_name: v.first_name, last_name: v.last_name, position: v.position, squad_number: v.squad_number, date_of_birth: v.date_of_birth, nationality: v.nationality } }); if (error) throw error;
          } else {
            const { error } = await sb.from('player_registration_submissions').insert({ team_id: v.team_id, season_id: seasonId, submitted_by: ctx.user.id, status: 'submitted', submission_type: 'registration', player_data: { first_name: v.first_name, last_name: v.last_name, position: v.position, squad_number: v.squad_number, date_of_birth: v.date_of_birth, nationality: v.nationality } }); if (error) throw error;
          }
          inserted++;
        } catch (e: any) { errors.push({ row: v.source_row, message: friendlyError(e) }); }
      }
      await sb.from('import_jobs').insert({ import_type: kind, season_id: seasonId || null, file_name: file.name, status: errors.length ? 'completed_with_errors' : 'completed', total_rows: res.total, successful_rows: inserted, failed_rows: res.total - inserted, error_report: errors, created_by: ctx.user.id, team_id: managerTeam ?? null });
    }
    return { ok: true, total: res.total, committed: { inserted, failed: res.total - inserted, errors: errors.sort((a, b) => a.row - b.row) } };
  } catch (e: any) { return { ok: false, error: friendlyError(e) }; }
}
export async function previewImport(kind: ImportKind, scope: 'admin' | 'manager', fd: FormData) { return run(kind, scope, fd, false); }
export async function commitImport(kind: ImportKind, scope: 'admin' | 'manager', fd: FormData) { return run(kind, scope, fd, true); }
