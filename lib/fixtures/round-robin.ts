/**
 * Deterministic round-robin engine (circle method).
 *  - Same input => same output (team ids are sorted first).
 *  - Odd team counts get a "bye" slot; the team paired with it simply rests that round.
 *  - Each leg k (0-based) replays the full schedule; odd legs reverse home/away.
 *  - Home/away is balanced greedily so no team drifts more than one home game from an even split.
 */
export type Pairing = { round: number; leg: number; home: string; away: string };
export type RoundRobinResult = { rounds: Pairing[][]; byes: (string | null)[]; teamCount: number; matchesPerTeam: number };

const BYE = '__BYE__';

export function generateRoundRobin(teamIds: string[], legs: number = 1): RoundRobinResult {
  const unique = Array.from(new Set(teamIds));
  if (unique.length !== teamIds.length) throw new Error('Duplicate team in the participant list');
  if (unique.length < 2) throw new Error('At least two teams are required');
  if (!Number.isInteger(legs) || legs < 1 || legs > 4) throw new Error('Number of rounds must be between 1 and 4');

  const teams = [...unique].sort();
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const perLeg = n - 1;

  // first leg, orientation decided greedily below
  const firstLeg: [string, string][][] = [];
  const byes: (string | null)[] = [];
  const homeCount = new Map<string, number>();
  const awayCount = new Map<string, number>();
  const lastVenue = new Map<string, 'H' | 'A'>();
  const diff = (t: string) => (homeCount.get(t) ?? 0) - (awayCount.get(t) ?? 0);

  for (let r = 0; r < perLeg; r++) {
    const pos: string[] = [teams[0]];
    for (let k = 1; k < n; k++) pos.push(teams[1 + ((k - 1 + r) % (n - 1))]);
    const round: [string, string][] = [];
    let bye: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const a = pos[i];
      const b = pos[n - 1 - i];
      if (a === BYE) { bye = b; continue; }
      if (b === BYE) { bye = a; continue; }
      // give home to the team that is further behind on home games; break ties by previous venue, then by id for determinism
      const da = diff(a), db = diff(b);
      let home: string, away: string;
      if (da !== db) [home, away] = da < db ? [a, b] : [b, a];
      else if (lastVenue.get(a) !== lastVenue.get(b)) [home, away] = lastVenue.get(a) === 'A' || lastVenue.get(b) === 'H' ? [a, b] : [b, a];
      else [home, away] = a < b ? [a, b] : [b, a];
      homeCount.set(home, (homeCount.get(home) ?? 0) + 1); awayCount.set(away, (awayCount.get(away) ?? 0) + 1);
      lastVenue.set(home, 'H'); lastVenue.set(away, 'A');
      round.push([home, away]);
    }
    firstLeg.push(round);
    byes.push(bye);
  }

  const rounds: Pairing[][] = [];
  const allByes: (string | null)[] = [];
  for (let leg = 0; leg < legs; leg++) {
    firstLeg.forEach((round, r) => {
      rounds.push(round.map(([h, a]) => (leg % 2 === 0 ? { round: leg * perLeg + r + 1, leg: leg + 1, home: h, away: a } : { round: leg * perLeg + r + 1, leg: leg + 1, home: a, away: h })));
      allByes.push(byes[r]);
    });
  }
  return { rounds, byes: allByes, teamCount: unique.length, matchesPerTeam: (unique.length - 1) * legs };
}

export function homeAwayBalance(rounds: Pairing[][]): Record<string, { home: number; away: number }> {
  const out: Record<string, { home: number; away: number }> = {};
  for (const m of rounds.flat()) {
    (out[m.home] ??= { home: 0, away: 0 }).home++;
    (out[m.away] ??= { home: 0, away: 0 }).away++;
  }
  return out;
}
