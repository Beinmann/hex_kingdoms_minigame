import { distance, inBounds, key, keyOf } from './hex';
import { resolveCombat } from './combat';
import { rivalDecide } from './ai';
import { drainMoveQueues, evictFromBuilding, onArrival, pruneToasts, pushToast, tickVillagers } from './villager';
import {
  BASE_VISION,
  BUILD_ABANDON_TICKS,
  BUILDING_SPEC,
  isImpassableTerrain,
  type Army,
  type Building,
  type Construction,
  type ExploredTile,
  type GameState,
  type MonsterLair,
  type Owner,
} from './types';

function clone<T>(x: T): T {
  if (typeof structuredClone === 'function') return structuredClone(x);
  return JSON.parse(JSON.stringify(x)) as T;
}

function addResources(target: { food: number; wood: number; stone: number; iron: number }, src: Partial<{ food: number; wood: number; stone: number; iron: number }>): void {
  if (src.food) target.food += src.food;
  if (src.wood) target.wood += src.wood;
  if (src.stone) target.stone += src.stone;
  if (src.iron) target.iron += src.iron;
}

function countLiving(state: GameState, owner: Owner): number {
  let n = 0;
  for (const v of state.villagers) if (v.owner === owner) n++;
  for (const a of state.armies) if (a.owner === owner) n += a.soldiers;
  for (const t of state.trainings) if (t.owner === owner) n++;
  return n;
}

function popRequired(state: GameState, owner: Owner): number {
  return countLiving(state, owner);
}

export function computePopCap(state: GameState, owner: Owner): number {
  let cap = 0;
  for (const b of state.buildings) if (b.owner === owner) cap += BUILDING_SPEC[b.type].popCapDelta ?? 0;
  return cap;
}

function completeTrainings(state: GameState): void {
  const done = state.trainings.filter((t) => t.ticksLeft <= 0);
  state.trainings = state.trainings.filter((t) => t.ticksLeft > 0);
  for (const t of done) {
    const at = state.buildings.find((b) => b.id === t.buildingId);
    if (!at || at.owner !== t.owner) continue;
    if (t.kind === 'villager') {
      state.villagers.push({
        id: newId(state, 'vlg'),
        owner: t.owner,
        q: at.q,
        r: at.r,
        homeQ: at.q,
        homeR: at.r,
        status: 'idle',
        path: [],
        carrying: null,
        pauseTicksLeft: 0,
      });
      continue;
    }
    const existing = state.armies.find(
      (a) => a.owner === t.owner && a.q === at.q && a.r === at.r && a.path.length === 0,
    );
    if (existing) {
      existing.soldiers += 1;
    } else {
      state.armies.push({
        id: newId(state, 'army'),
        owner: t.owner,
        q: at.q,
        r: at.r,
        soldiers: 1,
        path: [],
      });
    }
  }
}

function killVillagersOnHostileTiles(state: GameState): void {
  state.villagers = state.villagers.filter((v) => {
    return !state.armies.some(
      (a) => a.q === v.q && a.r === v.r && a.owner !== v.owner && a.soldiers > 0,
    );
  });
}

function tickTrainings(state: GameState): void {
  const active = new Set<string>();
  for (const t of state.trainings) {
    if (active.has(t.buildingId)) continue;
    active.add(t.buildingId);
    t.ticksLeft -= 1;
  }
}

function completeConstruction(state: GameState, c: Construction): void {
  const spec = BUILDING_SPEC[c.type];
  state.buildings.push({
    id: newId(state, `${c.owner}_b`),
    type: c.type,
    owner: c.owner,
    q: c.q,
    r: c.r,
    hp: spec.hp,
  });
  if (c.type === 'farm') {
    const tile = state.tiles.find((t) => t.q === c.q && t.r === c.r);
    if (tile) tile.type = 'farm';
  }
  for (const v of state.villagers) {
    if (v.owner === c.owner && v.homeQ === c.q && v.homeR === c.r && v.status === 'building') {
      onArrival(state, v);
    }
  }
  state.constructions = state.constructions.filter((x) => x.id !== c.id);
  if (c.owner === 'player') pushToast(state, `${spec.label} completed.`);
}

