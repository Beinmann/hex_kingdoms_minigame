import { distance, findPath, inBounds, keyOf, neighbours } from './hex';
import {
  BUILDING_SPEC,
  SOLDIER_COST,
  SOLDIER_POP,
  SOLDIER_TRAIN_TICKS,
  VILLAGER_COST,
  VILLAGER_POP,
  VILLAGER_TRAIN_TICKS,
  type BuildingType,
  type GameState,
  type Owner,
  type PlayerState,
  type Resources,
  type TileType,
} from './types';
import { newId, popRequired } from './tick';

const BUILD_PRIORITY: BuildingType[] = [
  'house',
  'farm',
  'lumber',
  'quarry',
  'barracks',
  'iron_mine',
];

function canAfford(res: Resources, cost: Partial<Resources>): boolean {
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if ((cost[k] ?? 0) > res[k]) return false;
  }
  return true;
}

function pay(res: Resources, cost: Partial<Resources>): void {
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (cost[k]) res[k] -= cost[k]!;
  }
}

function tileTypeAt(state: GameState, q: number, r: number): TileType | null {
  const t = state.tiles.find((t) => t.q === q && t.r === r);
  return t ? t.type : null;
}

function isOccupied(state: GameState, q: number, r: number): boolean {
  if (state.buildings.some((b) => b.q === q && b.r === r)) return true;
  if (state.lairs.some((l) => l.q === q && l.r === r)) return true;
  return false;
}

function findBuildSite(
  state: GameState,
  owner: Owner,
  type: BuildingType,
): { q: number; r: number } | null {
  const spec = BUILDING_SPEC[type];
  const ours = state.buildings.filter((b) => b.owner === owner);
  if (ours.length === 0) return null;
  const seen = new Set<string>();
  const frontier: { q: number; r: number }[] = [];
  for (const b of ours) {
    frontier.push({ q: b.q, r: b.r });
    seen.add(keyOf(b));
  }
  let depth = 0;
  while (frontier.length > 0 && depth < 6) {
    const next: { q: number; r: number }[] = [];
    for (const h of frontier) {
      for (const nb of neighbours(h)) {
        if (!inBounds(nb, state.mapWidth, state.mapHeight)) continue;
        const k = keyOf(nb);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(nb);
        const tt = tileTypeAt(state, nb.q, nb.r);
        if (tt && spec.tiles.includes(tt) && !isOccupied(state, nb.q, nb.r)) {
          return nb;
        }
      }
    }
    frontier.splice(0, frontier.length, ...next);
    depth++;
  }
  return null;
}

function popAvailable(state: GameState, owner: Owner, pstate: PlayerState): number {
  return Math.max(0, pstate.popCap - popRequired(state, owner));
}

function tryBuild(state: GameState, owner: Owner, pstate: PlayerState): boolean {
  for (const type of BUILD_PRIORITY) {
    const spec = BUILDING_SPEC[type];
    if (!canAfford(pstate.resources, spec.cost)) continue;
    if (popAvailable(state, owner, pstate) < spec.pop) continue;
    if (type === 'iron_mine' && !state.buildings.some((b) => b.owner === owner && b.type === 'barracks')) {
      continue;
    }
    const site = findBuildSite(state, owner, type);
    if (!site) continue;
    pay(pstate.resources, spec.cost);
    state.buildings.push({
      id: newId(state, `${owner}_b`),
      type,
      owner,
      q: site.q,
      r: site.r,
      hp: spec.hp,
    });
    if (type === 'farm') {
      const tile = state.tiles.find((t) => t.q === site.q && t.r === site.r);
      if (tile) tile.type = 'farm';
    }
    pstate.popCap += spec.popCapDelta ?? 0;
    return true;
  }
  return false;
}

function tryRecruit(state: GameState, owner: Owner, pstate: PlayerState): boolean {
  const barracks = state.buildings.find((b) => b.owner === owner && b.type === 'barracks');
  if (!barracks) return false;
  if (!canAfford(pstate.resources, SOLDIER_COST)) return false;
  if (popAvailable(state, owner, pstate) < SOLDIER_POP) return false;
  pay(pstate.resources, SOLDIER_COST);
  state.trainings.push({
    id: newId(state, 'train'),
    buildingId: barracks.id,
    owner,
    kind: 'soldier',
    ticksLeft: SOLDIER_TRAIN_TICKS,
  });
  return true;
}

function tryTrainVillager(state: GameState, owner: Owner, pstate: PlayerState): boolean {
  const th = state.buildings.find((b) => b.owner === owner && b.type === 'townhall');
  if (!th) return false;
  if (!canAfford(pstate.resources, VILLAGER_COST)) return false;
  if (popAvailable(state, owner, pstate) < VILLAGER_POP) return false;
  pay(pstate.resources, VILLAGER_COST);
  state.trainings.push({
    id: newId(state, 'train'),
    buildingId: th.id,
    owner,
    kind: 'villager',
    ticksLeft: VILLAGER_TRAIN_TICKS,
  });
  return true;
}

// Rival villagers are temporarily frozen — see plan-with-me-and-eager-lake.md.
// The function intentionally does nothing; left in place so the call site stays
// readable and so reintroducing rival villager AI later is a one-spot change.
function aiAssignIdleVillagers(_state: GameState, _owner: Owner): void {
  void _state;
  void _owner;
}

function trySendArmy(state: GameState): boolean {
  const idle = state.armies.filter((a) => a.owner === 'rival' && a.path.length === 0 && a.soldiers >= 3);
  if (idle.length === 0) return false;
  const playerTH = state.buildings.find((b) => b.owner === 'player' && b.type === 'townhall');
  const targets = playerTH ? [playerTH] : state.buildings.filter((b) => b.owner === 'player');
  if (targets.length === 0) return false;
  for (const army of idle) {
    let best: { q: number; r: number } | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const d = distance({ q: army.q, r: army.r }, { q: t.q, r: t.r });
      if (d < bestDist) {
        bestDist = d;
        best = { q: t.q, r: t.r };
      }
    }
    if (!best) continue;
    const path = findPath(
      { q: army.q, r: army.r },
      best,
      {
        width: state.mapWidth,
        height: state.mapHeight,
        isBlocked: (h) => {
          const tt = tileTypeAt(state, h.q, h.r);
          return tt === null || tt === 'water';
        },
      },
    );
    if (path && path.length > 0) {
      army.path = path;
      return true;
    }
  }
  return false;
}

export function rivalDecide(state: GameState): void {
  if (state.phase !== 'playing') return;
  const pstate = state.rival;
  aiAssignIdleVillagers(state, 'rival');
  tryTrainVillager(state, 'rival', pstate);
  tryBuild(state, 'rival', pstate);
  tryRecruit(state, 'rival', pstate);
  if (state.tick >= state.rivalAI.nextRaidTick) {
    if (trySendArmy(state)) {
      const interval = Math.max(20, 45 - Math.floor(state.tick / 30));
      state.rivalAI.nextRaidTick = state.tick + interval;
    } else {
      state.rivalAI.nextRaidTick = state.tick + 5;
    }
  }
}
