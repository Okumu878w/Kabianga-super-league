import { describe, it, expect } from 'vitest';
import { parseScorerText, resolvePlayer, buildEvents } from '@/lib/results/scorers';
import { parseTable } from '@/lib/imports/parse';
import { validateResultRows } from '@/lib/imports/results';

const teams = [{ id: 't1', name: 'Warriors F.C', short_name: 'WAR' }, { id: 't2', name: 'Puan F.C', short_name: 'PUA' }, { id: 't3', name: 'Thunder F.C', short_name: 'THU' }];
const squads = new Map([['t1', [{ player_id: 'a1', name: 'Peter Otieno' }, { player_id: 'a2', name: 'John Kamau' }]], ['t2', [{ player_id: 'b1', name: 'Brian Mwangi' }, { player_id: 'b2', name: 'Peter Wekesa' }]], ['t3', []]]);

describe('scorer text', () => {
  it('parses minutes, penalties, own goals and multipliers', () => {
    const l = parseScorerText("Peter Otieno 23'; John Kamau (p) 45\nBrian Mwangi (og) 80; Peter Otieno x2; Peter Otieno (2)");
    expect(l.map((x) => [x.name, x.minute, x.kind, x.count])).toEqual([['Peter Otieno', 23, 'goal', 1], ['John Kamau', 45, 'penalty_scored', 1], ['Brian Mwangi', 80, 'own_goal', 1], ['Peter Otieno', null, 'goal', 2], ['Peter Otieno', null, 'goal', 2]]);
    expect(parseScorerText('  ; \n')).toEqual([]);
  });
  it('resolves names exactly, by surname and flags ambiguity / unknowns', () => {
    const sq = [...squads.get('t1')!, { player_id: 'a3', name: 'Peter Njoroge' }];
    expect(resolvePlayer('peter otieno', sq)).toEqual({ id: 'a1' }); expect(resolvePlayer('Kamau', sq)).toEqual({ id: 'a2' });
    expect('error' in resolvePlayer('Peter', sq)).toBe(true); expect('error' in resolvePlayer('Nobody Here', sq)).toBe(true);
  });
  it('own goals are credited to the benefiting team but belong to the opponent player', () => {
    const r = buildEvents('t1', 't2', 'Brian Mwangi (og) 80; Peter Otieno 10', squads);
    expect(r.errors).toEqual([]); expect(r.events).toEqual([{ team_id: 't2', player_id: 'b1', event_type: 'own_goal', minute: 80 }, { team_id: 't1', player_id: 'a1', event_type: 'goal', minute: 10 }]);
  });
});

describe('historical results import', () => {
  const ctx = { seasonTeams: teams, squads, existing: [] as any[] };
  const csv = (b: string) => parseTable('r.csv', 'match_date,home_team,away_team,home_score,away_score,home_scorers,away_scorers\n' + b);
  it('accepts score-only rows and rows with scorers, deriving matchweek numbers from the dates', () => {
    const { rows, headers } = csv('2027-02-06,Warriors F.C,Puan F.C,2,1,Peter Otieno 10; John Kamau 50,Brian Mwangi 33\n2027-02-13,Thunder F.C,Warriors F.C,0,3,,');
    const r = validateResultRows(rows, headers, ctx);
    expect(r.errors).toEqual([]); expect(r.valid.map((v) => v.week_number)).toEqual([1, 2]); expect(r.valid[0].events.length).toBe(3); expect(r.valid[1].events.length).toBe(0);
  });
  it('reports bad rows without dropping the good ones', () => {
    const { rows, headers } = csv(['2027-02-06,Warriors F.C,Puan F.C,2,1,,', '2027-02-06,Nobody FC,Puan F.C,1,0,,', '2027-02-07,Thunder F.C,Puan F.C,x,0,,', '2027-02-08,Thunder F.C,Warriors F.C,1,0,Unknown Guy 5,', '2027-02-09,Thunder F.C,Puan F.C,0,0,Peter Otieno 5,', '2027-02-10,Puan F.C,Warriors F.C,1,1,Brian Mwangi 5; Peter Wekesa 9,'].join('\n'));
    const r = validateResultRows(rows, headers, ctx); const m = r.errors.map((e) => `${e.row}:${e.message}`).join('\n');
    expect(r.valid.length).toBe(1); expect(m).toMatch(/3:Home team "Nobody FC"/); expect(m).toMatch(/4:Score must be/); expect(m).toMatch(/5:Home scorers: "Unknown Guy" is not in the squad/); expect(m).toMatch(/7:2 home scorers listed but the home score is 1/);
  });
  it('numbers second meetings automatically and supports a single score column', () => {
    const t = parseTable('r.csv', 'match_date,home_team,away_team,score\n2027-02-06,Warriors F.C,Puan F.C,2-1\n2027-04-06,Puan F.C,Warriors F.C,0-0');
    const r = validateResultRows(t.rows, t.headers, ctx); expect(r.errors).toEqual([]); expect(r.valid.map((v) => v.round_number)).toEqual([1, 2]); expect(r.valid[0].home_score).toBe(2);
  });
  it('rejects results that already exist as published', () => {
    const { rows, headers } = csv('2027-02-06,Warriors F.C,Puan F.C,2,1,,');
    const r = validateResultRows(rows, headers, { ...ctx, existing: [{ home_team_id: 't1', away_team_id: 't2', round_number: 1, kickoff_at: '2027-02-06T15:00:00+03:00', result_status: 'published' }] });
    expect(r.valid.length).toBe(0); expect(r.errors[0].message).toMatch(/already has a published result/);
  });
  it('fails fast without score columns', () => { const t = parseTable('r.csv', 'match_date,home_team,away_team\n2027-02-06,Warriors F.C,Puan F.C'); expect(validateResultRows(t.rows, t.headers, ctx).fatal).toBe(true); });
});
