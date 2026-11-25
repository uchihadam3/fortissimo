/**
 * The campaign: five lands, four journeys each on the main road (the fourth is the land's guardian),
 * one harder extra path per land, and the secret Abyss at the very end.
 */
import type { EnemyKind, TowerKind, WorldId } from '../sim/defs';
import type { Feature, JGroup, JourneyDef, JWave, LandmarkKind } from '../sim/journey';
import { Rng } from '../core/rng';
import { ENEMIES } from '../sim/defs';

export interface LevelEntry {
  id: string;
  world: WorldId;
  /** position on the world map (160 × 90) */
  map: [number, number];
  kind: 'main' | 'boss' | 'extra' | 'secret';
  /** levels that must be won first */
  requires: string[];
  /** total stars needed (extras) */
  stars?: number;
  def: JourneyDef;
}

const LANDMARK: Record<WorldId, LandmarkKind> = { meadow: 'bell', desert: 'harp', ice: 'organ', forge: 'chimes', citadel: 'spire' };

export const WORLD_NAMES: Record<WorldId, { pt: string; en: string }> = {
  meadow: { pt: 'Prado das Cantigas', en: 'Meadow of Songs' },
  desert: { pt: 'Dunas do Eco', en: 'Dunes of Echo' },
  ice: { pt: 'Picos de Cristal', en: 'Crystal Peaks' },
  forge: { pt: 'Forja do Trovão', en: 'Thunder Forge' },
  citadel: { pt: 'Cidadela do Silêncio', en: 'Citadel of Silence' },
};

const SPEED: Record<string, number> = { every: 1 };

/** Procedural waves from a threat budget that grows along the journey. */
function gen(o: {
  seed: number;
  bars: number;
  first: number;
  gap: number;
  b0: number;
  b1: number;
  pool: [EnemyKind, number][];
  dirs: number[];
  tailBars?: number;
  maxGroups?: number;
  /** creature health multiplier (harder paths) */
  hp?: number;
}): JWave[] {
  const rng = new Rng(o.seed);
  const out: JWave[] = [];
  const last = o.bars - (o.tailBars ?? 10);
  const n = Math.max(1, Math.floor((last - o.first) / o.gap) + 1);
  for (let i = 0; i < n; i++) {
    const bar = o.first + i * o.gap;
    const k = n === 1 ? 1 : i / (n - 1);
    const budget = o.b0 + (o.b1 - o.b0) * Math.pow(k, 1.15);
    const groups: JGroup[] = [];
    const ng = Math.min(o.maxGroups ?? 3, 1 + Math.floor(k * 2.4 + rng.next() * 0.8));
    const dirs = o.dirs.slice();
    // tougher creatures arrive progressively along the journey
    const cap = 1.25 + k * 5;
    const pool = o.pool.filter(([kk]) => ENEMIES[kk].threat <= cap);
    const usable = pool.length ? pool : [o.pool[0]];
    for (let g = 0; g < ng; g++) {
      // weighted pick
      let tot = 0;
      for (const [, w] of usable) tot += w;
      let r = rng.next() * tot;
      let kind: EnemyKind = usable[0][0];
      for (const [kk, w] of usable) {
        r -= w;
        if (r <= 0) {
          kind = kk;
          break;
        }
      }
      const share = budget / ng;
      const count = Math.max(1, Math.round(share / ENEMIES[kind].threat));
      const dir = dirs.length ? dirs.splice(Math.floor(rng.next() * dirs.length), 1)[0] : o.dirs[0];
      const every = kind === 'scurry' || kind === 'blotling' ? 0.5 : kind === 'shell' || kind === 'muffler' || kind === 'bubble' ? 2 : 1;
      groups.push({ kind, count, every, dir, spread: 28, at: g * 4, hp: o.hp });
    }
    out.push({ bar, groups });
  }
  void SPEED;
  return out;
}

function def(o: Partial<JourneyDef> & { id: string; world: WorldId; name: { pt: string; en: string }; bars: number; waves: JWave[]; towers: TowerKind[]; slots: number; coins: number; features: Feature[] }): JourneyDef {
  return {
    song: o.world,
    landmark: LANDMARK[o.world],
    seed: o.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973,
    ...o,
  } as JourneyDef;
}

