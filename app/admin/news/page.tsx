import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { Field, Flash, Form, Head, StatusBadge, Table } from '@/components/ui';
import { saveArticle } from '@/app/admin/actions/content';
import { fmtDateTime, toLocalInput } from '@/lib/format';
export const metadata = { title: 'News' };
export default async function News({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const sp = await searchParams; const s = await requireAdmin();
  const { data } = await s.supabase.from('news_articles').select('id,title,slug,excerpt,body,category,status,is_featured,published_at,cover_image_url').order('created_at', { ascending: false }).limit(100);
  const rows = data ?? []; const a = rows.find((x: any) => x.id === sp.edit);
  return <><Head eyebrow="Content" title="News management" /><Flash ok={sp.ok} err={sp.err} />
    {s.canWrite && <details className="dlg" open={!!a}><summary>{a ? `Edit: ${a.title}` : 'Write an article'}</summary><Form action={saveArticle} back="/admin/news" cols>{a && <><input type="hidden" name="id" value={a.id} /><input type="hidden" name="existing_published_at" value={a.status === 'published' ? a.published_at ?? '' : ''} /></>}
      <Field label="Title" full><input name="title" defaultValue={a?.title} required minLength={4} /></Field><Field label="Category"><input name="category" defaultValue={a?.category ?? ''} placeholder="Match report, Announcement…" /></Field><Field label="Cover image (max 5 MB)"><input type="file" name="cover" accept="image/png,image/jpeg,image/webp" /></Field>
      <Field label="Excerpt" full><input name="excerpt" defaultValue={a?.excerpt ?? ''} maxLength={300} /></Field><Field label="Article" full><textarea name="body" defaultValue={a?.body ?? ''} style={{ minHeight: 220 }} required /></Field>
      <Field label="Status"><select name="status" defaultValue={a?.status ?? 'draft'}><option value="draft">Save as draft</option><option value="published">Publish now</option><option value="scheduled">Schedule</option><option value="archived">Archive</option></select></Field><Field label="Publish at (for scheduled, Nairobi time)"><input type="datetime-local" name="publish_at" defaultValue={a?.status === 'scheduled' && a.published_at ? toLocalInput(a.published_at) : ''} /></Field>
      <label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="is_featured" defaultChecked={a?.is_featured} /> Featured article</label><div className="full"><button className="btn">Save article</button></div></Form></details>}
    <section className="section"><Table head={['Title', 'Category', 'Status', 'Publication', '']} empty={rows.length ? undefined : 'No articles yet.'}>{rows.map((n: any) => <tr key={n.id}><td><b>{n.title}</b> {n.is_featured && <span className="badge gold">featured</span>}</td><td>{n.category ?? '—'}</td><td><StatusBadge status={n.status} /></td><td className="small">{n.published_at ? fmtDateTime(n.published_at) : '—'}</td><td className="right">{n.status === 'published' && <Link className="btn ghost sm" href={`/news/${n.slug}`}>View</Link>} {s.canWrite && <Link className="btn ghost sm" href={`/admin/news?edit=${n.id}`}>Edit</Link>}</td></tr>)}</Table></section></>;
}
