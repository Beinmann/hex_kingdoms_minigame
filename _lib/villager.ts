import { distance, findPath, key } from './hex';
import {
  ARRIVED_PAUSE_TICKS,
  BUILDING_SPEC,
  DEPLETED_TILE,
  EXTRACTOR_RADIUS,
  FARM_PRODUCE_INTERVAL_TICKS,
  GATHER_AMOUNT,
  GATHER_TICKS,
  NOTIFICATION_TTL_MS,
  TILE_CAPACITY_BY_BUILDING,
  TILE_CAPACITY_DEFAULT,
  WORK_PAUSE_TICKS,
  isImpassableTerrain,
  type Building,
  type Construction,
  type GameState,
  type HexCoord,
  type Owner,
  type Resources,
  type Tile,
  type Villager,
} from './types';

export function buildingById(state: GameState, id: string): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function buildingAt(state: GameState, q: number, r: number): Building | undefined {
  return state.buildings.find((b) => b.q === q && b.r === r);
}

export function constructionAt(state: GameState, q: number, r: number): Construction | undefined {
  return state.constructions.find((c) => c.q === q && c.r === r);
}

export function tileAt(state: GameState, q: number, r: number): Tile | undefined {
  return state.tiles.find((t) => t.q === q && t.r === r);
}

export function isBusy(v: Villager): boolean {
  return (
    v.status === 'moving' ||
    v.status === 'work_outbound' ||
    v.status === 'work_gather' ||
    v.status === 'work_inbound' ||
    v.status === 'building'
  );
}

export function capacityOf(state: GameState, q: number, r: number): number {
  const c = constructionAt(state, q, r);
  if (c) {
    const cap = TILE_CAPACITY_BY_BUILDING[c.type];
    if (cap !== undefined) return cap;
  }
  const b = buildingAt(state, q, r);
  if (b) {
    const cap = TILE_CAPACITY_BY_BUILDING[b.type];
    if (cap !== undefined) return cap;
  }
  return TILE_CAPACITY_DEFAULT;
}

export function occupantsAt(
  state: GameState,
  q: number,
  r: number,
  owner: Owner = 'player',
): number {
  let n = 0;
  for (const v of state.villagers) {
    if (v.owner !== owner) continue;
    if (v.homeQ === q && v.homeR === r) n++;
  }
  return n;
}

export function pushToast(state: GameState, text: string): void {
  const now = Date.now();
  const last = state.notifications[state.notifications.length - 1];
  if (last && last.text === text && now - last.addedAtMs < NOTIFICATION_TTL_MS) {
    last.count = (last.count ?? 1) + 1;
    last.addedAtMs = now;
    return;
  }
  state.notifications.push({
    id: `tst_${state.nextId++}`,
    text,
    addedAtMs: now,
  });
}

export function pruneToasts(state: GameState): void {
  const now = Date.now();
  state.notifications = state.notifications.filter(
    (n) => now - n.addedAtMs < NOTIFICATION_TTL_MS,
  );
}

