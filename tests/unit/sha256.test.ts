import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { Sha256, sha256Hex } from '../../apps/web/src/lib/sha256';

const ref = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('incremental SHA-256 of streamed uploads (R-FILES-004, R-FILES-011)', () => {
  it('R-FILES-004: matches the reference for edge lengths', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 1000, 70_001]) {
      const b = randomBytes(n);
      expect(sha256Hex(b)).toBe(ref(b));
    }
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('R-FILES-011: arbitrary chunking gives the same digest as hashing the whole file', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 3000 }), fc.array(fc.integer({ min: 1, max: 700 }), { maxLength: 20 }), (data, cuts) => {
        const h = new Sha256();
        let o = 0;
        for (const c of cuts) {
          h.update(data.subarray(o, o + c));
          o += c;
        }
        h.update(data.subarray(o));
        expect(h.digestHex()).toBe(ref(data));
      }),
      { numRuns: 200 },
    );
  });
});