function abandonConstruction(state: GameState, c: Construction): void {
  const spec = BUILDING_SPEC[c.type];
  const ps = c.owner === 'player' ? state.player : c.owner === 'rival' ? state.rival : null;
  if (ps) {
    for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
      if (spec.cost[k]) ps.resources[k] += spec.cost[k]!;
    }
  }
  for (const v of state.villagers) {
    if (v.homeQ === c.q && v.homeR === c.r && v.status === 'building') {
      v.homeQ = v.q;
      v.homeR = v.r;
      v.status = 'idle';
      v.path = [];
      v.carrying = null;
      v.pauseTicksLeft = 0;
    }
  }
  for (const owner of ['player', 'rival'] as const) {
    const queues = state.tileQueuesByOwner[owner];
    for (const srcKey of Object.keys(queues)) {
      const filtered = queues[srcKey].filter((cmd) => !(cmd.destQ === c.q && cmd.destR === c.r));
      if (filtered.length === 0) delete queues[srcKey];
      else queues[srcKey] = filtered;
    }
  }
  const fk = key(c.q, c.r);
  delete state.tileQueuesByOwner.player[fk];
  delete state.tileQueuesByOwner.rival[fk];
  state.constructions = state.constructions.filter((x) => x.id !== c.id);
  if (c.owner === 'player') pushToast(state, `${spec.label} construction abandoned — refunded.`);
}

function tickConstructions(state: GameState): void {
  const completed: Construction[] = [];
  const cancelled: Construction[] = [];
  for (const c of state.constructions) {
    let builders = 0;
    for (const v of state.villagers) {
      if (v.owner !== c.owner) continue;
      if (v.homeQ !== c.q || v.homeR !== c.r) continue;
      if (v.status !== 'building') continue;
      builders++;
    }
    if (builders > 0) {
      c.progress += builders;
      c.idleTicks = 0;
    } else {
      c.idleTicks += 1;
    }
    if (c.progress >= c.ticksRequired) completed.push(c);
    else if (c.idleTicks >= BUILD_ABANDON_TICKS) cancelled.push(c);
  }
  for (const c of completed) completeConstruction(state, c);
  for (const c of cancelled) abandonConstruction(state, c);
}

export function cancelConstructionById(state: GameState, id: string): boolean {
  const c = state.constructions.find((x) => x.id === id);
  if (!c) return false;
  abandonConstruction(state, c);
  return true;
}

export function newId(state: GameState, prefix: string): string {
  const n = state.nextId++;
  return `${prefix}_${n}`;
}

function isArmyBlocker(state: GameState, owner: Owner) {
  return (h: { q: number; r: number }): boolean => {
    const tile = state.tiles.find((t) => t.q === h.q && t.r === h.r);
    if (!tile || isImpassableTerrain(tile.type)) return true;
    const other = state.armies.find((a) => a.q === h.q && a.r === h.r && a.owner !== owner);
    return other !== undefined;
  };
}

function moveArmies(state: GameState): void {
  for (const army of state.armies) {
    if (army.path.length === 0) continue;
    const nextStep = army.path[0];
    const blocked = isArmyBlocker(state, army.owner);
    if (!inBounds(nextStep, state.mapWidth, state.mapHeight) || blocked(nextStep)) {
      army.path = [];
      continue;
    }
    army.q = nextStep.q;
    army.r = nextStep.r;
    army.path = army.path.slice(1);
  }
}

function resolveLairs(state: GameState): void {
  for (const lair of [...state.lairs]) {
    const attackers = state.armies.filter((a) => a.q === lair.q && a.r === lair.r && a.owner !== 'neutral');
    if (attackers.length === 0) continue;
    const atkStrength = attackers.reduce((s, a) => s + a.soldiers, 0);
    const { a: atkLeft, b: defLeft } = resolveCombat({ strength: atkStrength }, { strength: lair.garrison });
    distributeLosses(attackers, atkStrength - atkLeft);
    lair.garrison = defLeft;
    if (lair.garrison <= 0) {
      state.lairs = state.lairs.filter((l) => l.id !== lair.id);
      const winner = attackers.find((a) => a.soldiers > 0);
      if (winner) {
        const p = winner.owner === 'player' ? state.player : winner.owner === 'rival' ? state.rival : null;
        if (p) addResources(p.resources, lair.loot);
      }
    }
  }
}

function distributeLosses(armies: Army[], totalLosses: number): void {
  let remaining = totalLosses;
  for (const a of armies) {
    if (remaining <= 0) break;
    const take = Math.min(a.soldiers, remaining);
    a.soldiers -= take;
    remaining -= take;
  }
}

