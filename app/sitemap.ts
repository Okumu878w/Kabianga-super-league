import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SITE_URL, hasSupabase } from '@/lib/site';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base = ['', '/competitions', '/fixtures', '/results', '/standings', '/teams', '/players', '/statistics', '/news', '/player-of-the-week', '/team-of-the-week'].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now }));
  if (!hasSupabase()) return base;
  try {
    const sb = await createClient();
    const [c, t, p, n] = await Promise.all([sb.from('competitions').select('slug').eq('is_published', true), sb.from('teams').select('slug').eq('is_active', true), sb.from('players').select('slug').limit(2000), sb.from('news_articles').select('slug,published_at').in('status', ['published']).lte('published_at', now.toISOString())]);
    return [...base, ...(c.data ?? []).map((x: any) => ({ url: `${SITE_URL}/competitions/${x.slug}` })), ...(t.data ?? []).map((x: any) => ({ url: `${SITE_URL}/teams/${x.slug}` })), ...(p.data ?? []).map((x: any) => ({ url: `${SITE_URL}/players/${x.slug}` })), ...(n.data ?? []).map((x: any) => ({ url: `${SITE_URL}/news/${x.slug}`, lastModified: x.published_at }))];
  } catch { return base; }
}
