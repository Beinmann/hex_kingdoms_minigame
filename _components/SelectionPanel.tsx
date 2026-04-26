'use client';

import {
  BUILDING_SPEC,
  SOLDIER_COST,
  SOLDIER_POP,
  SOLDIER_TRAIN_TICKS,
  VILLAGER_COST,
  VILLAGER_POP,
  VILLAGER_TRAIN_TICKS,
  type GameState,
  type Resources,
  type Selection,
} from '../_lib/types';
import { countAssigned } from '../_lib/villager';

type Props = {
  state: GameState;
  selection: Selection;
  width: number;
  onCancelSelection: () => void;
  onRecruit: (barracksId: string) => void;
  onAssign: (buildingId: string, count: number) => void;
  onRecall: (buildingId: string, count: number) => void;
  onStartTransfer: (buildingId: string) => void;
  onTrainVillager: (thId: string) => void;
  onDestroy: (buildingId: string) => void;
};

function costString(cost: Partial<Resources>): string {
  const parts: string[] = [];
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (cost[k]) parts.push(`${cost[k]} ${k}`);
  }
  return parts.length ? parts.join(', ') : '—';
}

export default function SelectionPanel({
  state,
  selection,
  width,
  onCancelSelection,
  onRecruit,
  onAssign,
  onRecall,
  onStartTransfer,
  onTrainVillager,
  onDestroy,
}: Props) {
  const selectedTile =
    selection.kind === 'tile' ? state.tiles.find((t) => t.q === selection.q && t.r === selection.r) : null;
  const selectedBuilding =
    selection.kind === 'tile' ? state.buildings.find((b) => b.q === selection.q && b.r === selection.r) : null;
  const selectedLair =
    selection.kind === 'tile' ? state.lairs.find((l) => l.q === selection.q && l.r === selection.r) : null;
  const transferSource =
    selection.kind === 'transfer_source' ? state.buildings.find((b) => b.id === selection.buildingId) : null;
  const idleVillagers = state.villagers.filter((v) => v.owner === 'player' && v.assignedTo === null).length;

  return (
    <section
      className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2 text-sm"
      style={{ width }}
    >
      <h3 className="font-semibold text-zinc-200">Selection</h3>
      {selection.kind === 'none' && (
        <p className="text-xs text-zinc-500">Click a tile to inspect it.</p>
      )}
      {selection.kind === 'build' && (
        <p className="text-xs text-zinc-400">
          Placing <span className="text-zinc-100 font-medium">{BUILDING_SPEC[selection.building].label}</span>
          {selection.sticky && <span className="text-zinc-500"> (sticky — Esc to stop)</span>}
          . Click a valid tile, or{' '}
          <button onClick={onCancelSelection} className="underline">cancel</button>.
        </p>
      )}
      {selection.kind === 'send' && (
        <p className="text-xs text-zinc-400">
          Click a tile to send the selected army.{' '}
          <button onClick={onCancelSelection} className="underline">cancel</button>
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
          <div className="text-zinc-300 capitalize">
            {selectedTile.type}
            {selectedTile.pool !== undefined && selectedTile.maxPool !== undefined && (
              <span className="text-zinc-500 ml-2 normal-case">
                pool {selectedTile.pool}/{selectedTile.maxPool}
              </span>
            )}
          </div>
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
              {selectedBuilding.owner === 'player' && selectedBuilding.type !== 'townhall' && (
                <button
                  onClick={() => onDestroy(selectedBuilding.id)}
                  className="mt-2 w-full px-2 py-1 rounded border border-rose-800 text-rose-300 hover:bg-rose-900/30 text-xs"
                >
                  Destroy
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
