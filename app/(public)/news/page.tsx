import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Empty, PageHead, Pager } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { hasSupabase } from '@/lib/site';
export const metadata = { title: 'News', description: 'League news and announcements.' };
const PAGE = 9;
export default async function News({ searchParams }: { searchParams: Promise<{ page?: string; cat?: string }> }) {
  const sp = await searchParams; const page = Math.max(1, Number(sp.page) || 1);
  if (!hasSupabase()) return <><PageHead eyebrow="Newsroom" title="News & announcements" /><Empty>No articles have been published yet.</Empty></>;
  const sb = await createClient();
  let q = sb.from('news_articles').select('id,title,slug,excerpt,cover_image_url,category,published_at,is_featured').in('status', ['published', 'scheduled']).lte('published_at', new Date().toISOString());
  if (sp.cat) q = q.eq('category', sp.cat);
  const { data } = await q.order('is_featured', { ascending: false }).order('published_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  const rows = (data ?? []).slice(0, PAGE);
  return <><PageHead eyebrow="Newsroom" title="News & announcements" />{rows.length ? <div className="grid g3">{rows.map((n: any) => <Link key={n.id} href={`/news/${n.slug}`} className="card">{n.cover_image_url && <img src={n.cover_image_url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 10, marginBottom: 10 }} />}<div className="row small muted"><span>{n.category ?? 'News'}</span><span>{fmtDate(n.published_at)}</span></div>{n.is_featured && <span className="badge gold">Featured</span>}<h3 style={{ marginTop: 6 }}>{n.title}</h3><p className="muted small">{n.excerpt}</p></Link>)}</div> : <Empty>No articles have been published yet.</Empty>}
    <Pager base="/news" page={page} hasMore={(data ?? []).length > PAGE} params={{ cat: sp.cat }} /></>;
}
