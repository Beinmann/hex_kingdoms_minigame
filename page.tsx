import Game from './_components/Game';

export default function HexKingdomPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Hex Kingdom</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6 max-w-2xl">
        A tiny real-time city-builder on a hex map. Place extractors on the right terrain,
        keep food positive, recruit soldiers from a barracks, and march on the rival town hall.
        Click a tile to inspect, pick a building from the sidebar then click a tile to place it.
        Work in progress.
      </p>
      <Game />
      <ul className="mt-6 text-sm text-zinc-500 space-y-1 list-disc list-inside">
        <li>Each tick is one second. Pause and 2×/4× speed are in the sidebar.</li>
        <li>Buildings only fit on matching terrain — Quarry on hill, Iron Mine on mountain, etc.</li>
        <li>Your run is auto-saved to localStorage; <span className="font-mono text-xs">New game</span> wipes it.</li>
      </ul>
    </div>
  );
}
