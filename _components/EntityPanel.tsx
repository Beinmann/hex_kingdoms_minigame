'use client';

import { key } from '../_lib/hex';
import {
  BUILDING_SPEC,
  EXTRACTOR_RADIUS,
  TILE_CAPACITY_BY_BUILDING,
  type Army,
  type BuildingType,
  type GameState,
  type MoveCommand,
  type Resources,
  type Selection,
  type Villager,
  type VillagerStatus,
} from '../_lib/types';
import BuildingIcon from './BuildingIcon';
import Tooltip from './Tooltip';

type Props = {
  state: GameState;
  selection: Selection;
  onStartMove: (q: number, r: number) => void;
  onMoveAll: (q: number, r: number) => void;
  onSelectBuild: (b: BuildingType) => void;
  onSendArmy: (armyId: string) => void;
  onCancelArmy: (armyId: string) => void;
};

const HOTKEY_FOR: Record<BuildingType, string> = {
  house: 'Y',
  farm: 'X',
  lumber: 'C',
  quarry: 'V',
  iron_mine: 'B',
  barracks: 'N',
  watchtower: 'M',
  townhall: '',
};

const BUILDABLE: BuildingType[] = [
  'house',
  'farm',
  'lumber',
  'quarry',
  'iron_mine',
  'barracks',
  'watchtower',
];

const STATUS_LABEL: Record<VillagerStatus, string> = {
  idle: 'idle',
  moving: 'moving',
  arrived_pause: 'pausing',
  farming: 'farming',
  work_outbound: 'working',
  work_gather: 'working',
  work_inbound: 'working',
  work_pause: 'pausing',
  building: 'building',
};

function shortCost(cost: Partial<Resources>): string {
  const initials: Record<keyof Resources, string> = { food: 'f', wood: 'w', stone: 's', iron: 'i' };
  const parts: string[] = [];
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (cost[k]) parts.push(`${cost[k]}${initials[k]}`);
  }
  return parts.length ? parts.join(' ') : '—';
}

function fullCost(cost: Partial<Resources>): string {
  const parts: string[] = [];
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (cost[k]) parts.push(`${cost[k]} ${k}`);
  }
  return parts.length ? parts.join(', ') : 'free';
}

function canAfford(res: Resources, cost: Partial<Resources>): boolean {
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if ((cost[k] ?? 0) > res[k]) return false;
  }
  return true;
}

function buildingDescription(type: BuildingType): string {
  switch (type) {
    case 'house':
      return 'Raises population cap. Place anywhere on grass.';
    case 'farm':
      return 'Generates food at a fixed rate when staffed.';
    case 'lumber':
      return 'Workers harvest from adjacent forest tiles within range.';
    case 'quarry':
      return 'Workers harvest from adjacent hill tiles within range.';
    case 'iron_mine':
      return 'Workers harvest from adjacent mountain tiles within range.';
    case 'barracks':
      return 'Recruits soldiers. Soldiers form an army on this tile.';
    case 'watchtower':
      return 'Extends vision around its tile.';
    case 'townhall':
      return 'Your seat of power. Trains villagers.';
  }
}

function MoveQueueList({ queue }: { queue: MoveCommand[] }) {
  if (queue.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-zinc-500">
        Pending moves <span className="text-zinc-400">({queue.length})</span>
      </div>
      <div className="flex flex-wrap gap-1 text-[11px] text-zinc-400 font-mono">
        {queue.map((cmd, i) => (
          <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
            → ({cmd.destQ},{cmd.destR})
          </span>
        ))}
      </div>
    </div>
  );
}

