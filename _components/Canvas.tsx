'use client';

import { useEffect, useMemo, useRef } from 'react';
import { axialToPixel, hexCorners, keyOf, pixelToAxial } from '../_lib/hex';
import { capacityOf, occupantsAt } from '../_lib/villager';
import {
  BUILDING_SPEC,
  CAMERA_PAN_SPEED,
  EDGE_SCROLL_PX,
  EXTRACTOR_RADIUS,
  MAP_HEIGHT,
  MAP_WIDTH,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  type BuildingType,
  type GameState,
  type Selection,
  type TileType,
  type Villager,
} from '../_lib/types';

export const HEX_SIZE = 26;
const WORLD_PAD = 28;

const TILE_COLOURS: Record<TileType, string> = {
  grass: '#4f7f3f',
  forest: '#2f5a30',
  hill: '#8c7a4a',
  mountain: '#6b6f76',
  water: '#2e6c92',
  farm: '#c8a64a',
};

const BUILDING_GLYPHS: Record<BuildingType, string> = {
  townhall: '★',
  house: '⌂',
  farm: '🌾',
  lumber: '🌲',
  quarry: '⛏',
  iron_mine: '⛰',
  barracks: '⚔',
  watchtower: '♜',
};

type Props = {
  state: GameState;
  selection: Selection;
  tickMs: number;
  onTileClick: (q: number, r: number, shift: boolean) => void;
};

type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number };

type FloatIcon = {
  id: number;
  x: number;
  y: number;
  kind: 'food' | 'wood' | 'stone' | 'iron';
  startedAt: number;
};

const FLOAT_ICON_TTL_MS = 900;
const ICON_CHARS: Record<FloatIcon['kind'], string> = {
  food: '🌾',
  wood: '🪵',
  stone: '🪨',
  iron: '⛓',
};

function computeWorldBounds(): WorldBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let q = 0; q < MAP_WIDTH; q++) {
      const { x, y } = axialToPixel({ q, r }, HEX_SIZE);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const hexW = HEX_SIZE * Math.sqrt(3);
  const hexH = HEX_SIZE * 2;
  return {
    minX: minX - hexW / 2 - WORLD_PAD,
    minY: minY - hexH / 2 - WORLD_PAD,
    maxX: maxX + hexW / 2 + WORLD_PAD,
    maxY: maxY + hexH / 2 + WORLD_PAD,
  };
}

function clampCamera(cam: { x: number; y: number }, bounds: WorldBounds): { x: number; y: number } {
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  const maxX = bounds.maxX - VIEWPORT_WIDTH;
  const maxY = bounds.maxY - VIEWPORT_HEIGHT;
  const x = worldW <= VIEWPORT_WIDTH
    ? bounds.minX + (worldW - VIEWPORT_WIDTH) / 2
    : Math.max(bounds.minX, Math.min(maxX, cam.x));
  const y = worldH <= VIEWPORT_HEIGHT
    ? bounds.minY + (worldH - VIEWPORT_HEIGHT) / 2
    : Math.max(bounds.minY, Math.min(maxY, cam.y));
  return { x, y };
}

function drawHexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const pts = hexCorners(cx, cy, HEX_SIZE);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function ownerFill(owner: 'player' | 'rival' | 'neutral'): string {
  if (owner === 'player') return '#1d4ed8';
  if (owner === 'rival') return '#b91c1c';
  return '#374151';
}

// Offsets within a tile for clustering dots when multiple villagers share the same tile.
const CLUSTER_OFFSETS: { x: number; y: number }[][] = [
  [{ x: 0, y: 0 }],
  [
    { x: -0.28, y: 0 },
    { x: 0.28, y: 0 },
  ],
  [
    { x: 0, y: -0.3 },
    { x: -0.28, y: 0.18 },
    { x: 0.28, y: 0.18 },
  ],
  [
    { x: -0.28, y: -0.2 },
    { x: 0.28, y: -0.2 },
    { x: -0.28, y: 0.2 },
    { x: 0.28, y: 0.2 },
  ],
  [
    { x: 0, y: 0 },
    { x: -0.32, y: -0.22 },
    { x: 0.32, y: -0.22 },
    { x: -0.32, y: 0.22 },
    { x: 0.32, y: 0.22 },
  ],
];

