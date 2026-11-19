import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function POST(req: NextRequest) {
  const sb = await createClient(); const { data: { user } } = await sb.auth.getUser();
  if (user) await sb.rpc('log_auth_event', { p_action: 'auth.logout' });
  await sb.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.nextUrl.origin), { status: 303 });
}