function VillagerRow({
  villagers,
  state,
  q,
  r,
  selection,
  onStartMove,
  onMoveAll,
  onSelectBuild,
}: {
  villagers: Villager[];
  state: GameState;
  q: number;
  r: number;
  selection: Selection;
  onStartMove: (q: number, r: number) => void;
  onMoveAll: (q: number, r: number) => void;
  onSelectBuild: (b: BuildingType) => void;
}) {
  const moveQueue = state.tileQueuesByOwner.player[key(q, r)] ?? [];
  const counts: Partial<Record<string, number>> = {};
  for (const v of villagers) {
    const lbl = STATUS_LABEL[v.status];
    counts[lbl] = (counts[lbl] ?? 0) + 1;
  }
  const breakdown = Object.entries(counts)
    .map(([lbl, n]) => `${n} ${lbl}`)
    .join(', ');

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-200 font-medium">
          Villagers <span className="text-zinc-400">({villagers.length})</span>
        </span>
        <span className="text-zinc-500">{breakdown}</span>
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-zinc-500">Actions</div>
        <div className="flex flex-wrap gap-1">
          <Tooltip
            content={
              <div className="space-y-1">
                <div className="text-zinc-100 font-medium">Move villager</div>
                <div className="text-zinc-400">
                  Pick one non-busy villager from this tile and send them to a destination.
                  Right-click a tile to move 1 directly.
                </div>
              </div>
            }
          >
            <button
              onClick={() => onStartMove(q, r)}
              className={`flex flex-col items-center justify-center w-12 h-16 rounded border text-[10px] leading-tight transition-colors ${
                selection.kind === 'move_source' &&
                !selection.all &&
                selection.q === q &&
                selection.r === r
                  ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                  : 'border-amber-700 text-amber-200 hover:bg-amber-900/30'
              }`}
            >
              <span>Move</span>
              <span className="text-[9px] leading-none text-amber-400">[E]</span>
            </button>
          </Tooltip>
          <Tooltip
            content={
              <div className="space-y-1">
                <div className="text-zinc-100 font-medium">Move all villagers</div>
                <div className="text-zinc-400">
                  Send every non-busy villager from this tile to a destination. Shift+right-click a
                  tile to move all directly.
                </div>
              </div>
            }
          >
            <button
              onClick={() => onMoveAll(q, r)}
              className={`flex flex-col items-center justify-center w-12 h-16 rounded border text-[10px] leading-tight transition-colors ${
                selection.kind === 'move_source' &&
                selection.all &&
                selection.q === q &&
                selection.r === r
                  ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                  : 'border-amber-700 text-amber-200 hover:bg-amber-900/30'
              }`}
            >
              <span>Move all</span>
              <span className="text-[9px] leading-none text-amber-400">[R]</span>
            </button>
          </Tooltip>
        </div>
      </div>
      <MoveQueueList queue={moveQueue} />
      <div className="space-y-1">
        <div className="text-[11px] text-zinc-500">Build</div>
        <div className="flex flex-wrap gap-1">
          {BUILDABLE.map((type) => {
            const spec = BUILDING_SPEC[type];
            const active = selection.kind === 'build' && selection.building === type;
            const affordable = canAfford(state.player.resources, spec.cost);
            return (
              <Tooltip
                key={type}
                content={
                  <div className="space-y-1">
                    <div className="text-zinc-100 font-medium">{spec.label}</div>
                    <div className="text-zinc-400">{buildingDescription(type)}</div>
                    <div className="text-zinc-300">Cost: {fullCost(spec.cost)}</div>
                    <div className="text-zinc-400">
                      On {spec.tiles.join('/')}
                      {spec.worksOn && ` · gathers from ${spec.worksOn.join('/')} within ${EXTRACTOR_RADIUS}`}
                    </div>
                    {TILE_CAPACITY_BY_BUILDING[type] !== undefined && (
                      <div className="text-zinc-400">Workers cap: {TILE_CAPACITY_BY_BUILDING[type]}</div>
                    )}
                    {spec.popCapDelta ? (
                      <div className="text-zinc-400">+{spec.popCapDelta} pop cap</div>
                    ) : null}
                    {spec.visionBonus ? (
                      <div className="text-zinc-400">+{spec.visionBonus} vision</div>
                    ) : null}
                  </div>
                }
              >
                <button
                  onClick={() => onSelectBuild(type)}
                  disabled={!affordable && !active}
                  className={`flex flex-col items-center justify-between w-12 h-16 rounded border px-1 py-1 transition-colors ${
                    active
                      ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                      : affordable
                        ? 'border-zinc-700 hover:border-zinc-500 text-zinc-200'
                        : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <BuildingIcon type={type} size={20} />
                  <span className="text-[9px] leading-none text-zinc-400">[{HOTKEY_FOR[type]}]</span>
                  <span className="text-[9px] leading-none font-mono tabular-nums">
                    {shortCost(spec.cost)}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArmyRow({
  army,
  selection,
  onSendArmy,
  onCancelArmy,
}: {
  army: Army;
  selection: Selection;
  onSendArmy: (id: string) => void;
  onCancelArmy: (id: string) => void;
}) {
  const dest = army.path.length > 0 ? army.path[army.path.length - 1] : null;
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 space-y-2 text-xs">
      <div className="flex items-baseline justify-between">
        <span className="text-zinc-200 font-medium">
          Army <span className="text-zinc-400">({army.soldiers} soldier{army.soldiers === 1 ? '' : 's'})</span>
        </span>
        {dest && (
          <span className="text-zinc-500 font-mono">→ ({dest.q},{dest.r})</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSendArmy(army.id)}
          className={`flex-1 px-2 py-1 rounded border text-xs ${
            selection.kind === 'send' && selection.armyId === army.id
              ? 'border-amber-500 bg-amber-500/10 text-amber-200'
              : 'border-zinc-700 hover:bg-zinc-800'
          }`}
        >
          Send
        </button>
        {army.path.length > 0 && (
          <button
            onClick={() => onCancelArmy(army.id)}
            className="flex-1 px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

export default function EntityPanel({
  state,
  selection,
  onStartMove,
  onMoveAll,
  onSelectBuild,
  onSendArmy,
  onCancelArmy,
}: Props) {
  const tileCoord =
    selection.kind === 'tile'
      ? { q: selection.q, r: selection.r }
      : selection.kind === 'move_source'
        ? { q: selection.q, r: selection.r }
        : null;
  if (!tileCoord) return null;

  const { q, r } = tileCoord;
  const villagers = state.villagers.filter(
    (v) => v.owner === 'player' && v.homeQ === q && v.homeR === r,
  );
  const armies = state.armies.filter(
    (a) => a.owner === 'player' && a.q === q && a.r === r,
  );

  if (villagers.length === 0 && armies.length === 0) return null;

  return (
    <section className="flex-1 min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2 text-sm">
      <h3 className="font-semibold text-zinc-200">
        Entities <span className="text-zinc-500 text-xs font-normal font-mono">({q},{r})</span>
      </h3>
      {villagers.length > 0 && (
        <VillagerRow
          villagers={villagers}
          state={state}
          q={q}
          r={r}
          selection={selection}
          onStartMove={onStartMove}
          onMoveAll={onMoveAll}
          onSelectBuild={onSelectBuild}
        />
      )}
      {armies.map((a) => (
        <ArmyRow
          key={a.id}
          army={a}
          selection={selection}
          onSendArmy={onSendArmy}
          onCancelArmy={onCancelArmy}
        />
      ))}
    </section>
  );
}
