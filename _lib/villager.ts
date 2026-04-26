import { distance, findPath, inBounds, neighbours } from './hex';
import {
  BUILDING_SPEC,
  DEPLETED_TILE,
  EXTRACTOR_RADIUS,
  GATHER_AMOUNT,
  GATHER_TICKS,
  IDLE_WANDER_INTERVAL_TICKS,
  type Building,
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

export function tileAt(state: GameState, q: number, r: number): Tile | undefined {
  return state.tiles.find((t) => t.q === q && t.r === r);
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
      return !t || t.type === 'water';
    },
  });
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

function pickWanderTarget(state: GameState, v: Villager, idx: number): HexCoord | null {
  const th = state.buildings.find((b) => b.owner === v.owner && b.type === 'townhall');
  if (!th) return null;
  const candidates: HexCoord[] = [];
  for (const n of neighbours({ q: th.q, r: th.r })) {
    if (!inBounds(n, state.mapWidth, state.mapHeight)) continue;
    const t = tileAt(state, n.q, n.r);
    if (!t || t.type === 'water') continue;
    candidates.push(n);
  }
  if (candidates.length === 0) return null;
  const pick = (state.tick * 7 + idx * 13) % candidates.length;
  return candidates[pick];
}

function ownerState(state: GameState, owner: Owner) {
  if (owner === 'player') return state.player;
  if (owner === 'rival') return state.rival;
  return null;
}

export function stepVillager(state: GameState, v: Villager, idx: number): void {
  switch (v.state) {
    case 'idle': {
      if (v.path.length > 0) {
        const next = v.path[0];
        v.q = next.q;
        v.r = next.r;
        v.path = v.path.slice(1);
        return;
      }
      if (v.wanderCooldown > 0) {
        v.wanderCooldown -= 1;
        return;
      }
      const target = pickWanderTarget(state, v, idx);
      if (!target) return;
      v.path = [target];
      v.wanderCooldown = IDLE_WANDER_INTERVAL_TICKS;
      return;
    }
    case 'walking_to_source': {
      const building = v.assignedTo ? buildingById(state, v.assignedTo) : null;
      if (!building || building.owner !== v.owner) {
        v.state = 'idle';
        v.assignedTo = null;
        v.path = [];
        return;
      }
      const source = chooseSource(state, building);
      if (!source) {
        v.path = [];
        return;
      }
      if (v.q === source.q && v.r === source.r) {
        v.state = 'gathering';
        v.gatherTicksLeft = GATHER_TICKS;
        return;
      }
      if (v.path.length === 0 || v.path[v.path.length - 1].q !== source.q || v.path[v.path.length - 1].r !== source.r) {
        const p = pathBetween(state, { q: v.q, r: v.r }, { q: source.q, r: source.r });
        v.path = p ?? [];
      }
      if (v.path.length === 0) return;
      const next = v.path[0];
      v.q = next.q;
      v.r = next.r;
      v.path = v.path.slice(1);
      if (v.path.length === 0 && v.q === source.q && v.r === source.r) {
        v.state = 'gathering';
        v.gatherTicksLeft = GATHER_TICKS;
      }
      return;
    }
    case 'gathering': {
      v.gatherTicksLeft -= 1;
      if (v.gatherTicksLeft > 0) return;
      const building = v.assignedTo ? buildingById(state, v.assignedTo) : null;
      if (!building || building.owner !== v.owner) {
        v.state = 'idle';
        v.assignedTo = null;
        return;
      }
      const resource = producedResource(building);
      if (!resource) {
        v.state = 'idle';
        return;
      }
      const source = tileAt(state, v.q, v.r);
      let amount = GATHER_AMOUNT;
      if (source && source.pool !== undefined) {
        amount = Math.min(amount, source.pool);
        if (amount > 0) depleteSource(source, amount);
      }
      if (amount <= 0) {
        v.state = 'walking_to_source';
        v.path = [];
        return;
      }
      v.carrying = { resource, amount };
      v.state = 'walking_to_dropoff';
      const p = pathBetween(state, { q: v.q, r: v.r }, { q: building.q, r: building.r });
      v.path = p ?? [];
      if (v.path.length === 0 && v.q === building.q && v.r === building.r) {
        v.state = 'depositing';
      }
      return;
    }
    case 'walking_to_dropoff': {
      const building = v.assignedTo ? buildingById(state, v.assignedTo) : null;
      if (!building || building.owner !== v.owner) {
        v.state = 'idle';
        v.assignedTo = null;
        v.carrying = null;
        v.path = [];
        return;
      }
      if (v.q === building.q && v.r === building.r) {
        v.state = 'depositing';
        return;
      }
      if (v.path.length === 0) {
        const p = pathBetween(state, { q: v.q, r: v.r }, { q: building.q, r: building.r });
        v.path = p ?? [];
      }
      if (v.path.length === 0) return;
      const next = v.path[0];
      v.q = next.q;
      v.r = next.r;
      v.path = v.path.slice(1);
      if (v.q === building.q && v.r === building.r) {
        v.state = 'depositing';
      }
      return;
    }
    case 'depositing': {
      const building = v.assignedTo ? buildingById(state, v.assignedTo) : null;
      const ps = ownerState(state, v.owner);
      if (building && v.carrying && ps) {
        ps.resources[v.carrying.resource] += v.carrying.amount;
      }
      v.carrying = null;
      v.state = 'walking_to_source';
      v.path = [];
      return;
    }
    case 'walking_to_reassignment': {
      const building = v.assignedTo ? buildingById(state, v.assignedTo) : null;
      if (!building || building.owner !== v.owner) {
        v.state = 'idle';
        v.assignedTo = null;
        v.path = [];
        return;
      }
      if (v.q === building.q && v.r === building.r) {
        v.state = 'walking_to_source';
        v.path = [];
        return;
      }
      if (v.path.length === 0) {
        const p = pathBetween(state, { q: v.q, r: v.r }, { q: building.q, r: building.r });
        v.path = p ?? [];
      }
      if (v.path.length === 0) {
        v.state = 'walking_to_source';
        return;
      }
      const next = v.path[0];
      v.q = next.q;
      v.r = next.r;
      v.path = v.path.slice(1);
      if (v.q === building.q && v.r === building.r) {
        v.state = 'walking_to_source';
        v.path = [];
      }
      return;
    }
  }
}

