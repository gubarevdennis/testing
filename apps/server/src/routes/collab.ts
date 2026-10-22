import type { FastifyInstance } from 'fastify';
import { CLOSE } from '@kb/shared';
import type { Services } from '../app.js';
import { accessForSpaces, pageAccess } from '../acl/engine.js';

function originAllowed(origin: string | undefined, host: string | undefined, publicUrl: string): boolean {
  if (!origin) return true; // non-browser clients (no ambient cookies are sent cross-site without Origin)
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(publicUrl).origin;
  } catch {
    return false;
  }
}

export async function collabRoutes(app: FastifyInstance, s: Services) {
  /** Live document channel. Authentication via session cookie; Origin is checked against cross-site WebSocket hijacking. */
  app.get('/api/v1/collab/:pageId', { websocket: true }, (socket, req) => {
    const { pageId } = req.params as { pageId: string };
    if (!originAllowed(req.headers.origin, req.headers.host, s.cfg.publicUrl)) {
      socket.close(CLOSE.ACCESS_REVOKED, 'origin');
      return;
    }
    if (!req.user) {
      socket.close(CLOSE.SESSION_EXPIRED, 'unauthorized');
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(pageId)) {
      socket.close(CLOSE.NOT_FOUND, 'not_found');
      return;
    }
    void s.hub.connect(socket, req.user, req.session?.id ?? null, pageId).catch((err) => {
      req.log.error({ err }, 'collab connect failed');
      socket.close(CLOSE.SERVER_RESTART, 'error');
    });
  });

  /**
   * Per-user event stream (tree changes, page metadata, notifications, access changes).
   * Only identifiers are pushed; the client refetches through access-checked endpoints.
   */
  app.get('/api/v1/events', { websocket: true }, (socket, req) => {
    if (!originAllowed(req.headers.origin, req.headers.host, s.cfg.publicUrl) || !req.user) {
      socket.close(CLOSE.SESSION_EXPIRED, 'unauthorized');
      return;
    }
    const user = req.user;
    const sessionId = req.session?.id ?? null;
    let visibleSpaces: Set<string> | null = null;
    const refreshSpaces = async () => {
      const acc = await accessForSpaces(s.db, user);
      visibleSpaces = new Set([...acc.values()].filter((a) => a.actions.view).map((a) => a.spaceId));
    };
    void refreshSpaces();
    const send = (obj: unknown) => socket.readyState === 1 && socket.send(JSON.stringify(obj));
    const off = s.bus.on(async (e) => {
      try {
        if (e.type === 'user-revoked' && e.userId === user.id) {
          send({ type: 'session-ended', reason: e.reason });
          socket.close(CLOSE.ACCESS_REVOKED, 'revoked');
          return;
        }
        if (e.type === 'acl-changed' && e.orgId === user.orgId) {
          if (sessionId) {
            const st = (await s.db.query(`select s.revoked_at, s.expires_at, u.status, u.access_expires_at from sessions s join users u on u.id = s.user_id where s.id = $1`, [sessionId])).rows[0];
            const expired = (d: Date | null) => !!d && new Date(d) <= new Date();
            if (!st || st.revoked_at || st.status !== 'active' || expired(st.expires_at) || expired(st.access_expires_at)) {
              send({ type: 'session-ended', reason: 'revoked' });
              socket.close(CLOSE.ACCESS_REVOKED, 'revoked');
              return;
            }
          }
          await refreshSpaces();
          send({ type: 'access-changed' });
          return;
        }
        if (e.type === 'tree-changed' && e.orgId === user.orgId) {
          if (visibleSpaces?.has(e.spaceId)) send({ type: 'tree-changed', spaceId: e.spaceId });
          else send({ type: 'shared-changed' });
          return;
        }
        if (e.type === 'page-changed' && e.orgId === user.orgId) {
          const acc = await pageAccess(s.db, user, e.pageId);
          if (acc?.actions.view) send({ type: 'page-changed', pageId: e.pageId, fields: e.fields });
          return;
        }
        if (e.type === 'page-restored' && e.orgId === user.orgId && e.actorId !== user.id) {
          const acc = await pageAccess(s.db, user, e.pageId);
          if (acc?.actions.view) send({ type: 'page-restored', pageId: e.pageId, actorName: e.actorName, label: e.label, preRestoreRevisionId: acc.actions.view_history ? e.preRestoreRevisionId : null, preRestoreNumber: e.preRestoreNumber });
          return;
        }
        if (e.type === 'comments-changed') {
          const acc = await pageAccess(s.db, user, e.pageId);
          if (acc?.actions.view) send({ type: 'comments-changed', pageId: e.pageId });
          return;
        }
        if (e.type === 'notification' && e.userId === user.id) send({ type: 'notification' });
      } catch (err) {
        req.log.warn({ err }, 'event delivery failed');
      }
    });
    const ping = setInterval(() => socket.readyState === 1 && socket.ping(), 30_000);
    socket.on('close', () => {
      off();
      clearInterval(ping);
    });
    socket.on('message', (m: Buffer) => {
      if (m.toString() === 'ping') send({ type: 'pong' });
    });
  });
}
