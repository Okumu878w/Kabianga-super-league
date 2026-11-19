import type { SupabaseClient } from '@supabase/supabase-js';
import { UserError } from '@/lib/action';

const SIGS: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];
/** Validates by magic bytes (never trusts the browser-supplied MIME type or file name), then uploads under a random name. */
export async function uploadFile(supabase: SupabaseClient, bucket: string, folder: string, file: File | null, opts: { allowPdf?: boolean; maxBytes?: number } = {}): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const max = opts.maxBytes ?? 2 * 1024 * 1024;
  if (file.size > max) throw new UserError(`File is too large (limit ${Math.round(max / 1048576)} MB)`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const sig = SIGS.find((s) => s.test(buf) && (opts.allowPdf || s.mime !== 'application/pdf'));
  if (!sig) throw new UserError(opts.allowPdf ? 'Unsupported file. Upload a PNG, JPG, WebP or PDF.' : 'Unsupported image. Upload a PNG, JPG or WebP.');
  const path = `${folder}/${crypto.randomUUID()}.${sig.ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: sig.mime, upsert: false });
  if (error) throw error;
  return bucket === 'match-documents' ? path : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
