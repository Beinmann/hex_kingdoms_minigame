export type HexCoord = { q: number; r: number };

export type TileType = 'grass' | 'forest' | 'hill' | 'mountain' | 'water';

export type Owner = 'player' | 'rival' | 'neutral';

export type BuildingType =
  | 'townhall'
  | 'house'
  | 'farm'
  | 'lumber'
  | 'quarry'
  | 'iron_mine'
  | 'barracks'
  | 'watchtower';

export type Resources = {
  food: number;
  wood: number;
  stone: number;
  iron: number;
};

export type Tile = {
  q: number;
  r: number;
  type: TileType;
  pool?: number;
  maxPool?: number;
};

export const TILE_INITIAL_POOL: Partial<Record<TileType, number>> = {
  forest: 60,
  hill: 80,
  mountain: 40,
};

export const DEPLETED_TILE: Partial<Record<TileType, TileType>> = {
  forest: 'grass',
  hill: 'grass',
  mountain: 'hill',
};

export type Building = {
  id: string;
  type: BuildingType;
  owner: Owner;
  q: number;
  r: number;
  hp: number;
};

export type Army = {
  id: string;
  owner: Owner;
  q: number;
  r: number;
  soldiers: number;
  path: HexCoord[];
};

export type VillagerState =
  | 'idle'
  | 'walking_to_source'
  | 'gathering'
  | 'walking_to_dropoff'
  | 'depositing'
  | 'walking_to_reassignment';

export type Villager = {
  id: string;
  owner: Owner;
  q: number;
  r: number;
  path: HexCoord[];
  state: VillagerState;
  assignedTo: string | null;
  carrying: { resource: keyof Resources; amount: number } | null;
  gatherTicksLeft: number;
  wanderCooldown: number;
};

export type TrainingOrder = {
  id: string;
  buildingId: string;
  owner: Owner;
  kind: 'soldier' | 'villager';
  ticksLeft: number;
};

export type RivalAIState = {
  nextRaidTick: number;
};

export type MonsterLair = {
  id: string;
  q: number;
  r: number;
  garrison: number;
  loot: Partial<Resources>;
};

export type PlayerState = {
  resources: Resources;
  popCap: number;
  pop: number;
};

export type GamePhase = 'playing' | 'won' | 'lost';

export type Selection =
  | { kind: 'none' }
  | { kind: 'tile'; q: number; r: number }
  | { kind: 'build'; building: BuildingType; sticky: boolean }
  | { kind: 'send'; armyId: string }
  | { kind: 'transfer_source'; buildingId: string }
  | { kind: 'rect_select'; villagerIds: string[] };

export type GameState = {
  tick: number;
  phase: GamePhase;
  mapWidth: number;
  mapHeight: number;
  tiles: Tile[];
  buildings: Building[];
  armies: Army[];
  villagers: Villager[];
  trainings: TrainingOrder[];
  lairs: MonsterLair[];
  player: PlayerState;
  rival: PlayerState;
  rivalAI: RivalAIState;
  visible: Record<string, true>;
  nextId: number;
};

export const INITIAL_RESOURCES: Resources = {
  food: 20,
  wood: 40,
  stone: 10,
  iron: 0,
};

export const BUILDING_SPEC: Record<
  BuildingType,
  {
    label: string;
    tiles: TileType[];
    cost: Partial<Resources>;
    pop: number;
    hp: number;
    produces?: Partial<Resources>;
    worksOn?: TileType[];
    popCapDelta?: number;
    visionBonus?: number;
  }
> = {
  townhall: {
    label: 'Town Hall',
    tiles: ['grass', 'forest', 'hill'],
    cost: {},
    pop: 0,
    hp: 30,
    popCapDelta: 5,
  },
  house: {
    label: 'House',
    tiles: ['grass'],
    cost: { wood: 10 },
    pop: 0,
    hp: 8,
    popCapDelta: 5,
  },
  farm: {
    label: 'Farm',
    tiles: ['grass'],
    cost: { wood: 5 },
    pop: 2,
    hp: 8,
    produces: { food: 2 },
  },
  lumber: {
    label: 'Lumber Camp',
    tiles: ['grass'],
    cost: { wood: 8 },
    pop: 2,
    hp: 8,
    produces: { wood: 2 },
    worksOn: ['forest'],
  },
  quarry: {
    label: 'Quarry',
    tiles: ['grass'],
    cost: { wood: 12 },
    pop: 2,
    hp: 10,
    produces: { stone: 2 },
    worksOn: ['hill'],
  },
  iron_mine: {
    label: 'Iron Mine',
    tiles: ['grass'],
    cost: { wood: 25, stone: 10 },
    pop: 3,
    hp: 10,
    produces: { iron: 1 },
    worksOn: ['mountain'],
  },
  barracks: {
    label: 'Barracks',
    tiles: ['grass', 'forest', 'hill'],
    cost: { wood: 20, stone: 10 },
    pop: 3,
    hp: 15,
  },
  watchtower: {
    label: 'Watchtower',
    tiles: ['grass', 'forest', 'hill', 'mountain'],
    cost: { stone: 10 },
    pop: 1,
    hp: 12,
    visionBonus: 1,
  },
};

export const SOLDIER_COST: Partial<Resources> = { food: 5, iron: 5 };
export const SOLDIER_POP = 1;
export const SOLDIER_TRAIN_TICKS = 3;

export const VILLAGER_COST: Partial<Resources> = { food: 5 };
export const VILLAGER_POP = 1;
export const VILLAGER_TRAIN_TICKS = 4;

export const EXTRACTOR_RADIUS = 3;
export const GATHER_TICKS = 2;
export const GATHER_AMOUNT = 1;
export const INITIAL_VILLAGERS = 3;
export const IDLE_WANDER_INTERVAL_TICKS = 3;

export const RESOURCE_BY_TILE: Partial<Record<TileType, keyof Resources>> = {
  forest: 'wood',
  hill: 'stone',
  mountain: 'iron',
};

export const MAP_WIDTH = 25;
export const MAP_HEIGHT = 20;
export const BASE_VISION = 2;

export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 640;
export const CAMERA_PAN_SPEED = 600;
export const EDGE_SCROLL_PX = 24;
