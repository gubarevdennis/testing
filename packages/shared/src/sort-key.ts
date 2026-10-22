import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/** Fractional sort keys: moving an item never renumbers siblings. */
export function keyBetween(a: string | null | undefined, b: string | null | undefined): string {
  // Defensive: if keys are out of order (concurrent edits), fall back to "after a".
  if (a && b && a >= b) return generateKeyBetween(a, null);
  return generateKeyBetween(a ?? null, b ?? null);
}

export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  return generateNKeysBetween(a, b, n);
}
