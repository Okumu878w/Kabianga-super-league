import { generateRoundRobin, type Pairing } from './round-robin';

export type ScheduleConfig = {
  teamIds: string[];
  legs: number;                       // 1 = single, 2 = double round robin
  startDate: string;                  // YYYY-MM-DD, the first day of matchweek 1
  matchDays: number[];                // preferred weekdays, 0=Sun..6=Sat
  kickoffTimes: string[];             // HH:MM, local time
  intervalWeeks: number;              // weeks between matchweek starts
  minRestDays: number;                // minimum days between two games for one team
  utcOffset: string;                  // e.g. +03:00
  venueMode: 'home_ground' | 'fixed' | 'rotate';
  venues?: string[];                  // used for fixed (first) / rotate (all)
  homeVenues?: Record<string, string | null>;
  unavailable?: Record<string, string[]>; // teamId -> unavailable dates (YYYY-MM-DD)
  firstMatchweek?: number;
};
export type GeneratedFixture = { week_number: number; round_number: number; home_team_id: string; away_team_id: string; scheduled_at: string; venue: string | null; date: string; time: string };
export type ScheduleResult = { fixtures: GeneratedFixture[]; warnings: string[]; byes: { week_number: number; team_id: string }[]; matchesPerTeam: number };

const DAY = 86400000;
const parseDate = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) throw new Error(`Invalid date "${s}" (use YYYY-MM-DD)`); const d = Date.UTC(+m[1], +m[2] - 1, +m[3]); if (new Date(d).getUTCDate() !== +m[3]) throw new Error(`Invalid date "${s}"`); return d; };
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function buildSchedule(cfg: ScheduleConfig): ScheduleResult {
  if (!cfg.matchDays.length) throw new Error('Choose at least one match day');
  if (!cfg.kickoffTimes.length) throw new Error('Choose at least one kickoff time');
  cfg.kickoffTimes.forEach((t) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`Invalid kickoff time "${t}" (use HH:MM)`); });
  if (cfg.intervalWeeks < 1) throw new Error('Matchweek interval must be at least 1 week');
  const rr = generateRoundRobin(cfg.teamIds, cfg.legs);
  const start = parseDate(cfg.startDate);
  const first = cfg.firstMatchweek ?? 1;
  const warnings: string[] = [];
  const fixtures: GeneratedFixture[] = [];
  const byes: { week_number: number; team_id: string }[] = [];
  const days = [...new Set(cfg.matchDays)].sort((a, b) => a - b);
  const times = [...cfg.kickoffTimes].sort();

  rr.rounds.forEach((round, idx) => {
    const week = first + idx;
    if (rr.byes[idx]) byes.push({ week_number: week, team_id: rr.byes[idx] as string });
    const weekStart = start + idx * cfg.intervalWeeks * 7 * DAY;
    // candidate slots in the matchweek window (the 7 days from weekStart), ordered by date then time
    const slots: { date: string; time: string; used: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = weekStart + d * DAY;
      if (days.includes(new Date(ms).getUTCDay())) for (const t of times) slots.push({ date: fmt(ms), time: t, used: 0 });
    }
    if (!slots.length) throw new Error(`No match day falls inside matchweek ${week}`);
    const capacity = cfg.venueMode === 'home_ground' ? Infinity : cfg.venueMode === 'rotate' ? Math.max(1, cfg.venues?.length ?? 1) : 1;
    round.forEach((m: Pairing, i) => {
      // distribute evenly: start from the slot with the fewest matches, skip slots where a team is unavailable
      const order = slots.map((s, k) => ({ s, k })).sort((a, b) => a.s.used - b.s.used || a.k - b.k);
      let chosen = order.find(({ s }) => s.used < capacity && !(cfg.unavailable?.[m.home]?.includes(s.date)) && !(cfg.unavailable?.[m.away]?.includes(s.date)))?.s;
      if (!chosen) {
        const fallback = order.find(({ s }) => s.used < capacity)?.s;
        if (!fallback) throw new Error(`Not enough kickoff slots in matchweek ${week}: ${round.length} matches but only ${slots.length} slot(s) for ${cfg.venueMode} venue scheduling. Add match days or kickoff times.`);
        warnings.push(`Matchweek ${week}: a team is unavailable on every slot for one fixture; it was placed on ${fallback.date} ${fallback.time} anyway.`);
        chosen = fallback;
      }
      chosen.used++;
      let venue: string | null = null;
      if (cfg.venueMode === 'home_ground') venue = cfg.homeVenues?.[m.home] ?? null;
      else if (cfg.venueMode === 'fixed') venue = cfg.venues?.[0] ?? null;
      else venue = cfg.venues?.length ? cfg.venues[(chosen.used - 1 + i) % cfg.venues.length] : null;
      fixtures.push({ week_number: week, round_number: m.leg, home_team_id: m.home, away_team_id: m.away, scheduled_at: `${chosen.date}T${chosen.time}:00${cfg.utcOffset}`, venue, date: chosen.date, time: chosen.time });
    });
  });

  // rest-interval check
  const byTeam = new Map<string, number[]>();
  for (const f of fixtures) for (const t of [f.home_team_id, f.away_team_id]) (byTeam.get(t) ?? byTeam.set(t, []).get(t)!).push(parseDate(f.date));
  for (const [team, ds] of byTeam) {
    ds.sort((a, b) => a - b);
    for (let i = 1; i < ds.length; i++) if ((ds[i] - ds[i - 1]) / DAY < cfg.minRestDays) { warnings.push(`Team ${team.slice(0, 8)} has only ${(ds[i] - ds[i - 1]) / DAY} day(s) rest before ${fmt(ds[i])} (minimum ${cfg.minRestDays}).`); break; }
  }
  return { fixtures, warnings, byes, matchesPerTeam: rr.matchesPerTeam };
}
