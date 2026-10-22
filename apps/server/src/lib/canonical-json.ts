/** Deterministic JSON (sorted keys) — used for hashing values that pass through jsonb (which reorders keys). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).filter((k) => (v as any)[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson((v as any)[k])).join(',') + '}';
}