export function chooseSource(state: GameState, building: Building): Tile | null {
  const spec = BUILDING_SPEC[building.type];
  if (!spec.produces) return null;
  if (!spec.worksOn || spec.worksOn.length === 0) {
    return tileAt(state, building.q, building.r) ?? null;
  }
  let best: Tile | null = null;
  let bestDist = Infinity;
  for (const t of state.tiles) {
    if (!spec.worksOn.includes(t.type)) continue;
    if (t.pool === undefined || t.pool <= 0) continue;
    const d = distance({ q: building.q, r: building.r }, { q: t.q, r: t.r });
    if (d > EXTRACTOR_RADIUS) continue;
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

function pathBetween(state: GameState, from: HexCoord, to: HexCoord): HexCoord[] | null {
  return findPath(from, to, {
    width: state.mapWidth,
    height: state.mapHeight,
    isBlocked: (h) => {
      const t = tileAt(state, h.q, h.r);
      return !t || isImpassableTerrain(t.type);
    },
  });
}

function computePath(
  state: GameState,
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number,
): HexCoord[] {
  if (fromQ === toQ && fromR === toR) return [];
  const p = pathBetween(state, { q: fromQ, r: fromR }, { q: toQ, r: toR });
  return p ?? [];
}

function isPathReachable(
  state: GameState,
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number,
): boolean {
  if (fromQ === toQ && fromR === toR) return true;
  return pathBetween(state, { q: fromQ, r: fromR }, { q: toQ, r: toR }) !== null;
}

function producedResource(building: Building): keyof Resources | null {
  const produces = BUILDING_SPEC[building.type].produces;
  if (!produces) return null;
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (produces[k]) return k;
  }
  return null;
}

function depleteSource(tile: Tile, amount: number): void {
  if (tile.pool === undefined) return;
  tile.pool = Math.max(0, tile.pool - amount);
  if (tile.pool === 0) {
    const next = DEPLETED_TILE[tile.type];
    if (next) {
      tile.type = next;
      delete tile.pool;
      delete tile.maxPool;
    }
  }
}

function ownerState(state: GameState, owner: Owner) {
  if (owner === 'player') return state.player;
  if (owner === 'rival') return state.rival;
  return null;
}

export function issueMoveCommand(
  state: GameState,
  srcQ: number,
  srcR: number,
  destQ: number,
  destR: number,
  owner: 'player' | 'rival' = 'player',
): boolean {
  if (srcQ === destQ && srcR === destR) {
    if (owner === 'player') pushToast(state, 'Source and destination are the same.');
    return false;
  }
  const occSrc = occupantsAt(state, srcQ, srcR, owner);
  if (occSrc === 0) {
    if (owner === 'player') pushToast(state, 'No villager on source tile.');
    return false;
  }
  const destTile = tileAt(state, destQ, destR);
  if (!destTile || destTile.type === 'water') {
    if (owner === 'player') pushToast(state, 'Cannot move to that tile.');
    return false;
  }
  // Forest/hill/mountain are off-limits to free movement; villagers only enter them
  // automatically while gathering. Constructions are an explicit exception so the
  // builder can reach the build site.
  const hasConstruction = state.constructions.some(
    (c) => c.q === destQ && c.r === destR && c.owner === owner,
  );
  if (!hasConstruction && isImpassableTerrain(destTile.type)) {
    if (owner === 'player') pushToast(state, 'Villagers cannot enter that terrain.');
    return false;
  }
  const cap = capacityOf(state, destQ, destR);
  const occDest = occupantsAt(state, destQ, destR, owner);
  if (occDest >= cap) {
    if (owner === 'player') pushToast(state, 'Destination is full.');
    return false;
  }
  if (!isPathReachable(state, srcQ, srcR, destQ, destR)) {
    if (owner === 'player') pushToast(state, 'No path to destination.');
    return false;
  }
  const queues = state.tileQueuesByOwner[owner];
  const srcKey = key(srcQ, srcR);
  const queue = queues[srcKey] ?? [];
  if (queue.length >= occSrc) {
    if (owner === 'player') pushToast(state, 'No more queue slots on this tile.');
    return false;
  }
  queues[srcKey] = [...queue, { destQ, destR }];
  return true;
}

export function drainMoveQueues(state: GameState, owner: 'player' | 'rival' = 'player'): void {
  const queues = state.tileQueuesByOwner[owner];

  // Trim queues whose source population dropped (deaths, evictions).
  for (const srcKey of Object.keys(queues)) {
    const queue = queues[srcKey];
    if (!queue || queue.length === 0) {
      delete queues[srcKey];
      continue;
    }
    const [srcQStr, srcRStr] = srcKey.split(',');
    const srcQ = Number(srcQStr);
    const srcR = Number(srcRStr);
    const occ = occupantsAt(state, srcQ, srcR, owner);
    if (queue.length > occ) {
      const dropped = queue.length - occ;
      queues[srcKey] = queue.slice(0, occ);
      if (owner === 'player') {
        for (let i = 0; i < dropped; i++) {
          pushToast(state, 'Move cancelled — source emptied.');
        }
      }
    }
  }

  // Drain: assign queued commands to non-busy villagers.
  for (const srcKey of Object.keys(queues)) {
    const queue = queues[srcKey];
    if (!queue || queue.length === 0) {
      delete queues[srcKey];
      continue;
    }
    const [srcQStr, srcRStr] = srcKey.split(',');
    const srcQ = Number(srcQStr);
    const srcR = Number(srcRStr);
    while (queue.length > 0) {
      const candidate = state.villagers.find(
        (v) => v.owner === owner && v.homeQ === srcQ && v.homeR === srcR && !isBusy(v),
      );
      if (!candidate) break;
      const cmd = queue.shift()!;
      const cap = capacityOf(state, cmd.destQ, cmd.destR);
      const occDest = occupantsAt(state, cmd.destQ, cmd.destR, owner);
      if (occDest >= cap) {
        if (owner === 'player') pushToast(state, 'Move cancelled — destination became full.');
        continue;
      }
      const path = computePath(state, candidate.q, candidate.r, cmd.destQ, cmd.destR);
      if (path.length === 0 && (candidate.q !== cmd.destQ || candidate.r !== cmd.destR)) {
        if (owner === 'player') pushToast(state, 'Move cancelled — no path to destination.');
        continue;
      }
      candidate.homeQ = cmd.destQ;
      candidate.homeR = cmd.destR;
      candidate.status = 'moving';
      candidate.carrying = null;
      candidate.pauseTicksLeft = 0;
      candidate.path = path;
      if (candidate.q === cmd.destQ && candidate.r === cmd.destR) {
        onArrival(state, candidate);
      }
    }
    if (queue.length === 0) delete queues[srcKey];
  }
}

export function onArrival(state: GameState, v: Villager): void {
  v.path = [];
  const construction = constructionAt(state, v.homeQ, v.homeR);
  if (construction && construction.owner === v.owner) {
    v.status = 'building';
    v.pauseTicksLeft = 0;
    return;
  }
  const home = buildingAt(state, v.homeQ, v.homeR);
  if (home && home.owner === v.owner) {
    if (home.type === 'farm') {
      v.status = 'farming';
      v.pauseTicksLeft = 0;
      return;
    }
    if (BUILDING_SPEC[home.type].produces && BUILDING_SPEC[home.type].worksOn) {
      v.status = 'arrived_pause';
      v.pauseTicksLeft = ARRIVED_PAUSE_TICKS;
      return;
    }
  }
  v.status = 'idle';
  v.pauseTicksLeft = 0;
}

function beginWorkOutbound(state: GameState, v: Villager, building: Building): void {
  if (!BUILDING_SPEC[building.type].worksOn) {
    v.status = 'idle';
    return;
  }
  const source = chooseSource(state, building);
  if (!source) {
    v.status = 'work_pause';
    v.pauseTicksLeft = WORK_PAUSE_TICKS;
    v.path = [];
    return;
  }
  if (v.q === source.q && v.r === source.r) {
    v.status = 'work_gather';
    v.pauseTicksLeft = GATHER_TICKS;
    v.path = [];
    return;
  }
  v.status = 'work_outbound';
  v.path = computePath(state, v.q, v.r, source.q, source.r);
  if (v.path.length === 0) {
    v.status = 'work_pause';
    v.pauseTicksLeft = WORK_PAUSE_TICKS;
  }
}

function completeDeposit(state: GameState, v: Villager): void {
  const ps = ownerState(state, v.owner);
  if (v.carrying && ps) {
    ps.resources[v.carrying.resource] += v.carrying.amount;
  }
  v.carrying = null;
  v.status = 'work_pause';
  v.pauseTicksLeft = WORK_PAUSE_TICKS;
  v.path = [];
}

export function stepVillager(state: GameState, v: Villager): void {
  switch (v.status) {
    case 'idle':
      return;
    case 'moving': {
      if (v.q === v.homeQ && v.r === v.homeR) {
        onArrival(state, v);
        return;
      }
      if (v.path.length === 0) {
        v.path = computePath(state, v.q, v.r, v.homeQ, v.homeR);
        if (v.path.length === 0) {
          v.homeQ = v.q;
          v.homeR = v.r;
          v.status = 'idle';
          return;
        }
      }
      const next = v.path[0];
      v.q = next.q;
      v.r = next.r;
      v.path = v.path.slice(1);
      if (v.q === v.homeQ && v.r === v.homeR) {
        onArrival(state, v);
      }
      return;
    }
    case 'arrived_pause': {
      v.pauseTicksLeft -= 1;
      if (v.pauseTicksLeft > 0) return;
      const home = buildingAt(state, v.homeQ, v.homeR);
      if (home && home.owner === v.owner && BUILDING_SPEC[home.type].produces) {
        beginWorkOutbound(state, v, home);
      } else {
        v.status = 'idle';
      }
      return;
    }
    case 'farming': {
      const home = buildingAt(state, v.homeQ, v.homeR);
      if (!home || home.type !== 'farm' || home.owner !== v.owner) {
        v.status = 'idle';
        return;
      }
      if (v.pauseTicksLeft > 0) {
        v.pauseTicksLeft -= 1;
        return;
      }
      const produces = BUILDING_SPEC[home.type].produces;
      if (produces && produces.food) {
        const ps = ownerState(state, v.owner);
        if (ps) ps.resources.food += produces.food;
      }
      v.pauseTicksLeft = FARM_PRODUCE_INTERVAL_TICKS - 1;
      return;
    }
    case 'work_outbound': {
      const home = buildingAt(state, v.homeQ, v.homeR);
      if (!home || home.owner !== v.owner) {
        v.homeQ = v.q;
        v.homeR = v.r;
        v.status = 'idle';
        v.path = [];
        return;
      }
      if (v.path.length === 0) {
        const source = chooseSource(state, home);
        if (!source) {
          v.status = 'work_pause';
          v.pauseTicksLeft = WORK_PAUSE_TICKS;
          return;
        }
        if (v.q === source.q && v.r === source.r) {
          v.status = 'work_gather';
          v.pauseTicksLeft = GATHER_TICKS;
          return;
        }
        v.path = computePath(state, v.q, v.r, source.q, source.r);
        if (v.path.length === 0) {
          v.status = 'work_pause';
          v.pauseTicksLeft = WORK_PAUSE_TICKS;
          return;
        }
      }
      const next = v.path[0];
      v.q = next.q;
      v.r = next.r;
      v.path = v.path.slice(1);
      if (v.path.length === 0) {
        v.status = 'work_gather';
        v.pauseTicksLeft = GATHER_TICKS;
      }
      return;
    }
    case 'work_gather': {
      v.pauseTicksLeft -= 1;
      if (v.pauseTicksLeft > 0) return;
      const home = buildingAt(state, v.homeQ, v.homeR);
      if (!home || home.owner !== v.owner) {
        v.homeQ = v.q;
        v.homeR = v.r;
        v.status = 'idle';
        return;
      }
      const resource = producedResource(home);
      if (!resource) {
        v.status = 'work_pause';
        v.pauseTicksLeft = WORK_PAUSE_TICKS;
        return;
      }
      const sourceTile = tileAt(state, v.q, v.r);
      let amount = GATHER_AMOUNT;
      if (sourceTile && sourceTile.pool !== undefined) {
        amount = Math.min(amount, sourceTile.pool);
        if (amount > 0) depleteSource(sourceTile, amount);
      }
      if (amount > 0) {
        v.carrying = { resource, amount };
      }
      v.status = 'work_inbound';
      v.path = computePath(state, v.q, v.r, home.q, home.r);
      if (v.q === home.q && v.r === home.r) {
        completeDeposit(state, v);
      }
      return;
    }
    case 'work_inbound': {
      const home = buildingAt(state, v.homeQ, v.homeR);
      if (!home || home.owner !== v.owner) {
        v.homeQ = v.q;
        v.homeR = v.r;
        v.carrying = null;
        v.status = 'idle';
        v.path = [];
        return;
      }
      if (v.q === home.q && v.r === home.r) {
        completeDeposit(state, v);
        return;
      }
      if (v.path.length === 0) {
        v.path = computePath(state, v.q, v.r, home.q, home.r);
        if (v.path.length === 0) {
          v.homeQ = v.q;
          v.homeR = v.r;
          v.carrying = null;
          v.status = 'idle';
          return;
        }
      }
      const next = v.path[0];
      v.q = next.q;
      v.r = next.r;
      v.path = v.path.slice(1);
      if (v.q === home.q && v.r === home.r) {
        completeDeposit(state, v);
      }
      return;
    }
    case 'work_pause': {
      v.pauseTicksLeft -= 1;
      if (v.pauseTicksLeft > 0) return;
      const home = buildingAt(state, v.homeQ, v.homeR);
      if (!home || home.owner !== v.owner || !BUILDING_SPEC[home.type].produces) {
        v.status = 'idle';
        return;
      }
      beginWorkOutbound(state, v, home);
      return;
    }
    case 'building': {
      const c = constructionAt(state, v.homeQ, v.homeR);
      if (!c || c.owner !== v.owner) {
        v.status = 'idle';
        v.path = [];
        v.pauseTicksLeft = 0;
        return;
      }
      // Progress is advanced by tickConstructions, which runs after tickVillagers.
      return;
    }
  }
}

export function tickVillagers(state: GameState): void {
  for (const v of state.villagers) {
    if (v.owner !== 'player' && v.owner !== 'rival') continue;
    stepVillager(state, v);
  }
}

export function spawnVillager(
  state: GameState,
  owner: Owner,
  q: number,
  r: number,
): Villager {
  const id = `vlg_${state.nextId++}`;
  return {
    id,
    owner,
    q,
    r,
    homeQ: q,
    homeR: r,
    status: 'idle',
    path: [],
    carrying: null,
    pauseTicksLeft: 0,
  };
}

export function evictFromBuilding(state: GameState, q: number, r: number): void {
  for (const v of state.villagers) {
    if (v.homeQ === q && v.homeR === r) {
      v.homeQ = v.q;
      v.homeR = v.r;
      v.status = 'idle';
      v.path = [];
      v.carrying = null;
      v.pauseTicksLeft = 0;
    }
  }
  const k = key(q, r);
  delete state.tileQueuesByOwner.player[k];
  delete state.tileQueuesByOwner.rival[k];
}
