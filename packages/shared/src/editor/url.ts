/** URL safety helpers shared by client (paste, links) and server (import, export). */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Returns a safe href or null. Relative and in-app links (/p/..., #anchor) are allowed. */
export function sanitizeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const href = raw.trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (!href) return null;
  if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) return href;
  if (href.startsWith('./') || href.startsWith('../')) return href;
  try {
    const u = new URL(href);
    return SAFE_PROTOCOLS.has(u.protocol) ? u.toString() : null;
  } catch {
    // Bare domains like "example.com/path" are treated as https.
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(href)) return 'https://' + href;
    return null;
  }
}

export function isInternalUrl(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#');
}
