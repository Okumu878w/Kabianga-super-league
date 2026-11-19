import { missingColumns, parseDateCell, parseTimeCell, type RawRow, type RowError } from './parse';

export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'] as const;
const POS_ALIASES: Record<string, (typeof POSITIONS)[number]> = { gk: 'Goalkeeper', keeper: 'Goalkeeper', goalkeeper: 'Goalkeeper', def: 'Defender', df: 'Defender', defender: 'Defender', cb: 'Defender', lb: 'Defender', rb: 'Defender',
  mid: 'Midfielder', mf: 'Midfielder', midfielder: 'Midfielder', cm: 'Midfielder', fw: 'Forward', fwd: 'Forward', forward: 'Forward', striker: 'Forward', st: 'Forward', winger: 'Forward' };
export const normPosition = (v: string) => POS_ALIASES[v.trim().toLowerCase()] ?? null;
const nk = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export type TeamRef = { id: string; name: string; short_name?: string | null };
const teamIndex = (teams: TeamRef[]) => { const m = new Map<string, string>(); for (const t of teams) { m.set(nk(t.name), t.id); if (t.short_name) m.set(nk(t.short_name), t.id); } return m; };

// ---------------------------------------------------------------- fixtures
export const FIXTURE_COLUMNS = ['matchweek', 'home_team', 'away_team', 'match_date', 'kickoff_time', 'venue'];
export type FixtureRow = { week_number: number; round_number: number; home_team_id: string; away_team_id: string; scheduled_at: string; venue: string | null; source_row: number; home_name: string; away_name: string };
export type ExistingFixture = { home_team_id: string; away_team_id: string; round_number: number; kickoff_at: string; status?: string };

export function validateFixtureRows(rows: RawRow[], headers: string[], ctx: { seasonTeams: TeamRef[]; existing: ExistingFixture[]; utcOffset?: string }) {
  const errors: RowError[] = []; const valid: FixtureRow[] = [];
  const miss = missingColumns(headers, FIXTURE_COLUMNS);
  if (miss.length) return { valid, errors: [{ row: 1, message: `Missing required column(s): ${miss.join(', ')}` }], total: rows.length, fatal: true };
  const idx = teamIndex(ctx.seasonTeams); const offset = ctx.utcOffset ?? '+03:00';
  const names = new Map(ctx.seasonTeams.map((t) => [t.id, t.name]));
  const seenPairs = new Map<string, number>(); const placed: { team: string; at: number; row: number }[] = [];
  for (const e of ctx.existing) if (e.status !== 'cancelled' && e.status !== 'postponed') { const at = Date.parse(e.kickoff_at); placed.push({ team: e.home_team_id, at, row: 0 }, { team: e.away_team_id, at, row: 0 }); }
  const existingPairs = new Set(ctx.existing.filter((e) => e.status !== 'cancelled').map((e) => `${[e.home_team_id, e.away_team_id].sort().join('|')}#${e.round_number}`));
  for (const r of rows) {
    const row = +r.__row; const errs: string[] = [];
    const week = /^\d+$/.test(r.matchweek) ? +r.matchweek : NaN; if (!(week >= 1 && week <= 200)) errs.push('Matchweek must be a whole number from 1 to 200');
    const home = idx.get(nk(r.home_team)); const away = idx.get(nk(r.away_team));
    if (!r.home_team) errs.push('Home team is required'); else if (!home) errs.push(`Home team "${r.home_team}" is not registered in this competition and season`);
    if (!r.away_team) errs.push('Away team is required'); else if (!away) errs.push(`Away team "${r.away_team}" is not registered in this competition and season`);
    if (home && away && home === away) errs.push('Home and away teams must be different');
    const date = parseDateCell(r.match_date); if (!date) errs.push(`Match date "${r.match_date}" is not valid (use YYYY-MM-DD or DD/MM/YYYY)`);
    const time = parseTimeCell(r.kickoff_time); if (!time) errs.push(`Kickoff time "${r.kickoff_time}" is not valid (use HH:MM)`);
    const round = r.round && /^\d+$/.test(r.round) ? +r.round : 1;
    if (!errs.length && home && away && date && time) {
      const pair = `${[home, away].sort().join('|')}#${round}`;
      if (existingPairs.has(pair)) errs.push(`Duplicate fixture: ${names.get(home)} v ${names.get(away)} already exists in round ${round}`);
      else if (seenPairs.has(pair)) errs.push(`Duplicate fixture: same pairing as row ${seenPairs.get(pair)} (put second legs in a "round" column with value 2)`);
      const at = Date.parse(`${date}T${time}:00${offset}`);
      const clash = placed.find((p) => (p.team === home || p.team === away) && Math.abs(p.at - at) < 2 * 3600000);
      if (!errs.length && clash) errs.push(`Scheduling conflict: ${names.get(clash.team)} already plays within 2 hours of ${date} ${time}${clash.row ? ` (row ${clash.row})` : ''}`);
      if (!errs.length) { seenPairs.set(pair, row); placed.push({ team: home, at, row }, { team: away, at, row });
        valid.push({ week_number: week, round_number: round, home_team_id: home, away_team_id: away, scheduled_at: `${date}T${time}:00${offset}`, venue: r.venue || null, source_row: row, home_name: names.get(home)!, away_name: names.get(away)! }); }
    }
    errs.forEach((message) => errors.push({ row, message }));
  }
  return { valid, errors, total: rows.length, fatal: false };
}

