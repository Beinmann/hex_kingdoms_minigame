'use client';

import {
  BUILDING_SPEC,
  EXTRACTOR_RADIUS,
  SOLDIER_COST,
  SOLDIER_POP,
  SOLDIER_TRAIN_TICKS,
  VILLAGER_COST,
  VILLAGER_POP,
  VILLAGER_TRAIN_TICKS,
  type BuildingType,
  type GameState,
  type Resources,
  type Selection,
} from '../_lib/types';
import { countAssigned } from '../_lib/villager';

type Props = {
  state: GameState;
  selection: Selection;
  paused: boolean;
  speed: number;
  onSelectBuild: (b: BuildingType) => void;
  onCancelSelection: () => void;
  onTogglePause: () => void;
  onSetSpeed: (s: number) => void;
  onRestart: () => void;
  onRecruit: (barracksId: string) => void;
  onSendArmy: (armyId: string) => void;
  onCancelArmy: (armyId: string) => void;
  onAssign: (buildingId: string, count: number) => void;
  onRecall: (buildingId: string, count: number) => void;
  onStartTransfer: (buildingId: string) => void;
  onTrainVillager: (thId: string) => void;
};

const HOTKEY_FOR: Record<BuildingType, string> = {
  house: 'H',
  farm: 'F',
  lumber: 'L',
  quarry: 'Q',
  iron_mine: 'M',
  barracks: 'B',
  watchtower: 'T',
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

function ResRow({ res }: { res: Resources }) {
  const cell = (label: string, value: number) => (
    <div className="flex items-baseline justify-between text-xs gap-2">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono tabular-nums text-zinc-100">{value}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {cell('Food', res.food)}
      {cell('Wood', res.wood)}
      {cell('Stone', res.stone)}
      {cell('Iron', res.iron)}
    </div>
  );
}

function costString(cost: Partial<Resources>): string {
  const parts: string[] = [];
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (cost[k]) parts.push(`${cost[k]} ${k}`);
  }
  return parts.length ? parts.join(', ') : '—';
}

