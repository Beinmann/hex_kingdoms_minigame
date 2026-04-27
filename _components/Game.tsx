'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Canvas from './Canvas';
import EntityPanel from './EntityPanel';
import ResourceBar from './ResourceBar';
import SelectionPanel from './SelectionPanel';
import Sidebar from './Sidebar';
import { advance, cancelConstructionById } from '../_lib/tick';
import { createInitialState } from '../_lib/mapgen';
import { findPath, key } from '../_lib/hex';
import { issueMoveCommand, occupantsAt, pushToast } from '../_lib/villager';
import {
  BUILD_TICKS_BY_TYPE,
  BUILDING_SPEC,
  SOLDIER_COST,
  SOLDIER_POP,
  SOLDIER_TRAIN_TICKS,
  VIEWPORT_WIDTH,
  VILLAGER_COST,
  VILLAGER_POP,
  VILLAGER_TRAIN_TICKS,
  isImpassableTerrain,
  type BuildingType,
  type GameState,
  type Resources,
  type Selection,
} from '../_lib/types';

const TICK_MS = 1000;

function canAfford(res: Resources, cost: Partial<Resources>): boolean {
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if ((cost[k] ?? 0) > res[k]) return false;
  }
  return true;
}

function pay(res: Resources, cost: Partial<Resources>): void {
  for (const k of ['food', 'wood', 'stone', 'iron'] as const) {
    if (cost[k]) res[k] -= cost[k]!;
  }
}

function placeConstruction(
  state: GameState,
  type: BuildingType,
  q: number,
  r: number,
  sourceQ: number,
  sourceR: number,
): GameState | null {
  const spec = BUILDING_SPEC[type];
  const tile = state.tiles.find((t) => t.q === q && t.r === r);
  if (!tile || !spec.tiles.includes(tile.type)) return null;
  if (state.buildings.some((b) => b.q === q && b.r === r)) return null;
  if (state.constructions.some((c) => c.q === q && c.r === r)) return null;
  if (state.lairs.some((l) => l.q === q && l.r === r)) return null;
  if (state.armies.some((a) => a.q === q && a.r === r && a.owner !== 'player')) return null;
  if (!canAfford(state.player.resources, spec.cost)) return null;
  if (q === sourceQ && r === sourceR) return null;
  if (occupantsAt(state, sourceQ, sourceR, 'player') === 0) {
    const draft = JSON.parse(JSON.stringify(state)) as GameState;
    pushToast(draft, 'No villager on source tile.');
    return draft;
  }
  const next = JSON.parse(JSON.stringify(state)) as GameState;
  pay(next.player.resources, spec.cost);
  next.constructions.push({
    id: `pc_${state.nextId}`,
    type,
    owner: 'player',
    q,
    r,
    progress: 0,
    ticksRequired: BUILD_TICKS_BY_TYPE[type],
    idleTicks: 0,
  });
  next.nextId = state.nextId + 1;
  issueMoveCommand(next, sourceQ, sourceR, q, r, 'player');
  return next;
}

function cancelConstructionFor(state: GameState, q: number, r: number): GameState | null {
  const c = state.constructions.find((x) => x.q === q && x.r === r && x.owner === 'player');
  if (!c) return null;
  const next = JSON.parse(JSON.stringify(state)) as GameState;
  cancelConstructionById(next, c.id);
  return next;
}

function recruitAt(state: GameState, barracksId: string): GameState | null {
  const barracks = state.buildings.find((b) => b.id === barracksId);
  if (!barracks || barracks.owner !== 'player' || barracks.type !== 'barracks') return null;
  if (!canAfford(state.player.resources, SOLDIER_COST)) return null;
  if (state.player.pop + SOLDIER_POP > state.player.popCap) return null;
  const next: GameState = {
    ...state,
    player: { ...state.player, resources: { ...state.player.resources } },
  };
  pay(next.player.resources, SOLDIER_COST);
  next.trainings = [
    ...state.trainings,
    {
      id: `pt_${state.nextId}`,
      buildingId: barracksId,
      owner: 'player',
      kind: 'soldier',
      ticksLeft: SOLDIER_TRAIN_TICKS,
    },
  ];
  next.nextId = state.nextId + 1;
  return next;
}

