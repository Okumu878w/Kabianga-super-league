import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/site';
import { fmtDate } from '@/lib/format';
async function load(slug: string) { const sb = await createClient(); const { data } = await sb.from('news_articles').select('title,slug,excerpt,body,cover_image_url,category,published_at,status').eq('slug', slug).in('status', ['published', 'scheduled']).lte('published_at', new Date().toISOString()).maybeSingle(); return data; }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const a = await load(slug).catch(() => null); return a ? { title: a.title, description: a.excerpt ?? undefined, alternates: { canonical: `/news/${slug}` }, openGraph: { title: a.title, description: a.excerpt ?? undefined, type: 'article' as const, images: a.cover_image_url ? [a.cover_image_url] : undefined } } : { title: 'Article' }; }
export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const a = await load(slug); if (!a) notFound();
  const url = `${SITE_URL}/news/${a.slug}`; const share = (u: string) => encodeURIComponent(u);
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.title, datePublished: a.published_at, image: a.cover_image_url ? [a.cover_image_url] : undefined, mainEntityOfPage: url };
  return <article style={{ maxWidth: 760, margin: '0 auto' }}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    <header className="pagehead"><div className="eyebrow">{a.category ?? 'News'} · {fmtDate(a.published_at)}</div><h1>{a.title}</h1></header>
    {a.cover_image_url && <img src={a.cover_image_url} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 16 }} />}
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>{a.body}</div>
    <div className="row gap wrap" style={{ justifyContent: 'flex-start', marginTop: 24 }}><span className="muted small">Share:</span>
      <a className="chip" rel="noopener noreferrer" target="_blank" href={`https://wa.me/?text=${share(a.title + ' ' + url)}`}>WhatsApp</a><a className="chip" rel="noopener noreferrer" target="_blank" href={`https://twitter.com/intent/tweet?text=${share(a.title)}&url=${share(url)}`}>X</a><a className="chip" rel="noopener noreferrer" target="_blank" href={`https://www.facebook.com/sharer/sharer.php?u=${share(url)}`}>Facebook</a></div></article>;
}
