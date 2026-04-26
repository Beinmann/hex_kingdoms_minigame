import { describe, it, expect } from 'vitest';
import { createInitialState } from '../mapgen';
import { rivalDecide } from '../ai';
import { BUILDING_SPEC } from '../types';

describe('rivalDecide', () => {
  it('spends resources on a prioritised building when affordable', () => {
    const s = createInitialState(42);
    s.rival.resources = { food: 100, wood: 100, stone: 100, iron: 100 };
    const before = s.buildings.filter((b) => b.owner === 'rival').length;
    rivalDecide(s);
    const after = s.buildings.filter((b) => b.owner === 'rival').length;
    expect(after).toBeGreaterThan(before);
  });

  it('does not exceed popCap when building', () => {
    const s = createInitialState(7);
    s.rival.resources = { food: 100, wood: 100, stone: 100, iron: 100 };
    for (let i = 0; i < 10; i++) rivalDecide(s);
    const rivalBuildings = s.buildings.filter((b) => b.owner === 'rival');
    const req = rivalBuildings.reduce((sum, b) => sum + BUILDING_SPEC[b.type].pop, 0);
    expect(req).toBeLessThanOrEqual(s.rival.popCap);
  });

  it('builds nothing when starved of resources', () => {
    const s = createInitialState(3);
    s.rival.resources = { food: 0, wood: 0, stone: 0, iron: 0 };
    const before = s.buildings.filter((b) => b.owner === 'rival').length;
    rivalDecide(s);
    const after = s.buildings.filter((b) => b.owner === 'rival').length;
    expect(after).toBe(before);
  });

  it('queues a villager training when affordable and pop has room', () => {
    const s = createInitialState(99);
    s.rival.resources = { food: 100, wood: 0, stone: 0, iron: 0 };
    s.rival.popCap = 10;
    rivalDecide(s);
    const villagerTrainings = s.trainings.filter((t) => t.owner === 'rival' && t.kind === 'villager');
    expect(villagerTrainings.length).toBeGreaterThanOrEqual(1);
  });

  it('assigns idle rival villagers to its extractors', () => {
    const s = createInitialState(123);
    s.rival.resources = { food: 100, wood: 100, stone: 100, iron: 100 };
    const grass = s.tiles.find(
      (t) => t.type === 'grass' && !s.buildings.some((b) => b.q === t.q && b.r === t.r),
    )!;
    s.buildings.push({
      id: 'rl1',
      type: 'lumber',
      owner: 'rival',
      q: grass.q,
      r: grass.r,
      hp: BUILDING_SPEC.lumber.hp,
    });
    const rivalTH = s.buildings.find((b) => b.owner === 'rival' && b.type === 'townhall')!;
    s.villagers.push({
      id: 'rv1',
      owner: 'rival',
      q: rivalTH.q,
      r: rivalTH.r,
      path: [],
      state: 'idle',
      assignedTo: null,
      carrying: null,
      gatherTicksLeft: 0,
      wanderCooldown: 0,
    });
    rivalDecide(s);
    const assigned = s.villagers.filter((v) => v.owner === 'rival' && v.assignedTo === 'rl1').length;
    expect(assigned).toBeGreaterThan(0);
  });
});
