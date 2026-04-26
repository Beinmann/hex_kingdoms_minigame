# hex_kingdom — agent guide

A small real-time hex RTS-lite. Read `PLAN.md` for the original design rationale; this file is the
authoritative guide for editing code here.

**Read order:**
1. This file.
2. `PLAN.md` for game-design context.
3. The module you're about to edit.

---

## File map

```
hex_kingdom/
├── page.tsx                    # route entry, renders <Game />
├── PLAN.md                     # design doc
├── AGENTS.md                   # this file
├── _components/
│   ├── Game.tsx                # top-level: state, tick loop, save, hotkeys, selection routing
│   ├── Canvas.tsx              # camera-driven canvas-2D renderer + drag-rect select + interpolation
│   └── Sidebar.tsx             # resources, build menu (with hotkeys), selection info, win/lose panel
└── _lib/
    ├── types.ts                # GameState + BUILDING_SPEC + constants
    ├── hex.ts                  # axial coords, neighbours, distance, A*
    ├── mapgen.ts               # createInitialState(seed) → GameState
    ├── tick.ts                 # advance(state) — pure
    ├── villager.ts             # villager state machine, chooseSource, assign/recall
    ├── combat.ts               # resolveCombat({a},{b}) helper
    ├── ai.ts                   # rivalDecide(state) — mutates `next` inside advance
    ├── save.ts                 # SSR-guarded localStorage at SAVE_KEY
    └── __tests__/              # vitest: hex / tick / combat / ai / villager
```

---

## Key invariants

- **Tick order in `advance(state)`** — pure function returning a deep clone of the next state. Steps:
  1. `tickVillagers` — each villager runs one step of its state machine.
  2. Training tick (decrement `ticksLeft`, then complete any reaching 0; villagers spawn at TH, soldiers at barracks).
  3. Food consumption (1 per living entity; on shortfall, kill one villager, else one soldier).
  4. Army movement (one tile along `path`).
  5. Combat: army-vs-army, army-vs-lair, army-vs-building.
  6. Prune dead armies / destroyed buildings.
  7. Kill villagers standing on a hostile-occupied tile.
  8. Rival AI (`rivalDecide`) — assigns idle villagers, trains, builds, recruits, raids.
  9. Pop / popCap recompute. `pop = villagers + soldiers + trainings`. `popCap = sum of popCapDelta`.
 10. Visibility recompute from scratch (player buildings + player armies).
 11. Victory check (player TH gone → lost; rival TH gone → won).

- **`BUILDING_SPEC` is the single source of truth** for cost, tile types, hp, popCapDelta, vision bonus, production rate, and `worksOn`. `pop` on a spec is now an *advisory* max-workers cap, not a reservation. Do not duplicate these values into UI strings or AI heuristics.

- **Villagers are first-class entities** in `state.villagers`, addressable individually. `assignedTo: buildingId | null`. The state machine (`idle | walking_to_source | gathering | walking_to_dropoff | depositing | walking_to_reassignment`) is in `_lib/villager.ts`. Production happens only when a villager finishes a `depositing` cycle — there is no auto-production path.

- **Tile pools deplete permanently.** `Tile.pool` lives on resource tiles seeded by `TILE_INITIAL_POOL`. When a pool hits 0, the tile is mutated to its `DEPLETED_TILE` form (forest→grass, hill→grass, mountain→hill) and the pool field is removed. Save format includes the pool.

- **Camera state is Canvas-local** in a `useRef`, never in `GameState` — it must not appear in the save format. WASD / arrow keys / edge-scroll drive panning at `CAMERA_PAN_SPEED` px/s. Initial camera centres on the player TH.

- **Position interpolation is purely cosmetic.** `Canvas.tsx` keeps `prevPositionsRef` (entity → previous-tick hex) and `tickStartAtRef`; the rAF loop renders entities at `lerp(prev, current, dt / tickMs)`. No interpolation state ever flows back into `GameState`.

- **`visible` is `Record<string, true>`** keyed by `"q,r"` (`keyOf(coord)`), not a `Set`. JSON-serialisable so the save round-trips through localStorage without a custom replacer.

- **Save key is `hex_kingdom_save_v2`.** If you change the `GameState` shape non-additively, bump the version and reset old saves on read. `loadSave` already discards v1 blobs and any save whose `mapWidth`/`mapHeight` mismatches.

- **Map is a parallelogram**, axial coords `q ∈ [0, MAP_WIDTH)`, `r ∈ [0, MAP_HEIGHT)`. Pointy-top. Do not convert to offset coords — every neighbour/bounds check assumes axial. `MAP_WIDTH = 25`, `MAP_HEIGHT = 20`.

- **`stateRef` in `Game.tsx` is the source of truth for the tick loop.** The `useState` mirror exists only so React re-renders on tick. Mutating handlers compute a new `GameState` and assign to both `stateRef.current` and `setState`.

- **`townhall` is in `BUILDING_SPEC` but is not buildable** — it has no cost, only used at map-gen and for the victory check. Do not list it in the build menu. The TH does train villagers (`VILLAGER_COST`, `VILLAGER_TRAIN_TICKS`).

- **`TrainingOrder` carries `kind: 'soldier' | 'villager'` and `buildingId`** (renamed from `barracksId`). `completeTrainings` branches on kind.

- **The rival town hall is placed at map-gen.** Pop-cap and resources mirror the player's start. Mapgen also guarantees forest/hill/mountain within radius 5 of each capital so the start position isn't a lottery.

---

## Verification

From the repo root:

```bash
npm run build   # zero type errors
npm test        # vitest must pass
```

For UI changes, open `/projects/hex_kingdom` and play a few ticks — the canvas does not type-check, so layout regressions and broken click hit-tests must be verified by hand.

---

## Out of scope for v1

See PLAN.md "Out of scope". TL;DR: no second rival, no tier-2 buildings, no tweens, no diplomacy, no sound. Add them later only if the core loop is fun.
