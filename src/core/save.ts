/**
 * Save system: 3 slots in localStorage + a code/file export. Never throws: storage failures fall
 * back to memory.
 */
import type { EnemyKind, TowerKind } from '../sim/defs';
import type { Checkpoint } from '../sim/journey';

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
  /**
   * v2: after a defeat, where each journey can start again (the latest one per level; a win clears
   * it). Local to this device: not part of export codes and files.
   */
  checkpoints: Record<string, Checkpoint>;
}

export function newSave(slot: number): SaveData {
  const now = Date.now();
  return { version: SAVE_VERSION, slot, created: now, updated: now, playTime: 0, levels: {}, knownTowers: [], seenEnemies: [], flags: {}, current: 'm1', checkpoints: {} };
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
    checkpoints: validCheckpoints(d.checkpoints),
  } as SaveData;
}

const ACTIONS = new Set(['build', 'upgrade', 'sell', 'collect', 'ff', 'go']);

/** keeps only well-formed checkpoints (a broken one would replay a different journey) */
function validCheckpoints(raw: unknown): Record<string, Checkpoint> {
  const out: Record<string, Checkpoint> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, c] of Object.entries(raw as Record<string, unknown>)) {
    const cp = c as Partial<Checkpoint> | null;
    if (!cp || typeof cp !== 'object' || cp.id !== id || typeof cp.mode !== 'string' || typeof cp.sub !== 'number' || typeof cp.movement !== 'number' || typeof cp.total !== 'number') continue;
    if (!Array.isArray(cp.actions) || !cp.actions.every((a) => a && typeof a === 'object' && typeof a.sub === 'number' && ACTIONS.has(a.a))) continue;
    out[id] = cp as Checkpoint;
  }
  return out;
}

/** after a battle: remember where a fallen journey can start again (or forget it after a win) */
export function rememberCheckpoint(d: SaveData, levelId: string, cp: Checkpoint | null | undefined) {
  if (!d.checkpoints) d.checkpoints = {};
  if (cp && cp.id === levelId) d.checkpoints[levelId] = cp;
  else delete d.checkpoints[levelId];
}

/** a remembered checkpoint for this journey and mode, if any */
export function checkpointOf(d: SaveData, levelId: string, mode: Checkpoint['mode']): Checkpoint | null {
  const cp = d.checkpoints?.[levelId];
  return cp && cp.mode === mode ? cp : null;
}

/** what travels between devices (checkpoints stay on this one) */
function portable(d: SaveData): Omit<SaveData, 'checkpoints'> & { checkpoints?: never } {
  const { checkpoints: _skip, ...rest } = d;
  void _skip;
  return rest;
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
  const json = JSON.stringify(portable(d));
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
  const blob = new Blob([JSON.stringify(portable(d), null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fortissimo-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
