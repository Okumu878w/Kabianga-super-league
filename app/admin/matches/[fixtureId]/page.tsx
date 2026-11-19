import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { Avatar, Field, Flash, Form, Head, Inline, StatusBadge, Table } from '@/components/ui';
import { FIXTURE_SELECT } from '@/lib/data';
import { fmtDateTime } from '@/lib/format';
import { SubmitAs } from '@/components/submit-as';
import { addEvent, addLineup, applySubmission, deleteRow, publishResult, quickResult, reopenResult, reviewMatchSubmission, saveReport, setResultStatus } from '@/app/admin/actions/matches';
export const metadata = { title: 'Match management' };
const EV = [['goal', 'Goal'], ['penalty_scored', 'Penalty scored'], ['own_goal', 'Own goal'], ['penalty_missed', 'Penalty missed'], ['yellow_card', 'Yellow card'], ['red_card', 'Red card'], ['substitution_on', 'Substitution (on)'], ['substitution_off', 'Substitution (off)'], ['injury', 'Injury']];
export default async function Match({ params, searchParams }: { params: Promise<{ fixtureId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { fixtureId } = await params; const sp = await searchParams; if (!/^[0-9a-f-]{36}$/i.test(fixtureId)) notFound();
  const s = await requireAdmin(); const sb = s.supabase; const back = `/admin/matches/${fixtureId}`;
  const { data: f } = await sb.from('fixtures').select(FIXTURE_SELECT + ',season_id,verified_by').eq('id', fixtureId).maybeSingle() as any; if (!f) notFound();
  const [{ data: report }, { data: events }, { data: lineups }, { data: regs }, { data: subs }] = await Promise.all([
    sb.from('match_reports').select('*').eq('fixture_id', fixtureId).maybeSingle(),
    sb.from('match_events').select('id,team_id,event_type,minute,added_time,notes,player:players!match_events_player_id_fkey(full_name),other:players!match_events_secondary_player_id_fkey(full_name)').eq('fixture_id', fixtureId).order('minute'),
    sb.from('match_lineups').select('id,team_id,is_starting,is_captain,shirt_number,position,started_minute,ended_minute,player:players(full_name)').eq('fixture_id', fixtureId).order('is_starting', { ascending: false }),
    sb.from('player_registrations').select('player_id,team_id,squad_number,position,player:players(full_name)').eq('season_id', f.season_id).eq('status', 'approved').in('team_id', [f.home.id, f.away.id]).order('squad_number'),
    sb.from('match_submissions').select('id,team_id,status,home_score,away_score,formation,lineup,events,observations,evidence_urls,reviewer_note,submitted_at,version,team:teams(name)').eq('fixture_id', fixtureId).order('created_at', { ascending: false })]);
  const status = f.result_status as string; const locked = status === 'published'; const w = s.canWrite; const mgr = s.roles.some((r) => r === 'super_admin' || r === 'competition_admin');
  const name = (id: string) => (id === f.home.id ? f.home.short_name || f.home.name : f.away.short_name || f.away.name);
  const squad = (t: string) => (regs ?? []).filter((r: any) => r.team_id === t);
  const PlayerSelect = ({ name: n, label, req }: { name: string; label: string; req?: boolean }) => <Field label={label}><select name={n} required={req}><option value="">— none —</option>{[f.home, f.away].map((t: any) => <optgroup key={t.id} label={t.name}>{squad(t.id).map((r: any) => <option key={r.player_id} value={r.player_id}>{r.squad_number ?? '–'} · {r.player.full_name}</option>)}</optgroup>)}</select></Field>;
  const signed = await Promise.all((subs ?? []).flatMap((x: any) => (x.evidence_urls ?? []).map(async (p: string) => ({ id: x.id, path: p, url: (await sb.storage.from('match-documents').createSignedUrl(p, 3600)).data?.signedUrl }))));
  return <>
    <Head eyebrow={`${f.competition?.name} · ${f.matchweek?.label ?? `MW ${f.matchweek?.week_number}`}`} title={`${f.home.name} v ${f.away.name}`}><StatusBadge status={status} /></Head>
    <p className="muted small">{fmtDateTime(f.kickoff_at)} · {f.venue ?? 'Venue TBC'} · fixture status <StatusBadge status={f.status} /></p><Flash ok={sp.ok} err={sp.err} />

    <div className="card"><h3>Result workflow</h3><div className="row wrap gap" style={{ justifyContent: 'flex-start' }}>{['draft', 'submitted', 'verified', 'published'].map((x, i) => <span key={x} className={`chip${x === status ? ' on' : ''}`}>{i + 1}. {x}</span>)}</div>
      {w && <div className="row wrap gap" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        {status === 'draft' && <Inline action={setResultStatus} back={back} fields={{ fixture_id: fixtureId, to: 'submitted' }} label="Submit for verification" />}
        {status === 'submitted' && mgr && <Inline action={setResultStatus} back={back} fields={{ fixture_id: fixtureId, to: 'verified' }} label="Verify result" />}
        {(status === 'submitted' || status === 'verified') && <Inline action={setResultStatus} back={back} fields={{ fixture_id: fixtureId, to: 'draft' }} label="Return to draft" ghost />}
        {status === 'verified' && mgr && <Inline action={publishResult} back={back} fields={{ fixture_id: fixtureId }} label="Publish result" gold confirm="Publish this result? It becomes public and updates standings and statistics." />}
        {status === 'submitted' && !mgr && <span className="muted small">Waiting for a competition administrator to verify.</span>}
      </div>}
      {locked && mgr && <Form action={reopenResult} back={back}><input type="hidden" name="fixture_id" value={fixtureId} /><Field label="Reopen for correction — reason (recorded in the audit log)"><input name="reason" minLength={5} required placeholder="e.g. goal credited to the wrong player" /></Field><button className="btn danger sm" style={{ justifySelf: 'start' }}>Reopen published result</button></Form>}
    </div>

    {mgr && !locked && <div className="card" style={{ marginTop: 14, borderColor: 'var(--green)' }}><h3>Quick result: score + goal scorers, published in one step</h3>
      <p className="muted small">For super admins and competition admins. Replaces any draft events for this match, publishes immediately, and updates the table and top scorers. One scorer per line (or separated by ;): <code>Peter Otieno 23</code> · <code>John Kamau (p) 67</code> · <code>Brian Mwangi (og) 80</code> (own goals go under the team that <i>benefited</i>) · <code>Peter Otieno (2)</code> for two goals.</p>
      <Form action={quickResult} back={back} cols><input type="hidden" name="fixture_id" value={fixtureId} />
        <Field label={`${f.home.name} goals`}><input type="number" name="home" min={0} max={30} required defaultValue={report?.draft_home_score ?? ''} /></Field><Field label={`${f.away.name} goals`}><input type="number" name="away" min={0} max={30} required defaultValue={report?.draft_away_score ?? ''} /></Field>
        <Field label="Half-time home (optional)"><input type="number" name="ht_home" min={0} max={30} /></Field><Field label="Half-time away (optional)"><input type="number" name="ht_away" min={0} max={30} /></Field>
        <Field label={`${f.home.name} scorers`}><textarea name="home_scorers" placeholder={"Peter Otieno 23\nJohn Kamau (p) 67"} /></Field><Field label={`${f.away.name} scorers`}><textarea name="away_scorers" /></Field>
        <label className="row gap full" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="unknown" /> Some scorers are unknown (the score may be higher than the scorers listed)</label>
        <div className="full"><button className="btn gold">Save & publish result</button></div></Form></div>}

    <section className="section grid g2" style={{ alignItems: 'start' }}>
      <div className="card"><h3>Match report & score</h3>{locked && <p className="muted small">Published. Reopen the result to change the score.</p>}
        <Form action={saveReport} back={back} cols><input type="hidden" name="fixture_id" value={fixtureId} />
          <Field label={`${f.home.name} goals (full-time)`}><input type="number" name="home" min={0} max={30} defaultValue={report?.draft_home_score ?? ''} disabled={locked || !w} /></Field><Field label={`${f.away.name} goals (full-time)`}><input type="number" name="away" min={0} max={30} defaultValue={report?.draft_away_score ?? ''} disabled={locked || !w} /></Field>
          <Field label="Half-time home"><input type="number" name="ht_home" min={0} max={30} defaultValue={report?.draft_halftime_home ?? ''} disabled={locked || !w} /></Field><Field label="Half-time away"><input type="number" name="ht_away" min={0} max={30} defaultValue={report?.draft_halftime_away ?? ''} disabled={locked || !w} /></Field>
          <Field label="Referee"><input name="referee" defaultValue={report?.referee ?? ''} disabled={!w} /></Field><Field label="Attendance"><input type="number" name="attendance" min={0} defaultValue={report?.attendance ?? ''} disabled={!w} /></Field>
          <Field label="Match summary" full><textarea name="summary" defaultValue={report?.match_summary ?? ''} disabled={!w} /></Field>{w && <div className="full"><button className="btn">Save report</button></div>}</Form></div>

      <div className="card"><h3>Add a match event</h3>{locked || !w ? <p className="muted small">{locked ? 'Reopen the result to change events.' : 'Read-only.'}</p> :
        <Form action={addEvent} back={back} cols><input type="hidden" name="fixture_id" value={fixtureId} />
          <Field label="Event"><select name="event_type" required>{EV.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Team"><select name="team_id" required><option value={f.home.id}>{f.home.name}</option><option value={f.away.id}>{f.away.name}</option></select></Field>
          <PlayerSelect name="player_id" label="Player" /><PlayerSelect name="secondary_player_id" label="Assisted by (goals only)" />
          <Field label="Minute"><input type="number" name="minute" min={0} max={150} required /></Field><Field label="Added time"><input type="number" name="added_time" min={0} max={30} /></Field><Field label="Notes" full><input name="notes" /></Field>
          <p className="hint full">For an own goal choose the player who scored it and THEIR team; it is credited to the opponent.</p><div className="full"><button className="btn">Add event</button></div></Form>}</div>
    </section>

    <section className="section"><Head title="Events" /><Table head={['Min', 'Event', 'Team', 'Player', 'Assist', '']} empty={(events ?? []).length ? undefined : 'No events recorded.'}>{(events ?? []).map((e: any) => <tr key={e.id}><td>{e.minute}{e.added_time ? `+${e.added_time}` : ''}′</td><td>{e.event_type.replace(/_/g, ' ')}</td><td>{name(e.team_id)}</td><td>{e.player?.full_name ?? '—'}</td><td>{e.other?.full_name ?? ''}</td><td className="right">{w && !locked && <Inline action={deleteRow} back={back} fields={{ fixture_id: fixtureId, table: 'match_events', id: e.id }} label="✕" danger confirm="Remove this event?" />}</td></tr>)}</Table></section>

    <section className="section"><Head title="Lineups" />
      {w && !locked && <details className="dlg" style={{ marginBottom: 10 }}><summary>Add a lineup entry</summary><Form action={addLineup} back={back} cols><input type="hidden" name="fixture_id" value={fixtureId} /><Field label="Team"><select name="team_id"><option value={f.home.id}>{f.home.name}</option><option value={f.away.id}>{f.away.name}</option></select></Field><PlayerSelect name="player_id" label="Player" req /><Field label="Position played"><select name="position"><option value="">—</option>{['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="Shirt number"><input type="number" name="shirt_number" min={1} max={99} /></Field><Field label="Came on (minute, subs)"><input type="number" name="started_minute" min={0} max={120} /></Field><Field label="Went off (minute)"><input type="number" name="ended_minute" min={0} max={120} /></Field><label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="is_starting" defaultChecked /> Starting XI</label><label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="is_captain" /> Captain</label><div className="full"><button className="btn">Add</button></div></Form></details>}
      <div className="grid g2">{[f.home, f.away].map((t: any) => <div key={t.id}><h3 style={{ marginBottom: 6 }}>{t.name}</h3><Table head={['#', 'Player', 'Role', '']} empty={(lineups ?? []).some((l: any) => l.team_id === t.id) ? undefined : 'No lineup recorded.'}>{(lineups ?? []).filter((l: any) => l.team_id === t.id).map((l: any) => <tr key={l.id}><td>{l.shirt_number ?? '–'}</td><td>{l.player.full_name}{l.is_captain ? ' (C)' : ''} <span className="muted small">{l.position}</span></td><td>{l.is_starting ? 'XI' : 'Sub'}</td><td className="right">{w && !locked && <Inline action={deleteRow} back={back} fields={{ fixture_id: fixtureId, table: 'match_lineups', id: l.id }} label="✕" danger />}</td></tr>)}</Table></div>)}</div></section>

    <section className="section"><Head eyebrow="Team manager submissions" title="Compare submissions from both teams" />
      {(subs ?? []).length === 0 ? <div className="empty">Neither team has submitted match information.</div> : <div className="grid g2" style={{ alignItems: 'start' }}>{(subs ?? []).map((x: any) => <div className="card" key={x.id}><div className="row"><b>{x.team.name} · v{x.version}</b><StatusBadge status={x.status} /></div>
        <p className="small muted">Reported score {x.home_score ?? '–'}–{x.away_score ?? '–'} · formation {x.formation ?? '—'} · {(x.lineup ?? []).length} lineup rows · {(x.events ?? []).length} events</p>
        {(x.events ?? []).length > 0 && <div className="small stack">{x.events.map((e: any, i: number) => <div key={i}>{e.minute}′ {String(e.event_type).replace(/_/g, ' ')} — {((regs ?? []) as any[]).find((r: any) => r.player_id === e.player_id)?.player.full_name ?? '?'}{e.secondary_player_id ? ` (assist ${((regs ?? []) as any[]).find((r: any) => r.player_id === e.secondary_player_id)?.player.full_name})` : ''}</div>)}</div>}
        {x.observations && <p className="small">“{x.observations}”</p>}{signed.filter((d: any) => d.id === x.id && d.url).map((d: any, i: number) => <a key={i} className="chip" href={d.url} target="_blank" rel="noopener noreferrer">Document {i + 1}</a>)}
        {x.reviewer_note && <p className="small muted">Reviewer note: {x.reviewer_note}</p>}
        {w && ['submitted', 'under_review'].includes(x.status) && <Form action={reviewMatchSubmission} back={back}><input type="hidden" name="fixture_id" value={fixtureId} /><input type="hidden" name="id" value={x.id} /><Field label="Note (required to reject or request changes)"><input name="note" /></Field><div className="row gap wrap" style={{ justifyContent: 'flex-start' }}><SubmitAs name="decision" options={[{ value: 'approved', label: 'Approve' }, { value: 'under_review', label: 'Mark under review', className: 'ghost' }, { value: 'changes_requested', label: 'Request clarification', className: 'ghost' }, { value: 'rejected', label: 'Reject', className: 'danger' }]} /></div></Form>}
        {w && x.status === 'approved' && status === 'draft' && <Form action={applySubmission} back={back}><input type="hidden" name="fixture_id" value={fixtureId} /><input type="hidden" name="id" value={x.id} /><label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="apply_score" /> Also copy the reported score into the draft report</label><button className="btn sm">Load into official match draft</button><p className="hint">This replaces that team&apos;s draft lineup/events. Nothing is published.</p></Form>}</div>)}</div>}</section></>;
}
