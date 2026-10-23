/// <reference lib="webworker" />
import { Sha256 } from './sha256';

/**
 * Streaming SHA-256 off the main thread (R-PERF-019): hashing a large upload chunk by chunk in pure JS takes tens of
 * milliseconds per 4 MB — on the main thread that would stall typing while a file uploads.
 */
const hashers = new Map<string, Sha256>();
self.onmessage = (e: MessageEvent<{ id: string; op: 'update' | 'digest' | 'drop'; data?: ArrayBuffer }>) => {
  const { id, op, data } = e.data;
  if (op === 'drop') return void hashers.delete(id);
  let h = hashers.get(id);
  if (!h) hashers.set(id, (h = new Sha256()));
  if (op === 'update' && data) h.update(new Uint8Array(data));
  if (op === 'digest') {
    hashers.delete(id);
    (self as unknown as Worker).postMessage({ id, hex: h.digestHex() });
  } else (self as unknown as Worker).postMessage({ id, ok: true });
};
