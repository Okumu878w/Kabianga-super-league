import { describe, it, expect } from 'vitest';
import { parseTable, parseDateCell, parseTimeCell } from '@/lib/imports/parse';
import { validateFixtureRows, validatePlayerRows, validateTeamRows } from '@/lib/imports/validate';
import { templateCsv, templateXlsx } from '@/lib/imports/templates';
import { toCsv } from '@/lib/exports';

const teams = [{ id: 't1', name: 'Alpha FC', short_name: 'ALP' }, { id: 't2', name: 'Beta United', short_name: 'BET' }, { id: 't3', name: 'Gamma', short_name: 'GAM' }];

describe('parsing', () => {
  it('normalises headers and aliases', () => {
    const { rows, headers } = parseTable('f.csv', 'Match Week,Home,Away,Date,Kickoff Time,Stadium\n1,Alpha FC,Beta United,2027-02-06,15:00,Main');
    expect(headers).toEqual(['matchweek', 'home_team', 'away_team', 'match_date', 'kickoff_time', 'venue']);
    expect(rows[0].home_team).toBe('Alpha FC'); expect(rows[0].__row).toBe('2');
  });
  it('round-trips the xlsx template', () => {
    const buf = templateXlsx('fixtures'); const { headers, rows } = parseTable('t.xlsx', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(headers).toContain('home_team'); expect(rows.length).toBe(1);
  });
  it('csv templates parse back cleanly', () => { for (const k of ['teams', 'players', 'fixtures', 'results'] as const) expect(parseTable('x.csv', templateCsv(k)).rows.length).toBe(1); });
  it('rejects unsupported and oversized files', () => {
    expect(() => parseTable('x.pdf', 'a')).toThrow(/Unsupported/);
    expect(() => parseTable('x.csv', 'a'.repeat(3 * 1024 * 1024))).toThrow(/too large/);
  });
  it('parses dates and times in common formats incl. Excel serials', () => {
    expect(parseDateCell('2027-02-06')).toBe('2027-02-06'); expect(parseDateCell('06/02/2027')).toBe('2027-02-06'); expect(parseDateCell('31/02/2027')).toBeNull();
    expect(parseDateCell('46059')).toBe('2026-02-06'); expect(parseDateCell('soon')).toBeNull();
    expect(parseTimeCell('15:00')).toBe('15:00'); expect(parseTimeCell('3:30 PM')).toBe('15:30'); expect(parseTimeCell('0.625')).toBe('15:00'); expect(parseTimeCell('25:00')).toBeNull();
  });
});

describe('fixture import validation', () => {
  const csv = (body: string) => parseTable('f.csv', 'matchweek,home_team,away_team,match_date,kickoff_time,venue\n' + body);
  it('accepts valid rows and resolves team names / short names', () => {
    const { rows, headers } = csv('1,alpha fc,BET,2027-02-06,15:00,Main\n1,Gamma,Beta United,2027-02-07,15:00,');
    const r = validateFixtureRows(rows, headers, { seasonTeams: teams, existing: [] });
    expect(r.errors).toEqual([]); expect(r.valid.length).toBe(2); expect(r.valid[0].home_team_id).toBe('t1'); expect(r.valid[0].scheduled_at).toBe('2027-02-06T15:00:00+03:00');
  });
  it('reports every kind of invalid row without discarding the valid ones', () => {
    const { rows, headers } = csv([
      '1,Alpha FC,Beta United,2027-02-06,15:00,Main', '1,Alpha FC,Alpha FC,2027-02-13,15:00,', '1,Unknown FC,Beta United,2027-02-13,15:00,', 'x,Alpha FC,Gamma,2027-02-13,15:00,',
      '2,Alpha FC,Gamma,31/02/2027,15:00,', '2,Alpha FC,Gamma,2027-02-13,25:00,', '3,Beta United,Alpha FC,2027-02-20,15:00,', '2,Gamma,Beta United,2027-02-06,16:00,'].join('\n'));
    const r = validateFixtureRows(rows, headers, { seasonTeams: teams, existing: [] });
    const msgs = r.errors.map((e) => `${e.row}:${e.message}`).join('\n');
    expect(r.valid.length).toBe(1);
    expect(msgs).toMatch(/3:Home and away teams must be different/); expect(msgs).toMatch(/4:Home team "Unknown FC" is not registered/); expect(msgs).toMatch(/5:Matchweek must be/);
    expect(msgs).toMatch(/6:Match date/); expect(msgs).toMatch(/7:Kickoff time/); expect(msgs).toMatch(/8:Duplicate fixture: same pairing as row 2/); expect(msgs).toMatch(/9:Scheduling conflict/);
  });
  it('detects duplicates and conflicts against existing fixtures', () => {
    const { rows, headers } = csv('1,Alpha FC,Beta United,2027-02-06,15:00,\n2,Gamma,Alpha FC,2027-02-06,16:00,');
    const r = validateFixtureRows(rows, headers, { seasonTeams: teams, existing: [{ home_team_id: 't2', away_team_id: 't1', round_number: 1, kickoff_at: '2027-01-01T15:00:00+03:00' }, { home_team_id: 't3', away_team_id: 't2', round_number: 1, kickoff_at: '2027-02-06T16:30:00+03:00' }] });
    expect(r.errors.map((e) => e.message).join('|')).toMatch(/already exists in round 1/);
  });
  it('allows second legs through a round column', () => {
    const t = parseTable('f.csv', 'matchweek,home_team,away_team,match_date,kickoff_time,venue,round\n1,Alpha FC,Beta United,2027-02-06,15:00,,1\n9,Beta United,Alpha FC,2027-04-06,15:00,,2');
    expect(validateFixtureRows(t.rows, t.headers, { seasonTeams: teams, existing: [] }).errors).toEqual([]);
  });
  it('fails fast on missing columns', () => {
    const t = parseTable('f.csv', 'home_team,away_team\nA,B'); const r = validateFixtureRows(t.rows, t.headers, { seasonTeams: teams, existing: [] });
    expect(r.fatal).toBe(true); expect(r.errors[0].message).toMatch(/Missing required column.*matchweek/);
  });
});

describe('player import validation', () => {
  const csv = (b: string) => parseTable('p.csv', 'full_name,team,position,squad_number,date_of_birth\n' + b);
  it('validates required fields, duplicates and squad-number conflicts', () => {
    const { rows, headers } = csv(['Ann Kamau,Alpha FC,GK,1,', 'Ben Otieno,Alpha FC,Defender,2,2001-01-01', 'Ben Otieno,Alpha FC,Defender,3,2001-01-01', 'Cy Mwangi,Alpha FC,Forward,2,', 'Dan,Alpha FC,Forward,9,', 'Eve Njeri,Nowhere,Forward,9,', 'Fay Wanjiru,Alpha FC,Striker,100,', 'Gus Kiptoo,Alpha FC,Forward,5,', 'Hal Rono,Beta United,Forward,5,'].join('\n'));
    const r = validatePlayerRows(rows, headers, { teams, registered: [{ first_name: 'Gus', last_name: 'Kiptoo', team_id: 't1', squad_number: 5 }] });
    const msg = r.errors.map((e) => `${e.row}:${e.message}`).join('\n');
    expect(r.valid.map((v) => v.last_name)).toEqual(['Kamau', 'Otieno', 'Rono']);
    expect(r.valid[0].position).toBe('Goalkeeper');
    expect(msg).toMatch(/4:Duplicate player/); expect(msg).toMatch(/5:Squad number 2 is also used in row 3/); expect(msg).toMatch(/6:Full name must include/);
    expect(msg).toMatch(/7:Team "Nowhere"/); expect(msg).toMatch(/8:Position "Striker"|8:.*Squad number must be/); expect(msg).toMatch(/9:Duplicate registration/);
  });
  it('restricts managers to their own team', () => {
    const { rows, headers } = csv('Ann Kamau,Beta United,GK,1,');
    const r = validatePlayerRows(rows, headers, { teams, registered: [], onlyTeamId: 't1' });
    expect(r.errors[0].message).toMatch(/not your team/);
  });
  it('flags duplicates against pending submissions', () => {
    const { rows, headers } = csv('Ann Kamau,Alpha FC,GK,1,');
    const r = validatePlayerRows(rows, headers, { teams, registered: [], pending: [{ first_name: 'ann', last_name: 'KAMAU' }] });
    expect(r.errors[0].message).toMatch(/already registered or pending/);
  });
});

describe('team import + exports', () => {
  it('validates names, short names and duplicates', () => {
    const t = parseTable('t.csv', 'name,short_name\nNew Team,NEW\nAlpha FC,XXX\nToo Long,TOOLONG\nNew Team,NT2');
    const r = validateTeamRows(t.rows, t.headers, teams);
    expect(r.valid.length).toBe(1); expect(r.errors.length).toBe(3);
  });
  it('neutralises spreadsheet formulas in exports', () => { expect(toCsv([{ a: '=HYPERLINK("x")', b: 'ok' }])).toContain("'=HYPERLINK"); });
});
