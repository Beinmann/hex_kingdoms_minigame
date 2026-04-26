import { describe, it, expect } from 'vitest';
import {
  HEX_DIRS,
  axialToPixel,
  distance,
  equals,
  findPath,
  inBounds,
  key,
  keyOf,
  neighbours,
  pixelToAxial,
} from '../hex';

describe('hex coords', () => {
  it('has 6 unit-length neighbour directions', () => {
    expect(HEX_DIRS).toHaveLength(6);
    for (const d of HEX_DIRS) {
      expect(distance({ q: 0, r: 0 }, d)).toBe(1);
    }
  });

  it('key and keyOf produce the same string', () => {
    expect(key(3, 4)).toBe('3,4');
    expect(keyOf({ q: -1, r: 2 })).toBe('-1,2');
  });

  it('equals compares structurally', () => {
    expect(equals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    expect(equals({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
  });

  it('neighbours returns 6 adjacent coords', () => {
    const nb = neighbours({ q: 5, r: 5 });
    expect(nb).toHaveLength(6);
    for (const n of nb) {
      expect(distance({ q: 5, r: 5 }, n)).toBe(1);
    }
  });

  it('distance is symmetric', () => {
    const a = { q: 2, r: -3 };
    const b = { q: -4, r: 1 };
    expect(distance(a, b)).toBe(distance(b, a));
  });

  it('distance to self is zero', () => {
    expect(distance({ q: 3, r: 4 }, { q: 3, r: 4 })).toBe(0);
  });

  it('inBounds respects width/height on a parallelogram map', () => {
    expect(inBounds({ q: 0, r: 0 }, 12, 10)).toBe(true);
    expect(inBounds({ q: 11, r: 9 }, 12, 10)).toBe(true);
    expect(inBounds({ q: -1, r: 0 }, 12, 10)).toBe(false);
    expect(inBounds({ q: 12, r: 0 }, 12, 10)).toBe(false);
    expect(inBounds({ q: 0, r: 10 }, 12, 10)).toBe(false);
  });
});

describe('axial <-> pixel round trip', () => {
  it('pixelToAxial inverts axialToPixel', () => {
    const size = 24;
    for (let q = 0; q < 12; q++) {
      for (let r = 0; r < 10; r++) {
        const { x, y } = axialToPixel({ q, r }, size);
        const back = pixelToAxial(x, y, size);
        expect(back).toEqual({ q, r });
      }
    }
  });
});

describe('findPath', () => {
  const opts = (blocked: Set<string>) => ({
    width: 5,
    height: 5,
    isBlocked: (h: { q: number; r: number }) => blocked.has(keyOf(h)),
  });

  it('returns empty path when start == goal', () => {
    const p = findPath({ q: 0, r: 0 }, { q: 0, r: 0 }, opts(new Set()));
    expect(p).toEqual([]);
  });

  it('returns a shortest path in an empty map', () => {
    const p = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, opts(new Set()));
    expect(p).not.toBeNull();
    expect(p).toHaveLength(3);
    expect(p![p!.length - 1]).toEqual({ q: 3, r: 0 });
  });

  it('routes around a blocker', () => {
    const blocked = new Set(['1,0', '1,1']);
    const p = findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, opts(blocked));
    expect(p).not.toBeNull();
    for (const step of p!) {
      expect(blocked.has(keyOf(step))).toBe(false);
    }
    expect(p![p!.length - 1]).toEqual({ q: 2, r: 0 });
  });

  it('returns null when goal is unreachable', () => {
    const blocked = new Set<string>();
    for (let q = 0; q < 5; q++) blocked.add(keyOf({ q, r: 2 }));
    const p = findPath({ q: 0, r: 0 }, { q: 0, r: 4 }, opts(blocked));
    expect(p).toBeNull();
  });

  it('allows the goal itself to be blocked (you can enter it to fight)', () => {
    const blocked = new Set(['2,0']);
    const p = findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, opts(blocked));
    expect(p).not.toBeNull();
    expect(p![p!.length - 1]).toEqual({ q: 2, r: 0 });
  });
});
