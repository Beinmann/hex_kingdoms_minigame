import { describe, it, expect } from 'vitest';
import { createInitialState } from '../mapgen';
import {
  capacityOf,
  chooseSource,
  drainMoveQueues,
  issueMoveCommand,
  occupantsAt,
  spawnVillager,
  stepVillager,
  tickVillagers,
} from '../villager';
import { BUILDING_SPEC, TILE_CAPACITY_DEFAULT, type GameState } from '../types';

function fresh(): GameState {
  return createInitialState(2026);
}

function freeGrass(s: GameState) {
  return s.tiles.find(
    (t) => t.type === 'grass' && !s.buildings.some((b) => b.q === t.q && b.r === t.r),
  )!;
}

// Force the tile at (q,r) to be grass so terrain rules don't reject move-command tests
// that only care about queue/drain mechanics.
function makeGrass(s: GameState, q: number, r: number): void {
  const t = s.tiles.find((tt) => tt.q === q && tt.r === r);
  if (t) {
    t.type = 'grass';
    delete t.pool;
    delete t.maxPool;
  }
}

describe('villager helpers', () => {
  it('starts with no villagers — they must be trained at the town hall', () => {
    const s = fresh();
    expect(s.villagers.length).toBe(0);
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

  it('chooseSource returns null when no forest is within radius', () => {
    const s = fresh();
    for (const t of s.tiles) {
      if (t.type === 'forest') {
        t.type = 'grass';
        delete t.pool;
        delete t.maxPool;
      }
    }
    const grass = freeGrass(s);
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

  it('capacityOf returns the tile-default for non-buildings and farm cap for farms', () => {
    const s = fresh();
    const grass = freeGrass(s);
    expect(capacityOf(s, grass.q, grass.r)).toBe(TILE_CAPACITY_DEFAULT);
    s.buildings.push({
      id: 'f1',
      type: 'farm',
      owner: 'player',
      q: grass.q,
      r: grass.r,
      hp: BUILDING_SPEC.farm.hp,
    });
    expect(capacityOf(s, grass.q, grass.r)).toBe(2);
  });

  it('occupantsAt counts villagers whose home tile matches', () => {
    const s = fresh();
    const grass = freeGrass(s);
    s.villagers.push(spawnVillager(s, 'player', grass.q, grass.r));
    s.villagers.push(spawnVillager(s, 'player', grass.q, grass.r));
    expect(occupantsAt(s, grass.q, grass.r, 'player')).toBe(2);
  });

  it('issueMoveCommand rejects when the source has no villagers', () => {
    const s = fresh();
    const grass = freeGrass(s);
    const ok = issueMoveCommand(s, grass.q, grass.r, grass.q + 1, grass.r);
    expect(ok).toBe(false);
    expect(s.notifications.length).toBe(1);
  });

  it('issueMoveCommand queues a command when the source has a villager', () => {
    const s = fresh();
    const a = freeGrass(s);
    makeGrass(s, a.q + 1, a.r);
    s.villagers.push(spawnVillager(s, 'player', a.q, a.r));
    const ok = issueMoveCommand(s, a.q, a.r, a.q + 1, a.r);
    expect(ok).toBe(true);
    expect(s.tileQueuesByOwner.player[`${a.q},${a.r}`]).toBeDefined();
    expect(s.tileQueuesByOwner.player[`${a.q},${a.r}`].length).toBe(1);
  });

  it('drainMoveQueues moves a villager logically to dest on first drain', () => {
    const s = fresh();
    const a = freeGrass(s);
    makeGrass(s, a.q + 1, a.r);
    s.villagers.push(spawnVillager(s, 'player', a.q, a.r));
    issueMoveCommand(s, a.q, a.r, a.q + 1, a.r);
    drainMoveQueues(s);
    const v = s.villagers[0];
    expect(v.homeQ).toBe(a.q + 1);
    expect(v.homeR).toBe(a.r);
    expect(v.status).toBe('moving');
  });

  it('over-capacity move command is rejected at issuance', () => {
    const s = fresh();
    const a = freeGrass(s);
    const dest = freeGrass(s); // same as `a` for this seed; force a known dest
    const destQ = a.q + 1;
    const destR = a.r;
    // Fill the destination's logical occupants up to capacity (default 3).
    for (let i = 0; i < TILE_CAPACITY_DEFAULT; i++) {
      const v = spawnVillager(s, 'player', destQ, destR);
      v.homeQ = destQ;
      v.homeR = destR;
      s.villagers.push(v);
    }
    s.villagers.push(spawnVillager(s, 'player', a.q, a.r));
    const ok = issueMoveCommand(s, a.q, a.r, destQ, destR);
    expect(ok).toBe(false);
    void dest;
  });

  it('tickVillagers advances all villagers without throwing', () => {
    const s = fresh();
    expect(() => tickVillagers(s)).not.toThrow();
  });

  it('stepVillager handles every status without throwing', () => {
    const s = fresh();
    s.villagers.push(spawnVillager(s, 'player', 0, 0));
    const v = s.villagers[0];
    for (const status of [
      'idle',
      'moving',
      'arrived_pause',
      'farming',
      'work_outbound',
      'work_gather',
      'work_inbound',
      'work_pause',
    ] as const) {
      v.status = status;
      v.path = [];
      v.pauseTicksLeft = 1;
      stepVillager(s, v);
    }
    expect(true).toBe(true);
  });
});