// ---------------------------------------------------------------- players
export const PLAYER_COLUMNS = ['full_name', 'team', 'position', 'squad_number'];
export type PlayerRow = { first_name: string; last_name: string; team_id: string; team_name: string; position: string; squad_number: number; date_of_birth: string | null; nationality: string | null; source_row: number };
export type ExistingPlayer = { first_name: string; last_name: string; date_of_birth?: string | null; team_id?: string; squad_number?: number | null };

export function validatePlayerRows(rows: RawRow[], headers: string[], ctx: { teams: TeamRef[]; registered: ExistingPlayer[]; pending?: ExistingPlayer[]; onlyTeamId?: string }) {
  const errors: RowError[] = []; const valid: PlayerRow[] = [];
  const miss = missingColumns(headers, PLAYER_COLUMNS);
  if (miss.length) return { valid, errors: [{ row: 1, message: `Missing required column(s): ${miss.join(', ')}` }], total: rows.length, fatal: true };
  const idx = teamIndex(ctx.teams); const names = new Map(ctx.teams.map((t) => [t.id, t.name]));
  const inFile = new Map<string, number>(); const numbers = new Map<string, number>();
  const taken = new Set([...ctx.registered, ...(ctx.pending ?? [])].filter((p) => p.team_id && p.squad_number).map((p) => `${p.team_id}#${p.squad_number}`));
  const known = new Set([...ctx.registered, ...(ctx.pending ?? [])].map((p) => `${nk(p.first_name)}|${nk(p.last_name)}|${p.date_of_birth ?? ''}`));
  const knownNoDob = new Set([...ctx.registered, ...(ctx.pending ?? [])].map((p) => `${nk(p.first_name)}|${nk(p.last_name)}`));
  for (const r of rows) {
    const row = +r.__row; const errs: string[] = [];
    const parts = r.full_name.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) errs.push('Full name must include a first and last name');
    const first = parts.slice(0, -1).join(' '); const last = parts.slice(-1)[0] ?? '';
    const team = idx.get(nk(r.team));
    if (!r.team) errs.push('Team is required'); else if (!team) errs.push(`Team "${r.team}" is not registered in this competition and season`);
    else if (ctx.onlyTeamId && team !== ctx.onlyTeamId) errs.push(`Team "${r.team}" is not your team — you can only import players for ${names.get(ctx.onlyTeamId)}`);
    const pos = normPosition(r.position); if (!pos) errs.push(`Position "${r.position}" is not valid (Goalkeeper, Defender, Midfielder or Forward)`);
    const sq = /^\d+$/.test(r.squad_number) ? +r.squad_number : NaN; if (!(sq >= 1 && sq <= 99)) errs.push('Squad number must be a whole number from 1 to 99');
    let dob: string | null = null; if (r.date_of_birth) { dob = parseDateCell(r.date_of_birth); if (!dob) errs.push(`Date of birth "${r.date_of_birth}" is not valid`); }
    if (!errs.length && team) {
      const nameKey = `${team}|${nk(first)}|${nk(last)}|${dob ?? ''}`;
      if (inFile.has(nameKey)) errs.push(`Duplicate player: same as row ${inFile.get(nameKey)}`);
      else if (known.has(`${nk(first)}|${nk(last)}|${dob ?? ''}`) || (!dob && knownNoDob.has(`${nk(first)}|${nk(last)}`))) errs.push(`Duplicate registration: ${first} ${last} is already registered or pending in this season`);
      const numKey = `${team}#${sq}`;
      if (!errs.length && numbers.has(numKey)) errs.push(`Squad number ${sq} is also used in row ${numbers.get(numKey)}`);
      else if (!errs.length && taken.has(numKey)) errs.push(`Squad number ${sq} is already taken in ${names.get(team)}`);
      if (!errs.length) { inFile.set(nameKey, row); numbers.set(numKey, row); valid.push({ first_name: first, last_name: last, team_id: team, team_name: names.get(team)!, position: pos!, squad_number: sq, date_of_birth: dob, nationality: r.nationality || null, source_row: row }); }
    }
    errs.forEach((message) => errors.push({ row, message }));
  }
  return { valid, errors, total: rows.length, fatal: false };
}

