import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
type C = { name: string; value: string; options: CookieOptions };
/** Refreshes the session cookie and bounces anonymous visitors off /admin and /manager. Real authorisation happens in server code + RLS. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items: C[]) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } },
  });
  // Only bounce visitors who clearly have no session. If Supabase is unreachable we let the request through:
  // every admin/manager page re-checks the session on the server, so this never grants access.
  let signedIn = true;
  try { const { data, error } = await supabase.auth.getClaims(); signedIn = !!data?.claims?.sub || (!!error && /fetch|network|timeout|abort/i.test(String(error.message ?? error))); } catch { signedIn = true; }
  if (!signedIn) { const url = request.nextUrl.clone(); url.pathname = '/login'; url.search = ''; url.searchParams.set('next', request.nextUrl.pathname); return NextResponse.redirect(url); }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/admin/:path*', '/manager/:path*'] };