export function tickVillagers(state: GameState): void {
  for (let i = 0; i < state.villagers.length; i++) {
    stepVillager(state, state.villagers[i], i);
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
    path: [],
    state: 'idle',
    assignedTo: null,
    carrying: null,
    gatherTicksLeft: 0,
    wanderCooldown: 0,
  };
}

export function assignVillager(state: GameState, villagerId: string, buildingId: string | null): void {
  const v = state.villagers.find((vv) => vv.id === villagerId);
  if (!v) return;
  if (buildingId === null) {
    v.assignedTo = null;
    v.state = 'idle';
    v.path = [];
    v.carrying = null;
    v.wanderCooldown = 0;
    return;
  }
  const building = buildingById(state, buildingId);
  if (!building || building.owner !== v.owner) return;
  v.assignedTo = buildingId;
  v.carrying = null;
  v.state = 'walking_to_reassignment';
  v.path = [];
}

export function countAssigned(state: GameState, buildingId: string): number {
  let n = 0;
  for (const v of state.villagers) if (v.assignedTo === buildingId) n++;
  return n;
}

export function pickIdleVillagers(state: GameState, owner: Owner, n: number): Villager[] {
  const out: Villager[] = [];
  for (const v of state.villagers) {
    if (v.owner !== owner) continue;
    if (v.assignedTo !== null) continue;
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

export function pickAssignedVillagers(state: GameState, buildingId: string, n: number): Villager[] {
  const out: Villager[] = [];
  for (const v of state.villagers) {
    if (v.assignedTo !== buildingId) continue;
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}
