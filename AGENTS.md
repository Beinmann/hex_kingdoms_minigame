# hex_kingdom — agent guide

This project is in early development. Mechanics will keep changing. Treat the design as fluid; don't entrench abstractions for hypothetical future requirements.

**Read order before editing:**
1. This file.
2. `README.md` for the player-facing game model and code map.
3. The module you're about to touch.

---

## Core abstraction — read this first

A villager has **two positions**:

- `q, r` — *physical* position. Where the dot is drawn. Lerped between ticks for animation.
- `homeQ, homeR` — *logical* position. The tile they count as occupying for capacity, the `n/cap` badge, and the source side of move commands.

These diverge in two cases:
1. While `status === 'moving'`, `home` already equals the destination — even on tick zero of the move. The destination's occupancy goes up immediately.
2. While a villager is harvesting (`work_outbound | work_gather | work_inbound`), `home` stays pinned to the producer building tile, *even when they're physically standing in a forest*. They never count as occupying the resource tile.

If you're tempted to use `(q,r)` for a tile-occupancy check, you almost certainly want `(homeQ,homeR)` instead. Helpers `occupantsAt`, `capacityOf`, `isBusy` live in `_lib/villager.ts`.

## Move-command queue

Movement is *tile-scoped*, not villager-scoped. `state.tileQueuesByOwner.player['q,r']` and `.rival['q,r']` are owner-scoped FIFOs of `{destQ,destR}` commands. The drainer (run once per owner, before the per-villager step each tick) pairs each command with whatever non-busy villager of that owner has `home` on that source tile. Villager-level commands don't exist — that's intentional, race conditions get handled by the queue, not by a list of bound (villager, dest) pairs.

`issueMoveCommand` and `drainMoveQueues` both take an `owner` argument. Player commands come from UI handlers in `Game.tsx`; rival commands come from `aiAssignIdleVillagers` in `ai.ts`. Toasts are only emitted on the player path.

Issuance does a permissive check (source has someone, dest isn't impassable, dest isn't already over cap, queue isn't longer than source population). Drainage re-validates the dest cap; if full now, the command is dropped (with a toast on the player side).

## State machine

`VillagerStatus` in `_lib/types.ts`. `stepVillager` in `_lib/villager.ts` is the only place that transitions between statuses. Keep it that way — adding ad-hoc transitions in tick.ts or UI handlers will silently break the queue logic.

`isBusy(v)` returns true for `moving | work_outbound | work_gather | work_inbound`. Queue commands only get assigned to non-busy villagers, which means `idle | arrived_pause | farming | work_pause` are the windows where a queued move can take effect.

## Tick order in `advance(state)`

```
clone → tick++
drainMoveQueues (player) → drainMoveQueues (rival)
tickVillagers (steps both player and rival villagers)
tickTrainings + completeTrainings
moveArmies
combat (army-vs-army, lairs, army-vs-building)
pruneDead (also evicts villagers from destroyed buildings)
killVillagersOnHostileTiles
rivalDecide
recomputePop / recomputeVisibility / pruneToasts
checkVictory
```

`advance` is pure — it deep-clones first and never mutates the input.

## Things you'd want to know that aren't obvious from the code

- **Food drain is intentionally disabled.** Two `consumeFood` calls in `tick.ts` are commented out, the function is left in place. Re-enable by uncommenting if upkeep economy is reintroduced.
- **Rival AI runs villagers via the same queue model as the player.** `aiAssignIdleVillagers` in `ai.ts` issues rival queue commands from townhall to understaffed producers; `rivalDecide` also picks producer types based on `rivalScarcestResource(state)`, defends with `tryDefendArmies` when player armies enter `RIVAL_DEFENSE_RANGE` of any rival building, and raids with HP-weighted target scoring. Rival villager pathing/gather logic is the *same* `stepVillager` code as the player.
- **Tile capacity is owner-scoped.** `occupantsAt(state, q, r, owner)` counts only villagers of that owner. Soldiers don't count toward tile cap on either side. If/when soldiers should respect capacity, extend `occupantsAt` to take owner+entity-type.
- **Save schema is breaking-changes-allowed.** Bump `SAVE_KEY` (`_lib/save.ts`) for any non-additive change to `GameState`. Old keys go in `LEGACY_KEYS` and are wiped on load. Don't write migrations — the user wipes saves between iterations.
- **`BUILDING_SPEC[type].pop` is the build-time pop reservation, not a worker cap.** The worker cap lives in `TILE_CAPACITY_BY_BUILDING[type]`. Don't display `pop` as "max workers" in UI.
- **Toasts:** push via `pushToast(state, text)` from `_lib/villager.ts`. They live on `state.notifications` (so they survive serialization / round-trip through React state), expire after `NOTIFICATION_TTL_TICKS`, and the overlay is a sibling div above the canvas in `Canvas.tsx`, not canvas-drawn.
- **Float icons (e.g. `+1 wood` over a building)** are Canvas-local, not in `GameState` — they're spawned by detecting status transitions when a new tick arrives (see `prevVillagerSnapshotRef` in `Canvas.tsx`).
- **Action hotkeys (`Q W E R`) are context-sensitive.** They only fire when a tile is selected. `Q` = train (townhall) / recruit (barracks). `W` = destroy (any non-townhall building). `E` = move 1 villager. `R` = move all villagers. Build-placement keys are unconditional: `Y` house, `X` farm, `C` lumber, `V` quarry, `B` iron_mine, `N` barracks, `M` watchtower. Right-click a tile = move 1 villager from selected tile to clicked tile; Shift+right-click = move all.
- **Camera state, drag state, hover, float icons, and prev-positions are all `useRef` in Canvas.** None of them belong in `GameState` and none are saved.
- **`stateRef` in `Game.tsx` is the source of truth for the rAF tick loop.** The `useState` mirror only exists so React re-renders. UI handlers that produce a new state must assign to *both* `stateRef.current` and `setState`.
- **Fog of war: `state.visible` is current sight, `state.explored` is memory.** `recordExplored` (in `tick.ts`) overwrites the per-tile snapshot every tick a tile is visible — so re-seeing a tile updates memory, while losing sight freezes the last snapshot. Memory stores stationary things only (tile type, building, construction, lair); entities and HP/pool/progress bars are visible-only. When adding new stationary map state, extend `ExploredTile` and `recordExplored` together.

## Verification

From the repo root, every change must pass:

```bash
npm run build   # zero type errors
npm test        # all vitest suites green (currently 149 tests across the repo)
```

For UI changes the canvas is not type-checked — run `npm run dev`, open `/projects/hex_kingdom`, and click around. The dev server is forgiving; the build is strict.

## Out of scope right now

- Multi-villager move commands (one move = one villager).
- Cancelling a queued command from the UI.
- Soldiers respecting tile capacity.
- Diplomacy, second rival, tier-2 buildings, sound. Add those later only if the core loop turns out fun.