function clusterOffset(idx: number, total: number): { x: number; y: number } {
  if (total <= 0) return { x: 0, y: 0 };
  const layout = CLUSTER_OFFSETS[Math.min(total, CLUSTER_OFFSETS.length) - 1];
  return layout[idx % layout.length];
}

export default function Canvas({ state, selection, tickMs, onTileClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const selectionRef = useRef(selection);
  const tickMsRef = useRef(tickMs);
  const bounds = useMemo(() => computeWorldBounds(), []);
  const cameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraInitedRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const mouseInsideRef = useRef(false);
  const prevPositionsRef = useRef<Map<string, { q: number; r: number }>>(new Map());
  const tickStartAtRef = useRef(performance.now());
  const hoverTileRef = useRef<{ q: number; r: number } | null>(null);
  const floatIconsRef = useRef<FloatIcon[]>([]);
  const floatIconIdRef = useRef(0);
  const prevVillagerSnapshotRef = useRef<Map<string, Villager>>(new Map());

  useEffect(() => {
    const prev = stateRef.current;
    if (state.tick !== prev.tick) {
      const positions = new Map<string, { q: number; r: number }>();
      for (const v of prev.villagers) positions.set(v.id, { q: v.q, r: v.r });
      for (const a of prev.armies) positions.set(a.id, { q: a.q, r: a.r });
      prevPositionsRef.current = positions;
      tickStartAtRef.current = performance.now();
      // Spawn float icons for transitions: deposits and farm production.
      const prevById = prevVillagerSnapshotRef.current;
      for (const v of state.villagers) {
        const before = prevById.get(v.id);
        if (!before) continue;
        // Deposit: previous status was work_inbound and now work_pause (or carrying gone).
        if (
          before.status === 'work_inbound' &&
          (v.status === 'work_pause' || v.status === 'idle')
        ) {
          const home = state.buildings.find((b) => b.q === v.homeQ && b.r === v.homeR);
          if (home && before.carrying) {
            const px = axialToPixel({ q: home.q, r: home.r }, HEX_SIZE);
            floatIconsRef.current.push({
              id: floatIconIdRef.current++,
              x: px.x,
              y: px.y,
              kind: before.carrying.resource as FloatIcon['kind'],
              startedAt: performance.now(),
            });
          }
        }
        // Farming: each tick a 'farming' villager produces food.
        if (v.status === 'farming') {
          const px = axialToPixel({ q: v.homeQ, r: v.homeR }, HEX_SIZE);
          floatIconsRef.current.push({
            id: floatIconIdRef.current++,
            x: px.x + (Math.random() - 0.5) * HEX_SIZE * 0.4,
            y: px.y,
            kind: 'food',
            startedAt: performance.now(),
          });
        }
      }
      const snap = new Map<string, Villager>();
      for (const v of state.villagers) snap.set(v.id, { ...v });
      prevVillagerSnapshotRef.current = snap;
    }
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    tickMsRef.current = tickMs;
  }, [tickMs]);

  useEffect(() => {
    if (cameraInitedRef.current) return;
    const playerTh = state.buildings.find((b) => b.owner === 'player' && b.type === 'townhall');
    if (!playerTh) return;
    const { x, y } = axialToPixel({ q: playerTh.q, r: playerTh.r }, HEX_SIZE);
    cameraRef.current = clampCamera(
      { x: x - VIEWPORT_WIDTH / 2, y: y - VIEWPORT_HEIGHT / 2 },
      bounds,
    );
    cameraInitedRef.current = true;
  }, [state.buildings, bounds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
        keysRef.current.add(k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    const onBlur = () => keysRef.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (cvs.width !== VIEWPORT_WIDTH * dpr || cvs.height !== VIEWPORT_HEIGHT * dpr) {
      cvs.width = VIEWPORT_WIDTH * dpr;
      cvs.height = VIEWPORT_HEIGHT * dpr;
    }

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      const mouse = mousePosRef.current;
      if (mouseInsideRef.current && mouse) {
        if (mouse.x < EDGE_SCROLL_PX) dx -= 1;
        else if (mouse.x > VIEWPORT_WIDTH - EDGE_SCROLL_PX) dx += 1;
        if (mouse.y < EDGE_SCROLL_PX) dy -= 1;
        else if (mouse.y > VIEWPORT_HEIGHT - EDGE_SCROLL_PX) dy += 1;
      }
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        cameraRef.current = clampCamera(
          {
            x: cameraRef.current.x + (dx / len) * CAMERA_PAN_SPEED * dt,
            y: cameraRef.current.y + (dy / len) * CAMERA_PAN_SPEED * dt,
          },
          bounds,
        );
      }

      // Prune expired float icons.
      const cutoff = now - FLOAT_ICON_TTL_MS;
      floatIconsRef.current = floatIconsRef.current.filter((i) => i.startedAt >= cutoff);

      drawScene(ctx, dpr);
      raf = requestAnimationFrame(loop);
    };

    const drawScene = (ctx: CanvasRenderingContext2D, dpr: number): void => {
      const cur = stateRef.current;
      const sel = selectionRef.current;
      const cam = cameraRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      ctx.translate(-cam.x, -cam.y);

      for (const tile of cur.tiles) {
        const { x, y } = axialToPixel({ q: tile.q, r: tile.r }, HEX_SIZE);
        if (x < cam.x - HEX_SIZE * 2 || x > cam.x + VIEWPORT_WIDTH + HEX_SIZE * 2) continue;
        if (y < cam.y - HEX_SIZE * 2 || y > cam.y + VIEWPORT_HEIGHT + HEX_SIZE * 2) continue;
        const visible = cur.visible[keyOf(tile)];
        drawHexPath(ctx, x, y);
        ctx.fillStyle = visible ? TILE_COLOURS[tile.type] : '#111';
        ctx.fill();
        ctx.strokeStyle = visible ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (visible && tile.pool !== undefined && tile.maxPool && tile.pool < tile.maxPool) {
          const w = HEX_SIZE * 0.7;
          const h = 2;
          const x0 = x - w / 2;
          const y0 = y - HEX_SIZE * 0.75;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(x0, y0, w, h);
          ctx.fillStyle = '#fef3c7';
          ctx.fillRect(x0, y0, w * (tile.pool / tile.maxPool), h);
        }
      }

      for (const lair of cur.lairs) {
        if (!cur.visible[keyOf(lair)]) continue;
        const { x: cx, y: cy } = axialToPixel({ q: lair.q, r: lair.r }, HEX_SIZE);
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx, cy, HEX_SIZE * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f3f4f6';
        ctx.font = `${Math.round(HEX_SIZE * 0.7)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☠', cx, cy + 1);
        ctx.fillStyle = '#fbbf24';
        ctx.font = `${Math.round(HEX_SIZE * 0.4)}px sans-serif`;
        ctx.fillText(String(lair.garrison), cx, cy + HEX_SIZE * 0.6);
      }

      for (const b of cur.buildings) {
        if (!cur.visible[keyOf(b)]) continue;
        const { x: cx, y: cy } = axialToPixel({ q: b.q, r: b.r }, HEX_SIZE);
        if (b.type === 'farm') {
          // Farm doesn't draw a big building disc — the tile is already coloured.
        } else {
          ctx.fillStyle = ownerFill(b.owner);
          ctx.beginPath();
          ctx.arc(cx, cy, HEX_SIZE * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.round(HEX_SIZE * 0.6)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(BUILDING_GLYPHS[b.type], cx, cy + 1);
        }
        const maxHp = BUILDING_SPEC[b.type].hp;
        if (b.hp < maxHp) {
          const w = HEX_SIZE * 0.9;
          const h = 3;
          const x0 = cx - w / 2;
          const y0 = cy + HEX_SIZE * 0.6;
          ctx.fillStyle = '#222';
          ctx.fillRect(x0, y0, w, h);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(x0, y0, w * (b.hp / maxHp), h);
        }
      }

      // Villagers — cluster by current physical position so dots don't overlap.
      const tweenProgress = Math.min(1, (performance.now() - tickStartAtRef.current) / tickMsRef.current);
      const prevPositions = prevPositionsRef.current;
      const visibleVillagers = cur.villagers.filter((v) => cur.visible[keyOf(v)]);
      const clusters = new Map<string, Villager[]>();
      for (const v of visibleVillagers) {
        const k = keyOf(v);
        const arr = clusters.get(k);
        if (arr) arr.push(v);
        else clusters.set(k, [v]);
      }
      for (const [, group] of clusters) {
        for (let i = 0; i < group.length; i++) {
          const v = group[i];
          const offset = clusterOffset(i, group.length);
          const prev = prevPositions.get(v.id) ?? { q: v.q, r: v.r };
          const a = axialToPixel(prev, HEX_SIZE);
          const b = axialToPixel({ q: v.q, r: v.r }, HEX_SIZE);
          const cx = a.x + (b.x - a.x) * tweenProgress + offset.x * HEX_SIZE;
          const cy = a.y + (b.y - a.y) * tweenProgress + offset.y * HEX_SIZE;
          ctx.fillStyle = v.owner === 'player' ? '#93c5fd' : '#fca5a5';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, HEX_SIZE * 0.16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (v.carrying) {
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(cx + HEX_SIZE * 0.13, cy - HEX_SIZE * 0.13, HEX_SIZE * 0.06, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Occupancy badge — small number per tile that has player villagers calling it home.
      const homeCounts = new Map<string, number>();
      for (const v of cur.villagers) {
        if (v.owner !== 'player') continue;
        const k = `${v.homeQ},${v.homeR}`;
        homeCounts.set(k, (homeCounts.get(k) ?? 0) + 1);
      }
      ctx.font = `bold ${Math.round(HEX_SIZE * 0.36)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      for (const [k, count] of homeCounts) {
        const [qStr, rStr] = k.split(',');
        const q = Number(qStr);
        const r = Number(rStr);
        if (!cur.visible[`${q},${r}`]) continue;
        const cap = capacityOf(cur, q, r);
        const { x, y } = axialToPixel({ q, r }, HEX_SIZE);
        const tx = x + HEX_SIZE * 0.65;
        const ty = y - HEX_SIZE * 0.85;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(tx - HEX_SIZE * 0.18, ty + HEX_SIZE * 0.22, HEX_SIZE * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = count > cap ? '#fca5a5' : '#e5e7eb';
        ctx.fillText(`${count}/${cap}`, tx, ty);
      }

      // Armies.
      for (const army of cur.armies) {
        if (!cur.visible[keyOf(army)]) continue;
        const prev = prevPositions.get(army.id) ?? { q: army.q, r: army.r };
        const aPx = axialToPixel(prev, HEX_SIZE);
        const bPx = axialToPixel({ q: army.q, r: army.r }, HEX_SIZE);
        const cx = aPx.x + (bPx.x - aPx.x) * tweenProgress;
        const cy = aPx.y + (bPx.y - aPx.y) * tweenProgress;
        ctx.fillStyle = ownerFill(army.owner);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + HEX_SIZE * 0.35, cy - HEX_SIZE * 0.35, HEX_SIZE * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(HEX_SIZE * 0.45)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(army.soldiers), cx + HEX_SIZE * 0.35, cy - HEX_SIZE * 0.33);
        if (army.path.length > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          for (const step of army.path) {
            const { x: nx, y: ny } = axialToPixel({ q: step.q, r: step.r }, HEX_SIZE);
            ctx.lineTo(nx, ny);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Float icons (resource production indicators).
      const nowMs = performance.now();
      for (const icon of floatIconsRef.current) {
        const t = (nowMs - icon.startedAt) / FLOAT_ICON_TTL_MS;
        if (t < 0 || t > 1) continue;
        const alpha = 1 - t;
        const lift = HEX_SIZE * 0.7 * t;
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.round(HEX_SIZE * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(ICON_CHARS[icon.kind], icon.x, icon.y - lift - HEX_SIZE * 0.5);
        ctx.globalAlpha = 1;
      }

      // Selected tile highlight.
      if (sel.kind === 'tile') {
        const { x: cx, y: cy } = axialToPixel({ q: sel.q, r: sel.r }, HEX_SIZE);
        drawHexPath(ctx, cx, cy);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Move-source highlight + destination tinting.
      if (sel.kind === 'move_source') {
        const { x: cx, y: cy } = axialToPixel({ q: sel.q, r: sel.r }, HEX_SIZE);
        drawHexPath(ctx, cx, cy);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        const hover = hoverTileRef.current;
        if (hover) {
          const occDest = occupantsAt(cur, hover.q, hover.r, 'player');
          const cap = capacityOf(cur, hover.q, hover.r);
          const tile = cur.tiles.find((t) => t.q === hover.q && t.r === hover.r);
          const ok = tile && tile.type !== 'water' && occDest < cap;
          const { x: hx, y: hy } = axialToPixel(hover, HEX_SIZE);
          drawHexPath(ctx, hx, hy);
          ctx.strokeStyle = ok ? '#22c55e' : '#dc2626';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Build hover preview.
      if (sel.kind === 'build' && hoverTileRef.current) {
        const spec = BUILDING_SPEC[sel.building];
        if (spec.worksOn) {
          const hover = hoverTileRef.current;
          const { x: cx, y: cy } = axialToPixel(hover, HEX_SIZE);
          ctx.beginPath();
          ctx.arc(cx, cy, HEX_SIZE * (Math.sqrt(3) * EXTRACTOR_RADIUS + 0.5), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(253,224,71,0.06)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(253,224,71,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        const hover = hoverTileRef.current;
        const { x: cx, y: cy } = axialToPixel(hover, HEX_SIZE);
        drawHexPath(ctx, cx, cy);
        ctx.strokeStyle = spec.tiles.includes((cur.tiles.find((t) => t.q === hover.q && t.r === hover.r)?.type ?? 'water') as TileType) ? '#22c55e' : '#dc2626';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bounds]);

  const screenToAxial = (clientX: number, clientY: number): { q: number; r: number } | null => {
    const cvs = canvasRef.current;
    if (!cvs) return null;
    const rect = cvs.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cam = cameraRef.current;
    const wx = sx + cam.x;
    const wy = sy + cam.y;
    const { q, r } = pixelToAxial(wx, wy, HEX_SIZE);
    if (q < 0 || q >= MAP_WIDTH || r < 0 || r >= MAP_HEIGHT) return null;
    return { q, r };
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const hit = screenToAxial(e.clientX, e.clientY);
    if (!hit) return;
    onTileClick(hit.q, hit.r, e.shiftKey);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y };
    const hit = screenToAxial(e.clientX, e.clientY);
    hoverTileRef.current = hit;
  };

  const handleEnter = () => {
    mouseInsideRef.current = true;
  };

  const handleLeave = () => {
    mouseInsideRef.current = false;
    mousePosRef.current = null;
    hoverTileRef.current = null;
  };

  return (
    <div style={{ position: 'relative', width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          display: 'block',
          borderRadius: 8,
          cursor:
            selection.kind === 'build' || selection.kind === 'send' || selection.kind === 'move_source'
              ? 'crosshair'
              : 'pointer',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'flex-end',
          maxWidth: 280,
        }}
      >
        {state.notifications.map((n) => (
          <div
            key={n.id}
            style={{
              background: 'rgba(15,23,42,0.85)',
              color: '#fde68a',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 12,
              border: '1px solid rgba(245,158,11,0.4)',
            }}
          >
            {n.text}
          </div>
        ))}
      </div>
    </div>
  );
}
