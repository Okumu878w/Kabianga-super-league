import { missingColumns, parseDateCell, parseTimeCell, type RawRow, type RowError } from './parse';
import { buildEvents, type ResultEvent, type SquadPlayer } from '@/lib/results/scorers';
import type { TeamRef, ExistingFixture } from './validate';

export const RESULT_COLUMNS = ['match_date', 'home_team', 'away_team'];
export type ResultRow = { week_number: number; round_number: number; home_team_id: string; away_team_id: string; scheduled_at: string; venue: string | null; home_score: number; away_score: number; events: ResultEvent[]; source_row: number; home_name: string; away_name: string; scorers: number };
const nk = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const DAY = 86400000;
const weekStart = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY; };

/** Validates results of matches that were already played. Scorers are optional; scores are required. */
export function validateResultRows(rows: RawRow[], headers: string[], ctx: { seasonTeams: TeamRef[]; squads: Map<string, SquadPlayer[]>; existing: (ExistingFixture & { result_status?: string })[]; utcOffset?: string }) {
  const errors: RowError[] = []; const valid: ResultRow[] = [];
  const miss = missingColumns(headers, RESULT_COLUMNS); const hasScore = headers.includes('score') || (headers.includes('home_score') && headers.includes('away_score'));
  if (miss.length || !hasScore) return { valid, errors: [{ row: 1, message: miss.length ? `Missing required column(s): ${miss.join(', ')}` : 'Missing score columns: use home_score and away_score (or one "score" column like 2-1)' }], total: rows.length, fatal: true };
  const idx = new Map<string, string>(); for (const t of ctx.seasonTeams) { idx.set(nk(t.name), t.id); if (t.short_name) idx.set(nk(t.short_name), t.id); }
  const names = new Map(ctx.seasonTeams.map((t) => [t.id, t.name])); const offset = ctx.utcOffset ?? '+03:00';
  const pairCount = new Map<string, number>(); for (const e of ctx.existing) if (e.status !== 'cancelled') { const k = [e.home_team_id, e.away_team_id].sort().join('|'); pairCount.set(k, Math.max(pairCount.get(k) ?? 0, e.round_number)); }
  const parsed: { r: RawRow; date: string }[] = []; for (const r of rows) { const d = parseDateCell(r.match_date ?? ''); if (d) parsed.push({ r, date: d }); }
  const weeks = [...new Set(parsed.map((p) => weekStart(p.date)))].sort((a, b) => a - b); const weekNo = (d: string) => weeks.indexOf(weekStart(d)) + 1;
  const seen = new Map<string, number>(); const seenDay = new Map<string, number>(); const placed: { team: string; at: number }[] = [];
  for (const r of rows) {
    const row = +r.__row; const errs: string[] = [];
    const home = idx.get(nk(r.home_team)); const away = idx.get(nk(r.away_team));
    if (!r.home_team) errs.push('Home team is required'); else if (!home) errs.push(`Home team "${r.home_team}" is not registered in this competition and season`);
    if (!r.away_team) errs.push('Away team is required'); else if (!away) errs.push(`Away team "${r.away_team}" is not registered in this competition and season`);
    if (home && away && home === away) errs.push('Home and away teams must be different');
    const date = parseDateCell(r.match_date ?? ''); if (!date) errs.push(`Match date "${r.match_date}" is not valid (use YYYY-MM-DD or DD/MM/YYYY)`);
    const time = r.kickoff_time ? parseTimeCell(r.kickoff_time) : '15:00'; if (!time) errs.push(`Kickoff time "${r.kickoff_time}" is not valid (use HH:MM)`);
    let hs: number, as_: number;
    if (r.score) { const m = /^\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*$/.exec(r.score); hs = m ? +m[1] : NaN; as_ = m ? +m[2] : NaN; } else { hs = /^\d{1,2}$/.test(r.home_score ?? '') ? +r.home_score : NaN; as_ = /^\d{1,2}$/.test(r.away_score ?? '') ? +r.away_score : NaN; }
    if (Number.isNaN(hs) || Number.isNaN(as_)) errs.push('Score must be two whole numbers (home_score and away_score, or "2-1")'); else if (hs > 30 || as_ > 30) errs.push('Scores above 30 are not accepted');
    let events: ResultEvent[] = [];
    if (!errs.length && home && away) {
      const h = buildEvents(home, away, r.home_scorers ?? '', ctx.squads); const a = buildEvents(away, home, r.away_scorers ?? '', ctx.squads); errs.push(...h.errors.map((e) => `Home scorers: ${e}`), ...a.errors.map((e) => `Away scorers: ${e}`)); events = [...h.events, ...a.events];
      const hg = events.filter((e) => (e.team_id === home && e.event_type !== 'own_goal') || (e.team_id === away && e.event_type === 'own_goal')).length;
      const ag = events.filter((e) => (e.team_id === away && e.event_type !== 'own_goal') || (e.team_id === home && e.event_type === 'own_goal')).length;
      if (!errs.length && hg > hs) errs.push(`${hg} home scorers listed but the home score is ${hs}`); if (!errs.length && ag > as_) errs.push(`${ag} away scorers listed but the away score is ${as_}`);
    }
    if (!errs.length && home && away && date && time) {
      const key = [home, away].sort().join('|'); let round = r.round && /^\d+$/.test(r.round) ? +r.round : 0;
      const dayOf = (iso: string) => new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 10);
      const sameDay = ctx.existing.find((e) => [e.home_team_id, e.away_team_id].sort().join('|') === key && dayOf(e.kickoff_at) === date && e.status !== 'cancelled');
      if (!round) round = sameDay ? sameDay.round_number : Math.max(pairCount.get(key) ?? 0, 0) + 1; // same date as an existing fixture = the same match (makes re-uploading a file safe)
      const dayKey = `${key}@${date}`; if (seenDay.has(dayKey)) errs.push(`Duplicate: same teams and date as row ${seenDay.get(dayKey)}`);
      const ex = ctx.existing.find((e) => [e.home_team_id, e.away_team_id].sort().join('|') === key && e.round_number === round && e.status !== 'cancelled');
      if (ex?.result_status === 'published') errs.push(`${names.get(home)} v ${names.get(away)} already has a published result in round ${round}`);
      else if (ex && ex.home_team_id !== home) errs.push('A fixture for these teams already exists with home and away reversed — swap the teams in your file');
      const dupKey = `${key}#${round}`; if (!errs.length && seen.has(dupKey)) errs.push(`Duplicate: same pairing as row ${seen.get(dupKey)} (add a "round" column with 2 for a second meeting)`);
      const at = Date.parse(`${date}T${time}:00${offset}`);
      if (!errs.length && !ex) { const clash = placed.find((p) => (p.team === home || p.team === away) && Math.abs(p.at - at) < 2 * 3600000); if (clash) errs.push(`${names.get(clash.team)} has another match within 2 hours of ${date} ${time}`); }
      if (!errs.length) { seen.set(dupKey, row); seenDay.set(dayKey, row); pairCount.set(key, Math.max(pairCount.get(key) ?? 0, round)); placed.push({ team: home, at }, { team: away, at });
        valid.push({ week_number: r.matchweek && /^\d+$/.test(r.matchweek) ? +r.matchweek : weekNo(date), round_number: round, home_team_id: home, away_team_id: away, scheduled_at: `${date}T${time}:00${offset}`, venue: r.venue || null, home_score: hs, away_score: as_, events, source_row: row, home_name: names.get(home)!, away_name: names.get(away)!, scorers: events.length }); }
    }
    errs.forEach((message) => errors.push({ row, message }));
  }
  return { valid, errors, total: rows.length, fatal: false };
}
