import { describe, it, expect } from 'vitest';
import { createInitialState } from '../mapgen';
import {
  assignVillager,
  chooseSource,
  countAssigned,
  pickIdleVillagers,
  stepVillager,
  tickVillagers,
} from '../villager';
import { BUILDING_SPEC, type GameState } from '../types';

function fresh(): GameState {
  return createInitialState(2026);
}

describe('villager helpers', () => {
  it('spawns INITIAL_VILLAGERS per side at the town hall', () => {
    const s = fresh();
    const playerCount = s.villagers.filter((v) => v.owner === 'player').length;
    const rivalCount = s.villagers.filter((v) => v.owner === 'rival').length;
    expect(playerCount).toBe(3);
    expect(rivalCount).toBe(3);
    const playerTH = s.buildings.find((b) => b.owner === 'player' && b.type === 'townhall')!;
    for (const v of s.villagers.filter((v) => v.owner === 'player')) {
      expect(v.q).toBe(playerTH.q);
      expect(v.r).toBe(playerTH.r);
    }
  });

  it('chooseSource finds a forest within radius for a lumber camp', () => {
    const s = fresh();
    const forest = s.tiles.find((t) => t.type === 'forest')!;
    s.buildings.push({
      id: 'l1',
      type: 'lumber',
      owner: 'player',
      q: forest.q,
      r: forest.r,
      hp: BUILDING_SPEC.lumber.hp,
    });
    const src = chooseSource(s, s.buildings.find((b) => b.id === 'l1')!);
    expect(src).not.toBeNull();
    expect(src!.type).toBe('forest');
  });

  it('chooseSource returns the building tile itself for a farm', () => {
    const s = fresh();
    const grass = s.tiles.find((t) => t.type === 'grass' && !s.buildings.some((b) => b.q === t.q && b.r === t.r))!;
    s.buildings.push({
      id: 'f1',
      type: 'farm',
      owner: 'player',
      q: grass.q,
      r: grass.r,
      hp: BUILDING_SPEC.farm.hp,
    });
    const src = chooseSource(s, s.buildings.find((b) => b.id === 'f1')!);
    expect(src).not.toBeNull();
    expect(src!.q).toBe(grass.q);
    expect(src!.r).toBe(grass.r);
  });

  it('chooseSource returns null when no forest is within radius', () => {
    const s = fresh();
    for (const t of s.tiles) {
      if (t.type === 'forest') {
        t.type = 'grass';
        delete t.pool;
        delete t.maxPool;
      }
    }
    const grass = s.tiles.find((t) => t.type === 'grass')!;
    s.buildings.push({
      id: 'l1',
      type: 'lumber',
      owner: 'player',
      q: grass.q,
      r: grass.r,
      hp: BUILDING_SPEC.lumber.hp,
    });
    const src = chooseSource(s, s.buildings.find((b) => b.id === 'l1')!);
    expect(src).toBeNull();
  });

  it('assignVillager moves a villager to walking_to_reassignment, recall to idle', () => {
    const s = fresh();
    const grass = s.tiles.find((t) => t.type === 'grass' && !s.buildings.some((b) => b.q === t.q && b.r === t.r))!;
    s.buildings.push({
      id: 'f1',
      type: 'farm',
      owner: 'player',
      q: grass.q,
      r: grass.r,
      hp: BUILDING_SPEC.farm.hp,
    });
    const v = s.villagers.find((vv) => vv.owner === 'player')!;
    assignVillager(s, v.id, 'f1');
    expect(v.assignedTo).toBe('f1');
    expect(['walking_to_reassignment', 'walking_to_source']).toContain(v.state);
    assignVillager(s, v.id, null);
    expect(v.assignedTo).toBeNull();
    expect(v.state).toBe('idle');
  });

  it('countAssigned and pickIdleVillagers reflect assignments', () => {
    const s = fresh();
    const grass = s.tiles.find((t) => t.type === 'grass' && !s.buildings.some((b) => b.q === t.q && b.r === t.r))!;
    s.buildings.push({
      id: 'f1',
      type: 'farm',
      owner: 'player',
      q: grass.q,
      r: grass.r,
      hp: BUILDING_SPEC.farm.hp,
    });
    expect(countAssigned(s, 'f1')).toBe(0);
    expect(pickIdleVillagers(s, 'player', 5).length).toBe(3);
    const v = s.villagers.find((vv) => vv.owner === 'player')!;
    assignVillager(s, v.id, 'f1');
    expect(countAssigned(s, 'f1')).toBe(1);
    expect(pickIdleVillagers(s, 'player', 5).length).toBe(2);
  });

  it('stepVillager runs without throwing for every state', () => {
    const s = fresh();
    const v = s.villagers.find((vv) => vv.owner === 'player')!;
    for (const state of ['idle', 'walking_to_source', 'gathering', 'walking_to_dropoff', 'depositing', 'walking_to_reassignment'] as const) {
      v.state = state;
      v.path = [];
      stepVillager(s, v, 0);
    }
    expect(true).toBe(true);
  });

  it('tickVillagers advances all villagers without throwing', () => {
    const s = fresh();
    expect(() => tickVillagers(s)).not.toThrow();
  });
});
