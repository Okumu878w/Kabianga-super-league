'use client';
import { useState } from 'react';
import { SubmitAs } from '@/components/submit-as';
type P = { player_id: string; name: string; number: number | null; position: string };
type L = { player_id: string; is_starting: boolean; is_captain?: boolean; position?: string | null };
type E = { event_type: string; player_id: string | null; secondary_player_id?: string | null; minute: number; notes?: string | null };
const TYPES: [string, string][] = [['goal', 'Goal'], ['penalty_scored', 'Penalty scored'], ['own_goal', 'Own goal'], ['penalty_missed', 'Penalty missed'], ['yellow_card', 'Yellow card'], ['red_card', 'Red card'], ['substitution_on', 'Substitution on'], ['substitution_off', 'Substitution off'], ['injury', 'Injury']];
export function MatchSubmissionForm({ action, back, fixtureId, teamId, squad, initial, teamLabel, oppLabel, isHome }: { action: (fd: FormData) => void | Promise<void>; back: string; fixtureId: string; teamId: string; squad: P[]; initial: { lineup: L[]; events: E[]; formation?: string | null; observations?: string | null; home_score?: number | null; away_score?: number | null }; teamLabel: string; oppLabel: string; isHome: boolean }) {
  const [role, setRole] = useState<Record<string, 'none' | 'xi' | 'sub'>>(() => Object.fromEntries(initial.lineup.map((l) => [l.player_id, l.is_starting ? 'xi' : 'sub'])));
  const [captain, setCaptain] = useState<string>(initial.lineup.find((l) => l.is_captain)?.player_id ?? '');
  const [events, setEvents] = useState<E[]>(initial.events);
  const xi = squad.filter((p) => role[p.player_id] === 'xi').length;
  const lineup = squad.filter((p) => role[p.player_id] && role[p.player_id] !== 'none').map((p) => ({ player_id: p.player_id, is_starting: role[p.player_id] === 'xi', is_captain: captain === p.player_id, position: p.position, shirt_number: p.number }));
  const upd = (i: number, patch: Partial<E>) => setEvents((es) => es.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const pOpts = <>{<option value="">— player —</option>}{squad.map((p) => <option key={p.player_id} value={p.player_id}>{p.number ?? '–'} · {p.name}</option>)}</>;
  return (
    <form action={action} encType="multipart/form-data" className="stack">
      <input type="hidden" name="_back" value={back} /><input type="hidden" name="fixture_id" value={fixtureId} /><input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="payload" value={JSON.stringify({ lineup, events: events.filter((e) => e.event_type && e.minute !== undefined).map((e) => ({ ...e, player_id: e.player_id || null, secondary_player_id: e.secondary_player_id || null })) })} />
      <div className="card"><h3>Lineup <span className={`badge ${xi === 11 ? 'green' : xi > 11 ? 'red' : 'amber'}`}>{xi}/11 starters</span></h3><p className="hint">Only players in your approved squad are listed.</p>
        <div className="tw"><table className="t"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Role</th><th>Captain</th></tr></thead><tbody>{squad.map((p) => <tr key={p.player_id}><td>{p.number ?? '–'}</td><td>{p.name}</td><td>{p.position}</td><td><select aria-label={`Role for ${p.name}`} value={role[p.player_id] ?? 'none'} onChange={(e) => setRole({ ...role, [p.player_id]: e.target.value as any })} style={{ minWidth: 120 }}><option value="none">Not in squad</option><option value="xi">Starting XI</option><option value="sub">Substitute</option></select></td><td><input type="radio" name="cap" aria-label={`Captain: ${p.name}`} checked={captain === p.player_id} disabled={!role[p.player_id] || role[p.player_id] === 'none'} onChange={() => setCaptain(p.player_id)} /></td></tr>)}</tbody></table></div>
        <div className="form cols" style={{ marginTop: 10 }}><label className="field">Formation<select name="formation" defaultValue={initial.formation ?? ''}><option value="">—</option>{['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2', '4-5-1'].map((f) => <option key={f}>{f}</option>)}</select></label></div></div>
      <div className="card"><h3>Reported score</h3><div className="form cols"><label className="field">{isHome ? teamLabel : oppLabel} (home)<input type="number" name="home_score" min={0} max={30} defaultValue={initial.home_score ?? ''} /></label><label className="field">{isHome ? oppLabel : teamLabel} (away)<input type="number" name="away_score" min={0} max={30} defaultValue={initial.away_score ?? ''} /></label></div><p className="hint">For information only. Only an administrator can publish the official result.</p></div>
      <div className="card"><div className="row"><h3>Match events</h3><button type="button" className="btn ghost sm" onClick={() => setEvents([...events, { event_type: 'goal', player_id: null, minute: 1 }])}>+ Add event</button></div>
        <p className="hint">Goalscorers, assists (on the goal), cards, substitutions and injuries — for YOUR players only. Opponent goals are reported by the other team.</p>
        {events.length === 0 && <p className="muted small">No events added.</p>}
        <div className="stack">{events.map((e, i) => <div key={i} className="form cols" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', alignItems: 'end', border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
          <label className="field">Event<select value={e.event_type} onChange={(x) => upd(i, { event_type: x.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="field">Player<select value={e.player_id ?? ''} onChange={(x) => upd(i, { player_id: x.target.value || null })}>{pOpts}</select></label>
          {e.event_type === 'goal' && <label className="field">Assist by<select value={e.secondary_player_id ?? ''} onChange={(x) => upd(i, { secondary_player_id: x.target.value || null })}>{pOpts}</select></label>}
          <label className="field">Minute<input type="number" min={0} max={150} value={e.minute} onChange={(x) => upd(i, { minute: +x.target.value })} /></label>
          <button type="button" className="btn danger sm" onClick={() => setEvents(events.filter((_, k) => k !== i))} aria-label="Remove event">Remove</button></div>)}</div></div>
      <div className="card"><h3>Observations & documents</h3><label className="field">Match observations<textarea name="observations" defaultValue={initial.observations ?? ''} maxLength={2000} /></label>
        <label className="field">Match sheet / signed team list / photos (PDF, PNG, JPG, WebP · max 8 MB each)<input type="file" name="documents" multiple accept="application/pdf,image/png,image/jpeg,image/webp" /></label></div>
      <div className="row gap wrap" style={{ justifyContent: 'flex-start' }}><SubmitAs name="intent" options={[{ value: 'draft', label: 'Save draft', className: 'ghost' }, { value: 'submit', label: 'Submit for review' }]} /></div>
    </form>
  );
}
