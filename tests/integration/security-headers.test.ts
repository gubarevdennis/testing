import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let pageId: string;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
  pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Файлы' })).page.id;
}, 120_000);
afterAll(async () => ts?.close());

async function upload(name: string, data: Buffer, mime: string) {
  const fd = new FormData();
  fd.append('pageId', pageId);
  fd.append('file', new Blob([data], { type: mime }), name);
  const r = await org.owner.req('POST', '/api/v1/attachments', fd);
  return r.attachments[0];
}

describe('security headers for user content (SECURITY)', () => {
  it('app pages: CSP forbids framing the app and limits frames to same origin and allow-listed video hosts', async () => {
    const res = await org.owner.raw('GET', '/api/v1/auth/me');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/frame-src 'self' https:\/\/www\.youtube-nocookie\.com https:\/\/rutube\.ru https:\/\/vk\.com/);
    expect(csp).toContain("script-src 'self'");
  });

  it('uploaded SVG/HTML-like content is served sandboxed with nosniff; PDF is script-free but viewable', async () => {
    const svg = await upload('logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>'), 'image/svg+xml');
    const s = await org.owner.raw('GET', `/api/v1/attachments/${svg.id}/content`);
    expect(s.headers.get('x-content-type-options')).toBe('nosniff');
    expect(s.headers.get('content-security-policy')).toContain('sandbox');
    expect(await s.text()).not.toContain('<script');
    const pdf = await upload('doc.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), 'application/pdf');
    const p = await org.owner.raw('GET', `/api/v1/attachments/${pdf.id}/content`);
    const csp = p.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain('script-src');
  });
});
