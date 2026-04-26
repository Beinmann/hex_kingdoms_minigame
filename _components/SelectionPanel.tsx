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
import { capacityOf, occupantsAt } from '../_lib/villager';

type Props = {
  state: GameState;
  selection: Selection;
  width: number;
  onCancelSelection: () => void;
  onRecruit: (barracksId: string) => void;
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
  onTrainVillager,
  onDestroy,
}: Props) {
  const tileCoord =
    selection.kind === 'tile'
      ? { q: selection.q, r: selection.r }
      : selection.kind === 'move_source'
        ? { q: selection.q, r: selection.r }
        : null;
  const selectedTile = tileCoord
    ? state.tiles.find((t) => t.q === tileCoord.q && t.r === tileCoord.r) ?? null
    : null;
  const selectedBuilding = tileCoord
    ? state.buildings.find((b) => b.q === tileCoord.q && b.r === tileCoord.r) ?? null
    : null;
  const selectedLair = tileCoord
    ? state.lairs.find((l) => l.q === tileCoord.q && l.r === tileCoord.r) ?? null
    : null;

  const tileOcc = tileCoord ? occupantsAt(state, tileCoord.q, tileCoord.r, 'player') : 0;
  const tileCap = tileCoord ? capacityOf(state, tileCoord.q, tileCoord.r) : 0;

  return (
    <section
      className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2 text-sm"
      style={{ width }}
    >
      <h3 className="font-semibold text-zinc-200">Selection</h3>
      {selection.kind === 'none' && (
        <p className="text-xs text-zinc-500">Click a tile to inspect it. Press <kbd className="text-zinc-300">M</kbd> on a selected tile to send a villager elsewhere.</p>
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
      {selection.kind === 'move_source' && (
        <p className="text-xs text-amber-300">
          Choose a destination tile for one villager from{' '}
          <span className="font-mono text-zinc-100">({selection.q},{selection.r})</span>.{' '}
          <button onClick={onCancelSelection} className="underline">cancel</button>
        </p>
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
          {tileCoord && (
            <div className="text-zinc-400">
              Occupants <span className="text-zinc-100">{tileOcc}</span> / <span className="text-zinc-300">{tileCap}</span>
            </div>
          )}
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
