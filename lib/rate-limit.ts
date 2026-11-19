// Sliding-window limiter kept in process memory. Fine for a single instance / basic abuse protection;
// on Vercel (many short-lived instances) swap the Map for Upstash Redis or a Supabase table for hard guarantees.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now(); const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) }; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}
