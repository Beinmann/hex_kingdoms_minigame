'use client';

import { useEffect, useMemo, useRef } from 'react';
import { axialToPixel, hexCorners, keyOf, pixelToAxial } from '../_lib/hex';
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
} from '../_lib/types';

export const HEX_SIZE = 26;
const WORLD_PAD = 28;

const TILE_COLOURS: Record<TileType, string> = {
  grass: '#4f7f3f',
  forest: '#2f5a30',
  hill: '#8c7a4a',
  mountain: '#6b6f76',
  water: '#2e6c92',
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
  onRectSelect: (villagerIds: string[]) => void;
  onTileHover?: (q: number | null, r: number | null) => void;
};

type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number };

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

export default function Canvas({ state, selection, tickMs, onTileClick, onRectSelect, onTileHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const selectionRef = useRef(selection);
  const onHoverRef = useRef(onTileHover);
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
  const dragRef = useRef<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const onRectSelectRef = useRef(onRectSelect);
  useEffect(() => {
    onRectSelectRef.current = onRectSelect;
  }, [onRectSelect]);

  useEffect(() => {
    const prev = stateRef.current;
    if (state.tick !== prev.tick) {
      const positions = new Map<string, { q: number; r: number }>();
      for (const v of prev.villagers) positions.set(v.id, { q: v.q, r: v.r });
      for (const a of prev.armies) positions.set(a.id, { q: a.q, r: a.r });
      prevPositionsRef.current = positions;
      tickStartAtRef.current = performance.now();
    }
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    onHoverRef.current = onTileHover;
  }, [onTileHover]);
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
        ctx.fillStyle = ownerFill(b.owner);
        ctx.beginPath();
        ctx.arc(cx, cy, HEX_SIZE * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(HEX_SIZE * 0.7)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(BUILDING_GLYPHS[b.type], cx, cy + 1);
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

      const tweenProgress = Math.min(1, (performance.now() - tickStartAtRef.current) / tickMsRef.current);
      const prevPositions = prevPositionsRef.current;

      for (const v of cur.villagers) {
        if (!cur.visible[keyOf(v)]) continue;
        const prev = prevPositions.get(v.id) ?? { q: v.q, r: v.r };
        const a = axialToPixel(prev, HEX_SIZE);
        const b = axialToPixel({ q: v.q, r: v.r }, HEX_SIZE);
        const cx = a.x + (b.x - a.x) * tweenProgress;
        const cy = a.y + (b.y - a.y) * tweenProgress;
        ctx.fillStyle = v.owner === 'player' ? '#93c5fd' : '#fca5a5';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, HEX_SIZE * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (v.carrying) {
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(cx + HEX_SIZE * 0.15, cy - HEX_SIZE * 0.15, HEX_SIZE * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      }

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

      if (sel.kind === 'tile') {
        const { x: cx, y: cy } = axialToPixel({ q: sel.q, r: sel.r }, HEX_SIZE);
        drawHexPath(ctx, cx, cy);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const drag = dragRef.current;
      if (drag) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const x = Math.min(drag.start.x, drag.current.x);
        const y = Math.min(drag.start.y, drag.current.y);
        const w = Math.abs(drag.current.x - drag.start.x);
        const h = Math.abs(drag.current.y - drag.start.y);
        ctx.fillStyle = 'rgba(96,165,250,0.12)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(96,165,250,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.translate(-cam.x, -cam.y);
      }

      if (sel.kind === 'rect_select') {
        for (const id of sel.villagerIds) {
          const vlg = cur.villagers.find((vv) => vv.id === id);
          if (!vlg) continue;
          const prev = prevPositions.get(vlg.id) ?? { q: vlg.q, r: vlg.r };
          const a = axialToPixel(prev, HEX_SIZE);
          const b = axialToPixel({ q: vlg.q, r: vlg.r }, HEX_SIZE);
          const cx = a.x + (b.x - a.x) * tweenProgress;
          const cy = a.y + (b.y - a.y) * tweenProgress;
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, HEX_SIZE * 0.26, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (sel.kind === 'transfer_source') {
        const src = cur.buildings.find((b) => b.id === sel.buildingId);
        if (src) {
          const { x: cx, y: cy } = axialToPixel({ q: src.q, r: src.r }, HEX_SIZE);
          ctx.beginPath();
          ctx.arc(cx, cy, HEX_SIZE * 0.7, 0, Math.PI * 2);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

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

  const screenToWorld = (clientX: number, clientY: number): { wx: number; wy: number } | null => {
    const cvs = canvasRef.current;
    if (!cvs) return null;
    const rect = cvs.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cam = cameraRef.current;
    return { wx: sx + cam.x, wy: sy + cam.y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    if (e.button !== 0) return;
    const sel = selectionRef.current;
    if (sel.kind === 'build' || sel.kind === 'send' || sel.kind === 'transfer_source') return;
    const rect = cvs.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragRef.current = { start: { x, y }, current: { x, y } };
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    if (e.button !== 0) {
      dragRef.current = null;
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) {
      const dx = drag.current.x - drag.start.x;
      const dy = drag.current.y - drag.start.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= 16) {
        const cam = cameraRef.current;
        const x0 = Math.min(drag.start.x, drag.current.x) + cam.x;
        const x1 = Math.max(drag.start.x, drag.current.x) + cam.x;
        const y0 = Math.min(drag.start.y, drag.current.y) + cam.y;
        const y1 = Math.max(drag.start.y, drag.current.y) + cam.y;
        const cur = stateRef.current;
        const ids: string[] = [];
        for (const v of cur.villagers) {
          if (v.owner !== 'player') continue;
          const { x, y } = axialToPixel({ q: v.q, r: v.r }, HEX_SIZE);
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) ids.push(v.id);
        }
        if (onRectSelectRef.current) onRectSelectRef.current(ids);
        return;
      }
    }
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
    if (dragRef.current) {
      dragRef.current.current = { x, y };
    }
    const hit = screenToAxial(e.clientX, e.clientY);
    hoverTileRef.current = hit;
    if (!onHoverRef.current) return;
    if (!hit) onHoverRef.current(null, null);
    else onHoverRef.current(hit.q, hit.r);
  };

  const handleEnter = () => {
    mouseInsideRef.current = true;
  };

  const handleLeave = () => {
    mouseInsideRef.current = false;
    mousePosRef.current = null;
    hoverTileRef.current = null;
    if (onHoverRef.current) onHoverRef.current(null, null);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        display: 'block',
        borderRadius: 8,
        cursor:
          selection.kind === 'build' || selection.kind === 'send' || selection.kind === 'transfer_source'
            ? 'crosshair'
            : 'pointer',
      }}
    />
  );
}
