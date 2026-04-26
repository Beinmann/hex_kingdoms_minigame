import { describe, it, expect } from 'vitest';
import { createInitialState } from '../mapgen';
import { rivalDecide } from '../ai';
import { spawnVillager } from '../villager';
import { BUILDING_SPEC } from '../types';

describe('rivalDecide', () => {
  it('places a foundation on a prioritised building when affordable', () => {
    const s = createInitialState(42);
    s.rival.resources = { food: 100, wood: 100, stone: 100, iron: 100 };
    const before =
      s.buildings.filter((b) => b.owner === 'rival').length +
      s.constructions.filter((c) => c.owner === 'rival').length;
    rivalDecide(s);
    const after =
      s.buildings.filter((b) => b.owner === 'rival').length +
      s.constructions.filter((c) => c.owner === 'rival').length;
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

  it('rival villagers are frozen — rivalDecide does not move them', () => {
    const s = createInitialState(123);
    const rivalTH = s.buildings.find((b) => b.owner === 'rival' && b.type === 'townhall')!;
    const v = spawnVillager(s, 'rival', rivalTH.q, rivalTH.r);
    s.villagers.push(v);
    rivalDecide(s);
    const after = s.villagers.find((vv) => vv.id === v.id)!;
    expect(after.status).toBe('idle');
    expect(after.homeQ).toBe(rivalTH.q);
    expect(after.homeR).toBe(rivalTH.r);
  });
});
