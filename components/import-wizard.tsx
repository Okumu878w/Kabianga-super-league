'use client';
import { useState, useTransition } from 'react';
import { previewImport, commitImport, type ImportKind, type ImportResult } from '@/app/actions/imports';

const download = (name: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
const csv = (errs: { row: number; message: string }[]) => 'row,message\n' + errs.map((e) => `${e.row},"${e.message.replace(/"/g, '""')}"`).join('\n');
const COLS: Record<ImportKind, [string, string][]> = {
  fixtures: [['source_row', 'Row'], ['week_number', 'MW'], ['home_name', 'Home'], ['away_name', 'Away'], ['scheduled_at', 'Kickoff'], ['venue', 'Venue']],
  players: [['source_row', 'Row'], ['first_name', 'First'], ['last_name', 'Last'], ['team_name', 'Team'], ['position', 'Position'], ['squad_number', '#']],
  teams: [['source_row', 'Row'], ['name', 'Name'], ['short_name', 'Short'], ['home_venue', 'Venue']],
  results: [['source_row', 'Row'], ['week_number', 'MW'], ['home_name', 'Home'], ['home_score', 'H'], ['away_score', 'A'], ['away_name', 'Away'], ['scorers', 'Scorers']],
};
/** Upload → validate → preview (+ errors) → confirm → import → report. Validation always runs again on the server at confirm time. */
export function ImportWizard({ kind, scope, seasons, teamId, templates }: { kind: ImportKind; scope: 'admin' | 'manager'; seasons: { id: string; name: string }[]; teamId?: string; templates: boolean }) {
  const [season, setSeason] = useState(seasons[0]?.id ?? ''); const [file, setFile] = useState<File | null>(null); const [res, setRes] = useState<ImportResult | null>(null); const [pending, start] = useTransition();
  const build = () => { const fd = new FormData(); if (file) fd.set('file', file); fd.set('season_id', season); if (teamId) fd.set('team_id', teamId); return fd; };
  const preview = () => start(async () => setRes(await previewImport(kind, scope, build())));
  const commit = () => start(async () => setRes(await commitImport(kind, scope, build())));
  const c = res?.committed;
  return (
    <div className="stack">
      {templates && <div className="row gap wrap" style={{ justifyContent: 'flex-start' }}><span className="small muted">Templates:</span><a className="chip" href={`/api/templates/${kind}?format=csv`}>CSV</a><a className="chip" href={`/api/templates/${kind}?format=xlsx`}>Excel</a></div>}
      <div className="form cols">
        {kind !== 'teams' || seasons.length ? <label className="field">Season{kind === 'teams' && ' (optional: also register teams in it)'}<select value={season} onChange={(e) => { setSeason(e.target.value); setRes(null); }}>{kind === 'teams' && <option value="">Do not register to a season</option>}{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
        <label className="field">File (.csv or .xlsx, max 2 MB)<input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} /></label>
      </div>
      <div><button className="btn" disabled={!file || pending || (kind !== 'teams' && !season)} onClick={preview}>{pending ? 'Checking…' : 'Validate & preview'}</button></div>
      {res && !res.ok && <div className="flash err" role="alert">{res.error}</div>}
      {res?.ok && !c && <>
        <div className="flash ok">{res.valid?.length} of {res.total} row(s) are valid{res.errors?.length ? `, ${res.errors.length} problem(s) found` : ''}.</div>
        {!!res.errors?.length && <div><b className="small">Rows with problems (they will NOT be imported)</b><div className="tw"><table className="t"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>{res.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>)}</tbody></table></div><button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => download('import-errors.csv', csv(res.errors!))}>Download error report</button></div>}
        {!!res.valid?.length && <div><b className="small">Preview of valid rows</b><div className="tw"><table className="t"><thead><tr>{COLS[kind].map(([, h]) => <th key={h}>{h}</th>)}</tr></thead><tbody>{res.valid.slice(0, 50).map((v, i) => <tr key={i}>{COLS[kind].map(([k]) => <td key={k}>{String(v[k] ?? '')}</td>)}</tr>)}</tbody></table></div>{res.valid.length > 50 && <p className="hint">Showing the first 50 of {res.valid.length}.</p>}</div>}
        {!res.fatal && !!res.valid?.length && <div><button className="btn" disabled={pending} onClick={commit}>{pending ? 'Importing…' : scope === 'manager' ? `Submit ${res.valid.length} player(s) for approval` : kind === 'results' ? `Confirm: record & publish ${res.valid.length} result(s)` : `Confirm import of ${res.valid.length} row(s)`}</button></div>}
      </>}
      {c && <>
        <div className={`flash ${c.failed ? 'err' : 'ok'}`}>{c.failed ? 'Import completed with errors' : 'Import completed successfully'}: {c.inserted} imported, {c.failed} skipped.</div>
        {!!c.errors.length && <div><div className="tw"><table className="t"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>{c.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>)}</tbody></table></div><button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => download('import-errors.csv', csv(c.errors))}>Download error report</button></div>}
      </>}
    </div>
  );
}
