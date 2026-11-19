import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export type RawRow = Record<string, string> & { __row: string };

const ALIASES: Record<string, string> = {
  matchweek: 'matchweek', match_week: 'matchweek', week: 'matchweek', hometeam: 'home_team', home: 'home_team', awayteam: 'away_team', away: 'away_team',
  date: 'match_date', matchdate: 'match_date', kickoff: 'kickoff_time', kickofftime: 'kickoff_time', time: 'kickoff_time', stadium: 'venue', ground: 'venue',
  fullname: 'full_name', name: 'full_name', player: 'full_name', team: 'team', club: 'team', pos: 'position', number: 'squad_number', squadnumber: 'squad_number', shirt: 'squad_number', no: 'squad_number',
  dob: 'date_of_birth', dateofbirth: 'date_of_birth', birthdate: 'date_of_birth', shortname: 'short_name', homevenue: 'home_venue', coach: 'coach_name', manager: 'coach_name',
  round: 'round', leg: 'round', homegoals: 'home_score', awaygoals: 'away_score', homescore: 'home_score', awayscore: 'away_score', hs: 'home_score', as: 'away_score', result: 'score', homescorers: 'home_scorers', awayscorers: 'away_scorers', homegoalscorers: 'home_scorers', awaygoalscorers: 'away_scorers',
};
export const normHeader = (h: string) => { const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return ALIASES[k.replace(/_/g, '')] ?? k; };

function cell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
  return String(v).trim();
}

/** Parse a CSV or XLSX upload into normalised rows. Throws readable errors for unsupported/oversized files. */
export function parseTable(name: string, data: ArrayBuffer | string): { rows: RawRow[]; headers: string[] } {
  const size = typeof data === 'string' ? data.length : data.byteLength;
  if (size > MAX_IMPORT_BYTES) throw new Error('File is too large (limit 2 MB)');
  const lower = name.toLowerCase();
  let table: Record<string, unknown>[];
  let headers: string[];
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const res = Papa.parse<Record<string, unknown>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: normHeader });
    if (res.errors.some((e) => e.type === 'Quotes')) throw new Error('The CSV file is malformed (unbalanced quotes)');
    table = res.data; headers = (res.meta.fields ?? []).map(normHeader);
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    if (typeof data === 'string') throw new Error('Expected a binary spreadsheet');
    let wb: XLSX.WorkBook;
    try { wb = XLSX.read(data, { type: 'array', cellDates: true }); } catch { throw new Error('The spreadsheet could not be read'); }
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('The spreadsheet has no sheets');
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
    table = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [normHeader(k), v])));
    headers = table.length ? Object.keys(table[0]) : [];
  } else throw new Error('Unsupported file type. Upload a .csv or .xlsx file');
  if (table.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (limit ${MAX_IMPORT_ROWS})`);
  const rows = table.map((r, i) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) o[normHeader(k)] = cell(v);
    // Excel serial numbers for date/time cells that were not parsed as dates
    o.__row = String(i + 2); // spreadsheet row number (row 1 is the header)
    return o as RawRow;
  }).filter((r) => Object.entries(r).some(([k, v]) => k !== '__row' && v !== ''));
  return { rows, headers };
}

export function missingColumns(headers: string[], required: string[]): string[] { return required.filter((c) => !headers.includes(c)); }

export type RowError = { row: number; field?: string; message: string };

export function parseDateCell(v: string): string | null {
  const s = v.trim(); let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return valid(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s))) return valid(+m[3], +m[2], +m[1]); // day first (Kenya)
  if (/^\d{5}(\.\d+)?$/.test(s)) { const ms = Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000; return new Date(ms).toISOString().slice(0, 10); }
  return null;
}
function valid(y: number, mo: number, d: number): string | null { const dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null; }
export function parseTimeCell(v: string): string | null {
  const s = v.trim(); let m: RegExpExecArray | null;
  if ((m = /(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s))) {
    let h = +m[1]; const mi = +m[2]; const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null;
  }
  if (/^0?\.\d+$/.test(s)) { const mins = Math.round(parseFloat(s) * 1440); return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; }
  return null;
}
