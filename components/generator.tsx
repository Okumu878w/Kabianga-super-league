'use client';
import { useState, useTransition } from 'react';
import { previewGenerator, saveGenerated, type GenInput } from '@/app/admin/actions/fixtures';
import type { GeneratedFixture } from '@/lib/fixtures/schedule';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Team = { id: string; name: string };
export function Generator({ seasonId, teams, hasUnpublished }: { seasonId: string; teams: Team[]; hasUnpublished: boolean }) {
  const [sel, setSel] = useState<string[]>(teams.map((t) => t.id)); const [legs, setLegs] = useState(2); const [start, setStart] = useState(''); const [days, setDays] = useState<number[]>([6]); const [times, setTimes] = useState('15:00');
  const [interval, setIv] = useState(1); const [rest, setRest] = useState(3); const [mode, setMode] = useState<'home_ground' | 'fixed' | 'rotate'>('home_ground'); const [venues, setVenues] = useState('');
  const [rows, setRows] = useState<GeneratedFixture[] | null>(null); const [info, setInfo] = useState<{ warnings: string[]; byes: any[]; names: Record<string, string>; per: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [replace, setReplace] = useState(hasUnpublished); const [pending, run] = useTransition();
  const input = (): GenInput => ({ seasonId, teamIds: sel, legs, startDate: start, matchDays: days, kickoffTimes: times.split(',').map((x) => x.trim()).filter(Boolean), intervalWeeks: interval, minRestDays: rest, venueMode: mode, venues: venues.split('\n').map((v) => v.trim()).filter(Boolean) });
  const generate = () => run(async () => { setMsg(null); const r = await previewGenerator(input()); if (!r.ok) { setRows(null); setMsg({ ok: false, text: r.error }); return; } setRows(r.fixtures as GeneratedFixture[]); setInfo({ warnings: r.warnings, byes: r.byes, names: r.names, per: r.matchesPerTeam }); });
  const edit = (i: number, patch: Partial<GeneratedFixture>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const swap = (i: number) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, home_team_id: r.away_team_id, away_team_id: r.home_team_id } : r)));
  const save = (publish: boolean) => run(async () => { const fixes = rows!.map((r) => ({ ...r, scheduled_at: `${r.date}T${r.time}:00+03:00` })); const r = await saveGenerated(seasonId, fixes, input(), replace, publish); setMsg({ ok: r.ok, text: r.ok ? r.message : r.error }); if (r.ok) setRows(null); });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="stack">
      <div className="card"><div className="form cols">
        <label className="field full">Participating teams ({sel.length}/{teams.length})<div className="chips" style={{ flexWrap: 'wrap' }}>{teams.map((t) => <label key={t.id} className={`chip${sel.includes(t.id) ? ' on' : ''}`} style={{ cursor: 'pointer' }}><input type="checkbox" checked={sel.includes(t.id)} onChange={() => setSel(toggle(sel, t.id))} style={{ display: 'none' }} />{t.name}</label>)}</div></label>
        <label className="field">Format<select value={legs} onChange={(e) => setLegs(+e.target.value)}><option value={1}>Single round-robin</option><option value={2}>Double round-robin (home & away)</option><option value={3}>Triple</option><option value={4}>Quadruple</option></select></label>
        <label className="field">Start date (matchweek 1)<input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
        <div className="field">Preferred match days<div className="chips">{DAYS.map((d, i) => <label key={d} className={`chip${days.includes(i) ? ' on' : ''}`} style={{ cursor: 'pointer' }}><input type="checkbox" checked={days.includes(i)} onChange={() => setDays(toggle(days, i))} style={{ display: 'none' }} />{d}</label>)}</div></div>
        <label className="field">Kickoff times (HH:MM, comma separated)<input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="13:00, 15:00" /></label>
        <label className="field">Weeks between matchweeks<input type="number" min={1} max={8} value={interval} onChange={(e) => setIv(+e.target.value)} /></label>
        <label className="field">Minimum rest days per team<input type="number" min={0} max={14} value={rest} onChange={(e) => setRest(+e.target.value)} /></label>
        <label className="field">Venue rule<select value={mode} onChange={(e) => setMode(e.target.value as any)}><option value="home_ground">Home team&apos;s ground</option><option value="fixed">One fixed venue</option><option value="rotate">Rotate between venues</option></select></label>
        {mode !== 'home_ground' && <label className="field">Venues (one per line)<textarea value={venues} onChange={(e) => setVenues(e.target.value)} /></label>}
      </div><div style={{ marginTop: 12 }}><button className="btn" onClick={generate} disabled={pending || sel.length < 2 || !start}>{pending ? 'Working…' : 'Generate preview'}</button></div></div>
      {msg && <div className={`flash ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
      {rows && info && <>
        <div className="flash ok">{rows.length} fixtures over {new Set(rows.map((r) => r.week_number)).size} matchweeks · {info.per} matches per team{info.byes.length ? ` · byes: ${info.byes.map((b) => `MW${b.week_number} ${b.name}`).join(', ')}` : ''}</div>
        {info.warnings.map((w, i) => <div key={i} className="flash err">{w}</div>)}
        <div className="tw"><table className="t"><thead><tr><th>MW</th><th>Leg</th><th>Home</th><th></th><th>Away</th><th>Date</th><th>Time</th><th>Venue</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.week_number}</td><td>{r.round_number}</td><td>{info.names[r.home_team_id]}</td><td><button className="btn ghost sm" onClick={() => swap(i)} aria-label="Swap home and away">⇄</button></td><td>{info.names[r.away_team_id]}</td><td><input type="date" value={r.date} onChange={(e) => edit(i, { date: e.target.value })} style={{ minWidth: 140 }} /></td><td><input type="time" value={r.time} onChange={(e) => edit(i, { time: e.target.value })} style={{ minWidth: 100 }} /></td><td><input value={r.venue ?? ''} onChange={(e) => edit(i, { venue: e.target.value })} style={{ minWidth: 150 }} /></td></tr>)}</tbody></table></div>
        {hasUnpublished && <label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace existing UNPUBLISHED fixtures for this season (published fixtures are never touched)</label>}
        <div className="row gap wrap" style={{ justifyContent: 'flex-start' }}><button className="btn" disabled={pending} onClick={() => save(false)}>Save as drafts</button><button className="btn gold" disabled={pending} onClick={() => { if (confirm('Publish the whole schedule so the public can see it?')) save(true); }}>Save & publish schedule</button><button className="btn ghost" onClick={generate} disabled={pending}>Regenerate</button></div>
        <p className="hint">Saving is a single database transaction: if any fixture is rejected (duplicate, conflict…), nothing is saved.</p>
      </>}
    </div>
  );
}