function trainVillagerAt(state: GameState, thId: string): GameState | null {
  const th = state.buildings.find((b) => b.id === thId);
  if (!th || th.owner !== 'player' || th.type !== 'townhall') return null;
  if (!canAfford(state.player.resources, VILLAGER_COST)) return null;
  if (state.player.pop + VILLAGER_POP > state.player.popCap) return null;
  const next: GameState = {
    ...state,
    player: { ...state.player, resources: { ...state.player.resources } },
  };
  pay(next.player.resources, VILLAGER_COST);
  next.trainings = [
    ...state.trainings,
    {
      id: `pt_${state.nextId}`,
      buildingId: thId,
      owner: 'player',
      kind: 'villager',
      ticksLeft: VILLAGER_TRAIN_TICKS,
    },
  ];
  next.nextId = state.nextId + 1;
  return next;
}

function destroyBuilding(state: GameState, buildingId: string): GameState {
  const target = state.buildings.find((b) => b.id === buildingId);
  if (!target || target.owner !== 'player' || target.type === 'townhall') return state;
  const next = JSON.parse(JSON.stringify(state)) as GameState;
  // Evict villagers whose home was this tile back to their physical position.
  for (const v of next.villagers) {
    if (v.homeQ === target.q && v.homeR === target.r) {
      v.homeQ = v.q;
      v.homeR = v.r;
      v.status = 'idle';
      v.path = [];
      v.carrying = null;
      v.pauseTicksLeft = 0;
    }
  }
  const tk = key(target.q, target.r);
  delete next.tileQueuesByOwner.player[tk];
  delete next.tileQueuesByOwner.rival[tk];
  next.buildings = next.buildings.filter((b) => b.id !== buildingId);
  if (target.type === 'farm') {
    next.tiles = next.tiles.map((t) =>
      t.q === target.q && t.r === target.r ? { ...t, type: 'grass' as const } : t,
    );
  }
  return next;
}

function sendArmy(state: GameState, armyId: string, q: number, r: number): GameState | null {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || army.owner !== 'player') return null;
  const destTile = state.tiles.find((t) => t.q === q && t.r === r);
  if (!destTile || destTile.type === 'water') {
    const draft = JSON.parse(JSON.stringify(state)) as GameState;
    pushToast(draft, 'Cannot send army to that tile.');
    return draft;
  }
  if (isImpassableTerrain(destTile.type)) {
    const draft = JSON.parse(JSON.stringify(state)) as GameState;
    pushToast(draft, 'Armies cannot enter that terrain.');
    return draft;
  }
  const path = findPath(
    { q: army.q, r: army.r },
    { q, r },
    {
      width: state.mapWidth,
      height: state.mapHeight,
      isBlocked: (h) => {
        const tile = state.tiles.find((t) => t.q === h.q && t.r === h.r);
        return !tile || isImpassableTerrain(tile.type);
      },
    },
  );
  if (!path) {
    const draft = JSON.parse(JSON.stringify(state)) as GameState;
    pushToast(draft, 'No path to destination.');
    return draft;
  }
  return {
    ...state,
    armies: state.armies.map((a) => (a.id === armyId ? { ...a, path } : a)),
  };
}

function cancelArmy(state: GameState, armyId: string): GameState {
  return {
    ...state,
    armies: state.armies.map((a) => (a.id === armyId ? { ...a, path: [] } : a)),
  };
}

function tryIssueMove(
  state: GameState,
  srcQ: number,
  srcR: number,
  destQ: number,
  destR: number,
): GameState {
  const next = JSON.parse(JSON.stringify(state)) as GameState;
  issueMoveCommand(next, srcQ, srcR, destQ, destR);
  return next;
}

function tryIssueMoveAll(
  state: GameState,
  srcQ: number,
  srcR: number,
  destQ: number,
  destR: number,
): GameState {
  const next = JSON.parse(JSON.stringify(state)) as GameState;
  const nonBusy = next.villagers.filter(
    (v) =>
      v.owner === 'player' &&
      v.homeQ === srcQ &&
      v.homeR === srcR &&
      v.status !== 'moving' &&
      v.status !== 'work_outbound' &&
      v.status !== 'work_gather' &&
      v.status !== 'work_inbound',
  ).length;
  for (let i = 0; i < nonBusy; i++) {
    if (!issueMoveCommand(next, srcQ, srcR, destQ, destR)) break;
  }
  return next;
}