const T1: TowerKind[] = ['harp'];
const T2: TowerKind[] = ['harp', 'drum'];
const T3: TowerKind[] = ['harp', 'drum', 'bell'];
const T4: TowerKind[] = ['harp', 'drum', 'bell', 'shaker'];
const T5: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal'];
const T6: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn'];
const T7: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir'];
const T8: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];

export const CAMPAIGN: LevelEntry[] = [
  // ───────────────────────────── Meadow ─────────────────────────────
  {
    id: 'm1', world: 'meadow', map: [14, 74], kind: 'main', requires: [],
    def: def({
      id: 'm1', world: 'meadow', name: { pt: 'O Despertar', en: 'The Awakening' }, bars: 36, slots: 3, coins: 150, towers: T1, newTower: 'harp',
      tutorial: ['basics', 'pickup'], pickups: 7, curviness: 0.6,
      features: [{ kind: 'meadow', from: 0, to: 80 }, { kind: 'lake', from: 20, to: 50, side: 1 }],
      waves: [
        // the first contact: the glove's single harp beats it on its own
        { bar: 2, groups: [{ kind: 'blot', count: 2, every: 4, dir: 0, spread: 6, hp: 0.8 }] },
        { bar: 8, groups: [{ kind: 'blot', count: 4, every: 2, dir: 0, spread: 20, hp: 0.9 }] },
        { bar: 14, groups: [{ kind: 'blot', count: 3, every: 2, dir: -45 }, { kind: 'blot', count: 3, every: 2, dir: 45, at: 4 }] },
        { bar: 21, groups: [{ kind: 'blot', count: 6, every: 1.5, dir: 0, spread: 40 }] },
        { bar: 28, groups: [{ kind: 'blot', count: 4, every: 1.5, dir: -60 }, { kind: 'blot', count: 4, every: 1.5, dir: 60, at: 3 }] },
      ],
    }),
  },
  {
    id: 'm2', world: 'meadow', map: [26, 64], kind: 'main', requires: ['m1'],
    def: def({
      id: 'm2', world: 'meadow', name: { pt: 'Tambores no Vale', en: 'Drums in the Vale' }, bars: 44, slots: 4, coins: 210, towers: T2, newTower: 'drum',
      tutorial: ['upgrade'], pickups: 8,
      features: [{ kind: 'meadow', from: 0, to: 30 }, { kind: 'forest', from: 25, to: 60, side: -1 }, { kind: 'river', from: 48, to: 56 }],
      waves: [
        { bar: 2, groups: [{ kind: 'blot', count: 5, every: 1.5, dir: 0, spread: 30 }] },
        { bar: 9, groups: [{ kind: 'scurry', count: 5, every: 0.5, dir: 30 }, { kind: 'blot', count: 4, every: 1, dir: -30, at: 4 }] },
        { bar: 16, groups: [{ kind: 'blot', count: 10, every: 0.75, dir: -70 }] },
        { bar: 23, groups: [{ kind: 'scurry', count: 8, every: 0.5, dir: 90 }, { kind: 'blot', count: 6, every: 1, dir: 0, at: 6 }] },
        { bar: 30, groups: [{ kind: 'blot', count: 8, every: 0.75, dir: 0, spread: 70 }, { kind: 'scurry', count: 5, every: 0.5, dir: 180, at: 8 }] },
      ],
    }),
  },
  {
    id: 'm3', world: 'meadow', map: [38, 72], kind: 'main', requires: ['m2'],
    def: def({
      id: 'm3', world: 'meadow', name: { pt: 'Asas Cinzentas', en: 'Grey Wings' }, bars: 52, slots: 5, coins: 270, towers: T3, newTower: 'bell',
      tutorial: ['ff'], ff: true, pickups: 9,
      features: [{ kind: 'hills', from: 0, to: 40 }, { kind: 'lake', from: 35, to: 70, side: -1 }, { kind: 'ruins', from: 70, to: 100 }],
      waves: [
        { bar: 2, groups: [{ kind: 'blot', count: 8, every: 1, dir: 0, spread: 50 }] },
        { bar: 9, groups: [{ kind: 'moth', count: 4, every: 1.5, dir: 40 }] },
        { bar: 16, groups: [{ kind: 'scurry', count: 8, every: 0.5, dir: -90 }, { kind: 'blot', count: 6, every: 1, dir: 0, at: 4 }] },
        { bar: 23, groups: [{ kind: 'moth', count: 6, every: 1, dir: -40 }, { kind: 'blot', count: 8, every: 0.75, dir: 60, at: 4 }] },
        { bar: 30, groups: [{ kind: 'scurry', count: 8, every: 0.5, dir: 180 }, { kind: 'moth', count: 4, every: 1, dir: 0, at: 6 }] },
        { bar: 37, groups: [{ kind: 'blot', count: 10, every: 0.5, dir: 0, spread: 80 }, { kind: 'moth', count: 4, every: 1, dir: 90, at: 4 }, { kind: 'scurry', count: 6, every: 0.5, dir: -90, at: 8 }] },
      ],
    }),
  },
  {
    id: 'm4', world: 'meadow', map: [50, 62], kind: 'boss', requires: ['m3'],
    def: def({
      id: 'm4', world: 'meadow', name: { pt: 'O Grande Borrão', en: 'The Great Blot' }, bars: 56, slots: 6, coins: 300, towers: T3, ff: true, pickups: 9, song: 'boss',
      boss: { kind: 'bossBlot', bar: 34 },
      features: [{ kind: 'meadow', from: 0, to: 40 }, { kind: 'canyon', from: 40, to: 80 }, { kind: 'hills', from: 80, to: 130 }],
      waves: gen({ seed: 41, bars: 56, first: 2, gap: 7, b0: 9.8, b1: 13.0, pool: [['blot', 4], ['scurry', 2], ['moth', 2]], dirs: [0, 45, -45, 90, -90, 180], tailBars: 22 }),
    }),
  },
  {
    id: 'mx', world: 'meadow', map: [32, 84], kind: 'extra', requires: ['m3'], stars: 7,
    def: def({
      id: 'mx', world: 'meadow', name: { pt: 'Trilha dos Vagalumes', en: 'Firefly Trail' }, bars: 60, slots: 6, coins: 260, towers: T3, ff: true, pickups: 10,
      features: [{ kind: 'forest', from: 0, to: 60, side: 0 }, { kind: 'river', from: 60, to: 68 }, { kind: 'forest', from: 70, to: 140, side: 1 }],
      waves: gen({ hp: 1.25,  seed: 77, bars: 60, first: 2, gap: 5, b0: 10.2, b1: 23.0, pool: [['blot', 3], ['scurry', 4], ['moth', 3]], dirs: [0, 60, -60, 120, -120, 180], maxGroups: 3 }),
    }),
  },
  // ───────────────────────────── Desert ─────────────────────────────
  {
    id: 'd1', world: 'desert', map: [62, 72], kind: 'main', requires: ['m4'],
    def: def({
      id: 'd1', world: 'desert', name: { pt: 'Areias que Cantam', en: 'Singing Sands' }, bars: 52, slots: 6, coins: 220, towers: T4, newTower: 'shaker', ff: true, pickups: 7,
      features: [{ kind: 'meadow', from: 0, to: 40 }, { kind: 'canyon', from: 40, to: 90 }, { kind: 'ruins', from: 95, to: 120 }],
      waves: [
        { bar: 3, groups: [{ kind: 'blot', count: 8, every: 1, dir: 0 }] },
        { bar: 10, groups: [{ kind: 'shell', count: 2, every: 4, dir: 0 }, { kind: 'scurry', count: 6, every: 0.5, dir: 60, at: 4 }] },
        { bar: 17, groups: [{ kind: 'blot', count: 8, every: 0.75, dir: -90 }, { kind: 'blot', count: 8, every: 0.75, dir: 90 }] },
        { bar: 24, groups: [{ kind: 'shell', count: 3, every: 3, dir: 45 }, { kind: 'moth', count: 6, every: 1, dir: -45, at: 4 }] },
        { bar: 31, groups: [{ kind: 'scurry', count: 10, every: 0.5, dir: 180 }, { kind: 'shell', count: 3, every: 3, dir: 0, at: 6 }] },
        { bar: 38, groups: [{ kind: 'blot', count: 14, every: 0.5, dir: 90 }, { kind: 'blot', count: 14, every: 0.5, dir: -90 }, { kind: 'shell', count: 3, every: 3, dir: 0, at: 6 }] },
      ],
    }),
  },
  {
    id: 'd2', world: 'desert', map: [74, 80], kind: 'main', requires: ['d1'],
    def: def({
      id: 'd2', world: 'desert', name: { pt: 'O Oásis', en: 'The Oasis' }, bars: 56, slots: 7, coins: 260, towers: T5, newTower: 'crystal', ff: true, pickups: 9,
      features: [{ kind: 'lake', from: 20, to: 60, side: 1 }, { kind: 'river', from: 70, to: 78 }, { kind: 'canyon', from: 90, to: 120 }],
      waves: gen({ seed: 202, bars: 56, first: 2, gap: 6, b0: 10.5, b1: 20.0, pool: [['blot', 3], ['scurry', 3], ['shell', 2], ['shield', 2], ['moth', 2]], dirs: [0, 50, -50, 100, -100, 180] }),
    }),
  },
  {
    id: 'd3', world: 'desert', map: [86, 70], kind: 'main', requires: ['d2'],
    def: def({
      id: 'd3', world: 'desert', name: { pt: 'Obeliscos Mudos', en: 'Mute Obelisks' }, bars: 60, slots: 7, coins: 280, towers: T5, ff: true, pickups: 9,
      obelisks: [{ s: 40, side: 1 }, { s: 70, side: -1 }, { s: 95, side: 1 }],
      features: [{ kind: 'ruins', from: 30, to: 110 }, { kind: 'canyon', from: 60, to: 90 }],
      waves: gen({ seed: 303, bars: 60, first: 2, gap: 6, b0: 10.9, b1: 23.0, pool: [['blot', 3], ['scurry', 2], ['shell', 2], ['shield', 2], ['bubble', 2], ['moth', 2]], dirs: [0, 45, -45, 90, -90, 180] }),
    }),
  },
  {
    id: 'd4', world: 'desert', map: [98, 76], kind: 'boss', requires: ['d3'],
    def: def({
      id: 'd4', world: 'desert', name: { pt: 'O Escaravelho', en: 'The Scarab' }, bars: 60, slots: 8, coins: 340, towers: T5, ff: true, pickups: 9, song: 'boss',
      boss: { kind: 'bossScarab', bar: 36 },
      features: [{ kind: 'canyon', from: 20, to: 70 }, { kind: 'ruins', from: 80, to: 140 }],
      waves: gen({ seed: 404, bars: 60, first: 2, gap: 6, b0: 10.9, b1: 20.0, pool: [['blot', 3], ['scurry', 3], ['shell', 2], ['shield', 1], ['bubble', 1]], dirs: [0, 60, -60, 120, -120], tailBars: 24 }),
    }),
  },
  {
    id: 'dx', world: 'desert', map: [80, 58], kind: 'extra', requires: ['d3'], stars: 18,
    def: def({
      id: 'dx', world: 'desert', name: { pt: 'Miragem', en: 'Mirage' }, bars: 64, slots: 8, coins: 300, towers: T5, ff: true, pickups: 10,
      obelisks: [{ s: 50, side: -1 }, { s: 90, side: 1 }],
      features: [{ kind: 'hills', from: 0, to: 60 }, { kind: 'canyon', from: 60, to: 110 }],
      waves: gen({ hp: 1.2,  seed: 505, bars: 64, first: 2, gap: 5, b0: 11.6, b1: 37.9, pool: [['blot', 2], ['scurry', 3], ['shell', 3], ['shield', 2], ['bubble', 2], ['moth', 2]], dirs: [0, 60, -60, 120, -120, 180], maxGroups: 3 }),
    }),
  },
  // ───────────────────────────── Ice ─────────────────────────────
  {
    id: 'i1', world: 'ice', map: [112, 68], kind: 'main', requires: ['d4'],
    def: def({
      id: 'i1', world: 'ice', name: { pt: 'Neve que Ecoa', en: 'Echoing Snow' }, bars: 56, slots: 8, coins: 300, towers: T6, newTower: 'horn', ff: true, pickups: 8,
      features: [{ kind: 'hills', from: 0, to: 50 }, { kind: 'lake', from: 50, to: 90, side: 1 }, { kind: 'forest', from: 90, to: 130, side: -1 }],
      waves: [
        { bar: 3, groups: [{ kind: 'blot', count: 10, every: 0.75, dir: 0 }] },
        { bar: 10, groups: [{ kind: 'phantom', count: 4, every: 1.5, dir: 30 }] },
        { bar: 17, groups: [{ kind: 'shell', count: 4, every: 2, dir: 0 }, { kind: 'scurry', count: 10, every: 0.5, dir: -90, at: 4 }] },
        { bar: 24, groups: [{ kind: 'phantom', count: 6, every: 1, dir: -40 }, { kind: 'moth', count: 6, every: 1, dir: 60, at: 4 }] },
        { bar: 31, groups: [{ kind: 'shield', count: 4, every: 2, dir: 0 }, { kind: 'blot', count: 14, every: 0.5, dir: 180, at: 4 }] },
        { bar: 38, groups: [{ kind: 'phantom', count: 8, every: 1, dir: 90 }, { kind: 'shell', count: 4, every: 2, dir: -90 }, { kind: 'scurry', count: 12, every: 0.5, dir: 0, at: 6 }] },
      ],
    }),
  },
  {
    id: 'i2', world: 'ice', map: [124, 58], kind: 'main', requires: ['i1'],
    def: def({
      id: 'i2', world: 'ice', name: { pt: 'O Coro Gelado', en: 'The Frozen Choir' }, bars: 60, slots: 9, coins: 320, towers: T7, newTower: 'choir', ff: true, pickups: 9,
      features: [{ kind: 'forest', from: 0, to: 60, side: 0 }, { kind: 'river', from: 64, to: 72 }, { kind: 'canyon', from: 85, to: 120 }],
      waves: gen({ seed: 606, bars: 60, first: 2, gap: 6, b0: 12.0, b1: 30.0, pool: [['blot', 2], ['scurry', 2], ['shell', 2], ['phantom', 3], ['mender', 2], ['moth', 2]], dirs: [0, 45, -45, 90, -90, 180] }),
    }),
  },
  {
    id: 'i3', world: 'ice', map: [136, 66], kind: 'main', requires: ['i2'],
    def: def({
      id: 'i3', world: 'ice', name: { pt: 'Lago de Espelho', en: 'Mirror Lake' }, bars: 64, slots: 9, coins: 340, towers: T7, ff: true, pickups: 10,
      obelisks: [{ s: 60, side: 1 }, { s: 100, side: -1 }],
      features: [{ kind: 'lake', from: 10, to: 60, side: -1 }, { kind: 'lake', from: 70, to: 120, side: 1 }],
      waves: gen({ seed: 707, bars: 64, first: 2, gap: 6, b0: 12.7, b1: 36.0, pool: [['blot', 2], ['scurry', 2], ['shell', 2], ['phantom', 2], ['mender', 2], ['muffler', 2], ['moth', 2], ['shield', 1]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  {
    id: 'i4', world: 'ice', map: [146, 52], kind: 'boss', requires: ['i3'],
    def: def({
      id: 'i4', world: 'ice', name: { pt: 'A Mariposa-Rainha', en: 'The Moth Queen' }, bars: 64, slots: 10, coins: 380, towers: T7, ff: true, pickups: 10, song: 'boss',
      boss: { kind: 'bossMoth', bar: 40 },
      features: [{ kind: 'hills', from: 0, to: 80 }, { kind: 'forest', from: 80, to: 140, side: 0 }],
      waves: gen({ seed: 808, bars: 64, first: 2, gap: 6, b0: 12.3, b1: 28.0, pool: [['blot', 2], ['moth', 3], ['phantom', 2], ['scurry', 2], ['shell', 2], ['mender', 1]], dirs: [0, 60, -60, 120, -120], tailBars: 26 }),
    }),
  },
  {
    id: 'ix', world: 'ice', map: [134, 80], kind: 'extra', requires: ['i3'], stars: 30,
    def: def({
      id: 'ix', world: 'ice', name: { pt: 'Aurora Partida', en: 'Broken Aurora' }, bars: 68, slots: 10, coins: 360, towers: T7, ff: true, pickups: 10,
      obelisks: [{ s: 40, side: -1 }, { s: 80, side: 1 }, { s: 120, side: -1 }],
      features: [{ kind: 'canyon', from: 10, to: 70 }, { kind: 'lake', from: 80, to: 120, side: 1 }],
      waves: gen({ hp: 1.45,  seed: 909, bars: 68, first: 2, gap: 5, b0: 13.4, b1: 62.6, pool: [['blot', 2], ['phantom', 3], ['muffler', 2], ['mender', 2], ['shell', 2], ['moth', 3], ['bubble', 2]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  // ───────────────────────────── Forge ─────────────────────────────
  {
    id: 'f1', world: 'forge', map: [136, 36], kind: 'main', requires: ['i4'],
    def: def({
      id: 'f1', world: 'forge', name: { pt: 'Brasas', en: 'Embers' }, bars: 60, slots: 10, coins: 400, towers: T8, newTower: 'bass', ff: true, pickups: 9,
      features: [{ kind: 'canyon', from: 0, to: 50 }, { kind: 'lake', from: 50, to: 90, side: -1 }, { kind: 'ruins', from: 90, to: 130 }],
      waves: [
        { bar: 3, groups: [{ kind: 'shell', count: 5, every: 2, dir: 0 }] },
        { bar: 10, groups: [{ kind: 'blot', count: 16, every: 0.5, dir: -60 }, { kind: 'scurry', count: 12, every: 0.5, dir: 60, at: 2 }] },
        { bar: 17, groups: [{ kind: 'shell', count: 6, every: 1.5, dir: 90 }, { kind: 'shield', count: 4, every: 2, dir: -90 }] },
        { bar: 24, groups: [{ kind: 'muffler', count: 2, every: 4, dir: 0 }, { kind: 'phantom', count: 8, every: 1, dir: 180, at: 2 }] },
        { bar: 31, groups: [{ kind: 'bubble', count: 5, every: 2, dir: 45 }, { kind: 'moth', count: 10, every: 0.75, dir: -45, at: 4 }] },
        { bar: 38, groups: [{ kind: 'shell', count: 8, every: 1, dir: 0 }, { kind: 'mender', count: 3, every: 2, dir: 0, at: 2 }, { kind: 'scurry', count: 16, every: 0.5, dir: 180, at: 6 }] },
      ],
    }),
  },
  {
    id: 'f2', world: 'forge', map: [124, 28], kind: 'main', requires: ['f1'],
    def: def({
      id: 'f2', world: 'forge', name: { pt: 'Rios de Lava', en: 'Lava Rivers' }, bars: 64, slots: 10, coins: 420, towers: T8, ff: true, pickups: 10,
      features: [{ kind: 'river', from: 30, to: 38 }, { kind: 'river', from: 70, to: 78 }, { kind: 'canyon', from: 90, to: 130 }],
      waves: gen({ seed: 1111, bars: 64, first: 2, gap: 6, b0: 14.1, b1: 45.0, pool: [['blot', 2], ['shell', 3], ['shield', 2], ['bubble', 2], ['muffler', 1], ['mender', 2], ['scurry', 2], ['moth', 2]], dirs: [0, 50, -50, 100, -100, 180] }),
    }),
  },
  {
    id: 'f3', world: 'forge', map: [112, 36], kind: 'main', requires: ['f2'],
    def: def({
      id: 'f3', world: 'forge', name: { pt: 'A Bigorna', en: 'The Anvil' }, bars: 68, slots: 11, coins: 440, towers: T8, ff: true, pickups: 10,
      obelisks: [{ s: 50, side: 1 }, { s: 90, side: -1 }, { s: 120, side: 1 }],
      features: [{ kind: 'ruins', from: 20, to: 140 }, { kind: 'lake', from: 60, to: 100, side: 1 }],
      waves: gen({ seed: 1212, bars: 68, first: 2, gap: 6, b0: 15.2, b1: 52.0, pool: [['blot', 2], ['shell', 3], ['shield', 2], ['bubble', 2], ['muffler', 2], ['mender', 2], ['phantom', 2], ['moth', 2]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  {
    id: 'f4', world: 'forge', map: [100, 26], kind: 'boss', requires: ['f3'],
    def: def({
      id: 'f4', world: 'forge', name: { pt: 'O Golem da Forja', en: 'The Forge Golem' }, bars: 68, slots: 12, coins: 480, towers: T8, ff: true, pickups: 10, song: 'boss',
      boss: { kind: 'bossGolem', bar: 42 },
      features: [{ kind: 'canyon', from: 0, to: 60 }, { kind: 'hills', from: 60, to: 140 }],
      waves: gen({ seed: 1313, bars: 68, first: 2, gap: 6, b0: 14.5, b1: 40.0, pool: [['blot', 2], ['shell', 3], ['shield', 2], ['scurry', 2], ['mender', 1], ['moth', 2]], dirs: [0, 60, -60, 120, -120], tailBars: 28 }),
    }),
  },
  {
    id: 'fx', world: 'forge', map: [120, 14], kind: 'extra', requires: ['f3'], stars: 42,
    def: def({
      id: 'fx', world: 'forge', name: { pt: 'Coração Vulcânico', en: 'Volcanic Heart' }, bars: 72, slots: 12, coins: 460, towers: T8, ff: true, pickups: 11,
      obelisks: [{ s: 40, side: 1 }, { s: 70, side: -1 }, { s: 100, side: 1 }, { s: 130, side: -1 }],
      features: [{ kind: 'canyon', from: 0, to: 140 }],
      waves: gen({ hp: 1.55,  seed: 1414, bars: 72, first: 2, gap: 5, b0: 15.9, b1: 94.2, pool: [['blot', 2], ['shell', 3], ['shield', 2], ['bubble', 2], ['muffler', 2], ['mender', 2], ['phantom', 2], ['moth', 3]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  // ───────────────────────────── Citadel ─────────────────────────────
  {
    id: 'c1', world: 'citadel', map: [84, 36], kind: 'main', requires: ['f4'],
    def: def({
      id: 'c1', world: 'citadel', name: { pt: 'Degraus de Mármore', en: 'Marble Steps' }, bars: 64, slots: 12, coins: 480, towers: T8, ff: true, pickups: 10,
      obelisks: [{ s: 60, side: -1 }, { s: 110, side: 1 }],
      features: [{ kind: 'ruins', from: 0, to: 150 }, { kind: 'hills', from: 40, to: 100 }],
      waves: gen({ seed: 1515, bars: 64, first: 2, gap: 6, b0: 15.9, b1: 55.0, pool: [['blot', 2], ['shell', 2], ['shield', 2], ['bubble', 2], ['muffler', 2], ['mender', 2], ['phantom', 3], ['moth', 2], ['scurry', 2]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  {
    id: 'c2', world: 'citadel', map: [72, 26], kind: 'main', requires: ['c1'],
    def: def({
      id: 'c2', world: 'citadel', name: { pt: 'Ecos Vazios', en: 'Hollow Echoes' }, bars: 68, slots: 12, coins: 500, towers: T8, ff: true, pickups: 11,
      obelisks: [{ s: 40, side: 1 }, { s: 80, side: -1 }, { s: 120, side: 1 }],
      features: [{ kind: 'canyon', from: 20, to: 80 }, { kind: 'ruins', from: 80, to: 150 }],
      waves: gen({ seed: 1616, bars: 68, first: 2, gap: 6, b0: 17.0, b1: 62.0, pool: [['blot', 2], ['shell', 2], ['shield', 2], ['bubble', 2], ['muffler', 2], ['mender', 2], ['phantom', 3], ['moth', 3], ['scurry', 2]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  {
    id: 'c3', world: 'citadel', map: [60, 36], kind: 'main', requires: ['c2'],
    def: def({
      id: 'c3', world: 'citadel', name: { pt: 'A Última Escada', en: 'The Last Stair' }, bars: 72, slots: 12, coins: 520, towers: T8, ff: true, pickups: 11,
      obelisks: [{ s: 50, side: -1 }, { s: 90, side: 1 }, { s: 130, side: -1 }],
      features: [{ kind: 'ruins', from: 0, to: 160 }, { kind: 'canyon', from: 90, to: 140 }],
      waves: gen({ seed: 1717, bars: 72, first: 2, gap: 6, b0: 18.1, b1: 78.4, pool: [['blot', 2], ['shell', 2], ['shield', 2], ['bubble', 2], ['muffler', 2], ['mender', 2], ['phantom', 3], ['moth', 3], ['scurry', 2]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
  {
    id: 'c4', world: 'citadel', map: [46, 24], kind: 'boss', requires: ['c3'],
    def: def({
      id: 'c4', world: 'citadel', name: { pt: 'O Silêncio', en: 'The Silence' }, bars: 76, slots: 12, coins: 560, towers: T8, ff: true, pickups: 12, song: 'finale',
      boss: { kind: 'silence', bar: 44 },
      features: [{ kind: 'ruins', from: 0, to: 170 }],
      waves: gen({ seed: 1818, bars: 76, first: 2, gap: 6, b0: 17.0, b1: 46.8, pool: [['blot', 2], ['shell', 2], ['shield', 2], ['muffler', 2], ['mender', 2], ['phantom', 3], ['moth', 3]], dirs: [0, 60, -60, 120, -120, 180], tailBars: 32 }),
    }),
  },
  {
    id: 'cx', world: 'citadel', map: [28, 16], kind: 'secret', requires: ['c4'], stars: 60,
    def: def({
      id: 'cx', world: 'citadel', name: { pt: 'O Abismo', en: 'The Abyss' }, bars: 80, slots: 12, coins: 520, towers: T8, ff: true, pickups: 12, song: 'finale',
      obelisks: [{ s: 40, side: 1 }, { s: 70, side: -1 }, { s: 100, side: 1 }, { s: 130, side: -1 }, { s: 160, side: 1 }],
      features: [{ kind: 'canyon', from: 0, to: 180 }],
      waves: gen({ hp: 1.9,  seed: 1919, bars: 80, first: 2, gap: 5, b0: 20.6, b1: 212.5, pool: [['blot', 2], ['shell', 3], ['shield', 3], ['bubble', 2], ['muffler', 3], ['mender', 3], ['phantom', 3], ['moth', 3]], dirs: [0, 60, -60, 120, -120, 180] }),
    }),
  },
];

export const LEVEL_BY_ID = new Map(CAMPAIGN.map((l) => [l.id, l]));

/** Endless "Bis": a very long walk with waves that keep growing. */
export function endlessDef(world: WorldId, slots = 12): JourneyDef {
  const towers: TowerKind[] = world === 'meadow' ? T3 : world === 'desert' ? T5 : world === 'ice' ? T7 : T8;
  const pool: [EnemyKind, number][] = world === 'meadow' ? [['blot', 4], ['scurry', 3], ['moth', 2]] : world === 'desert' ? [['blot', 2], ['scurry', 2], ['shell', 2], ['shield', 2], ['bubble', 1], ['moth', 2]] : [['shell', 2], ['shield', 2], ['bubble', 2], ['muffler', 1], ['mender', 2], ['phantom', 2], ['moth', 2], ['scurry', 2]];
  return def({
    id: `bis-${world}`, world, name: { pt: 'Bis', en: 'Encore' }, bars: 260, slots, coins: 300, towers, ff: true, pickups: 40,
    features: [{ kind: 'hills', from: 0, to: 120 }, { kind: 'forest', from: 120, to: 240, side: 0 }, { kind: 'canyon', from: 240, to: 330 }, { kind: 'lake', from: 330, to: 420, side: 1 }],
    waves: gen({ seed: 2024 + world.length, bars: 260, first: 2, gap: 5, b0: 10.2, b1: 160.0, pool, dirs: [0, 60, -60, 120, -120, 180], tailBars: 4 }),
  });
}
