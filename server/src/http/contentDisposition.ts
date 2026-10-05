/**
 * Build a Content-Disposition value that is safe for Node's header validation even when the
 * stored filename is non-ASCII (e.g. Thai): an ASCII fallback `filename="..."` plus the
 * RFC 5987/6266 `filename*=UTF-8''...` form that modern clients prefer.
 */
export function contentDisposition(
  name: string | null | undefined,
  type: 'inline' | 'attachment' = 'inline',
): string {
  const raw = String(name ?? '').trim() || 'file';
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(raw)?.[0] ?? '';
  const asciiFull = raw
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\%;]/g, '_');
  // A name that is all non-ASCII collapses to underscores — fall back to a generic stem.
  const fallback = /[A-Za-z0-9]/.test(asciiFull.slice(0, asciiFull.length - ext.length))
    ? asciiFull
    : `file${ext.replace(/[^\x20-\x7e]/g, '')}`;
  const encoded = encodeURIComponent(raw).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
