import { distance, findPath, inBounds, keyOf, neighbours } from './hex';
import {
  BUILD_TICKS_BY_TYPE,
  BUILDING_SPEC,
  SOLDIER_COST,
  SOLDIER_POP,
  SOLDIER_TRAIN_TICKS,
  VILLAGER_COST,
  VILLAGER_POP,
  VILLAGER_TRAIN_TICKS,
  isImpassableTerrain,
  type Army,
  type BuildingType,
  type GameState,
  type Owner,
  type PlayerState,
  type Resources,
  type TileType,
} from './types';
import { newId, popRequired } from './tick';
import { capacityOf, issueMoveCommand, occupantsAt } from './villager';

const BUILD_PRIORITY: BuildingType[] = [
  'house',
  'farm',
  'lumber',
  'quarry',
  'barracks',
  'iron_mine',
];

const PRODUCER_FOR_RESOURCE: Record<keyof Resources, BuildingType> = {
  food: 'farm',
  wood: 'lumber',
  stone: 'quarry',
  iron: 'iron_mine',
};

const RIVAL_DEFENSE_RANGE = 4;
const RIVAL_TARGET_DISTANCE_WEIGHT = 0.1;
const RIVAL_TOWNHALL_BONUS = 0.3;

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
  if (state.constructions.some((c) => c.q === q && c.r === r)) return true;
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

function attemptBuild(
  state: GameState,
  owner: Owner,
  pstate: PlayerState,
  type: BuildingType,
): boolean {
  const spec = BUILDING_SPEC[type];
  if (!canAfford(pstate.resources, spec.cost)) return false;
  if (popAvailable(state, owner, pstate) < spec.pop) return false;
  if (
    type === 'iron_mine' &&
    !state.buildings.some((b) => b.owner === owner && b.type === 'barracks')
  ) {
    return false;
  }
  const site = findBuildSite(state, owner, type);
  if (!site) return false;
  pay(pstate.resources, spec.cost);
  state.constructions.push({
    id: newId(state, `${owner}_c`),
    type,
    owner,
    q: site.q,
    r: site.r,
    progress: 0,
    ticksRequired: BUILD_TICKS_BY_TYPE[type],
    idleTicks: 0,
  });
  return true;
}

export function rivalScarcestResource(state: GameState): keyof Resources {
  const r = state.rival.resources;
  const order: (keyof Resources)[] = ['food', 'wood', 'stone', 'iron'];
  let scarcest: keyof Resources = order[0];
  for (const k of order) {
    if (r[k] < r[scarcest]) scarcest = k;
  }
  return scarcest;
}

