import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { FIXTURE_SELECT } from '@/lib/data';
import { Crest, StatusBadge } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
const ICON: Record<string, string> = { goal: '⚽', penalty_scored: '⚽ (pen)', own_goal: '⚽ (o.g.)', yellow_card: '🟨', red_card: '🟥', penalty_missed: '✖ pen missed', substitution_on: '↑ on', substitution_off: '↓ off', injury: '＋ injury' };
export async function generateMetadata({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params; const sb = await createClient().catch(() => null); if (!sb || !/^[0-9a-f-]{36}$/i.test(fixtureId)) return { title: 'Match' };
  const { data } = await sb.from('fixtures').select('home:teams!fixtures_home_team_id_fkey(name),away:teams!fixtures_away_team_id_fkey(name)').eq('id', fixtureId).maybeSingle() as any;
  return { title: data ? `${data.home.name} v ${data.away.name}` : 'Match', alternates: { canonical: `/fixtures/${fixtureId}` } };
}
export default async function Match({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params; if (!/^[0-9a-f-]{36}$/i.test(fixtureId)) notFound();
  const sb = await createClient();
  const { data: f } = await sb.from('fixtures').select(FIXTURE_SELECT).eq('id', fixtureId).maybeSingle() as any;
  if (!f) notFound();
  const done = f.result_status === 'published';
  const [{ data: events }, { data: lineups }, { data: report }] = done ? await Promise.all([
    sb.from('match_events').select('id,team_id,event_type,minute,added_time,notes,player:players!match_events_player_id_fkey(full_name,slug),other:players!match_events_secondary_player_id_fkey(full_name)').eq('fixture_id', fixtureId).order('minute'),
    sb.from('match_lineups').select('team_id,is_starting,is_captain,shirt_number,position,player:players(full_name,slug)').eq('fixture_id', fixtureId).order('shirt_number'),
    sb.from('match_reports').select('referee,attendance,match_summary,summary').eq('fixture_id', fixtureId).maybeSingle()]) : [{ data: [] }, { data: [] }, { data: null }] as any;
  const teamBlock = (t: any) => <div className="card"><h3>{t.name}</h3>{(lineups ?? []).filter((l: any) => l.team_id === t.id).length ? <div className="stack small">{(lineups ?? []).filter((l: any) => l.team_id === t.id).map((l: any, i: number) => <div key={i} className="row"><span>{l.shirt_number ?? '–'} · <Link href={`/players/${l.player.slug}`}>{l.player.full_name}</Link>{l.is_captain ? ' (C)' : ''}</span><span className="muted">{l.is_starting ? l.position ?? 'Starter' : 'Sub'}</span></div>)}</div> : <p className="muted small">Lineup not published.</p>}</div>;
  return <>
    <div className="pagehead"><div className="eyebrow">{f.competition?.name} · {f.matchweek?.label || `Matchweek ${f.matchweek?.week_number ?? ''}`}</div></div>
    <div className="card"><div className="row small muted"><span>{fmtDateTime(f.kickoff_at)} · {f.venue ?? 'Venue TBC'}</span><StatusBadge status={done ? 'completed' : f.status} /></div>
      <div className="fx" style={{ marginTop: 18 }}><div className="team"><Crest team={f.home} lg /><span style={{ fontSize: 18 }}>{f.home.name}</span></div><div className={`score${done ? '' : ' pending'}`} style={{ fontSize: done ? 44 : 18 }}>{done ? `${f.home_score} – ${f.away_score}` : 'v'}</div><div className="team away"><span style={{ fontSize: 18 }}>{f.away.name}</span><Crest team={f.away} lg /></div></div>
      {done && f.halftime_home_score != null && <p className="center muted small">Half-time {f.halftime_home_score} – {f.halftime_away_score}</p>}</div>
    {done ? <>
      <section className="section"><h2>Match events</h2><div className="card timeline" style={{ marginTop: 10 }}>{(events ?? []).length ? (events ?? []).map((e: any) => <div className="ev" key={e.id}><span className="min">{e.minute ?? '–'}{e.added_time ? `+${e.added_time}` : ''}′</span><span>{ICON[e.event_type] ?? e.event_type}</span><span><b>{e.player?.full_name ?? '—'}</b>{e.other?.full_name && e.event_type === 'goal' ? <span className="muted"> (assist {e.other.full_name})</span> : null}<span className="muted"> · {e.team_id === f.home.id ? f.home.short_name : f.away.short_name}</span></span></div>) : <span className="muted">No events recorded.</span>}</div></section>
      <section className="section grid g2">{teamBlock(f.home)}{teamBlock(f.away)}</section>
      {(report?.match_summary || report?.summary || report?.referee) && <section className="section"><h2>Match report</h2><div className="card" style={{ marginTop: 10 }}>{report.match_summary || report.summary}<p className="muted small">{report.referee && `Referee: ${report.referee}`}{report.attendance ? ` · Attendance: ${report.attendance}` : ''}</p></div></section>}
    </> : <div className="empty" style={{ marginTop: 18 }}>The match centre fills in once the official result is published.</div>}
  </>;
}
