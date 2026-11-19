import { requireAdmin } from '@/lib/auth';
/** Loads competitions/seasons the current admin can see and resolves ?c (competition id) & ?s (season id) for admin pages. */
export async function adminContext(sp: { c?: string; s?: string }) {
  const s = await requireAdmin();
  const [{ data: competitions }, { data: seasons }] = await Promise.all([
    s.supabase.from('competitions').select('id,name,slug,format,status,is_published,logo_url,points_win,points_draw,points_loss,tie_break_rules,clean_sheet_min_minutes,description,rules,start_date,end_date').order('name'),
    s.supabase.from('seasons').select('id,name,competition_id,is_current,status,starts_on,ends_on').order('starts_on', { ascending: false, nullsFirst: false })]);
  const comps = competitions ?? []; const seas = seasons ?? [];
  const season = seas.find((x: any) => x.id === sp.s) ?? (sp.c ? seas.find((x: any) => x.competition_id === sp.c && x.is_current) ?? seas.find((x: any) => x.competition_id === sp.c) : seas.find((x: any) => x.is_current) ?? seas[0]) ?? null;
  const competition = comps.find((x: any) => x.id === (season?.competition_id ?? sp.c)) ?? comps[0] ?? null;
  return { ...s, competitions: comps, seasons: seas, season, competition };
}
export const aq = (season?: { id: string } | null, extra: Record<string, string | undefined> = {}) => { const p = new URLSearchParams(); if (season) p.set('s', season.id); for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v); const t = p.toString(); return t ? `?${t}` : ''; };
