/**
 * Save system: 3 slots in localStorage + a code/file export. Never throws: storage failures fall
 * back to memory.
 */
import type { EnemyKind, TowerKind } from '../sim/defs';

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
const KEY = (slot: number) => `fortissimo.save.${slot}`;
const LAST = 'fortissimo.lastSlot';

export interface LevelRecord {
  stars: number;
  /** Virtuoso challenge beaten */
  crown?: boolean;
  /** best endless waves */
  best?: number;
}

export interface SaveData {
  version: number;
  slot: number;
  created: number;
  updated: number;
  playTime: number;
  levels: Record<string, LevelRecord>;
  knownTowers: TowerKind[];
  seenEnemies: EnemyKind[];
  /** story beats already shown */
  flags: Record<string, boolean>;
  /** last level played (map focus) */
  current: string;
}

export function newSave(slot: number): SaveData {
  const now = Date.now();
  return { version: SAVE_VERSION, slot, created: now, updated: now, playTime: 0, levels: {}, knownTowers: [], seenEnemies: [], flags: {}, current: 'm1' };
}

const memory = new Map<string, string>();
function store(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__ff_probe', '1');
    s.removeItem('__ff_probe');
    return s;
  } catch {
    return null;
  }
}
function getItem(k: string): string | null {
  try {
    return store()?.getItem(k) ?? memory.get(k) ?? null;
  } catch {
    return memory.get(k) ?? null;
  }
}
function setItem(k: string, v: string): boolean {
  memory.set(k, v);
  try {
    const s = store();
    if (!s) return false;
    s.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

export function validate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (typeof d.version !== 'number' || typeof d.levels !== 'object' || d.levels === null) return null;
  const base = newSave(typeof d.slot === 'number' ? d.slot : 0);
  return {
    ...base,
    ...d,
    levels: d.levels ?? {},
    knownTowers: Array.isArray(d.knownTowers) ? d.knownTowers : [],
    seenEnemies: Array.isArray(d.seenEnemies) ? d.seenEnemies : [],
    flags: d.flags ?? {},
  } as SaveData;
}

export function loadSlot(slot: number): SaveData | null {
  const raw = getItem(KEY(slot));
  if (!raw) return null;
  try {
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSlot(d: SaveData): boolean {
  d.updated = Date.now();
  const ok = setItem(KEY(d.slot), JSON.stringify(d));
  setItem(LAST, String(d.slot));
  return ok;
}

export function deleteSlot(slot: number) {
  memory.delete(KEY(slot));
  try {
    store()?.removeItem(KEY(slot));
  } catch {
    /* ignore */
  }
}

export function lastSlot(): number | null {
  const v = getItem(LAST);
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT && loadSlot(n) ? n : null;
}

export function listSlots(): { slot: number; data: SaveData | null; stars: number }[] {
  const out: { slot: number; data: SaveData | null; stars: number }[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const d = loadSlot(i);
    out.push({ slot: i, data: d, stars: d ? Object.values(d.levels).reduce((a, r) => a + (r.stars ?? 0), 0) : 0 });
  }
  return out;
}

/** Text code for copying a save between devices. */
export function saveToCode(d: SaveData): string {
  const json = JSON.stringify(d);
  return 'FF1:' + btoa(unescape(encodeURIComponent(json)));
}

export function saveFromCode(code: string): SaveData | null {
  const c = code.trim();
  try {
    const body = c.startsWith('FF1:') ? c.slice(4) : c;
    const json = c.startsWith('{') ? c : decodeURIComponent(escape(atob(body)));
    return validate(JSON.parse(json));
  } catch {
    return null;
  }
}

export function exportFile(d: SaveData) {
  const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fortissimo-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
