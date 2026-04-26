import {
  BASE_VISION,
  BUILDING_SPEC,
  INITIAL_RESOURCES,
  INITIAL_VILLAGERS,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_INITIAL_POOL,
  type Building,
  type ExploredTile,
  type GameState,
  type MonsterLair,
  type Owner,
  type PlayerState,
  type Tile,
  type TileType,
  type Villager,
} from './types';
import { distance, inBounds, key, keyOf, neighbours } from './hex';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE_WEIGHTS: { type: TileType; w: number }[] = [
  { type: 'grass', w: 0.45 },
  { type: 'forest', w: 0.2 },
  { type: 'hill', w: 0.15 },
  { type: 'mountain', w: 0.1 },
  { type: 'water', w: 0.1 },
];

function pickTile(rng: () => number): TileType {
  const r = rng();
  let acc = 0;
  for (const t of TILE_WEIGHTS) {
    acc += t.w;
    if (r < acc) return t.type;
  }
  return 'grass';
}

function genTiles(rng: () => number): Tile[] {
  const tiles: Tile[] = [];
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let q = 0; q < MAP_WIDTH; q++) {
      tiles.push({ q, r, type: pickTile(rng) });
    }
  }
  return tiles;
}

function setTile(tiles: Tile[], q: number, r: number, type: TileType): void {
  const t = tiles.find((t) => t.q === q && t.r === r);
  if (t) t.type = type;
}

function getTile(tiles: Tile[], q: number, r: number): Tile | undefined {
  return tiles.find((t) => t.q === q && t.r === r);
}

function clearArea(tiles: Tile[], cq: number, cr: number): void {
  setTile(tiles, cq, cr, 'grass');
  for (const n of neighbours({ q: cq, r: cr })) {
    if (!inBounds(n, MAP_WIDTH, MAP_HEIGHT)) continue;
    const t = getTile(tiles, n.q, n.r);
    if (!t) continue;
    if (t.type === 'water') {
      t.type = 'grass';
    }
  }
}

function ensureResourceNear(
  tiles: Tile[],
  rng: () => number,
  center: { q: number; r: number },
  type: TileType,
  radius: number,
): void {
  for (const t of tiles) {
    if (t.type !== type) continue;
    if (distance(center, { q: t.q, r: t.r }) <= radius) return;
  }
  const candidates: Tile[] = [];
  for (const t of tiles) {
    const d = distance(center, { q: t.q, r: t.r });
    if (d > radius || d < 1) continue;
    if (t.type === 'water') continue;
    candidates.push(t);
  }
  if (candidates.length === 0) return;
  const picked = candidates[Math.floor(rng() * candidates.length)];
  picked.type = type;
}

function seedPools(tiles: Tile[]): void {
  for (const t of tiles) {
    const initial = TILE_INITIAL_POOL[t.type];
    if (initial !== undefined) {
      t.pool = initial;
      t.maxPool = initial;
    } else {
      delete t.pool;
      delete t.maxPool;
    }
  }
}

function computeInitialVisibility(
  buildings: Building[],
  owner: 'player' | 'rival',
): Record<string, true> {
  const vis: Record<string, true> = {};
  for (const b of buildings) {
    if (b.owner !== owner) continue;
    const radius = BASE_VISION + (BUILDING_SPEC[b.type].visionBonus ?? 0);
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const c = { q: b.q + dq, r: b.r + dr };
        if (!inBounds(c, MAP_WIDTH, MAP_HEIGHT)) continue;
        if (distance({ q: b.q, r: b.r }, c) <= radius) {
          vis[keyOf(c)] = true;
        }
      }
    }
  }
  return vis;
}

function computeInitialExplored(
  visible: Record<string, true>,
  tiles: Tile[],
  buildings: Building[],
  lairs: MonsterLair[],
): Record<string, ExploredTile> {
  const explored: Record<string, ExploredTile> = {};
  for (const t of tiles) {
    const k = key(t.q, t.r);
    if (!visible[k]) continue;
    const entry: ExploredTile = { type: t.type };
    const b = buildings.find((b) => b.q === t.q && b.r === t.r);
    if (b) entry.building = { type: b.type, owner: b.owner };
    const l = lairs.find((l) => l.q === t.q && l.r === t.r);
    if (l) entry.lair = true;
    explored[k] = entry;
  }
  return explored;
}

