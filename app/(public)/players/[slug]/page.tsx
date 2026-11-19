import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getContext, getPlayerStats, qs } from '@/lib/data';
import Link from 'next/link';
import { Avatar, Head, Table } from '@/components/ui';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const sb = await createClient().catch(() => null); const { data } = sb ? await sb.from('players').select('full_name').eq('slug', slug).maybeSingle() : { data: null }; return { title: data?.full_name ?? 'Player', alternates: { canonical: `/players/${slug}` } }; }
export default async function Player({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; s?: string }> }) {
  const { slug } = await params; const sp = await searchParams; const sb = await createClient();
  const { data: p } = await sb.from('players').select('id,full_name,slug,photo_url,position,nationality,date_of_birth,biography').eq('slug', slug).maybeSingle();
  if (!p) notFound();
  const { data: regs } = await sb.from('player_registrations').select('squad_number,position,released_at,season:seasons(id,name,competition:competitions(slug,name)),team:teams(name,slug)').eq('player_id', p.id).eq('status', 'approved').order('registered_at', { ascending: false });
  const sel = regs?.find((r: any) => r.season.id === sp.s) ?? regs?.[0]; const seasonId = (sel as any)?.season?.id;
  const stats = seasonId ? (await getPlayerStats(seasonId)).filter((x: any) => x.player_id === p.id) : [];
  const sum = (k: string) => stats.reduce((n: number, x: any) => n + (x[k] ?? 0), 0);
  return <><header className="pagehead row gap" style={{ justifyContent: 'flex-start', alignItems: 'center' }}><Avatar lg src={p.photo_url} name={p.full_name} /><div><div className="eyebrow">{(sel as any)?.position ?? p.position}</div><h1>{p.full_name}</h1><div className="muted small">{(sel as any)?.team ? <>#{(sel as any).squad_number ?? '–'} · <Link href={`/teams/${(sel as any).team.slug}`}>{(sel as any).team.name}</Link></> : ''}{p.nationality ? ` · ${p.nationality}` : ''}{p.date_of_birth ? ` · Born ${p.date_of_birth}` : ''}</div></div></header>
    {p.biography && <p className="lead">{p.biography}</p>}
    {seasonId && <><Head title={`Statistics — ${(sel as any).season.competition.name} ${(sel as any).season.name}`} /><div className="grid g4"><div className="card"><div className="metric">{sum('appearances')}</div><div className="muted small">Appearances</div></div><div className="card"><div className="metric">{sum('goals')}</div><div className="muted small">Goals</div></div><div className="card"><div className="metric">{sum('assists')}</div><div className="muted small">Assists</div></div><div className="card"><div className="metric">{sum('yellow_cards')}<span className="muted small"> / </span>{sum('red_cards')}</div><div className="muted small">Yellow / red cards</div></div></div>{((sel as any).position === 'Goalkeeper') && <p className="muted small">Clean sheets: {sum('clean_sheets')} · Goals conceded: {sum('goals_conceded')}</p>}</>}
    {regs && regs.length > 0 && <section className="section"><Head title="Career at the league" /><Table head={['Season', 'Competition', 'Team', 'Position', 'Status']}>{regs.map((r: any, i: number) => <tr key={i}><td><Link href={`/players/${slug}${qs(r.season.competition.slug, r.season.id)}`}>{r.season.name}</Link></td><td>{r.season.competition.name}</td><td>{r.team.name}</td><td>{r.position}</td><td>{r.released_at ? 'Left the club' : 'Registered'}</td></tr>)}</Table></section>}</>;
}
