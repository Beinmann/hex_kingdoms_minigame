# hex_kingdom

A small real-time hex-grid RTS-lite. Currently in early development — the core loop (build, train, gather, fight) works, but very rough.

## How to play

Route: `/projects/hex_kingdom`.

- **Click a tile** to inspect it. The Selection panel below the map describes the tile and any building on it.
- When a player villager or army is on the selected tile, an **Entities panel** appears beneath the Selection panel with the move / build / send actions for those units.
- **Press `M` while a tile is selected** (or click *Move villager* in the Entities panel), then click another tile, to send one villager from the selected tile to the destination.
- **Build** by selecting a tile with one of your villagers on it, then clicking a building icon in the Entities panel — or by pressing its hotkey anywhere (`H` house, `F` farm, `L` lumber, `Q` quarry, `I` iron mine, `B` barracks, `T` watchtower) and clicking a valid tile. Hold `Shift` while clicking to keep placing. Hover an icon to see its full description.
- **Train villagers** at the Town Hall (button in the selection panel).
- **Recruit soldiers** at a Barracks (same place).
- **Send armies** from the Entities panel of the army's tile. The sidebar's Armies list is a clickable index — click an entry to jump to that army.
- `Space` = pause/resume. `Esc` = clear selection. `WASD` / arrow keys = pan.

## Game model

- Each villager has a *physical* position (where they're drawn) and a *logical home tile* (where they count for occupancy and the on-screen `n/cap` badge). Moving a villager is a tile-scoped command — it lives on the source tile's queue until a non-busy villager fulfils it.
- Villagers placed on a **farm** auto-produce food (cap 2 per farm).
- Villagers placed on a **lumber camp / quarry / iron mine** loop out to the nearest forest / hill / mountain, harvest, and return — they always *count* as occupying the building tile, even when visually off-tile (cap 3 per producer).
- Default tile capacity is 3; town hall is 5; farm is 2; producers are 3.
- A queued move auto-cancels with a toast if the destination becomes full before the villager's turn comes up.
- Food cost only applies at training time; villagers don't consume food per tick.
- Win by destroying the rival town hall; lose by losing yours. The rival has its own villagers, picks producers based on its scarcest resource, defends its territory when your armies come close, and raids weakened buildings preferentially.

## Code architecture

Tick-based, pure-function state advance. `advance(state) → next` is the whole simulation; everything else is rendering and input.

```
hex_kingdom/
├── page.tsx                  Route entry, renders <Game />
├── README.md                 This file
├── AGENTS.md                 Agent guide (read this before editing)
├── CLAUDE.md                 → @AGENTS.md
├── _components/
│   ├── Game.tsx              Top-level state, rAF tick loop, save, hotkeys, selection routing
│   ├── Canvas.tsx            Canvas-2D renderer, camera, click hit-testing, float-icons, toasts
│   ├── SelectionPanel.tsx    Per-tile inspector (terrain, building, recruit/train/destroy)
│   ├── EntityPanel.tsx       Per-tile unit panel (Move, Build icon strip, army Send/Stop)
│   ├── BuildingIcon.tsx      Inline-SVG icon per building type
│   ├── Tooltip.tsx           Hover-tooltip wrapper (used by the build icons)
│   └── Sidebar.tsx           Resources, armies index, win/lose
└── _lib/
    ├── types.ts              GameState, Villager, BUILDING_SPEC, capacity & timing constants
    ├── hex.ts                Axial coords, neighbours, distance, A*
    ├── mapgen.ts             createInitialState(seed) → fresh GameState
    ├── tick.ts               advance(state) — pure
    ├── villager.ts           Villager state machine + per-tile move-command system
    ├── combat.ts             resolveCombat helper
    ├── ai.ts                 rivalDecide(state) — economy / villager assignment / defense / raiding
    ├── save.ts               localStorage at SAVE_KEY (currently v4)
    └── __tests__/            vitest: hex / tick / combat / ai / villager
```

## Running

From the repo root:

```bash
npm run dev      # http://localhost:3000/projects/hex_kingdom
npm run build    # must pass with zero type errors
npm test         # vitest, must pass
```