function placeLairs(
  rng: () => number,
  tiles: Tile[],
  avoid: { q: number; r: number }[],
): MonsterLair[] {
  const out: MonsterLair[] = [];
  const minDistFromCapitals = 3;
  const lootOptions: Partial<{ food: number; wood: number; stone: number; iron: number }>[] = [
    { food: 20 },
    { wood: 20 },
    { stone: 15 },
    { iron: 10 },
  ];
  let tries = 0;
  while (out.length < 8 && tries < 600) {
    tries++;
    const q = Math.floor(rng() * MAP_WIDTH);
    const r = Math.floor(rng() * MAP_HEIGHT);
    const t = getTile(tiles, q, r);
    if (!t || t.type === 'water') continue;
    if (avoid.some((a) => distance({ q, r }, a) < minDistFromCapitals)) continue;
    if (out.some((l) => distance({ q, r }, l) < 2)) continue;
    out.push({
      id: `lair_${out.length}`,
      q,
      r,
      garrison: 3 + Math.floor(rng() * 4),
      loot: lootOptions[out.length % lootOptions.length],
    });
  }
  return out;
}

function spawnInitialVillagers(
  capital: { q: number; r: number },
  owner: Owner,
  startId: number,
): { villagers: Villager[]; nextId: number } {
  const villagers: Villager[] = [];
  let id = startId;
  for (let i = 0; i < INITIAL_VILLAGERS; i++) {
    villagers.push({
      id: `vlg_${id++}`,
      owner,
      q: capital.q,
      r: capital.r,
      homeQ: capital.q,
      homeR: capital.r,
      status: 'idle',
      path: [],
      carrying: null,
      pauseTicksLeft: 0,
    });
  }
  return { villagers, nextId: id };
}

export function createInitialState(seed: number = Date.now()): GameState {
  const rng = mulberry32(seed);
  const tiles = genTiles(rng);

  const playerCapital = { q: 1, r: MAP_HEIGHT - 2 };
  const rivalCapital = { q: MAP_WIDTH - 2, r: 1 };

  clearArea(tiles, playerCapital.q, playerCapital.r);
  clearArea(tiles, rivalCapital.q, rivalCapital.r);

  for (const cap of [playerCapital, rivalCapital]) {
    ensureResourceNear(tiles, rng, cap, 'forest', 5);
    ensureResourceNear(tiles, rng, cap, 'hill', 5);
    ensureResourceNear(tiles, rng, cap, 'mountain', 5);
  }

  seedPools(tiles);

  const buildings: Building[] = [
    {
      id: 'player_th',
      type: 'townhall',
      owner: 'player',
      q: playerCapital.q,
      r: playerCapital.r,
      hp: BUILDING_SPEC.townhall.hp,
    },
    {
      id: 'rival_th',
      type: 'townhall',
      owner: 'rival',
      q: rivalCapital.q,
      r: rivalCapital.r,
      hp: BUILDING_SPEC.townhall.hp,
    },
  ];

  const lairs = placeLairs(rng, tiles, [playerCapital, rivalCapital]);

  const player: PlayerState = {
    resources: { ...INITIAL_RESOURCES },
    popCap: BUILDING_SPEC.townhall.popCapDelta ?? 5,
    pop: 0,
  };
  const rival: PlayerState = {
    resources: { ...INITIAL_RESOURCES },
    popCap: BUILDING_SPEC.townhall.popCapDelta ?? 5,
    pop: 0,
  };

  const visible = computeInitialVisibility(buildings, 'player');
  const explored = computeInitialExplored(visible, tiles, buildings, lairs);

  const playerVillagers = spawnInitialVillagers(playerCapital, 'player', 1);
  const rivalVillagers = spawnInitialVillagers(rivalCapital, 'rival', playerVillagers.nextId);
  const villagers = [...playerVillagers.villagers, ...rivalVillagers.villagers];
  player.pop = playerVillagers.villagers.length;
  rival.pop = rivalVillagers.villagers.length;

  return {
    tick: 0,
    phase: 'playing',
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    tiles,
    buildings,
    armies: [],
    villagers,
    trainings: [],
    constructions: [],
    lairs,
    player,
    rival,
    rivalAI: { nextRaidTick: 45 },
    visible,
    explored,
    tileQueuesByOwner: { player: {}, rival: {} },
    notifications: [],
    nextId: rivalVillagers.nextId,
  };
}

export function tileAt(state: GameState, q: number, r: number): Tile | undefined {
  return state.tiles.find((t) => t.q === q && t.r === r);
}

export function buildingAt(state: GameState, q: number, r: number): Building | undefined {
  return state.buildings.find((b) => b.q === q && b.r === r);
}

export function lairAt(state: GameState, q: number, r: number): MonsterLair | undefined {
  return state.lairs.find((l) => l.q === q && l.r === r);
}

export function tilesKey(q: number, r: number): string {
  return key(q, r);
}
