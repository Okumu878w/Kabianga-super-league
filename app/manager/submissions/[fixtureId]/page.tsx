import { notFound } from 'next/navigation';
import { managerContext } from '@/lib/manager-ctx';
import { Flash, Head, StatusBadge } from '@/components/ui';
import { MatchSubmissionForm } from '@/components/match-submission-form';
import { saveMatchSubmission } from '@/app/manager/actions';
import { FIXTURE_SELECT } from '@/lib/data';
import { fmtDateTime } from '@/lib/format';
export const metadata = { title: 'Match information' };
export default async function SubForm({ params, searchParams }: { params: Promise<{ fixtureId: string }>; searchParams: Promise<{ team?: string; ok?: string; err?: string }> }) {
  const { fixtureId } = await params; const sp = await searchParams; if (!/^[0-9a-f-]{36}$/i.test(fixtureId)) notFound();
  const m = await managerContext(sp); const t = m.team;
  const { data: f } = await m.supabase.from('fixtures').select(FIXTURE_SELECT + ',season_id').eq('id', fixtureId).maybeSingle() as any;
  if (!f || (f.home.id !== t.id && f.away.id !== t.id)) notFound();
  const [{ data: regs }, { data: subs }] = await Promise.all([m.supabase.from('player_registrations').select('squad_number,position,player:players(id,full_name)').eq('team_id', t.id).eq('season_id', f.season_id).eq('status', 'approved').is('released_at', null).order('squad_number'), m.supabase.from('match_submissions').select('id,status,version,lineup,events,formation,observations,home_score,away_score,reviewer_note,evidence_urls').eq('fixture_id', fixtureId).eq('team_id', t.id).order('version', { ascending: false })]);
  const current = (subs ?? []).find((s: any) => ['draft', 'changes_requested'].includes(s.status)); const latest = (subs ?? [])[0] as any; const locked = !!latest && !current && ['submitted', 'under_review', 'approved'].includes(latest.status);
  const squad = ((regs ?? []) as any[]).map((r) => ({ player_id: r.player.id, name: r.player.full_name, number: r.squad_number, position: r.position }));
  const seed = (current ?? (latest?.status === 'rejected' ? latest : null)) as any;
  return <><Head eyebrow={`${f.competition?.name} · MW ${f.matchweek?.week_number}`} title={`${f.home.name} v ${f.away.name}`}>{latest && <StatusBadge status={latest.status} />}</Head><p className="muted small">{fmtDateTime(f.kickoff_at)} · {f.venue ?? 'Venue TBC'} · You are submitting for <b>{t.name}</b></p><Flash ok={sp.ok} err={sp.err} />
    {f.result_status === 'published' ? <div className="flash ok">The official result has been published; submissions are closed.</div> : locked ? <div className="flash ok">Your submission is {latest.status === 'approved' ? 'approved' : 'with the administrators'} and can no longer be edited. {latest.reviewer_note && <>Note: {latest.reviewer_note}</>}</div> : squad.length === 0 ? <div className="empty">You have no approved players yet. Register players first — only approved players can be selected.</div> : <>
      {current?.status === 'changes_requested' && <div className="flash err">Changes requested: {current.reviewer_note}</div>}
      <MatchSubmissionForm action={saveMatchSubmission} back={`/manager/submissions/${fixtureId}${m.teamQ}`} fixtureId={fixtureId} teamId={t.id} squad={squad} teamLabel={t.name} oppLabel={f.home.id === t.id ? f.away.name : f.home.name} isHome={f.home.id === t.id} initial={{ lineup: seed?.lineup ?? [], events: seed?.events ?? [], formation: seed?.formation, observations: seed?.observations, home_score: seed?.home_score, away_score: seed?.away_score }} /></>}</>;
}