// ---------------------------------------------------------------- teams
export const TEAM_COLUMNS = ['name', 'short_name'];
export function validateTeamRows(rawRows: RawRow[], rawHeaders: string[], existing: TeamRef[]) {
  // the header alias table maps "name" to full_name (players); for team files it means the team name
  const rows = rawRows.map((r) => ({ ...r, name: r.name || r.full_name || '' }) as RawRow);
  const headers = rawHeaders.map((h) => (h === 'full_name' ? 'name' : h));
  const errors: RowError[] = []; const valid: { name: string; short_name: string; home_venue: string | null; coach_name: string | null; description: string | null; source_row: number }[] = [];
  const miss = missingColumns(headers, TEAM_COLUMNS);
  if (miss.length) return { valid, errors: [{ row: 1, message: `Missing required column(s): ${miss.join(', ')}` }], total: rows.length, fatal: true };
  const have = teamIndex(existing); const seen = new Map<string, number>();
  for (const r of rows) {
    const row = +r.__row; const errs: string[] = [];
    if (!r.name) errs.push('Team name is required'); if (!r.short_name) errs.push('Short name is required'); else if (r.short_name.length > 5) errs.push('Short name must be 5 characters or fewer');
    if (!errs.length) {
      if (have.has(nk(r.name)) || have.has(nk(r.short_name))) errs.push(`Duplicate team: "${r.name}" already exists`);
      else if (seen.has(nk(r.name)) || seen.has(nk(r.short_name))) errs.push(`Duplicate team: same name or short name as row ${seen.get(nk(r.name)) ?? seen.get(nk(r.short_name))}`);
      else { seen.set(nk(r.name), row); seen.set(nk(r.short_name), row); valid.push({ name: r.name.trim(), short_name: r.short_name.trim().toUpperCase(), home_venue: r.home_venue || null, coach_name: r.coach_name || null, description: r.description || null, source_row: row }); }
    }
    errs.forEach((message) => errors.push({ row, message }));
  }
  return { valid, errors, total: rows.length, fatal: false };
}
