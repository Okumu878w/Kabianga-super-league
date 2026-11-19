import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasSupabase } from '@/lib/site';

export type Role = 'super_admin' | 'competition_admin' | 'editor' | 'viewer' | 'team_manager';
export const ADMIN_ROLES: Role[] = ['super_admin', 'competition_admin', 'editor', 'viewer'];
export const WRITE_ROLES: Role[] = ['super_admin', 'competition_admin', 'editor'];

export const getSession = cache(async () => {
  if (!hasSupabase()) return { supabase: null as any, user: null, roles: [] as Role[], profile: null as any, teams: [] as any[] }; // unconfigured deployment: everyone is anonymous
  const supabase = await createClient();
    // getClaims() verifies the signed token locally, which removes one network call from every request.
  let user: { id: string; email?: string } | null = null;
  try { const { data } = await supabase.auth.getClaims(); if (data?.claims?.sub) user = { id: data.claims.sub, email: data.claims.email as string | undefined }; } catch { user = null; }
  if (!user) return { supabase, user: null, roles: [] as Role[], profile: null as any, teams: [] as any[] };
  const [{ data: profile }, { data: roles }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('display_name,email,is_active').eq('id', user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
    supabase.from('team_manager_assignments').select('id,team_id,competition_id,season_id,is_active,team:teams(id,name,short_name,logo_url,home_venue,coach_name,description,slug)').eq('user_id', user.id).eq('is_active', true),
  ]);
  return { supabase, user, profile, roles: ((roles ?? []).map((r: any) => r.role)) as Role[], teams: assignments ?? [] };
});

/** Server-side gate for every /admin page. Redirects instead of rendering anything for unauthorised users. */
export async function requireAdmin(opts: { roles?: Role[] } = {}) {
  const s = await getSession();
  if (!s.user) redirect('/login');
  if (s.profile && s.profile.is_active === false) redirect('/unauthorized?reason=deactivated');
  const allowed = opts.roles ?? ADMIN_ROLES;
  if (!s.roles.some((r) => allowed.includes(r))) redirect('/unauthorized');
  return { ...s, user: s.user!, canWrite: s.roles.some((r) => WRITE_ROLES.includes(r)), isSuper: s.roles.includes('super_admin') };
}
/** Gate for mutations: viewers are read-only. RLS/RPC checks still apply underneath. */
export async function requireWriter(roles: Role[] = WRITE_ROLES) {
  const s = await requireAdmin({ roles });
  return s;
}
export async function requireManager() {
  const s = await getSession();
  if (!s.user) redirect('/login');
  if (s.profile && s.profile.is_active === false) redirect('/unauthorized?reason=deactivated');
  if (!s.roles.includes('team_manager') || !s.teams.length) redirect('/unauthorized?reason=no-team');
  return { ...s, user: s.user! };
}
