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
import Tooltip from './Tooltip';

type Props = {
  state: GameState;
  selection: Selection;
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
    <section className="flex-1 min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2 text-sm">
      <h3 className="font-semibold text-zinc-200">Selection</h3>
      {selection.kind === 'none' && (
        <p className="text-xs text-zinc-500">
          Click a tile to inspect it. Right-click a tile to send a villager from the selected
          tile (Shift+right-click moves all). Hover any action button for details.
        </p>
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
          Choose a destination tile for {selection.all ? 'all non-busy villagers' : 'one villager'} from{' '}
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
              {selectedBuilding.owner === 'player' && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] text-zinc-500">Actions</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedBuilding.type === 'townhall' && (
                      <Tooltip
                        content={
                          <div className="space-y-1">
                            <div className="text-zinc-100 font-medium">Train villager</div>
                            <div className="text-zinc-400">
                              Cost: {costString(VILLAGER_COST)} · pop {VILLAGER_POP} ·{' '}
                              {VILLAGER_TRAIN_TICKS}t
                            </div>
                            <div className="text-zinc-400">
                              Spawns a villager at the townhall after training.
                            </div>
                          </div>
                        }
                      >
                        <button
                          onClick={() => onTrainVillager(selectedBuilding.id)}
                          className="flex flex-col items-center justify-center w-12 h-16 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-[10px] leading-tight transition-colors"
                        >
                          <span>Train</span>
                          <span className="text-[9px] leading-none text-zinc-400">[Q]</span>
                        </button>
                      </Tooltip>
                    )}
                    {selectedBuilding.type === 'barracks' && (
                      <Tooltip
                        content={
                          <div className="space-y-1">
                            <div className="text-zinc-100 font-medium">Recruit soldier</div>
                            <div className="text-zinc-400">
                              Cost: {costString(SOLDIER_COST)} · pop {SOLDIER_POP} ·{' '}
                              {SOLDIER_TRAIN_TICKS}t
                            </div>
                            <div className="text-zinc-400">
                              Soldier joins the army on this tile when ready.
                            </div>
                          </div>
                        }
                      >
                        <button
                          onClick={() => onRecruit(selectedBuilding.id)}
                          className="flex flex-col items-center justify-center w-12 h-16 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-[10px] leading-tight transition-colors"
                        >
                          <span>Recruit</span>
                          <span className="text-[9px] leading-none text-zinc-400">[Q]</span>
                        </button>
                      </Tooltip>
                    )}
                    {selectedBuilding.type !== 'townhall' && (
                      <Tooltip
                        content={
                          <div className="space-y-1">
                            <div className="text-zinc-100 font-medium">Destroy building</div>
                            <div className="text-zinc-400">
                              Removes the building. Workers stationed here become idle.
                            </div>
                          </div>
                        }
                      >
                        <button
                          onClick={() => onDestroy(selectedBuilding.id)}
                          className="flex flex-col items-center justify-center w-12 h-16 rounded border border-rose-800 text-rose-300 hover:bg-rose-900/30 text-[10px] leading-tight transition-colors"
                        >
                          <span>Destroy</span>
                          <span className="text-[9px] leading-none text-rose-400">[W]</span>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <TrainingQueue state={state} buildingId={selectedBuilding.id} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TrainingQueue({ state, buildingId }: { state: GameState; buildingId: string }) {
  const orders = state.trainings.filter((t) => t.buildingId === buildingId);
  if (orders.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-zinc-500">
        Queue <span className="text-zinc-400">({orders.length})</span>
      </div>
      <div className="space-y-1">
        {orders.map((t) => {
          const total = t.kind === 'villager' ? VILLAGER_TRAIN_TICKS : SOLDIER_TRAIN_TICKS;
          const done = Math.max(0, total - t.ticksLeft);
          const pct = Math.min(100, Math.max(0, (done / total) * 100));
          return (
            <div key={t.id} className="flex items-center gap-2 text-[11px]">
              <span className="text-zinc-300 capitalize w-16 shrink-0">{t.kind}</span>
              <div className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                <div className="h-full bg-amber-500/70" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-zinc-500 font-mono tabular-nums w-10 text-right">
                {Math.max(0, t.ticksLeft)}t
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