function resolveArmyVsArmy(state: GameState): void {
  for (let i = 0; i < state.armies.length; i++) {
    for (let j = i + 1; j < state.armies.length; j++) {
      const a = state.armies[i];
      const b = state.armies[j];
      if (a.q !== b.q || a.r !== b.r) continue;
      if (a.owner === b.owner) continue;
      const { a: aLeft, b: bLeft } = resolveCombat({ strength: a.soldiers }, { strength: b.soldiers });
      a.soldiers = aLeft;
      b.soldiers = bLeft;
    }
  }
}

function resolveArmyVsBuilding(state: GameState): void {
  for (const army of state.armies) {
    if (army.soldiers <= 0) continue;
    const target = state.buildings.find(
      (b) => b.q === army.q && b.r === army.r && b.owner !== army.owner && b.owner !== 'neutral',
    );
    if (!target) continue;
    target.hp -= army.soldiers;
  }
}

function pruneDead(state: GameState): void {
  state.armies = state.armies.filter((a) => a.soldiers > 0);
  const destroyed = state.buildings.filter((b) => b.hp <= 0);
  state.buildings = state.buildings.filter((b) => b.hp > 0);
  for (const b of destroyed) evictFromBuilding(state, b.q, b.r);
}

function recomputePop(state: GameState): void {
  state.player.popCap = computePopCap(state, 'player');
  state.rival.popCap = computePopCap(state, 'rival');
  state.player.pop = countLiving(state, 'player');
  state.rival.pop = countLiving(state, 'rival');
}

function visionRadius(building: Building): number {
  return BASE_VISION + (BUILDING_SPEC[building.type].visionBonus ?? 0);
}

function recomputeVisibility(state: GameState): void {
  const vis: Record<string, true> = {};
  for (const b of state.buildings) {
    if (b.owner !== 'player') continue;
    const radius = visionRadius(b);
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const c = { q: b.q + dq, r: b.r + dr };
        if (!inBounds(c, state.mapWidth, state.mapHeight)) continue;
        if (distance({ q: b.q, r: b.r }, c) <= radius) vis[keyOf(c)] = true;
      }
    }
  }
  for (const a of state.armies) {
    if (a.owner !== 'player') continue;
    const radius = BASE_VISION;
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const c = { q: a.q + dq, r: a.r + dr };
        if (!inBounds(c, state.mapWidth, state.mapHeight)) continue;
        if (distance({ q: a.q, r: a.r }, c) <= radius) vis[keyOf(c)] = true;
      }
    }
  }
  for (const v of state.villagers) {
    if (v.owner !== 'player') continue;
    const radius = BASE_VISION;
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const c = { q: v.q + dq, r: v.r + dr };
        if (!inBounds(c, state.mapWidth, state.mapHeight)) continue;
        if (distance({ q: v.q, r: v.r }, c) <= radius) vis[keyOf(c)] = true;
      }
    }
  }
  state.visible = vis;
}

function recordExplored(state: GameState): void {
  for (const t of state.tiles) {
    const k = keyOf(t);
    if (!state.visible[k]) continue;
    const entry: ExploredTile = { type: t.type };
    const b = state.buildings.find((b) => b.q === t.q && b.r === t.r);
    if (b) entry.building = { type: b.type, owner: b.owner };
    const c = state.constructions.find((c) => c.q === t.q && c.r === t.r);
    if (c) entry.construction = { type: c.type, owner: c.owner };
    const lair = state.lairs.find((l) => l.q === t.q && l.r === t.r);
    if (lair) entry.lair = true;
    state.explored[k] = entry;
  }
}

function checkVictory(state: GameState): void {
  const playerTH = state.buildings.find((b) => b.owner === 'player' && b.type === 'townhall');
  const rivalTH = state.buildings.find((b) => b.owner === 'rival' && b.type === 'townhall');
  if (!playerTH) state.phase = 'lost';
  else if (!rivalTH) state.phase = 'won';
}

export function advance(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const next = clone(state);
  next.tick += 1;

  drainMoveQueues(next, 'player');
  drainMoveQueues(next, 'rival');
  tickVillagers(next);
  tickConstructions(next);

  tickTrainings(next);
  completeTrainings(next);

  // Food drain disabled: villagers only cost food at training.

  moveArmies(next);

  resolveArmyVsArmy(next);
  resolveLairs(next);
  resolveArmyVsBuilding(next);

  pruneDead(next);
  killVillagersOnHostileTiles(next);

  rivalDecide(next);

  recomputePop(next);
  recomputeVisibility(next);
  recordExplored(next);
  pruneToasts(next);

  checkVictory(next);

  return next;
}

export { popRequired };
export type { MonsterLair };