function tryBuild(state: GameState, owner: Owner, pstate: PlayerState): boolean {
  // Need-based pre-pass: if the rival is scarce on a resource, try the matching
  // producer first (cap at 2 of that producer type to avoid runaway specialization).
  if (owner === 'rival') {
    const scarce = rivalScarcestResource(state);
    const target = PRODUCER_FOR_RESOURCE[scarce];
    const have = state.buildings.filter((b) => b.owner === owner && b.type === target).length;
    if (have < 2 && attemptBuild(state, owner, pstate, target)) return true;
  }
  for (const type of BUILD_PRIORITY) {
    if (attemptBuild(state, owner, pstate, type)) return true;
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

function aiAssignIdleVillagers(state: GameState, owner: Owner): void {
  if (owner !== 'rival' && owner !== 'player') return;
  const queues = state.tileQueuesByOwner[owner];
  const townhall = state.buildings.find((b) => b.owner === owner && b.type === 'townhall');
  if (!townhall) return;
  const targets: { q: number; r: number }[] = [];
  for (const b of state.buildings) {
    if (b.owner !== owner) continue;
    if (BUILDING_SPEC[b.type].produces) targets.push({ q: b.q, r: b.r });
  }
  for (const c of state.constructions) {
    if (c.owner !== owner) continue;
    targets.push({ q: c.q, r: c.r });
  }
  for (const t of targets) {
    if (t.q === townhall.q && t.r === townhall.r) continue;
    const cap = capacityOf(state, t.q, t.r);
    const current = occupantsAt(state, t.q, t.r, owner);
    let pending = 0;
    for (const k of Object.keys(queues)) {
      for (const cmd of queues[k]) {
        if (cmd.destQ === t.q && cmd.destR === t.r) pending++;
      }
    }
    if (current + pending >= cap) continue;
    issueMoveCommand(state, townhall.q, townhall.r, t.q, t.r, owner);
  }
}

function pathForArmy(state: GameState, from: Army, to: { q: number; r: number }) {
  return findPath(
    { q: from.q, r: from.r },
    to,
    {
      width: state.mapWidth,
      height: state.mapHeight,
      isBlocked: (h) => {
        const tt = tileTypeAt(state, h.q, h.r);
        return tt === null || isImpassableTerrain(tt);
      },
    },
  );
}

function tryDefendArmies(state: GameState): void {
  const rivalArmies = state.armies.filter((a) => a.owner === 'rival' && a.soldiers >= 2);
  if (rivalArmies.length === 0) return;
  const rivalBuildings = state.buildings.filter((b) => b.owner === 'rival');
  if (rivalBuildings.length === 0) return;
  const playerArmies = state.armies.filter((a) => a.owner === 'player');
  for (const threat of playerArmies) {
    const nearOwn = rivalBuildings.some(
      (b) => distance({ q: threat.q, r: threat.r }, { q: b.q, r: b.r }) <= RIVAL_DEFENSE_RANGE,
    );
    if (!nearOwn) continue;
    let best: Army | null = null;
    let bestDist = Infinity;
    for (const army of rivalArmies) {
      const lastStep =
        army.path.length > 0 ? army.path[army.path.length - 1] : { q: army.q, r: army.r };
      // already heading near this threat — don't re-assign.
      if (distance(lastStep, { q: threat.q, r: threat.r }) <= 2) continue;
      const d = distance({ q: army.q, r: army.r }, { q: threat.q, r: threat.r });
      if (d < bestDist) {
        bestDist = d;
        best = army;
      }
    }
    if (!best) continue;
    const path = pathForArmy(state, best, { q: threat.q, r: threat.r });
    if (path && path.length > 0) best.path = path;
  }
}

function trySendArmy(state: GameState): boolean {
  const idle = state.armies.filter(
    (a) => a.owner === 'rival' && a.path.length === 0 && a.soldiers >= 3,
  );
  if (idle.length === 0) return false;
  const targets = state.buildings.filter((b) => b.owner === 'player');
  if (targets.length === 0) return false;
  for (const army of idle) {
    let best: { q: number; r: number } | null = null;
    let bestScore = Infinity;
    for (const t of targets) {
      const spec = BUILDING_SPEC[t.type];
      const hpFrac = t.hp / spec.hp;
      const d = distance({ q: army.q, r: army.r }, { q: t.q, r: t.r });
      let score = hpFrac + d * RIVAL_TARGET_DISTANCE_WEIGHT;
      if (t.type === 'townhall') score -= RIVAL_TOWNHALL_BONUS;
      if (score < bestScore) {
        bestScore = score;
        best = { q: t.q, r: t.r };
      }
    }
    if (!best) continue;
    const path = pathForArmy(state, army, best);
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
  tryTrainVillager(state, 'rival', pstate);
  tryBuild(state, 'rival', pstate);
  aiAssignIdleVillagers(state, 'rival');
  tryRecruit(state, 'rival', pstate);
  tryDefendArmies(state);
  if (state.tick >= state.rivalAI.nextRaidTick) {
    if (trySendArmy(state)) {
      const interval = Math.max(20, 45 - Math.floor(state.tick / 30));
      state.rivalAI.nextRaidTick = state.tick + interval;
    } else {
      state.rivalAI.nextRaidTick = state.tick + 5;
    }
  }
}
