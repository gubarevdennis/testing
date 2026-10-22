/**
 * Pairwise (all-pairs) combination generator and invariant helpers for test matrices (QA26-30, QA26-31).
 *
 * Every pair of values of any two axes appears in at least one generated case, which catches all defects caused by
 * the interaction of two factors with far fewer cases than the full cartesian product. Deterministic: the same
 * axes always give the same cases, so a failing case can be reproduced by its index.
 */
export type Axes = Record<string, readonly unknown[]>;
export type Case<A extends Axes> = { [K in keyof A]: A[K][number] };

export function pairwise<A extends Axes>(axes: A): Array<Case<A>> {
  const names = Object.keys(axes);
  const sizes = names.map((n) => axes[n].length);
  if (sizes.some((s) => s === 0)) return [];
  if (names.length === 1) return axes[names[0]].map((v) => ({ [names[0]]: v }) as Case<A>);
  // uncovered pairs as "i:a|j:b" keys (i < j axis indices, a/b value indices)
  const uncovered = new Set<string>();
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) for (let a = 0; a < sizes[i]; a++) for (let b = 0; b < sizes[j]; b++) uncovered.add(`${i}:${a}|${j}:${b}`);
  const rows: number[][] = [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (uncovered.size) {
    // start from an uncovered pair, then fill the other axes greedily
    const [first] = uncovered;
    const [[i0, a0], [j0, b0]] = first.split('|').map((p) => p.split(':').map(Number));
    const row: number[] = new Array(names.length).fill(-1);
    row[i0] = a0;
    row[j0] = b0;
    const order = names.map((_, k) => k).filter((k) => row[k] < 0).sort(() => rnd() - 0.5);
    for (const k of order) {
      let best = 0;
      let bestGain = -1;
      for (let v = 0; v < sizes[k]; v++) {
        let gain = 0;
        for (let m = 0; m < names.length; m++) {
          if (m === k || row[m] < 0) continue;
          const key = m < k ? `${m}:${row[m]}|${k}:${v}` : `${k}:${v}|${m}:${row[m]}`;
          if (uncovered.has(key)) gain++;
        }
        if (gain > bestGain || (gain === bestGain && rnd() < 0.3)) {
          best = v;
          bestGain = gain;
        }
      }
      row[k] = best;
    }
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) uncovered.delete(`${i}:${row[i]}|${j}:${row[j]}`);
    rows.push(row);
  }
  return rows.map((r) => Object.fromEntries(names.map((n, k) => [n, axes[n][r[k]]])) as Case<A>);
}

/** Pairs of values not covered by `cases` (empty when the set is a complete pairwise cover). */
export function missingPairs<A extends Axes>(axes: A, cases: Array<Case<A>>): string[] {
  const names = Object.keys(axes);
  const out: string[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++)
      for (const a of axes[names[i]])
        for (const b of axes[names[j]]) if (!cases.some((c) => (c as any)[names[i]] === a && (c as any)[names[j]] === b)) out.push(`${names[i]}=${String(a)} × ${names[j]}=${String(b)}`);
  return out;
}

export function caseName(c: Record<string, unknown>) {
  return Object.entries(c)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');
}

/** Plain text of a Tiptap/ProseMirror JSON document, one line per top-level block. */
export function docLines(doc: any): string[] {
  const text = (n: any): string => (n.text ?? '') + (n.content ?? []).map(text).join('');
  return (doc?.content ?? []).map(text);
}

/**
 * Invariant: `expected` strings appear in `lines` in this relative order (other lines may be interleaved).
 * Returns the first violation or null.
 */
export function orderViolation(lines: string[], expected: string[]): string | null {
  let at = -1;
  for (const e of expected) {
    const i = lines.findIndex((l, k) => k > at && l.includes(e));
    if (i < 0) return lines.some((l) => l.includes(e)) ? `out of order: ${e}` : `missing: ${e}`;
    at = i;
  }
  return null;
}

/** Invariant: each marker occurs exactly once in the text (nothing lost, nothing duplicated). */
export function countViolations(text: string, markers: string[]): string[] {
  const out: string[] = [];
  for (const m of markers) {
    const n = text.split(m).length - 1;
    if (n !== 1) out.push(`${m} × ${n}`);
  }
  return out;
}
