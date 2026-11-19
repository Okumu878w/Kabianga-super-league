import { requireAdmin } from '@/lib/auth';
import { Field, Flash, Form, Head } from '@/components/ui';
import { saveSettings } from '@/app/admin/actions/league';
export const metadata = { title: 'Settings' };
export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams; const s = await requireAdmin(); const { data } = await s.supabase.from('league_settings').select('*').maybeSingle(); const soc = (data?.social_links ?? {}) as Record<string, string>;
  return <><Head eyebrow="System" title="Settings" /><Flash ok={sp.ok} err={sp.err} />
    <div className="card"><h3>League branding & contact</h3>{!s.isSuper && <p className="muted small">Only a super administrator can change these settings.</p>}
      <Form action={saveSettings} back="/admin/settings" cols><Field label="League name"><input name="league_name" defaultValue={data?.league_name} disabled={!s.isSuper} /></Field><Field label="Official league logo (PNG/JPG/WebP)" hint="Upload the official logo only. Until then a text logo is shown."><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" disabled={!s.isSuper} /></Field><Field label="Contact email"><input type="email" name="contact_email" defaultValue={data?.contact_email ?? ''} disabled={!s.isSuper} /></Field><Field label="Contact phone"><input name="contact_phone" defaultValue={data?.contact_phone ?? ''} disabled={!s.isSuper} /></Field>
        {['facebook', 'x', 'instagram', 'youtube', 'tiktok'].map((k) => <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)} URL`}><input name={k} defaultValue={soc[k] ?? ''} placeholder="https://" disabled={!s.isSuper} /></Field>)}{s.isSuper && <div className="full"><button className="btn">Save settings</button></div>}</Form></div></>;
}
