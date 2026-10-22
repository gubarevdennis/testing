/** Sends client-side errors and input latency samples (no document content) to the server metrics. */
let errors: Array<{ kind: string; message: string }> = [];
let latency: number[] = [];
let timer: number | null = null;

function csrf() {
  return /(?:^|;\s*)kb_csrf=([^;]+)/.exec(document.cookie)?.[1] ?? '';
}

function flushSoon() {
  if (timer) return;
  timer = window.setTimeout(() => {
    timer = null;
    if (!errors.length && !latency.length) return;
    const body = JSON.stringify({ errors: errors.slice(0, 20), inputLatencyMs: latency.slice(0, 200) });
    errors = [];
    latency = [];
    fetch('/api/v1/telemetry', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf()) }, body, credentials: 'same-origin', keepalive: true }).catch(() => undefined);
  }, 15_000);
}

export function reportError(kind: string, message: string) {
  errors.push({ kind, message: message.slice(0, 500) });
  flushSoon();
}

export function reportInputLatency(ms: number) {
  if (Math.random() < 0.2) {
    latency.push(Math.round(ms));
    flushSoon();
  }
}
