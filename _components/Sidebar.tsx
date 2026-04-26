'use client';

import type { GameState } from '../_lib/types';

type Props = {
  state: GameState;
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onSetSpeed: (s: number) => void;
  onRestart: () => void;
  onSelectArmyTile: (q: number, r: number) => void;
};

export default function Sidebar({
  state,
  paused,
  speed,
  onTogglePause,
  onSetSpeed,
  onRestart,
  onSelectArmyTile,
}: Props) {
  const idleVillagers = state.villagers.filter((v) => v.owner === 'player' && v.status === 'idle').length;
  const playerArmies = state.armies.filter((a) => a.owner === 'player');
  const playerTrainings = state.trainings.filter((t) => t.owner === 'player');

  return (
    <aside className="w-72 shrink-0 space-y-4 text-sm">
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Tick {state.tick}</span>
          <span>{paused ? 'Paused' : `${speed}×`}</span>
        </div>
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

      {(playerArmies.length > 0 || playerTrainings.length > 0) && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          <h3 className="font-semibold text-zinc-200">Armies</h3>
          {playerArmies.map((a) => {
            const dest = a.path.length > 0 ? a.path[a.path.length - 1] : null;
            return (
              <button
                key={a.id}
                onClick={() => onSelectArmyTile(a.q, a.r)}
                className="w-full text-left px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-200">
                    {a.soldiers}× soldier <span className="text-zinc-500 font-mono">({a.q},{a.r})</span>
                  </span>
                  {dest && (
                    <span className="text-zinc-500 font-mono">→ ({dest.q},{dest.r})</span>
                  )}
                </div>
              </button>
            );
          })}
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
