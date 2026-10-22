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
  | { type: 'notification'; userId: string }
  /** A version/journal state was restored: co-editors are told, with a link to the pre-restore version. */
  | { type: 'page-restored'; orgId: string; pageId: string; actorId: string; actorName: string; label: string; preRestoreRevisionId: string; preRestoreNumber: number }
  /** Local only: the LISTEN connection was re-established; events may have been missed meanwhile. */
  | { type: 'bus-resync' };

const CHANNEL = 'kb_events';

export class EventBus {
  private local = new EventEmitter();
  private listener: pg.PoolClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  readonly instanceId = Math.random().toString(36).slice(2);

  constructor(
    private pool: pg.Pool,
    private log: Logger,
  ) {
    this.local.setMaxListeners(10_000);
  }

  async start() {
    this.stopped = false;
    await this.listen();
  }

  /**
   * Dedicated LISTEN connection. If it is lost (database restart, failover, terminated backend) it is
   * re-established with backoff; consumers then get a local 'bus-resync' event because notifications sent
   * while it was down are not replayed by PostgreSQL.
   */
  private async listen() {
    const client = await this.pool.connect();
    this.listener = client;
    let lost = false;
    const onLost = (err?: Error) => {
      if (lost) return;
      lost = true;
      if (this.listener === client) this.listener = null;
      this.log.error({ err: err?.message }, 'event listener connection lost — reconnecting');
      try {
        client.release(err ?? new Error('listener connection ended'));
      } catch {
        /* already released */
      }
      this.scheduleReconnect(250);
    };
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
    client.on('error', onLost);
    client.on('end', () => onLost());
    try {
      await client.query(`listen ${CHANNEL}`);
    } catch (err) {
      onLost(err as Error);
      throw err;
    }
  }

  private scheduleReconnect(delay: number) {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      try {
        await this.listen();
        this.log.info('event listener reconnected');
        this.local.emit('event', { type: 'bus-resync' } satisfies KbEvent);
      } catch {
        this.scheduleReconnect(Math.min(delay * 2, 10_000));
      }
    }, delay);
  }

  async stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.listener) {
      const l = this.listener;
      this.listener = null;
      l.removeAllListeners('end');
      await l.query(`unlisten ${CHANNEL}`).catch(() => undefined);
      l.release();
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
