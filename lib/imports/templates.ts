import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const TEMPLATES = {
  teams: { headers: ['name', 'short_name', 'home_venue', 'coach_name', 'description'], sample: [['Example United', 'EXU', 'Example Ground', 'Jane Doe', 'Sample row - delete me']] },
  players: { headers: ['full_name', 'team', 'position', 'squad_number', 'date_of_birth', 'nationality'], sample: [['Sample Player', 'Example United', 'Midfielder', '8', '2002-05-14', 'Kenyan']] },
  results: { headers: ['match_date', 'kickoff_time', 'home_team', 'away_team', 'home_score', 'away_score', 'home_scorers', 'away_scorers', 'matchweek', 'round'], sample: [['2027-02-06', '15:00', 'Example United', 'Another FC', '2', '1', 'Sample Player 23; Sample Player (p) 67', 'Other Player 12', '1', '1']] },
  fixtures: { headers: ['matchweek', 'home_team', 'away_team', 'match_date', 'kickoff_time', 'venue', 'round'], sample: [['1', 'Example United', 'Another FC', '2027-02-06', '15:00', 'Example Ground', '1']] },
} as const;
export type TemplateKind = keyof typeof TEMPLATES;

export function templateCsv(kind: TemplateKind): string { const t = TEMPLATES[kind]; return Papa.unparse({ fields: [...t.headers], data: t.sample.map((r) => [...r]) }); }
export function templateXlsx(kind: TemplateKind): Uint8Array {
  const t = TEMPLATES[kind]; const ws = XLSX.utils.aoa_to_sheet([[...t.headers], ...t.sample.map((r) => [...r])]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, kind); return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
export function errorReportCsv(errors: { row: number; field?: string; message: string }[]): string { return Papa.unparse({ fields: ['row', 'field', 'message'], data: errors.map((e) => [e.row, e.field ?? '', e.message]) }); }
