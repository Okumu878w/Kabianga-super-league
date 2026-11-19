import * as XLSX from 'xlsx';
import Papa from 'papaparse';
// CSV-injection safe: cells starting with = + - @ are prefixed so spreadsheet apps never evaluate them.
const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
export const sanitizeRows = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safe(v)])));
export const toCsv = (rows: Record<string, unknown>[]) => Papa.unparse(sanitizeRows(rows));
export function toXlsx(sheets: Record<string, Record<string, unknown>[]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sanitizeRows(rows)), name.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
