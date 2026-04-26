'use client';

import {
  BUILDING_SPEC,
  EXTRACTOR_RADIUS,
  type BuildingType,
  type GameState,
  type Resources,
  type Selection,
} from '../_lib/types';

type Props = {
  state: GameState;
  selection: Selection;
  paused: boolean;
  speed: number;
  onSelectBuild: (b: BuildingType) => void;
  onTogglePause: () => void;
  onSetSpeed: (s: number) => void;
  onRestart: () => void;
  onSendArmy: (armyId: string) => void;
  onCancelArmy: (armyId: string) => void;
};

const HOTKEY_FOR: Record<BuildingType, string> = {
  house: 'H',
  farm: 'F',
  lumber: 'L',
  quarry: 'Q',
  iron_mine: 'I',
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
  onTogglePause,
  onSetSpeed,
  onRestart,
  onSendArmy,
  onCancelArmy,
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
