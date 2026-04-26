import { MAP_HEIGHT, MAP_WIDTH, type GameState } from './types';

export const SAVE_KEY = 'hex_kingdom_save_v6';
const LEGACY_KEYS = [
  'hex_kingdom_save_v1',
  'hex_kingdom_save_v2',
  'hex_kingdom_save_v3',
  'hex_kingdom_save_v4',
  'hex_kingdom_save_v5',
];

export function loadSave(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    for (const k of LEGACY_KEYS) window.localStorage.removeItem(k);
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tiles)) return null;
    if (parsed.mapWidth !== MAP_WIDTH || parsed.mapHeight !== MAP_HEIGHT) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // quota or serialization error — ignore; the game just won't persist this tick
  }
}

export function clearSave(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
