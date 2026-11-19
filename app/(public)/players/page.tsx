import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getContext, qs } from '@/lib/data';
import { Avatar, Empty, PageHead, Pager } from '@/components/ui';
export const metadata = { title: 'Players', description: 'Registered Kabianga Super League players.' };
const PAGE = 24;
export default async function Players({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; q?: string; pos?: string; page?: string }> }) {
  const sp = await searchParams; const { competition, season } = await getContext(sp.c, sp.s); const page = Math.max(1, Number(sp.page) || 1);
  let rows: any[] = [];
  if (season) {
    const sb = await createClient();
    let q = sb.from('player_registrations').select('squad_number,position,team:teams(name,short_name),player:players!inner(full_name,slug,photo_url)').eq('season_id', season.id).eq('status', 'approved').is('released_at', null);
    if (sp.pos) q = q.eq('position', sp.pos); if (sp.q) q = q.ilike('player.full_name', `%${sp.q.replace(/[%,]/g, '')}%`);
    const { data } = await q.order('squad_number').range((page - 1) * PAGE, page * PAGE); rows = data ?? [];
  }
  const more = rows.length > PAGE; rows = rows.slice(0, PAGE);
  return <><PageHead eyebrow={competition ? `${competition.name} · ${season?.name}` : 'Players'} title="Players" />
    <form className="form cols card" style={{ marginBottom: 14 }}><input type="hidden" name="c" value={competition?.slug ?? ''} /><input type="hidden" name="s" value={season?.id ?? ''} /><label className="field">Search<input name="q" defaultValue={sp.q} placeholder="Player name" /></label><label className="field">Position<select name="pos" defaultValue={sp.pos ?? ''}><option value="">All</option>{['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => <option key={p}>{p}</option>)}</select></label><div><button className="btn sm">Search</button></div></form>
    {rows.length ? <div className="grid g4">{rows.map((r) => <Link key={r.player.slug} href={`/players/${r.player.slug}${qs(competition?.slug, season?.id)}`} className="card" style={{ textAlign: 'center' }}><div style={{ display: 'grid', placeItems: 'center' }}><Avatar lg src={r.player.photo_url} name={r.player.full_name} /></div><h3 style={{ marginTop: 10 }}>{r.player.full_name}</h3><div className="muted small">#{r.squad_number ?? '–'} · {r.position}</div><div className="small">{r.team?.name}</div></Link>)}</div> : <Empty>No players found.</Empty>}
    <Pager base="/players" page={page} hasMore={more} params={{ c: competition?.slug, s: season?.id, q: sp.q, pos: sp.pos }} /></>;
}
