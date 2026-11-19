export function ExportLinks({ kind, season, formats = ['csv', 'xlsx', 'pdf'] }: { kind: string; season: string; formats?: string[] }) {
  return <span className="row gap" style={{ justifyContent: 'flex-start' }}>{formats.map((f) => <a key={f} className="chip" href={`/api/export/${kind}?s=${season}&format=${f}`}>{f.toUpperCase()}</a>)}</span>;
}
