/**
 * Video providers that are embedded as a player (everything else is a link card). Pure functions, unit-tested in
 * tests/unit/editor-embed-providers.test.ts.
 *
 * Every embed origin returned here must be listed in the CSP frame-src of apps/server/src/app.ts (EMBED_FRAME_SOURCES)
 * — a player whose origin is not allowed is blocked by the browser and the frame shows an error.
 */
export interface EmbedTarget {
  provider: 'youtube' | 'rutube' | 'vk';
  /** URL of the player page to put into the iframe. */
  src: string;
}

/** Origins the players are served from (kept in sync with the server CSP; checked by the unit test). */
export const EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://rutube.ru', 'https://vk.com', 'https://vkvideo.ru'] as const;

/** "90", "1m30s", "1h2m3s" → seconds (YouTube/RuTube start time). */
function seconds(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtube(u: URL): EmbedTarget | null {
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
  } else return null;
  if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
  const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
  return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}` };
}

/**
 * RuTube: /video/<id>/, /video/private/<id>/?p=<key> (a private video needs its access key, otherwise the player
 * says the video is unavailable), /shorts/<id>/, /play/embed/<id>; any of www./m. hosts.
 */
function rutube(u: URL): EmbedTarget | null {
  if (!/^(?:www\.|m\.)?rutube\.ru$/.test(u.hostname)) return null;
  const m = /^\/(?:video\/(?:private\/)?|shorts\/|play\/embed\/)([0-9a-zA-Z]{6,64})(?:\/|$)/.exec(u.pathname);
  if (!m || m[1] === 'private') return null;
  const q = new URLSearchParams();
  const key = u.searchParams.get('p');
  if (key && /^[\w-]+$/.test(key)) q.set('p', key);
  const t = seconds(u.searchParams.get('t'));
  if (t) q.set('t', String(t));
  const qs = q.toString();
  return { provider: 'rutube', src: `https://rutube.ru/play/embed/${m[1]}/${qs ? '?' + qs : ''}` };
}

/** VK Видео: vk.com / vkvideo.ru /video-1_2, /clip-1_2, ?z=video-1_2, and ready-made video_ext.php players. */
function vk(u: URL): EmbedTarget | null {
  const host = u.hostname.replace(/^(www|m)\./, '');
  if (host !== 'vk.com' && host !== 'vkvideo.ru' && host !== 'vk.ru') return null;
  const origin = host === 'vkvideo.ru' ? 'https://vkvideo.ru' : 'https://vk.com';
  let oid: string | null = null;
  let id: string | null = null;
  let hash: string | null = null;
  if (u.pathname === '/video_ext.php') {
    oid = u.searchParams.get('oid');
    id = u.searchParams.get('id');
    hash = u.searchParams.get('hash');
  } else {
    const m = /(?:video|clip)(-?\d+)_(\d+)/.exec(u.pathname) ?? /(?:video|clip)(-?\d+)_(\d+)/.exec(u.searchParams.get('z') ?? '');
    if (m) [oid, id] = [m[1], m[2]];
  }
  if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) return null;
  const q = new URLSearchParams({ oid, id });
  if (hash && /^\w+$/.test(hash)) q.set('hash', hash);
  return { provider: 'vk', src: `${origin}/video_ext.php?${q.toString()}` };
}

/** The player for a video address, or null when the address is not an allow-listed video (shown as a link card). */
export function toEmbed(raw: string | null | undefined): EmbedTarget | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return youtube(u) ?? rutube(u) ?? vk(u);
}

/** Kind of the embed block for an inserted address. */
export const embedKind = (url: string): 'video' | 'link' => (toEmbed(url) ? 'video' : 'link');
