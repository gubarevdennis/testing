import { EventEmitter } from 'node:events';
import type pg from 'pg';
import type { Logger } from 'pino';

/**
 * Cross-instance event bus. Events are emitted locally and published through Postgres NOTIFY so that every
 * application instance (WebSocket gateway) learns about ACL changes, revocations and document updates.
 */
export type KbEvent =
  | { type: 'acl-changed'; orgId: string }
  | { type: 'user-revoked'; userId: string; reason: string }
  | { type: 'tree-changed'; orgId: string; spaceId: string; pageIds?: string[] }
  | { type: 'page-changed'; orgId: string; pageId: string; fields: string[] }
  | { type: 'doc-update'; pageId: string; seq: number; origin: string }
  | { type: 'doc-reset'; pageId: string; origin: string }
  | { type: 'comments-changed'; pageId: string }
  | { type: 'notification'; userId: string };

const CHANNEL = 'kb_events';

export class EventBus {
  private local = new EventEmitter();
  private listener: pg.PoolClient | null = null;
  readonly instanceId = Math.random().toString(36).slice(2);

  constructor(
    private pool: pg.Pool,
    private log: Logger,
  ) {
    this.local.setMaxListeners(10_000);
  }

  async start() {
    const client = await this.pool.connect();
    this.listener = client;
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const { from, event } = JSON.parse(msg.payload);
        if (from === this.instanceId) return;
        this.local.emit('event', event as KbEvent);
      } catch (err) {
        this.log.warn({ err }, 'bad event payload');
      }
    });
    client.on('error', (err) => this.log.error({ err }, 'event listener connection error'));
    await client.query(`listen ${CHANNEL}`);
  }

  async stop() {
    if (this.listener) {
      await this.listener.query(`unlisten ${CHANNEL}`).catch(() => undefined);
      this.listener.release();
      this.listener = null;
    }
  }

  on(fn: (e: KbEvent) => void): () => void {
    this.local.on('event', fn);
    return () => this.local.off('event', fn);
  }

  /** Emits locally right away and to other instances via NOTIFY (best effort; state is always in the DB). */
  emit(event: KbEvent) {
    this.local.emit('event', event);
    const payload = JSON.stringify({ from: this.instanceId, event });
    if (payload.length < 7900) this.pool.query('select pg_notify($1, $2)', [CHANNEL, payload]).catch((err) => this.log.warn({ err }, 'notify failed'));
  }
}
