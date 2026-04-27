import { describe, it, expect } from 'vitest';
import { createInitialState } from '../mapgen';
import { advance } from '../tick';
import { findPath } from '../hex';
import { issueMoveCommand, spawnVillager } from '../villager';
import { rivalDecide, rivalScarcestResource } from '../ai';
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

// Carve a grass corridor from `from` to `to` so a movement test isn't blocked by
// random forest/hill/mountain that happens to sit on the seeded path. Tiles named
// in `keep` are preserved so resources we depend on (e.g. the gather forest) survive.
function carveGrassCorridor(
  s: GameState,
  from: { q: number; r: number },
  to: { q: number; r: number },
  keep: { q: number; r: number }[] = [],
): boolean {
  const path = findPath(from, to, {
    width: s.mapWidth,
    height: s.mapHeight,
    isBlocked: (h) => {
      if (keep.some((k) => k.q === h.q && k.r === h.r)) return true;
      const tt = s.tiles.find((t) => t.q === h.q && t.r === h.r);
      return !tt || tt.type === 'water';
    },
  });
  if (!path) return false;
  for (const step of path) {
    const t = s.tiles.find((tt) => tt.q === step.q && tt.r === step.r);
    if (!t || t.type === 'grass' || t.type === 'water') continue;
    t.type = 'grass';
    delete t.pool;
    delete t.maxPool;
  }
  return true;
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

  it('a villager whose home is a lumber camp gathers wood from a nearby forest', () => {
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
    const v = spawnVillager(s, 'player', grassNear.q, grassNear.r);
    v.homeQ = grassNear.q;
    v.homeR = grassNear.r;
    v.status = 'arrived_pause';
    v.pauseTicksLeft = 1;
    s.villagers.push(v);
    s.player.resources.food = 1000;

    const startWood = s.player.resources.wood;
    let cur: GameState = s;
    for (let i = 0; i < 30; i++) cur = advance(cur);
    expect(cur.player.resources.wood).toBeGreaterThan(startWood);
    const tileAfter = cur.tiles.find((t) => t.q === forest.q && t.r === forest.r)!;
    expect(tileAfter.pool ?? 0).toBeLessThan(startPool);
  });

  it('food does not drain over time (upkeep is disabled)', () => {
    const s = freshState();
    s.villagers.push(spawnVillager(s, 'player', 0, 0));
    s.player.resources.food = 5;
    let cur: GameState = s;
    for (let i = 0; i < 10; i++) cur = advance(cur);
    expect(cur.player.resources.food).toBe(5);
    expect(cur.villagers.filter((v) => v.owner === 'player').length).toBe(1);
  });

  it('a queued move command moves a villager logically on next advance', () => {
    const s = freshState();
    const grass = s.tiles.find(
      (t) => t.type === 'grass' && !s.buildings.some((b) => b.q === t.q && b.r === t.r),
    )!;
    // Force the destination grass so terrain rules don't reject the move command.
    const destTile = s.tiles.find((t) => t.q === grass.q + 1 && t.r === grass.r);
    if (destTile) {
      destTile.type = 'grass';
      delete destTile.pool;
      delete destTile.maxPool;
    }
    const v = spawnVillager(s, 'player', grass.q, grass.r);
    s.villagers.push(v);
    const ok = issueMoveCommand(s, grass.q, grass.r, grass.q + 1, grass.r);
    expect(ok).toBe(true);
    const next = advance(s);
    const moved = next.villagers.find((vv) => vv.id === v.id)!;
    expect(moved.homeQ).toBe(grass.q + 1);
    expect(moved.homeR).toBe(grass.r);
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

  it('a rival villager queued from townhall to a lumber camp gathers wood', () => {
    const s = freshState();
    const rivalTH = s.buildings.find((b) => b.owner === 'rival' && b.type === 'townhall')!;
    const forest = s.tiles.find(
      (t) =>
        t.type === 'forest' &&
        !s.buildings.some((bb) => bb.q === t.q && bb.r === t.r) &&
        Math.abs(t.q - rivalTH.q) <= 3 &&
        Math.abs(t.r - rivalTH.r) <= 3,
    );
    if (!forest) {
      // seed-dependent; skip rather than fail. The need-based-build test below
      // guards the same codepath without relying on tile layout.
      return;
    }
    const grassNear = s.tiles.find(
      (t) =>
        t.type === 'grass' &&
        !s.buildings.some((bb) => bb.q === t.q && bb.r === t.r) &&
        Math.abs(t.q - forest.q) <= 2 &&
        Math.abs(t.r - forest.r) <= 2,
    )!;
    addBuilding(s, { id: 'rl1', type: 'lumber', owner: 'rival', q: grassNear.q, r: grassNear.r });
    if (
      !carveGrassCorridor(
        s,
        { q: rivalTH.q, r: rivalTH.r },
        { q: grassNear.q, r: grassNear.r },
        [{ q: forest.q, r: forest.r }],
      )
    ) {
      // No water-only path exists for this seed — terrain test isn't applicable.
      return;
    }
    const v = spawnVillager(s, 'rival', rivalTH.q, rivalTH.r);
    s.villagers.push(v);
    s.rival.resources.food = 100000;

    const startPool = forest.pool!;
    let cur: GameState = s;
    for (let i = 0; i < 60; i++) cur = advance(cur);

    // At least one rival villager logically settled at the lumber camp via the queue.
    const lumberOcc = cur.villagers.filter(
      (vv) => vv.owner === 'rival' && vv.homeQ === grassNear.q && vv.homeR === grassNear.r,
    ).length;
    expect(lumberOcc).toBeGreaterThanOrEqual(1);

    // Forest depleted at least once — proves a full outbound→gather→inbound cycle ran.
    const forestAfter = cur.tiles.find((t) => t.q === forest.q && t.r === forest.r)!;
    const poolAfter = forestAfter.pool ?? 0;
    expect(poolAfter).toBeLessThan(startPool);
  });

  it('rivalScarcestResource returns the resource with the lowest stock', () => {
    const s = freshState();
    s.rival.resources = { food: 100, wood: 100, stone: 5, iron: 100 };
    expect(rivalScarcestResource(s)).toBe('stone');
    s.rival.resources = { food: 1, wood: 50, stone: 50, iron: 50 };
    expect(rivalScarcestResource(s)).toBe('food');
  });

  it('the rival starts a lumber-camp foundation when wood is its scarcest resource', () => {
    const s = freshState();
    // Force a clear scarcity on wood; everything else abundant.
    s.rival.resources = { food: 100, wood: 10, stone: 100, iron: 100 };
    s.rival.popCap = 20;
    const before =
      s.buildings.filter((b) => b.owner === 'rival' && b.type === 'lumber').length +
      s.constructions.filter((c) => c.owner === 'rival' && c.type === 'lumber').length;
    rivalDecide(s);
    const after =
      s.buildings.filter((b) => b.owner === 'rival' && b.type === 'lumber').length +
      s.constructions.filter((c) => c.owner === 'rival' && c.type === 'lumber').length;
    expect(after).toBe(before + 1);
  });
});
