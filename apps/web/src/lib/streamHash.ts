import { Sha256 } from './sha256';

/**
 * Incremental SHA-256 that runs in a Web Worker when available (R-PERF-019: uploads never block typing), with the same
 * result as the in-thread implementation it falls back to (no Worker support, worker failed to start).
 */
export interface StreamHasher {
  update(data: Uint8Array): Promise<void>;
  digestHex(): Promise<string>;
}

let worker: Worker | null | undefined;
const waiting = new Map<string, Array<(v: { hex?: string; ok?: boolean; error?: string }) => void>>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    // measurement switch (tests/e2e/perf-background.spec.ts compares both): hash on the main thread
    if (localStorage.getItem('kb:hash-in-thread') === '1') return null;
  } catch {
    /* storage unavailable */
  }
  try {
    worker = new Worker(new URL('./sha256.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: string; hex?: string; ok?: boolean }>) => waiting.get(e.data.id)?.shift()?.(e.data);
    worker.onerror = () => {
      // the worker could not run: fail pending calls, later hashers use the main thread
      for (const q of waiting.values()) for (const r of q.splice(0)) r({ error: 'worker failed' });
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function call(w: Worker, id: string, op: 'update' | 'digest', data?: Uint8Array) {
  return new Promise<{ hex?: string; ok?: boolean; error?: string }>((resolve) => {
    const q = waiting.get(id) ?? [];
    q.push(resolve);
    waiting.set(id, q);
    if (data) {
      const copy = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.slice().buffer;
      w.postMessage({ id, op, data: copy }, [copy as ArrayBuffer]);
    } else w.postMessage({ id, op });
  });
}

export function createStreamHasher(): StreamHasher {
  const w = getWorker();
  if (!w) {
    const h = new Sha256();
    return { update: async (d) => void h.update(d), digestHex: async () => h.digestHex() };
  }
  const id = crypto.randomUUID();
  let broken = false;
  return {
    async update(d) {
      if (broken) return;
      if ((await call(w, id, 'update', d)).error) broken = true;
    },
    async digestHex() {
      const r = broken ? null : await call(w, id, 'digest');
      if (!r?.hex) throw new Error('hash worker failed'); // the caller re-hashes the file in-thread
      return r.hex;
    },
  };
}

/** In-thread SHA-256 of a whole file, slice by slice (fallback when the worker failed mid-file). */
export async function hashFileInThread(file: Blob): Promise<string> {
  const h = new Sha256();
  for (let at = 0; at < file.size; at += 4 * 1024 * 1024) {
    h.update(new Uint8Array(await file.slice(at, Math.min(file.size, at + 4 * 1024 * 1024)).arrayBuffer()));
    await new Promise((r) => setTimeout(r, 0)); // yield between slices
  }
  return h.digestHex();
}
