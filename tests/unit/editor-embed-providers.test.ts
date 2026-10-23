import { describe, it, expect } from 'vitest';
import { toEmbed, embedKind, EMBED_ORIGINS } from '../../apps/web/src/editor/embedProviders';

const ID = 'c6cc4d620b1d4338901770a44b3e82f4';

describe('embed providers: RuTube', () => {
  it.each([
    [`https://rutube.ru/video/${ID}/`, `https://rutube.ru/play/embed/${ID}/`],
    [`https://rutube.ru/video/${ID}`, `https://rutube.ru/play/embed/${ID}/`],
    [`http://rutube.ru/video/${ID}/?r=wd`, `https://rutube.ru/play/embed/${ID}/`],
    [`https://www.rutube.ru/video/${ID}/`, `https://rutube.ru/play/embed/${ID}/`],
    [`https://m.rutube.ru/video/${ID}/`, `https://rutube.ru/play/embed/${ID}/`],
    [`https://rutube.ru/video/${ID}/?t=95`, `https://rutube.ru/play/embed/${ID}/?t=95`],
    // a private video plays only with its access key; the old regex took «private» for the id → «Видео недоступно»
    [`https://rutube.ru/video/private/${ID}/?p=Xy-Z_9`, `https://rutube.ru/play/embed/${ID}/?p=Xy-Z_9`],
    [`https://rutube.ru/shorts/${ID}/`, `https://rutube.ru/play/embed/${ID}/`],
    [`https://rutube.ru/play/embed/${ID}`, `https://rutube.ru/play/embed/${ID}/`],
    [`https://rutube.ru/play/embed/${ID}/?p=key1`, `https://rutube.ru/play/embed/${ID}/?p=key1`],
  ])('%s → %s', (url, src) => {
    expect(toEmbed(url)).toEqual({ provider: 'rutube', src });
    expect(embedKind(url)).toBe('video');
  });

  it('not a video: channels, the private path without an id, other hosts, unsafe schemes', () => {
    for (const url of ['https://rutube.ru/channel/123/', 'https://rutube.ru/video/private/', 'https://rutube.ru/', 'https://evilrutube.ru/video/' + ID, 'https://rutube.ru.evil.com/video/' + ID, 'javascript:alert(1)//rutube.ru/video/' + ID, 'ftp://rutube.ru/video/' + ID, '', 'not a url'])
      expect(toEmbed(url), url).toBeNull();
    expect(embedKind('https://example.com/video')).toBe('link');
  });

  it('access keys and times cannot inject into the player address', () => {
    expect(toEmbed(`https://rutube.ru/video/private/${ID}/?p=a%22%3E%3Cscript`)!.src).toBe(`https://rutube.ru/play/embed/${ID}/`);
  });
});

describe('embed providers: YouTube and VK keep working', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
  ])('YouTube %s', (url, src) => expect(toEmbed(url)).toEqual({ provider: 'youtube', src }));

  it.each([
    ['https://vk.com/video-12345_456239017', 'https://vk.com/video_ext.php?oid=-12345&id=456239017'],
    ['https://vk.com/video12345_67', 'https://vk.com/video_ext.php?oid=12345&id=67'],
    ['https://vkvideo.ru/video-12345_456239017', 'https://vkvideo.ru/video_ext.php?oid=-12345&id=456239017'],
    ['https://vk.com/clip-1_2', 'https://vk.com/video_ext.php?oid=-1&id=2'],
    ['https://vk.com/club1?z=video-1_2%2Fpl_cat', 'https://vk.com/video_ext.php?oid=-1&id=2'],
    ['https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123', 'https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123'],
  ])('VK %s', (url, src) => expect(toEmbed(url)).toEqual({ provider: 'vk', src }));

  it('every player address is on an allow-listed https origin', () => {
    for (const url of [`https://rutube.ru/video/${ID}/`, 'https://youtu.be/dQw4w9WgXcQ', 'https://vk.com/video-1_2', 'https://vkvideo.ru/video-1_2']) {
      const origin = new URL(toEmbed(url)!.src).origin;
      expect(EMBED_ORIGINS as readonly string[]).toContain(origin);
      expect(origin.startsWith('https://')).toBe(true);
    }
  });
});
