import { describe, it, expect } from 'vitest';
import { createInitialState } from '../mapgen';
import { advance } from '../tick';
import { assignVillager } from '../villager';
import { BUILDING_SPEC, type Building, type GameState } from '../types';

function freshState(): GameState {
  return createInitialState(12345);
}

function addBuilding(state: GameState, b: Omit<Building, 'hp'> & Partial<Pick<Building, 'hp'>>): void {
  const spec = BUILDING_SPEC[b.type];
  state.buildings.push({ hp: spec.hp, ...b } as Building);
  if (b.owner === 'player') state.player.popCap += spec.popCapDelta ?? 0;
  if (b.owner === 'rival') state.rival.popCap += spec.popCapDelta ?? 0;
}

describe('advance', () => {
  it('increments the tick counter', () => {
    const s = freshState();
    const next = advance(s);
    expect(next.tick).toBe(1);
  });

  it('does not mutate the input state', () => {
    const s = freshState();
    const snap = JSON.stringify(s);
    advance(s);
    expect(JSON.stringify(s)).toBe(snap);
  });

  it('a villager assigned to a lumber camp on grass gathers wood from a nearby forest', () => {
    const s = freshState();
    const forest = s.tiles.find(
      (t) => t.type === 'forest' && !s.buildings.some((b) => b.q === t.q && b.r === t.r),
    )!;
    const startPool = forest.pool!;
    const grassNear = s.tiles.find(
      (t) =>
        t.type === 'grass' &&
        !s.buildings.some((b) => b.q === t.q && b.r === t.r) &&
        Math.abs(t.q - forest.q) <= 2 &&
        Math.abs(t.r - forest.r) <= 2,
    )!;
    addBuilding(s, { id: 'l1', type: 'lumber', owner: 'player', q: grassNear.q, r: grassNear.r });
    const villager = s.villagers.find((v) => v.owner === 'player')!;
    villager.q = grassNear.q;
    villager.r = grassNear.r;
    assignVillager(s, villager.id, 'l1');

    const startWood = s.player.resources.wood;
    let cur: GameState = s;
    for (let i = 0; i < 30; i++) cur = advance(cur);
    expect(cur.player.resources.wood).toBeGreaterThan(startWood);
    const tileAfter = cur.tiles.find((t) => t.q === forest.q && t.r === forest.r)!;
    expect(tileAfter.pool ?? 0).toBeLessThan(startPool);
  });

  it('shrinks pop when food runs out', () => {
    const s = freshState();
    const startVillagers = s.villagers.filter((v) => v.owner === 'player').length;
    s.player.resources.food = 0;
    const next = advance(s);
    expect(next.villagers.filter((v) => v.owner === 'player').length).toBeLessThan(startVillagers);
    expect(next.player.resources.food).toBe(0);
  });

  it('reveals tiles around the player town hall', () => {
    const s = freshState();
    const th = s.buildings.find((b) => b.owner === 'player')!;
    const next = advance(s);
    expect(next.visible[`${th.q},${th.r}`]).toBe(true);
  });

  it('sets phase to lost when the player town hall is destroyed', () => {
    const s = freshState();
    s.buildings = s.buildings.filter((b) => !(b.owner === 'player' && b.type === 'townhall'));
    const next = advance(s);
    expect(next.phase).toBe('lost');
  });

  it('sets phase to won when the rival town hall is destroyed', () => {
    const s = freshState();
    s.buildings = s.buildings.filter((b) => !(b.owner === 'rival' && b.type === 'townhall'));
    const next = advance(s);
    expect(next.phase).toBe('won');
  });
});
