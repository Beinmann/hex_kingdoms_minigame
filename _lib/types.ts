export type HexCoord = { q: number; r: number };

export type TileType = 'grass' | 'forest' | 'hill' | 'mountain' | 'water' | 'farm';

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

export type VillagerStatus =
  | 'idle'
  | 'moving'
  | 'arrived_pause'
  | 'farming'
  | 'work_outbound'
  | 'work_gather'
  | 'work_inbound'
  | 'work_pause'
  | 'building';

export type Villager = {
  id: string;
  owner: Owner;
  q: number;
  r: number;
  homeQ: number;
  homeR: number;
  status: VillagerStatus;
  path: HexCoord[];
  carrying: { resource: keyof Resources; amount: number } | null;
  pauseTicksLeft: number;
};

export type MoveCommand = { destQ: number; destR: number };

export type Construction = {
  id: string;
  type: BuildingType;
  owner: Owner;
  q: number;
  r: number;
  progress: number;
  ticksRequired: number;
  idleTicks: number;
};

export type Notification = {
  id: string;
  text: string;
  tickAdded: number;
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
  | { kind: 'build'; building: BuildingType; sticky: boolean; sourceQ: number; sourceR: number }
  | { kind: 'send'; armyId: string }
  | { kind: 'move_source'; q: number; r: number; all?: boolean };

export type ExploredTile = {
  type: TileType;
  building?: { type: BuildingType; owner: Owner };
  construction?: { type: BuildingType; owner: Owner };
  lair?: true;
};

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
  constructions: Construction[];
  lairs: MonsterLair[];
  player: PlayerState;
  rival: PlayerState;
  rivalAI: RivalAIState;
  visible: Record<string, true>;
  explored: Record<string, ExploredTile>;
  tileQueuesByOwner: Record<'player' | 'rival', Record<string, MoveCommand[]>>;
  notifications: Notification[];
  nextId: number;
};

export const INITIAL_RESOURCES: Resources = {
  food: 40,
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
export const GATHER_AMOUNT = 3;
export const FARM_PRODUCE_INTERVAL_TICKS = 5;
export const INITIAL_VILLAGERS = 0;

export const ARRIVED_PAUSE_TICKS = 1;
export const WORK_PAUSE_TICKS = 1;

export const TILE_CAPACITY_DEFAULT = 3;
export const TILE_CAPACITY_BY_BUILDING: Partial<Record<BuildingType, number>> = {
  townhall: 5,
  farm: 2,
  lumber: 3,
  quarry: 3,
  iron_mine: 3,
  barracks: 3,
  house: 3,
  watchtower: 3,
};

export const NOTIFICATION_TTL_TICKS = 3;

export const BUILD_TICKS_BY_TYPE: Record<BuildingType, number> = {
  townhall: 10,
  house: 5,
  farm: 5,
  lumber: 5,
  quarry: 8,
  iron_mine: 8,
  barracks: 8,
  watchtower: 5,
};

export const BUILD_ABANDON_TICKS = 20;

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
