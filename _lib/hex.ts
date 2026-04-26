import type { HexCoord } from './types';

export const HEX_DIRS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

export function key(q: number, r: number): string {
  return `${q},${r}`;
}

export function keyOf(h: HexCoord): string {
  return `${h.q},${h.r}`;
}

export function equals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function neighbours(h: HexCoord): HexCoord[] {
  return HEX_DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function distance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function inBounds(h: HexCoord, width: number, height: number): boolean {
  return h.q >= 0 && h.q < width && h.r >= 0 && h.r < height;
}

export function axialToPixel(h: HexCoord, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r);
  const y = size * ((3 / 2) * h.r);
  return { x, y };
}

export function pixelToAxial(x: number, y: number, size: number): HexCoord {
  const qf = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const rf = ((2 / 3) * y) / size;
  return hexRound(qf, rf);
}

function hexRound(qf: number, rf: number): HexCoord {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  }
  return { q, r };
}

export function hexCorners(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return out;
}

export type PathOpts = {
  width: number;
  height: number;
  isBlocked: (h: HexCoord) => boolean;
};

export function findPath(
  start: HexCoord,
  goal: HexCoord,
  opts: PathOpts,
): HexCoord[] | null {
  if (equals(start, goal)) return [];
  const open: { node: HexCoord; f: number }[] = [{ node: start, f: 0 }];
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, HexCoord>();
  gScore.set(keyOf(start), 0);

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const { node: current } = open.splice(bestIdx, 1)[0];

    if (equals(current, goal)) {
      const path: HexCoord[] = [current];
      let cur = current;
      while (cameFrom.has(keyOf(cur))) {
        cur = cameFrom.get(keyOf(cur))!;
        path.unshift(cur);
      }
      path.shift();
      return path;
    }

    const currentG = gScore.get(keyOf(current)) ?? Infinity;
    for (const nb of neighbours(current)) {
      if (!inBounds(nb, opts.width, opts.height)) continue;
      if (!equals(nb, goal) && opts.isBlocked(nb)) continue;
      const tentative = currentG + 1;
      const prev = gScore.get(keyOf(nb)) ?? Infinity;
      if (tentative < prev) {
        cameFrom.set(keyOf(nb), current);
        gScore.set(keyOf(nb), tentative);
        const f = tentative + distance(nb, goal);
        const existing = open.find((o) => equals(o.node, nb));
        if (existing) existing.f = f;
        else open.push({ node: nb, f });
      }
    }
  }
  return null;
}
