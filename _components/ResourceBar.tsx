'use client';

import { VIEWPORT_WIDTH, type Resources } from '../_lib/types';

const ITEMS: { key: keyof Resources; label: string; color: string }[] = [
  { key: 'food', label: 'Food', color: 'text-amber-300' },
  { key: 'wood', label: 'Wood', color: 'text-emerald-300' },
  { key: 'stone', label: 'Stone', color: 'text-zinc-300' },
  { key: 'iron', label: 'Iron', color: 'text-sky-300' },
];

export default function ResourceBar({ resources }: { resources: Resources }) {
  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 flex items-center gap-6"
      style={{ width: VIEWPORT_WIDTH }}
    >
      {ITEMS.map((it) => (
        <div key={it.key} className="flex items-baseline gap-2">
          <span className={`text-xs uppercase tracking-wide ${it.color}`}>{it.label}</span>
          <span className="font-mono tabular-nums text-zinc-100 text-sm">
            {resources[it.key]}
          </span>
        </div>
      ))}
    </div>
  );
}
