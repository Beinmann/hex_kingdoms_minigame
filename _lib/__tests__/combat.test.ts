import { describe, it, expect } from 'vitest';
import { resolveCombat } from '../combat';

describe('resolveCombat', () => {
  it('5 vs 3 -> 2 vs 0', () => {
    expect(resolveCombat({ strength: 5 }, { strength: 3 })).toEqual({ a: 2, b: 0 });
  });

  it('equal sides annihilate each other', () => {
    expect(resolveCombat({ strength: 4 }, { strength: 4 })).toEqual({ a: 0, b: 0 });
  });

  it('empty attacker loses nothing', () => {
    expect(resolveCombat({ strength: 0 }, { strength: 5 })).toEqual({ a: 0, b: 5 });
  });

  it('symmetric swap inverts result', () => {
    const fwd = resolveCombat({ strength: 7 }, { strength: 2 });
    const back = resolveCombat({ strength: 2 }, { strength: 7 });
    expect({ a: back.b, b: back.a }).toEqual(fwd);
  });
});
