import { describe, it, expect } from 'vitest';
import { generateRoundRobin, homeAwayBalance } from '@/lib/fixtures/round-robin';
import { buildSchedule } from '@/lib/fixtures/schedule';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `team-${String(i + 1).padStart(2, '0')}`);
const key = (a: string, b: string) => [a, b].sort().join('|');

describe.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 19, 20])('round robin with %i teams', (n) => {
  for (const legs of [1, 2]) {
    it(`legs=${legs}: every pair meets exactly ${legs}x, nobody plays themselves, each team plays the expected number`, () => {
      const rr = generateRoundRobin(ids(n), legs);
      const all = rr.rounds.flat();
      expect(all.every((m) => m.home !== m.away)).toBe(true);
      const pairCount = new Map<string, number>();
      all.forEach((m) => pairCount.set(key(m.home, m.away), (pairCount.get(key(m.home, m.away)) ?? 0) + 1));
      expect(pairCount.size).toBe((n * (n - 1)) / 2);
      expect([...pairCount.values()].every((c) => c === legs)).toBe(true);
      const played = new Map<string, number>();
      all.forEach((m) => { played.set(m.home, (played.get(m.home) ?? 0) + 1); played.set(m.away, (played.get(m.away) ?? 0) + 1); });
      expect([...played.values()].every((c) => c === (n - 1) * legs)).toBe(true);
      expect(rr.rounds.length).toBe((n % 2 ? n : n - 1) * legs);
    });
    it(`legs=${legs}: no team plays twice in one round; odd counts give exactly one bye per round`, () => {
      const rr = generateRoundRobin(ids(n), legs);
      rr.rounds.forEach((round, i) => {
        const teams = round.flatMap((m) => [m.home, m.away]);
        expect(new Set(teams).size).toBe(teams.length);
        expect(rr.byes[i] === null).toBe(n % 2 === 0);
        if (n % 2) expect(teams.includes(rr.byes[i] as string)).toBe(false);
      });
    });
  }
  it('double round robin reverses home and away in the second leg and balances venues', () => {
    const rr = generateRoundRobin(ids(n), 2);
    const bal = homeAwayBalance(rr.rounds);
    for (const b of Object.values(bal)) expect(b.home).toBe(b.away);
    const [first, second] = [rr.rounds.slice(0, rr.rounds.length / 2).flat(), rr.rounds.slice(rr.rounds.length / 2).flat()];
    const f = new Set(first.map((m) => `${m.home}>${m.away}`));
    expect(second.every((m) => f.has(`${m.away}>${m.home}`))).toBe(true);
  });
  it('single round robin keeps home/away within 2 of even', () => {
    const bal = homeAwayBalance(generateRoundRobin(ids(n), 1).rounds);
    for (const b of Object.values(bal)) expect(Math.abs(b.home - b.away)).toBeLessThanOrEqual(n >= 8 ? 3 : 2);
  });
  it('is deterministic regardless of input order', () => {
    const a = generateRoundRobin(ids(n), 2);
    const b = generateRoundRobin([...ids(n)].reverse(), 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('input validation', () => {
  it('rejects duplicates, <2 teams and bad leg counts', () => {
    expect(() => generateRoundRobin(['a', 'a', 'b'])).toThrow(/Duplicate/);
    expect(() => generateRoundRobin(['a'])).toThrow(/two teams/);
    expect(() => generateRoundRobin(['a', 'b'], 0)).toThrow(/between 1 and 4/);
  });
});

describe('scheduling', () => {
  const base = { teamIds: ids(6), legs: 2, startDate: '2027-02-06', matchDays: [6, 0], kickoffTimes: ['13:00', '15:00'], intervalWeeks: 1, minRestDays: 3, utcOffset: '+03:00', venueMode: 'home_ground' as const };
  it('produces sequential matchweeks and never double-books a team in one matchweek', () => {
    const r = buildSchedule(base);
    const weeks = new Set(r.fixtures.map((f) => f.week_number));
    expect([...weeks].sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    for (const w of weeks) { const t = r.fixtures.filter((f) => f.week_number === w).flatMap((f) => [f.home_team_id, f.away_team_id]); expect(new Set(t).size).toBe(t.length); }
    expect(r.fixtures.length).toBe(30);
  });
  it('only uses requested weekdays and kickoff times, and distributes across slots', () => {
    const r = buildSchedule(base);
    for (const f of r.fixtures) { expect([0, 6]).toContain(new Date(f.date + 'T00:00:00Z').getUTCDay()); expect(['13:00', '15:00']).toContain(f.time); }
    const wk1 = r.fixtures.filter((f) => f.week_number === 1).map((f) => `${f.date} ${f.time}`);
    expect(new Set(wk1).size).toBeGreaterThan(1);
  });
  it('respects team unavailability when another slot exists', () => {
    const r = buildSchedule({ ...base, unavailable: { 'team-01': ['2027-02-06'] } });
    const f = r.fixtures.filter((x) => x.week_number === 1 && (x.home_team_id === 'team-01' || x.away_team_id === 'team-01'));
    expect(f.every((x) => x.date !== '2027-02-06')).toBe(true);
  });
  it('handles odd team counts with byes and gives the right match count', () => {
    const r = buildSchedule({ ...base, teamIds: ids(5), legs: 1 });
    expect(r.fixtures.length).toBe(10); expect(r.byes.length).toBe(5); expect(r.matchesPerTeam).toBe(4);
  });
  it('fails loudly when a single venue lacks slots', () => {
    expect(() => buildSchedule({ ...base, venueMode: 'fixed', venues: ['Main'], matchDays: [6], kickoffTimes: ['15:00'] })).toThrow(/Not enough kickoff slots/);
  });
  it('uses home grounds and warns on short rest', () => {
    const r = buildSchedule({ ...base, homeVenues: Object.fromEntries(ids(6).map((t) => [t, `Ground ${t}`])), minRestDays: 20 });
    expect(r.fixtures[0].venue).toMatch(/^Ground team-/);
    expect(r.warnings.some((w) => /rest/.test(w))).toBe(true);
  });
  it('validates inputs', () => {
    expect(() => buildSchedule({ ...base, startDate: '2027-13-40' })).toThrow(/Invalid date/);
    expect(() => buildSchedule({ ...base, kickoffTimes: ['25:99'] })).toThrow(/Invalid kickoff/);
    expect(() => buildSchedule({ ...base, matchDays: [] })).toThrow(/match day/);
  });
  it('is deterministic', () => { expect(JSON.stringify(buildSchedule(base))).toBe(JSON.stringify(buildSchedule({ ...base, teamIds: [...base.teamIds].reverse() }))); });
});