export default function Sidebar({
  state,
  selection,
  paused,
  speed,
  onSelectBuild,
  onCancelSelection,
  onTogglePause,
  onSetSpeed,
  onRestart,
  onRecruit,
  onSendArmy,
  onCancelArmy,
  onAssign,
  onRecall,
  onStartTransfer,
  onTrainVillager,
}: Props) {
  const selectedTile = selection.kind === 'tile' ? state.tiles.find((t) => t.q === selection.q && t.r === selection.r) : null;
  const selectedBuilding =
    selection.kind === 'tile' ? state.buildings.find((b) => b.q === selection.q && b.r === selection.r) : null;
  const selectedLair =
    selection.kind === 'tile' ? state.lairs.find((l) => l.q === selection.q && l.r === selection.r) : null;
  const transferSource =
    selection.kind === 'transfer_source' ? state.buildings.find((b) => b.id === selection.buildingId) : null;
  const idleVillagers = state.villagers.filter((v) => v.owner === 'player' && v.assignedTo === null).length;
  const playerArmies = state.armies.filter((a) => a.owner === 'player');
  const playerTrainings = state.trainings.filter((t) => t.owner === 'player');

  return (
    <aside className="w-72 shrink-0 space-y-4 text-sm">
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Tick {state.tick}</span>
          <span>{paused ? 'Paused' : `${speed}×`}</span>
        </div>
        <ResRow res={state.player.resources} />
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-zinc-400">Pop</span>
          <span className="font-mono tabular-nums text-zinc-100">
            {state.player.pop} <span className="text-zinc-500">/ {state.player.popCap}</span>
            <span className="text-zinc-500 ml-1">({idleVillagers} idle)</span>
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onTogglePause}
            className="flex-1 px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2 py-1 rounded border text-xs ${
                speed === s ? 'border-zinc-300 bg-zinc-800' : 'border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          onClick={onRestart}
          className="w-full px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs"
        >
          New game
        </button>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-200">Build</h3>
          {selection.kind === 'build' && (
            <button onClick={onCancelSelection} className="text-xs text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
          )}
        </div>
        <div className="space-y-1">
          {BUILDABLE.map((type) => {
            const spec = BUILDING_SPEC[type];
            const active = selection.kind === 'build' && selection.building === type;
            const detail = spec.worksOn
              ? `on ${spec.tiles.join('/')} · gathers from ${spec.worksOn.join('/')} within ${EXTRACTOR_RADIUS}`
              : `on ${spec.tiles.join('/')}`;
            return (
              <button
                key={type}
                onClick={() => onSelectBuild(type)}
                className={`w-full text-left px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-100 font-medium">
                    <span className="text-zinc-400 mr-1">[{HOTKEY_FOR[type]}]</span>
                    {spec.label}
                  </span>
                  {spec.pop > 0 && <span className="text-zinc-500">max {spec.pop}</span>}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {costString(spec.cost)} · {detail}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <h3 className="font-semibold text-zinc-200">Selection</h3>
        {selection.kind === 'none' && (
          <p className="text-xs text-zinc-500">Click a tile to inspect it.</p>
        )}
        {selection.kind === 'build' && (
          <p className="text-xs text-zinc-400">
            Placing <span className="text-zinc-100 font-medium">{BUILDING_SPEC[selection.building].label}</span>.
            Click a valid tile, or <button onClick={onCancelSelection} className="underline">cancel</button>.
          </p>
        )}
        {selection.kind === 'send' && (
          <p className="text-xs text-zinc-400">
            Click a tile to send the selected army. <button onClick={onCancelSelection} className="underline">cancel</button>
          </p>
        )}
        {transferSource && (
          <div className="text-xs text-blue-300 space-y-1">
            <div>
              Transferring <span className="text-zinc-100">{countAssigned(state, transferSource.id)}</span> villagers from{' '}
              <span className="text-zinc-100">{BUILDING_SPEC[transferSource.type].label}</span>
            </div>
            <div className="text-zinc-400">
              Click another player building to confirm.{' '}
              <button onClick={onCancelSelection} className="underline">cancel</button>
            </div>
          </div>
        )}
        {selection.kind === 'rect_select' && (
          <div className="text-xs text-amber-300 space-y-1">
            <div>
              <span className="text-zinc-100">{selection.villagerIds.length}</span> villagers selected
            </div>
            <div className="text-zinc-400">
              Click a player building to assign them.{' '}
              <button onClick={onCancelSelection} className="underline">cancel</button>
            </div>
          </div>
        )}
        {selectedTile && (
          <div className="text-xs space-y-1">
            <div className="text-zinc-400">
              Tile <span className="font-mono text-zinc-200">({selectedTile.q},{selectedTile.r})</span>
            </div>
            <div className="text-zinc-300 capitalize">{selectedTile.type}</div>
            {selectedLair && (
              <div className="text-rose-300">Monster lair · garrison {selectedLair.garrison}</div>
            )}
            {selectedBuilding && (
              <div>
                <div className="text-zinc-200">
                  {BUILDING_SPEC[selectedBuilding.type].label}{' '}
                  <span className="text-zinc-500">({selectedBuilding.owner})</span>
                </div>
                <div className="text-zinc-500">
                  HP {selectedBuilding.hp} / {BUILDING_SPEC[selectedBuilding.type].hp}
                </div>
                {selectedBuilding.owner === 'player' && BUILDING_SPEC[selectedBuilding.type].produces && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">
                        Workers <span className="text-zinc-100">{countAssigned(state, selectedBuilding.id)}</span>
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => onRecall(selectedBuilding.id, 1)}
                          disabled={countAssigned(state, selectedBuilding.id) === 0}
                          className="px-2 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 text-xs disabled:opacity-40"
                        >
                          −
                        </button>
                        <button
                          onClick={() => onAssign(selectedBuilding.id, 1)}
                          disabled={idleVillagers === 0}
                          className="px-2 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 text-xs disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {countAssigned(state, selectedBuilding.id) > 0 && (
                      <button
                        onClick={() => onStartTransfer(selectedBuilding.id)}
                        className="w-full px-2 py-0.5 rounded border border-blue-700 text-blue-300 hover:bg-blue-900/30 text-xs"
                      >
                        Transfer all → click target
                      </button>
                    )}
                  </div>
                )}
                {selectedBuilding.owner === 'player' && selectedBuilding.type === 'barracks' && (
                  <button
                    onClick={() => onRecruit(selectedBuilding.id)}
                    className="mt-2 w-full px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs"
                  >
                    Recruit soldier ({costString(SOLDIER_COST)}, pop {SOLDIER_POP}, {SOLDIER_TRAIN_TICKS}t)
                  </button>
                )}
                {selectedBuilding.owner === 'player' && selectedBuilding.type === 'townhall' && (
                  <button
                    onClick={() => onTrainVillager(selectedBuilding.id)}
                    className="mt-2 w-full px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-xs"
                  >
                    Train villager ({costString(VILLAGER_COST)}, pop {VILLAGER_POP}, {VILLAGER_TRAIN_TICKS}t)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {(playerArmies.length > 0 || playerTrainings.length > 0) && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          <h3 className="font-semibold text-zinc-200">Armies</h3>
          {playerArmies.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-300">
                {a.soldiers}× soldier <span className="text-zinc-500 font-mono">({a.q},{a.r})</span>
                {a.path.length > 0 && <span className="text-zinc-500"> → ({a.path[a.path.length - 1].q},{a.path[a.path.length - 1].r})</span>}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => onSendArmy(a.id)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    selection.kind === 'send' && selection.armyId === a.id
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  Send
                </button>
                {a.path.length > 0 && (
                  <button
                    onClick={() => onCancelArmy(a.id)}
                    className="px-2 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 text-[11px]"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          ))}
          {playerTrainings.map((t) => (
            <div key={t.id} className="text-xs text-zinc-500">
              Training {t.kind} · {t.ticksLeft}t
            </div>
          ))}
        </section>
      )}

      {state.phase !== 'playing' && (
        <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-center space-y-2">
          <div className={`font-bold text-lg ${state.phase === 'won' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {state.phase === 'won' ? 'Victory' : 'Defeat'}
          </div>
          <p className="text-xs text-zinc-400">
            {state.phase === 'won'
              ? 'The rival kingdom has fallen.'
              : 'Your town hall has fallen.'}
          </p>
          <button
            onClick={onRestart}
            className="w-full px-2 py-1 rounded border border-zinc-600 hover:bg-zinc-800 text-xs"
          >
            New game
          </button>
        </section>
      )}
    </aside>
  );
}
