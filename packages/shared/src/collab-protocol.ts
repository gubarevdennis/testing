/**
 * Wire protocol for collaborative editing (binary frames, lib0 encoding).
 *
 * Durability contract: the server sends ACK(opId, seq) only after the update is committed to PostgreSQL.
 * The client shows "saved" only when every local update has been acknowledged.
 */
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export const MSG = {
  HELLO: 0, // C→S: clientStateVector
  SYNC: 1, // S→C: missing update, server state vector, last seq, flags
  UPDATE: 2, // C→S: opId + update
  ACK: 3, // S→C: opId + seq
  NACK: 4, // S→C: opId + code + message
  REMOTE: 5, // S→C: update from others (+seq)
  AWARENESS: 6, // C↔S: awareness update (cursor positions)
  PRESENCE: 7, // S→C: JSON list of connected users (server-authored identities)
  ACCESS: 8, // S→C: JSON { canEdit, level, reason }
  PING: 10,
  PONG: 11,
  ERROR: 12, // S→C: JSON { code, message } — connection will be closed
} as const;

export type ClientMessage =
  | { type: typeof MSG.HELLO; stateVector: Uint8Array }
  | { type: typeof MSG.UPDATE; opId: string; update: Uint8Array }
  | { type: typeof MSG.AWARENESS; update: Uint8Array }
  | { type: typeof MSG.PING };

export type ServerMessage =
  | { type: typeof MSG.SYNC; update: Uint8Array; stateVector: Uint8Array; seq: number; canEdit: boolean }
  | { type: typeof MSG.ACK; opId: string; seq: number }
  | { type: typeof MSG.NACK; opId: string; code: string; message: string }
  | { type: typeof MSG.REMOTE; update: Uint8Array; seq: number }
  | { type: typeof MSG.AWARENESS; update: Uint8Array }
  | { type: typeof MSG.PRESENCE; users: PresenceUser[] }
  | { type: typeof MSG.ACCESS; canEdit: boolean; level: string; reason?: string }
  | { type: typeof MSG.PONG }
  | { type: typeof MSG.ERROR; code: string; message: string };

export interface PresenceUser {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  canEdit: boolean;
}

/** WebSocket close codes used by the server. */
export const CLOSE = {
  ACCESS_REVOKED: 4403,
  NOT_FOUND: 4404,
  SESSION_EXPIRED: 4401,
  INVALID: 4400,
  SERVER_RESTART: 4503,
} as const;

export function encodeClient(m: ClientMessage): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, m.type);
  switch (m.type) {
    case MSG.HELLO:
      encoding.writeVarUint8Array(e, m.stateVector);
      break;
    case MSG.UPDATE:
      encoding.writeVarString(e, m.opId);
      encoding.writeVarUint8Array(e, m.update);
      break;
    case MSG.AWARENESS:
      encoding.writeVarUint8Array(e, m.update);
      break;
  }
  return encoding.toUint8Array(e);
}

export function decodeClient(buf: Uint8Array): ClientMessage {
  const d = decoding.createDecoder(buf);
  const type = decoding.readVarUint(d);
  switch (type) {
    case MSG.HELLO:
      return { type, stateVector: decoding.readVarUint8Array(d) };
    case MSG.UPDATE:
      return { type, opId: decoding.readVarString(d), update: decoding.readVarUint8Array(d) };
    case MSG.AWARENESS:
      return { type, update: decoding.readVarUint8Array(d) };
    case MSG.PING:
      return { type };
  }
  throw new Error('unknown client message ' + type);
}

export function encodeServer(m: ServerMessage): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, m.type);
  switch (m.type) {
    case MSG.SYNC:
      encoding.writeVarUint8Array(e, m.update);
      encoding.writeVarUint8Array(e, m.stateVector);
      encoding.writeVarUint(e, m.seq);
      encoding.writeVarUint(e, m.canEdit ? 1 : 0);
      break;
    case MSG.ACK:
      encoding.writeVarString(e, m.opId);
      encoding.writeVarUint(e, m.seq);
      break;
    case MSG.NACK:
      encoding.writeVarString(e, m.opId);
      encoding.writeVarString(e, m.code);
      encoding.writeVarString(e, m.message);
      break;
    case MSG.REMOTE:
      encoding.writeVarUint8Array(e, m.update);
      encoding.writeVarUint(e, m.seq);
      break;
    case MSG.AWARENESS:
      encoding.writeVarUint8Array(e, m.update);
      break;
    case MSG.PRESENCE:
      encoding.writeVarString(e, JSON.stringify(m.users));
      break;
    case MSG.ACCESS:
      encoding.writeVarString(e, JSON.stringify({ canEdit: m.canEdit, level: m.level, reason: m.reason }));
      break;
    case MSG.ERROR:
      encoding.writeVarString(e, JSON.stringify({ code: m.code, message: m.message }));
      break;
  }
  return encoding.toUint8Array(e);
}

export function decodeServer(buf: Uint8Array): ServerMessage {
  const d = decoding.createDecoder(buf);
  const type = decoding.readVarUint(d);
  switch (type) {
    case MSG.SYNC:
      return { type, update: decoding.readVarUint8Array(d), stateVector: decoding.readVarUint8Array(d), seq: decoding.readVarUint(d), canEdit: decoding.readVarUint(d) === 1 };
    case MSG.ACK:
      return { type, opId: decoding.readVarString(d), seq: decoding.readVarUint(d) };
    case MSG.NACK:
      return { type, opId: decoding.readVarString(d), code: decoding.readVarString(d), message: decoding.readVarString(d) };
    case MSG.REMOTE:
      return { type, update: decoding.readVarUint8Array(d), seq: decoding.readVarUint(d) };
    case MSG.AWARENESS:
      return { type, update: decoding.readVarUint8Array(d) };
    case MSG.PRESENCE:
      return { type, users: JSON.parse(decoding.readVarString(d)) };
    case MSG.ACCESS: {
      const j = JSON.parse(decoding.readVarString(d));
      return { type, canEdit: j.canEdit, level: j.level, reason: j.reason };
    }
    case MSG.PONG:
      return { type };
    case MSG.ERROR: {
      const j = JSON.parse(decoding.readVarString(d));
      return { type, code: j.code, message: j.message };
    }
  }
  throw new Error('unknown server message ' + type);
}

const COLORS = ['#5A85C6', '#C65A85', '#3E9B6E', '#C68A3A', '#8A5AC6', '#3A9BB5', '#B5563A', '#6E7F2E'];
export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Names of the shared types inside a page's Y.Doc. */
export const FRAGMENT_NAME = 'default';
export const TITLE_NAME = 'title';
