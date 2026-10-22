import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { pairwise, missingPairs, orderViolation, countViolations, docLines } from '../support/pairwise';

/** The axes of the product test matrix (docs/TEST_MATRIX.md, QA26-30). */
export const PRODUCT_AXES = {
  role: ['owner', 'editor', 'commenter', 'viewer', 'guest'],
  device: ['desktop-mouse', 'desktop-keyboard', 'tablet-touch', 'phone-touch'],
  content: ['plain', 'unicode', 'long-line', 'table', 'image'],
  network: ['online', 'http-fallback', 'offline-reconnect', 'slow'],
  concurrency: [1, 2, 20],
  history: ['fresh', 'with-version', 'restored'],
  size: ['small', 'large'],
} as const;

describe('pairwise test-case generator (QA26-30)', () => {
  it('QA26-30: covers every pair of role × device/input × content × network × concurrency × history × size with far fewer cases than the product', () => {
    const cases = pairwise(PRODUCT_AXES);
    expect(missingPairs(PRODUCT_AXES, cases)).toEqual([]);
    const product = Object.values(PRODUCT_AXES).reduce((n, v) => n * v.length, 1);
    expect(product).toBe(7200);
    expect(cases.length).toBeLessThan(40);
    // deterministic: a failing case can be reproduced by its index
    expect(pairwise(PRODUCT_AXES)).toEqual(cases);
  });

  it('QA26-30: any random set of axes gets a complete pairwise cover (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 7 }), (sizes) => {
        const axes = Object.fromEntries(sizes.map((n, i) => [`a${i}`, Array.from({ length: n }, (_, k) => k)]));
        const cases = pairwise(axes);
        expect(missingPairs(axes, cases)).toEqual([]);
        const sorted = [...sizes].sort((a, b) => b - a);
        expect(cases.length).toBeGreaterThanOrEqual(sizes.length > 1 ? sorted[0] * sorted[1] : sorted[0]);
      }),
      { numRuns: 60 },
    );
  });
});

describe('invariant helpers (QA26-31)', () => {
  it('QA26-31: detect lost, duplicated and reordered content', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'один [a]' }] }, { type: 'heading', content: [{ type: 'text', text: 'два' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'три [b][b]' }] }] };
    const lines = docLines(doc);
    expect(lines).toEqual(['один [a]', 'два', 'три [b][b]']);
    expect(orderViolation(lines, ['один', 'два', 'три'])).toBeNull();
    expect(orderViolation(lines, ['два', 'один'])).toBe('out of order: один');
    expect(orderViolation(lines, ['четыре'])).toBe('missing: четыре');
    expect(countViolations(lines.join('\n'), ['[a]', '[b]', '[c]'])).toEqual(['[b] × 2', '[c] × 0']);
  });
});
