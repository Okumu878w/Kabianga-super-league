import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    // fail fast instead of hanging for minutes when the connection to Supabase stalls
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) }) },
    cookies: { getAll() { return cookieStore.getAll(); }, setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } }
  });
}