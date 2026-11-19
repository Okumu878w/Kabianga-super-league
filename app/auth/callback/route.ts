import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
// Handles invitation and password-reset links (PKCE code exchange or token_hash/OTP).
export async function GET(req: NextRequest) {
  const url = req.nextUrl; const code = url.searchParams.get('code'); const token_hash = url.searchParams.get('token_hash'); const type = url.searchParams.get('type');
  const raw = url.searchParams.get('next') ?? '/login'; const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/login';
  const sb = await createClient();
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (token_hash && type) ok = !(await sb.auth.verifyOtp({ token_hash, type: type as any })).error;
  return NextResponse.redirect(new URL(ok ? next : '/login?err=' + encodeURIComponent('That link is invalid or has expired.'), url.origin));
}