export default function Game() {
  const [state, setState] = useState<GameState>(() => createInitialState(1));
  const stateRef = useRef<GameState>(state);
  const [hydrated, setHydrated] = useState(false);

  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const selectionRef = useRef<Selection>(selection);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    const initial = createInitialState();
    stateRef.current = initial;
    setState(initial);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current && stateRef.current.phase === 'playing') {
        acc += dt;
        const tickInterval = TICK_MS / speedRef.current;
        while (acc >= tickInterval) {
          acc -= tickInterval;
          const next = advance(stateRef.current);
          stateRef.current = next;
          setState(next);
        }
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hydrated]);

  const handleSelectBuild = useCallback((b: BuildingType) => {
    setSelection((cur) => {
      if (cur.kind === 'build' && cur.building === b) return { kind: 'none' };
      if (cur.kind === 'build') return { ...cur, building: b };
      if (cur.kind === 'tile' || cur.kind === 'move_source') {
        return { kind: 'build', building: b, sticky: false, sourceQ: cur.q, sourceR: cur.r };
      }
      return cur;
    });
  }, []);

  const handleCancelSelection = useCallback(() => setSelection({ kind: 'none' }), []);

  const handleTogglePause = useCallback(() => setPaused((p) => !p), []);

  const handleSetSpeed = useCallback((s: number) => setSpeed(s), []);

  const handleRestart = useCallback(() => {
    const fresh = createInitialState();
    stateRef.current = fresh;
    setState(fresh);
    setSelection({ kind: 'none' });
    setPaused(false);
  }, []);

  const handleRecruit = useCallback((barracksId: string) => {
    const next = recruitAt(stateRef.current, barracksId);
    if (next) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const handleTrainVillager = useCallback((thId: string) => {
    const next = trainVillagerAt(stateRef.current, thId);
    if (next) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const handleDestroy = useCallback((buildingId: string) => {
    const next = destroyBuilding(stateRef.current, buildingId);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
      setSelection({ kind: 'none' });
    }
  }, []);

  const handleCancelConstruction = useCallback((q: number, r: number) => {
    const next = cancelConstructionFor(stateRef.current, q, r);
    if (next) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const handleSendArmy = useCallback((armyId: string) => {
    setSelection({ kind: 'send', armyId });
  }, []);

  const handleCancelArmy = useCallback((armyId: string) => {
    const next = cancelArmy(stateRef.current, armyId);
    stateRef.current = next;
    setState(next);
  }, []);

  const handleStartMove = useCallback((q: number, r: number) => {
    setSelection({ kind: 'move_source', q, r });
  }, []);

  const handleMoveAll = useCallback((q: number, r: number) => {
    setSelection({ kind: 'move_source', q, r, all: true });
  }, []);

  const handleSelectArmyTile = useCallback((q: number, r: number) => {
    setSelection({ kind: 'tile', q, r });
  }, []);

  const handleTileClick = useCallback(
    (q: number, r: number, shift: boolean) => {
      const cur = stateRef.current;
      if (selection.kind === 'build') {
        const next = placeConstruction(
          cur,
          selection.building,
          q,
          r,
          selection.sourceQ,
          selection.sourceR,
        );
        if (next) {
          stateRef.current = next;
          setState(next);
          if (!(shift || selection.sticky)) {
            setSelection({ kind: 'tile', q: selection.sourceQ, r: selection.sourceR });
          }
        }
        return;
      }
      if (selection.kind === 'send') {
        const next = sendArmy(cur, selection.armyId, q, r);
        if (next) {
          stateRef.current = next;
          setState(next);
        }
        setSelection({ kind: 'none' });
        return;
      }
      if (selection.kind === 'move_source') {
        const next = selection.all
          ? tryIssueMoveAll(cur, selection.q, selection.r, q, r)
          : tryIssueMove(cur, selection.q, selection.r, q, r);
        stateRef.current = next;
        setState(next);
        setSelection({ kind: 'tile', q: selection.q, r: selection.r });
        return;
      }
      setSelection({ kind: 'tile', q, r });
    },
    [selection],
  );

  const handleTileRightClick = useCallback((q: number, r: number, shift: boolean) => {
    const sel = selectionRef.current;
    const src =
      sel.kind === 'tile' || sel.kind === 'move_source'
        ? { q: sel.q, r: sel.r }
        : null;
    if (!src) return;
    if (src.q === q && src.r === r) return;
    const cur = stateRef.current;
    const next = shift
      ? tryIssueMoveAll(cur, src.q, src.r, q, r)
      : tryIssueMove(cur, src.q, src.r, q, r);
    stateRef.current = next;
    setState(next);
    setSelection({ kind: 'tile', q: src.q, r: src.r });
  }, []);

  const HOTKEY_TO_BUILDING: Record<string, BuildingType> = {
    y: 'house',
    x: 'farm',
    c: 'lumber',
    v: 'quarry',
    b: 'iron_mine',
    n: 'barracks',
    m: 'watchtower',
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        setSelection({ kind: 'none' });
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      const k = e.key.toLowerCase();
      const sel = selectionRef.current;
      const tileSel =
        sel.kind === 'tile' || sel.kind === 'move_source'
          ? { q: sel.q, r: sel.r }
          : null;
      if (tileSel) {
        const cur = stateRef.current;
        const buildingHere = cur.buildings.find(
          (b) => b.q === tileSel.q && b.r === tileSel.r && b.owner === 'player',
        );
        const constructionHere = cur.constructions.find(
          (c) => c.q === tileSel.q && c.r === tileSel.r && c.owner === 'player',
        );
        const playerVillagersHere = cur.villagers.some(
          (v) => v.owner === 'player' && v.homeQ === tileSel.q && v.homeR === tileSel.r,
        );
        if (k === 'q') {
          if (buildingHere?.type === 'townhall') {
            e.preventDefault();
            const next = trainVillagerAt(cur, buildingHere.id);
            if (next) {
              stateRef.current = next;
              setState(next);
            }
            return;
          }
          if (buildingHere?.type === 'barracks') {
            e.preventDefault();
            const next = recruitAt(cur, buildingHere.id);
            if (next) {
              stateRef.current = next;
              setState(next);
            }
            return;
          }
        }
        if (k === 'w') {
          if (constructionHere) {
            e.preventDefault();
            const next = cancelConstructionFor(cur, tileSel.q, tileSel.r);
            if (next) {
              stateRef.current = next;
              setState(next);
              setSelection({ kind: 'none' });
            }
            return;
          }
          if (buildingHere && buildingHere.type !== 'townhall') {
            e.preventDefault();
            const next = destroyBuilding(cur, buildingHere.id);
            if (next !== cur) {
              stateRef.current = next;
              setState(next);
              setSelection({ kind: 'none' });
            }
            return;
          }
        }
        if (k === 'e' && playerVillagersHere) {
          e.preventDefault();
          setSelection({ kind: 'move_source', q: tileSel.q, r: tileSel.r });
          return;
        }
        if (k === 'r' && playerVillagersHere) {
          e.preventDefault();
          setSelection({ kind: 'move_source', q: tileSel.q, r: tileSel.r, all: true });
          return;
        }
        if (k === 't') {
          const armyHere = cur.armies.find(
            (a) => a.q === tileSel.q && a.r === tileSel.r && a.owner === 'player',
          );
          if (armyHere) {
            e.preventDefault();
            setSelection({ kind: 'send', armyId: armyHere.id });
            return;
          }
        }
      }
      const t = HOTKEY_TO_BUILDING[k];
      if (t) {
        e.preventDefault();
        const sticky = e.shiftKey;
        const sel = selectionRef.current;
        if (sel.kind === 'build') {
          setSelection({ ...sel, building: t, sticky });
        } else if (sel.kind === 'tile' || sel.kind === 'move_source') {
          setSelection({ kind: 'build', building: t, sticky, sourceQ: sel.q, sourceR: sel.r });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex gap-6 items-start flex-wrap">
      <div className="space-y-4">
        <ResourceBar resources={state.player.resources} />
        <div className="rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 inline-block">
          <Canvas
            state={state}
            selection={selection}
            tickMs={TICK_MS / speed}
            onTileClick={handleTileClick}
            onTileRightClick={handleTileRightClick}
          />
        </div>
        <div className="flex gap-4 items-start" style={{ width: VIEWPORT_WIDTH }}>
          <SelectionPanel
            state={state}
            selection={selection}
            tickMs={TICK_MS / speed}
            onCancelSelection={handleCancelSelection}
            onRecruit={handleRecruit}
            onTrainVillager={handleTrainVillager}
            onDestroy={handleDestroy}
            onCancelConstruction={handleCancelConstruction}
          />
          <EntityPanel
            state={state}
            selection={selection}
            onStartMove={handleStartMove}
            onMoveAll={handleMoveAll}
            onSelectBuild={handleSelectBuild}
            onSendArmy={handleSendArmy}
            onCancelArmy={handleCancelArmy}
          />
        </div>
      </div>
      <Sidebar
        state={state}
        paused={paused}
        speed={speed}
        onTogglePause={handleTogglePause}
        onSetSpeed={handleSetSpeed}
        onRestart={handleRestart}
        onSelectArmyTile={handleSelectArmyTile}
      />
    </div>
  );
}
