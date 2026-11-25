/**
 * The campaign: five lands, four journeys each on the main road (the fourth is the land's guardian),
 * one harder extra path per land, and the secret Abyss at the very end.
 *
 * v2: every journey is a symphony in movements (3 to 5). Between two movements comes a breather
 * (calm bars, golden notes along the road, one more plate of the shell). Levels start with few
 * plates and the band grows while you play. Waves come from where the land lets them come:
 * front and back in canyons, around the open plains, out of the forests; fliers from anywhere.
 */
import type { EnemyKind, TowerKind, WorldId } from '../sim/defs';
import type { Feature, JGroup, JMovement, JourneyDef, JWave, LandmarkKind, TutorialId } from '../sim/journey';
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

/** path units per bar (DEFAULT_SPEED × 4 beats) */
const PU = 1.68;

// ───────────────────────────── wave generation ─────────────────────────────

/** Directions creatures can come from at path distance s (ground creatures respect the land). */
function dirsAt(features: Feature[], s: number, flying: boolean): number[] {
  const open = [0, 40, -40, 80, -80, 125, -125, 180];
  if (flying) return [0, 50, -50, 100, -100, 150, -150];
  const at = (k: Feature['kind']) => features.find((f) => f.kind === k && s >= f.from - 6 && s <= f.to + 6);
  if (at('canyon')) return [0, 180, 12, -12, 168, -168];
  let dirs = open.slice();
  const lake = at('lake');
  if (lake) {
    const side = lake.side ?? 1;
    dirs = dirs.filter((d) => Math.abs(d) < 30 || Math.abs(d) > 150 || Math.sign(d) !== side);
  }
  if (at('forest')) dirs.push(70, -70, 110, -110);
  if (at('river')) dirs = dirs.filter((d) => Math.abs(d) <= 100);
  return dirs;
}

interface GenSpec {
  seed: number;
  /** threat budget of the first and the last wave of the movement */
  b0: number;
  b1: number;
  pool: [EnemyKind, number][];
  /** bars between waves */
  gap?: number;
  /** first wave, bars after the movement starts */
  first?: number;
  /** calm bars at the end of the movement */
  tail?: number;
  /** creature health × */
  hp?: number;
  maxGroups?: number;
}

function shape(kind: EnemyKind): { every: number; spread: number; dist?: number } {
  const d = ENEMIES[kind];
  if (d.pack) return { every: 0.3, spread: 12 };
  if (kind === 'blotling') return { every: 0.5, spread: 20 };
  if (d.threat >= 6) return { every: 3, spread: 18 };
  if (d.threat >= 3) return { every: 2, spread: 22 };
  return { every: 1, spread: 28 };
}

/** procedural waves of one movement from a threat budget that grows through it (bars relative to the movement) */
function genMovement(o: GenSpec, bars: number, startBar: number, features: Feature[], mi: number): JWave[] {
  const rng = new Rng(o.seed);
  const out: JWave[] = [];
  const gap = o.gap ?? 5;
  const first = o.first ?? 1;
  const last = bars - (o.tail ?? 5);
  const n = Math.max(1, Math.floor((last - first) / gap) + 1);
  const pick = (list: [EnemyKind, number][]): EnemyKind => {
    let tot = 0;
    for (const [, w] of list) tot += w;
    let r = rng.next() * tot;
    for (const [kk, w] of list) {
      r -= w;
      if (r <= 0) return kk;
    }
    return list[list.length - 1][0];
  };
  for (let i = 0; i < n; i++) {
    const bar = first + i * gap;
    const k = n === 1 ? 1 : i / (n - 1);
    const budget = o.b0 + (o.b1 - o.b0) * Math.pow(k, 1.1);
    const groups: JGroup[] = [];
    const ng = Math.min(o.maxGroups ?? 3, 1 + Math.floor(k * 2.2 + rng.next() * 0.9));
    const s = (startBar + bar) * PU;
    const used: number[] = [];
    const kinds: EnemyKind[] = [];
    // tougher creatures come in as the journey goes on; the strange ones (mimics, mufflers,
    // conductors) never open a journey and come one group at a time
    const cap = 1.6 + 3.2 * mi + 6 * k;
    let strange = false;
    for (let g = 0; g < ng; g++) {
      const share = budget / ng;
      const pool = o.pool.filter(([kk]) => {
        const d = ENEMIES[kk];
        if (kinds.includes(kk) || d.threat > cap || d.threat > share * 1.05) return false;
        if (STRANGE.has(kk) && (strange || (mi === 0 && k < 0.5))) return false;
        return true;
      });
      const cheapest = o.pool.reduce((a, b) => (ENEMIES[a[0]].threat <= ENEMIES[b[0]].threat ? a : b));
      const kind = pool.length ? pick(pool) : cheapest[0];
      if (STRANGE.has(kind)) strange = true;
      kinds.push(kind);
      let count = Math.max(1, Math.round(share / ENEMIES[kind].threat));
      if (STRANGE.has(kind)) count = Math.min(count, 1 + Math.floor(k * 2));
      const dirs = dirsAt(features, s, ENEMIES[kind].flying).filter((d) => !used.includes(d));
      const dir = dirs.length ? dirs[Math.floor(rng.next() * dirs.length)] : 0;
      used.push(dir);
      const sh = shape(kind);
      // a group never takes more than ~3 bars to come out
      groups.push({ kind, count, every: Math.min(sh.every, 12 / count), dir, spread: sh.spread, at: g * 3, hp: o.hp });
    }
    out.push({ bar, groups });
  }
  return out;
}

/** creatures whose ability matters more than their health */
const STRANGE = new Set<EnemyKind>(['mimic', 'muffler', 'conductor', 'slug', 'knight']);

// ───────────────────────────── journeys in movements ─────────────────────────────

interface MoveSpec {
  /** bars of music (and fighting) in this movement */
  bars: number;
  /** breather before it (not for the first) */
  rest?: number;
  /** golden notes in that breather */
  notes?: number;
  /** hand-written waves (bars relative to the movement) */
  waves?: JWave[];
  /** generated waves */
  gen?: GenSpec;
  /** set pieces added to the generated waves: elites, ambushes, squadrons (relative bars) */
  set?: JWave[];
}

interface JourneySpec {
  id: string;
  world: WorldId;
  name: { pt: string; en: string };
  /** plates open at the start */
  slots: number;
  coins: number;
  towers: TowerKind[];
  features: Feature[];
  moves: MoveSpec[];
  newTower?: TowerKind;
  tutorial?: TutorialId[];
  pickups?: number;
  song?: JourneyDef['song'];
  curviness?: number;
  ff?: boolean;
  obelisks?: { s: number; side: number; dist?: number }[];
  /** the guardian, `at` bars into the last movement */
  boss?: { kind: EnemyKind; at: number; hp?: number };
}

/**
 * Difficulty of every generated movement: its threat budgets are multiplied by these factors.
 * Found with `npx tsx tools/balance.ts --tune` (the good bot plays each movement at the edge of its
 * skill), then rounded by hand.
 */
export const TUNE: Record<string, number[]> = {
  // the first land stays welcoming (set by hand below the good bot's edge, so a novice gets through)
  m1: [1, 1, 1],
  m2: [1, 2.2, 3.2, 4],
  m3: [1.2, 1.7, 2.8, 4.5],
  m4: [1.4, 2.8, 4.4, 6.5, 12],
  mx: [1.26, 2.62, 4.09, 8.46, 6.77],
  d1: [1.19, 1.14, 1.49, 3.64],
  d2: [1.58, 0.76, 1.86, 4.55],
  d3: [0.31, 0.76, 2.08, 5.1, 7.96],
  d4: [1.34, 1.49, 1.98, 4.85, 11.85],
  dx: [0.81, 1.77, 1.19, 2.91, 6.77],
  i1: [0.69, 1.67, 3.64, 8.88],
  i2: [0.61, 0.73, 3.91, 9.57],
  i3: [1.34, 1.77, 6.81, 16.65],
  i4: [1.01, 2.47, 2.78, 6.77, 11.77],
  ix: [0.25, 0.61, 4.63, 11.31, 27.58],
  f1: [1.97, 3.64, 6.07, 14.81],
  f2: [1.49, 3.64, 3.09, 7.53],
  f3: [1.97, 4.82, 12.48, 5.42],
  f4: [1.19, 2.91, 7.96, 19.43, 20.6],
  fx: [1.01, 2.47, 3.28, 6.77, 16.53],
  c1: [1.97, 4.82, 2.21, 5.4],
  c2: [1.67, 1.34, 7.23, 17.64],
  c3: [0.76, 1.86, 5.69, 13.88],
  c4: [1.07, 2.62, 3.26, 7.95, 5.4],
  cx: [0.86, 2.09, 5.42, 11.21, 6.39],
};

const SPECS = new Map<string, JourneySpec>();

function journey(o: JourneySpec, tune: number[] | undefined = TUNE[o.id]): JourneyDef {
  SPECS.set(o.id, o);
  const seed = o.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973;
  const movements: JMovement[] = [];
  const waves: JWave[] = [];
  let cur = 0;
  o.moves.forEach((m, k) => {
    const rest = k === 0 ? 0 : m.rest ?? 8;
    cur += rest;
    movements.push({ bar: cur, rest, notes: k === 0 ? undefined : m.notes ?? 8 });
    // the difficulty factor grows both the crowds and the creatures' health
    const f = tune?.[k] ?? 1;
    const fc = Math.pow(f, 0.4), fh = Math.pow(f, 0.6);
    const gen = m.gen ? { ...m.gen, b0: m.gen.b0 * fc, b1: m.gen.b1 * fc, hp: (m.gen.hp ?? 1) * fh } : null;
    const rel: JWave[] = [...(m.waves ?? []), ...(gen ? genMovement(gen, m.bars, cur, o.features, k) : [])];
    const scaled = (g: JGroup): JGroup => {
      if (!m.gen) return g;
      const count = g.elite ? g.count : Math.max(1, Math.round(g.count * fc));
      return { ...g, count, every: Math.min(g.every, 12 / count), hp: (g.hp ?? 1) * fh };
    };
    for (const s of m.set ?? []) {
      const same = rel.find((w) => w.bar === s.bar);
      if (same) same.groups.push(...s.groups.map((g) => ({ ...scaled(g), at: (g.at ?? 0) + 2 })));
      else rel.push({ bar: s.bar, groups: s.groups.map(scaled) });
    }
    for (const w of rel) waves.push({ bar: cur + w.bar, groups: w.groups });
    cur += m.bars;
  });
  waves.sort((a, b) => a.bar - b.bar);
  const lastStart = movements[movements.length - 1].bar;
  return {
    id: o.id, world: o.world, song: o.song ?? o.world, name: o.name, bars: cur, slots: o.slots, coins: o.coins, towers: o.towers,
    waves, movements, features: o.features, pickups: o.pickups ?? Math.round(cur / 9), obelisks: o.obelisks,
    // the guardian grows with the difficulty of its movement
    boss: o.boss ? { kind: o.boss.kind, bar: lastStart + o.boss.at, hp: (o.boss.hp ?? 1) * Math.pow(tune?.[o.moves.length - 1] ?? 1, 0.6) } : undefined,
    tutorial: o.tutorial, newTower: o.newTower, ff: o.ff ?? true, seed, landmark: LANDMARK[o.world], curviness: o.curviness,
  };
}

const T1: TowerKind[] = ['harp'];
const T2: TowerKind[] = ['harp', 'drum'];
const T3: TowerKind[] = ['harp', 'drum', 'bell'];
const T4: TowerKind[] = ['harp', 'drum', 'bell', 'shaker'];
const T5: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal'];
const T6: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn'];
const T7: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir'];
const T8: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];

// shorthand for hand-written groups
const G = (kind: EnemyKind, count: number, dir: number, o: Partial<JGroup> = {}): JGroup => {
  const sh = shape(kind);
  return { kind, count, every: sh.every, dir, spread: sh.spread, ...o };
};
const W = (bar: number, ...groups: JGroup[]): JWave => ({ bar, groups });

// creature families of each land (weights)
const MEADOW: [EnemyKind, number][] = [['blot', 4], ['scurry', 3], ['bubble', 2], ['moth', 2]];
const DUNES: [EnemyKind, number][] = [['blot', 2], ['scurry', 1], ['moth', 1], ['scorpion', 3], ['whirl', 3], ['echo', 3]];
const PEAKS: [EnemyKind, number][] = [['wolf', 3], ['shell', 3], ['phantom', 3], ['muffler', 1], ['moth', 2], ['echo', 1]];
const FORGE: [EnemyKind, number][] = [['ember', 3], ['slug', 1], ['shield', 3], ['mender', 2], ['wolf', 1], ['shell', 2], ['scorpion', 1]];
const CITADEL: [EnemyKind, number][] = [['knight', 2], ['mimic', 1], ['phantom', 2], ['ember', 2], ['shield', 2], ['mender', 1], ['whirl', 2], ['wolf', 2], ['echo', 1], ['moth', 1]];

export const CAMPAIGN: LevelEntry[] = [
  // ───────────────────────────── Meadow ─────────────────────────────
  {
    id: 'm1', world: 'meadow', map: [14, 74], kind: 'main', requires: [],
    def: journey({
      id: 'm1', world: 'meadow', name: { pt: 'O Despertar', en: 'The Awakening' }, slots: 2, coins: 150, towers: T1, newTower: 'harp',
      tutorial: ['basics', 'pickup'], pickups: 9, curviness: 0.6,
      features: [{ kind: 'meadow', from: 0, to: 70 }, { kind: 'lake', from: 40, to: 100, side: 1 }, { kind: 'hills', from: 100, to: 140 }, { kind: 'meadow', from: 140, to: 190 }],
      moves: [
        {
          bars: 28,
          waves: [
            // the first contact: the glove's single harp beats it on its own
            W(2, G('blot', 2, 0, { every: 4, spread: 6, hp: 0.8 })),
            W(8, G('blot', 4, 0, { every: 2, spread: 20, hp: 0.9 })),
            W(14, G('blot', 3, -45, { every: 2 }), G('blot', 3, 45, { every: 2, at: 4 })),
            W(20, G('blot', 6, 0, { every: 1.5, spread: 40 })),
          ],
        },
        {
          bars: 28, rest: 8, notes: 7,
          waves: [
            W(1, G('blot', 4, -60, { every: 1.5 }), G('blot', 4, 60, { every: 1.5, at: 3 })),
            W(7, G('blot', 8, 0, { every: 1, spread: 60 })),
            W(13, G('blot', 5, -80, { every: 1.2 }), G('blot', 5, 0, { every: 1.2, at: 4 })),
            W(19, G('blot', 10, 0, { every: 0.8, spread: 80 })),
          ],
        },
        {
          bars: 28, rest: 8, notes: 8,
          waves: [
            // something comes from behind for the first time
            W(1, G('blot', 6, 180, { every: 1.2, spread: 30 })),
            W(7, G('blot', 6, -40, { every: 1 }), G('blot', 6, 40, { every: 1, at: 2 })),
            W(13, G('blot', 12, 0, { every: 0.6, spread: 90 })),
            W(19, G('blot', 7, 125, { every: 0.8 }), G('blot', 7, -125, { every: 0.8, at: 2 }), G('blot', 6, 0, { every: 1, at: 6 })),
          ],
        },
      ],
    }),
  },
  {
    id: 'm2', world: 'meadow', map: [26, 64], kind: 'main', requires: ['m1'],
    def: journey({
      id: 'm2', world: 'meadow', name: { pt: 'Tambores no Vale', en: 'Drums in the Vale' }, slots: 2, coins: 210, towers: T2, newTower: 'drum',
      tutorial: ['upgrade'], pickups: 11,
      features: [{ kind: 'meadow', from: 0, to: 45 }, { kind: 'forest', from: 45, to: 110, side: -1 }, { kind: 'river', from: 116, to: 124 }, { kind: 'hills', from: 130, to: 175 }, { kind: 'meadow', from: 175, to: 220 }],
      moves: [
        {
          bars: 26,
          waves: [
            W(2, G('blot', 5, 0, { every: 1.5, spread: 30 })),
            W(8, G('blot', 4, -40), G('blot', 3, 40, { at: 3 })),
            W(14, G('scurry', 4, 0)),
            W(19, G('blot', 6, 80, { every: 0.8 }), G('scurry', 4, -80, { at: 4 })),
          ],
        },
        {
          bars: 26, rest: 8,
          gen: { seed: 21, b0: 9, b1: 13, pool: [['blot', 4], ['scurry', 4]], gap: 5, first: 1, tail: 4 },
        },
        {
          bars: 26, rest: 8,
          gen: { seed: 22, b0: 11, b1: 16, pool: [['blot', 4], ['scurry', 3], ['bubble', 2]], gap: 5, first: 1, tail: 4 },
          set: [W(8, G('scurry', 8, 180, { spread: 10 }))],
        },
        {
          bars: 23, rest: 8,
          gen: { seed: 23, b0: 14, b1: 20, pool: [['blot', 3], ['scurry', 3], ['bubble', 3]], gap: 4, first: 1, tail: 4 },
          set: [W(13, G('bubble', 3, 0, { hp: 1.4, every: 2 }))],
        },
      ],
    }),
  },
  {
    id: 'm3', world: 'meadow', map: [38, 72], kind: 'main', requires: ['m2'],
    def: journey({
      id: 'm3', world: 'meadow', name: { pt: 'Asas Cinzentas', en: 'Grey Wings' }, slots: 3, coins: 260, towers: T3, newTower: 'bell',
      tutorial: ['ff'], pickups: 12,
      features: [{ kind: 'hills', from: 0, to: 60 }, { kind: 'lake', from: 60, to: 120, side: -1 }, { kind: 'meadow', from: 120, to: 170 }, { kind: 'ruins', from: 170, to: 240 }],
      moves: [
        {
          bars: 30,
          gen: { seed: 31, b0: 7, b1: 12, pool: [['blot', 4], ['scurry', 3]], gap: 5, first: 2, tail: 4 },
          set: [W(12, G('moth', 4, 40, { every: 1.5 }))],
        },
        {
          bars: 32, rest: 8,
          gen: { seed: 32, b0: 12, b1: 18, pool: [['blot', 3], ['scurry', 3], ['moth', 3], ['bubble', 1]], gap: 5, first: 1, tail: 4 },
        },
        {
          bars: 30, rest: 8,
          gen: { seed: 33, b0: 15, b1: 22, pool: [['blot', 2], ['scurry', 3], ['moth', 3], ['bubble', 2]], gap: 5, first: 1, tail: 4 },
          // a mid-journey elite: a giant bubble, with moths overhead
          set: [W(11, G('bubble', 1, 0, { hp: 5, elite: true, spread: 0 }), G('moth', 6, 60, { at: 4 }))],
        },
        {
          bars: 30, rest: 8,
          gen: { seed: 34, b0: 19, b1: 28, pool: [['blot', 2], ['scurry', 3], ['moth', 3], ['bubble', 3]], gap: 5, first: 1, tail: 4 },
          set: [W(16, G('scurry', 10, 180, { spread: 10 }), G('moth', 6, 0, { at: 2 }))],
        },
      ],
    }),
  },
  {
    id: 'm4', world: 'meadow', map: [50, 62], kind: 'boss', requires: ['m3'],
    def: journey({
      id: 'm4', world: 'meadow', name: { pt: 'O Grande Borrão', en: 'The Great Blot' }, slots: 3, coins: 300, towers: T3, pickups: 14, song: 'boss',
      features: [{ kind: 'meadow', from: 0, to: 60 }, { kind: 'forest', from: 60, to: 130, side: 1 }, { kind: 'canyon', from: 140, to: 200 }, { kind: 'hills', from: 200, to: 280 }, { kind: 'meadow', from: 280, to: 380 }],
      moves: [
        { bars: 34, gen: { seed: 41, b0: 9, b1: 15, pool: MEADOW, gap: 5, first: 2, tail: 4 } },
        { bars: 34, rest: 8, gen: { seed: 42, b0: 14, b1: 21, pool: MEADOW, gap: 5, first: 1, tail: 4 } },
        {
          bars: 34, rest: 8,
          gen: { seed: 43, b0: 18, b1: 26, pool: MEADOW, gap: 5, first: 1, tail: 4 },
          // canyon: an ambush from behind while a giant bubble comes ahead
          set: [W(9, G('scurry', 12, 180, { spread: 8 })), W(19, G('bubble', 1, 0, { hp: 6, elite: true, spread: 0 }), G('blot', 10, 180, { at: 2 }))],
        },
        { bars: 34, rest: 8, gen: { seed: 44, b0: 22, b1: 31, pool: MEADOW, gap: 5, first: 1, tail: 4 } },
        {
          bars: 50, rest: 8, notes: 10,
          gen: { seed: 45, b0: 14, b1: 22, pool: [['blot', 3], ['scurry', 3], ['moth', 2]], gap: 6, first: 1, tail: 8 },
        },
      ],
      boss: { kind: 'bossBlot', at: 4 },
    }),
  },
  {
    id: 'mx', world: 'meadow', map: [32, 84], kind: 'extra', requires: ['m3'], stars: 7,
    def: journey({
      id: 'mx', world: 'meadow', name: { pt: 'Trilha dos Vagalumes', en: 'Firefly Trail' }, slots: 4, coins: 280, towers: T3, pickups: 14,
      features: [{ kind: 'forest', from: 0, to: 90, side: 0 }, { kind: 'river', from: 92, to: 100 }, { kind: 'forest', from: 105, to: 200, side: 1 }, { kind: 'canyon', from: 210, to: 260 }, { kind: 'hills', from: 260, to: 330 }],
      moves: [
        { bars: 34, gen: { seed: 71, b0: 12, b1: 19, pool: MEADOW, gap: 4, first: 2, tail: 4, hp: 1.15 } },
        { bars: 34, rest: 8, gen: { seed: 72, b0: 18, b1: 26, pool: MEADOW, gap: 4, first: 1, tail: 4, hp: 1.15 }, set: [W(13, G('moth', 10, 100, { every: 0.6 }))] },
        { bars: 34, rest: 8, gen: { seed: 73, b0: 23, b1: 32, pool: MEADOW, gap: 4, first: 1, tail: 4, hp: 1.2 }, set: [W(17, G('bubble', 2, 0, { hp: 5, elite: true, every: 4 }), G('scurry', 14, 180, { at: 4 }))] },
        { bars: 30, rest: 8, gen: { seed: 74, b0: 28, b1: 38, pool: MEADOW, gap: 4, first: 1, tail: 4, hp: 1.2 } },
        { bars: 32, rest: 8, gen: { seed: 75, b0: 32, b1: 44, pool: MEADOW, gap: 4, first: 1, tail: 4, hp: 1.25 }, set: [W(21, G('moth', 12, -100, { every: 0.5 }), G('scurry', 14, 100, { at: 2 }))] },
      ],
    }),
  },
  // ───────────────────────────── Desert ─────────────────────────────
  {
    id: 'd1', world: 'desert', map: [62, 72], kind: 'main', requires: ['m4'],
    def: journey({
      id: 'd1', world: 'desert', name: { pt: 'Areias que Cantam', en: 'Singing Sands' }, slots: 3, coins: 240, towers: T4, newTower: 'shaker', pickups: 12,
      features: [{ kind: 'meadow', from: 0, to: 50 }, { kind: 'canyon', from: 50, to: 110 }, { kind: 'hills', from: 110, to: 170 }, { kind: 'ruins', from: 170, to: 230 }],
      moves: [
        {
          bars: 30,
          gen: { seed: 101, b0: 9, b1: 15, pool: [['blot', 3], ['scurry', 2], ['moth', 1], ['scorpion', 3]], gap: 5, first: 2, tail: 4 },
        },
        {
          bars: 32, rest: 8,
          gen: { seed: 102, b0: 14, b1: 21, pool: [['blot', 2], ['scurry', 2], ['moth', 1], ['scorpion', 3], ['whirl', 3]], gap: 5, first: 1, tail: 4 },
          set: [W(6, G('whirl', 3, 0, { every: 2 }))],
        },
        {
          bars: 30, rest: 8,
          gen: { seed: 103, b0: 18, b1: 26, pool: [['blot', 2], ['scurry', 2], ['moth', 2], ['scorpion', 3], ['whirl', 3]], gap: 5, first: 1, tail: 4 },
          set: [W(11, G('scorpion', 1, 0, { hp: 3, elite: true, spread: 0 }), G('whirl', 3, 180, { at: 4 }))],
        },
        {
          bars: 30, rest: 8,
          gen: { seed: 104, b0: 22, b1: 31, pool: [['blot', 2], ['scurry', 2], ['moth', 2], ['scorpion', 3], ['whirl', 3]], gap: 5, first: 1, tail: 4 },
        },
      ],
    }),
  },
  {
    id: 'd2', world: 'desert', map: [74, 80], kind: 'main', requires: ['d1'],
    def: journey({
      id: 'd2', world: 'desert', name: { pt: 'O Oásis', en: 'The Oasis' }, slots: 4, coins: 260, towers: T5, newTower: 'crystal', pickups: 13,
      features: [{ kind: 'hills', from: 0, to: 40 }, { kind: 'lake', from: 40, to: 120, side: 1 }, { kind: 'river', from: 126, to: 134 }, { kind: 'lake', from: 150, to: 200, side: -1 }, { kind: 'canyon', from: 205, to: 250 }],
      moves: [
        { bars: 32, gen: { seed: 201, b0: 11, b1: 18, pool: [['blot', 2], ['scurry', 2], ['scorpion', 2], ['whirl', 2], ['echo', 3]], gap: 5, first: 2, tail: 4 } },
        { bars: 32, rest: 8, gen: { seed: 202, b0: 17, b1: 25, pool: DUNES, gap: 5, first: 1, tail: 4 } },
        { bars: 32, rest: 8, gen: { seed: 203, b0: 22, b1: 31, pool: DUNES, gap: 5, first: 1, tail: 4 }, set: [W(11, G('echo', 1, 0, { hp: 5, elite: true, spread: 0 }), G('moth', 8, 100, { at: 3 }))] },
        { bars: 31, rest: 8, gen: { seed: 204, b0: 27, b1: 37, pool: DUNES, gap: 5, first: 1, tail: 4 }, set: [W(16, G('scorpion', 6, 180, { every: 1 }))] },
      ],
    }),
  },
  {
    id: 'd3', world: 'desert', map: [86, 70], kind: 'main', requires: ['d2'],
    def: journey({
      id: 'd3', world: 'desert', name: { pt: 'Obeliscos Mudos', en: 'Mute Obelisks' }, slots: 4, coins: 280, towers: T5, pickups: 14,
      obelisks: [{ s: 50, side: 1 }, { s: 95, side: -1 }, { s: 140, side: 1 }, { s: 185, side: -1 }, { s: 230, side: 1 }],
      features: [{ kind: 'ruins', from: 30, to: 150 }, { kind: 'canyon', from: 150, to: 200 }, { kind: 'ruins', from: 200, to: 270 }],
      moves: [
        { bars: 30, gen: { seed: 301, b0: 12, b1: 19, pool: DUNES, gap: 5, first: 2, tail: 4 } },
        { bars: 30, rest: 8, gen: { seed: 302, b0: 18, b1: 26, pool: DUNES, gap: 5, first: 1, tail: 4 } },
        { bars: 28, rest: 8, gen: { seed: 303, b0: 23, b1: 31, pool: DUNES, gap: 5, first: 1, tail: 4 }, set: [W(10, G('scorpion', 8, 180, { every: 0.8 }))] },
        { bars: 28, rest: 8, gen: { seed: 304, b0: 27, b1: 36, pool: DUNES, gap: 5, first: 1, tail: 4 }, set: [W(11, G('whirl', 1, 0, { hp: 6, elite: true, spread: 0 }), G('echo', 6, 180, { at: 4 }))] },
        { bars: 24, rest: 8, gen: { seed: 305, b0: 32, b1: 42, pool: DUNES, gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'd4', world: 'desert', map: [98, 76], kind: 'boss', requires: ['d3'],
    def: journey({
      id: 'd4', world: 'desert', name: { pt: 'O Escaravelho', en: 'The Scarab' }, slots: 5, coins: 340, towers: T5, pickups: 15, song: 'boss',
      features: [{ kind: 'hills', from: 0, to: 60 }, { kind: 'canyon', from: 60, to: 140 }, { kind: 'ruins', from: 140, to: 230 }, { kind: 'canyon', from: 260, to: 330 }],
      moves: [
        { bars: 34, gen: { seed: 401, b0: 14, b1: 22, pool: DUNES, gap: 5, first: 2, tail: 4 } },
        { bars: 34, rest: 8, gen: { seed: 402, b0: 20, b1: 29, pool: DUNES, gap: 5, first: 1, tail: 4 }, set: [W(14, G('whirl', 5, 180, { every: 1 }))] },
        { bars: 34, rest: 8, gen: { seed: 403, b0: 26, b1: 35, pool: DUNES, gap: 5, first: 1, tail: 4 }, set: [W(13, G('scorpion', 1, 0, { hp: 3.5, elite: true, spread: 0 }), G('echo', 5, 168, { at: 3 }))] },
        { bars: 34, rest: 8, gen: { seed: 404, b0: 30, b1: 40, pool: DUNES, gap: 5, first: 1, tail: 4 } },
        { bars: 50, rest: 8, notes: 10, gen: { seed: 405, b0: 18, b1: 28, pool: [['blot', 2], ['scurry', 2], ['echo', 2], ['moth', 2]], gap: 6, first: 1, tail: 8 } },
      ],
      boss: { kind: 'bossScarab', at: 4 },
    }),
  },
  {
    id: 'dx', world: 'desert', map: [80, 58], kind: 'extra', requires: ['d3'], stars: 18,
    def: journey({
      id: 'dx', world: 'desert', name: { pt: 'Miragem', en: 'Mirage' }, slots: 5, coins: 300, towers: T5, pickups: 15,
      obelisks: [{ s: 70, side: -1 }, { s: 150, side: 1 }, { s: 230, side: -1 }],
      features: [{ kind: 'hills', from: 0, to: 80 }, { kind: 'canyon', from: 80, to: 160 }, { kind: 'lake', from: 170, to: 240, side: 1 }, { kind: 'canyon', from: 250, to: 330 }],
      moves: [
        { bars: 35, gen: { seed: 501, b0: 16, b1: 25, pool: DUNES, gap: 4, first: 2, tail: 4, hp: 1.15 } },
        { bars: 35, rest: 8, gen: { seed: 502, b0: 24, b1: 33, pool: DUNES, gap: 4, first: 1, tail: 4, hp: 1.15 }, set: [W(13, G('whirl', 6, 180, { every: 0.8 }))] },
        { bars: 35, rest: 8, gen: { seed: 503, b0: 30, b1: 40, pool: DUNES, gap: 4, first: 1, tail: 4, hp: 1.2 }, set: [W(17, G('scorpion', 2, 0, { hp: 5, elite: true, every: 4 }))] },
        { bars: 33, rest: 8, gen: { seed: 504, b0: 36, b1: 47, pool: DUNES, gap: 4, first: 1, tail: 4, hp: 1.2 } },
        { bars: 25, rest: 8, gen: { seed: 505, b0: 42, b1: 54, pool: DUNES, gap: 4, first: 1, tail: 4, hp: 1.25 } },
      ],
    }),
  },
  // ───────────────────────────── Ice ─────────────────────────────
  {
    id: 'i1', world: 'ice', map: [112, 68], kind: 'main', requires: ['d4'],
    def: journey({
      id: 'i1', world: 'ice', name: { pt: 'Neve que Ecoa', en: 'Echoing Snow' }, slots: 5, coins: 320, towers: T6, newTower: 'horn', pickups: 13,
      features: [{ kind: 'hills', from: 0, to: 70 }, { kind: 'lake', from: 70, to: 130, side: 1 }, { kind: 'forest', from: 130, to: 200, side: -1 }, { kind: 'canyon', from: 200, to: 240 }],
      moves: [
        { bars: 32, gen: { seed: 601, b0: 14, b1: 22, pool: [['wolf', 3], ['shell', 3], ['moth', 2], ['scorpion', 1]], gap: 5, first: 2, tail: 4 } },
        { bars: 32, rest: 8, gen: { seed: 602, b0: 20, b1: 29, pool: [['wolf', 3], ['shell', 3], ['phantom', 3], ['moth', 2]], gap: 5, first: 1, tail: 4 } },
        { bars: 26, rest: 8, gen: { seed: 603, b0: 25, b1: 34, pool: [['wolf', 3], ['shell', 3], ['phantom', 3], ['moth', 2]], gap: 5, first: 1, tail: 4 }, set: [W(11, G('shell', 1, 0, { hp: 5, elite: true, spread: 0 }), G('wolf', 10, 180, { at: 3 }))] },
        { bars: 26, rest: 8, gen: { seed: 604, b0: 30, b1: 40, pool: [['wolf', 3], ['shell', 3], ['phantom', 3], ['moth', 2]], gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'i2', world: 'ice', map: [124, 58], kind: 'main', requires: ['i1'],
    def: journey({
      id: 'i2', world: 'ice', name: { pt: 'O Coro Gelado', en: 'The Frozen Choir' }, slots: 5, coins: 340, towers: T7, newTower: 'choir', pickups: 14,
      features: [{ kind: 'forest', from: 0, to: 90, side: 0 }, { kind: 'river', from: 96, to: 104 }, { kind: 'canyon', from: 120, to: 180 }, { kind: 'hills', from: 180, to: 250 }],
      moves: [
        { bars: 30, gen: { seed: 701, b0: 16, b1: 24, pool: PEAKS, gap: 5, first: 2, tail: 4 } },
        { bars: 30, rest: 8, gen: { seed: 702, b0: 22, b1: 31, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(10, G('muffler', 2, 0, { every: 3 }), G('phantom', 6, 180, { at: 2 }))] },
        { bars: 26, rest: 8, gen: { seed: 703, b0: 27, b1: 36, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(16, G('wolf', 14, 168, { spread: 8 }))] },
        { bars: 26, rest: 8, gen: { seed: 704, b0: 32, b1: 43, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(6, G('muffler', 1, 0, { hp: 4, elite: true, spread: 0 }), G('shell', 4, 0, { at: 2 }))] },
      ],
    }),
  },
  {
    id: 'i3', world: 'ice', map: [136, 66], kind: 'main', requires: ['i2'],
    def: journey({
      id: 'i3', world: 'ice', name: { pt: 'Lago de Espelho', en: 'Mirror Lake' }, slots: 6, coins: 360, towers: T7, pickups: 15,
      obelisks: [{ s: 80, side: 1 }, { s: 160, side: -1 }, { s: 230, side: 1 }],
      features: [{ kind: 'lake', from: 10, to: 90, side: -1 }, { kind: 'lake', from: 100, to: 180, side: 1 }, { kind: 'hills', from: 180, to: 230 }, { kind: 'forest', from: 230, to: 270, side: 0 }],
      moves: [
        { bars: 32, gen: { seed: 801, b0: 18, b1: 27, pool: PEAKS, gap: 5, first: 2, tail: 4 } },
        { bars: 32, rest: 8, gen: { seed: 802, b0: 25, b1: 34, pool: PEAKS, gap: 5, first: 1, tail: 4 } },
        { bars: 28, rest: 8, gen: { seed: 803, b0: 30, b1: 40, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(11, G('phantom', 1, 0, { hp: 6, elite: true, spread: 0 }), G('phantom', 8, 180, { at: 2 }))] },
        { bars: 32, rest: 8, gen: { seed: 804, b0: 35, b1: 47, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(16, G('wolf', 16, 0, { spread: 30 }), G('muffler', 2, 180, { every: 3, at: 2 }))] },
      ],
    }),
  },
  {
    id: 'i4', world: 'ice', map: [146, 52], kind: 'boss', requires: ['i3'],
    def: journey({
      id: 'i4', world: 'ice', name: { pt: 'A Mariposa-Rainha', en: 'The Moth Queen' }, slots: 6, coins: 380, towers: T7, pickups: 16, song: 'boss',
      features: [{ kind: 'hills', from: 0, to: 90 }, { kind: 'forest', from: 90, to: 170, side: 0 }, { kind: 'canyon', from: 170, to: 230 }, { kind: 'lake', from: 240, to: 320, side: -1 }, { kind: 'hills', from: 320, to: 400 }],
      moves: [
        { bars: 36, gen: { seed: 901, b0: 18, b1: 27, pool: PEAKS, gap: 5, first: 2, tail: 4 } },
        { bars: 36, rest: 8, gen: { seed: 902, b0: 25, b1: 35, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(16, G('moth', 12, 50, { every: 0.5 }))] },
        { bars: 34, rest: 8, gen: { seed: 903, b0: 31, b1: 41, pool: PEAKS, gap: 5, first: 1, tail: 4 }, set: [W(11, G('shell', 1, 0, { hp: 6, elite: true, spread: 0 }), G('wolf', 12, 180, { at: 2 }))] },
        { bars: 34, rest: 8, gen: { seed: 904, b0: 36, b1: 47, pool: PEAKS, gap: 5, first: 1, tail: 4 } },
        { bars: 52, rest: 8, notes: 10, gen: { seed: 905, b0: 22, b1: 32, pool: [['wolf', 3], ['phantom', 2], ['shell', 2]], gap: 6, first: 1, tail: 8 } },
      ],
      boss: { kind: 'bossMoth', at: 4 },
    }),
  },
  {
    id: 'ix', world: 'ice', map: [134, 80], kind: 'extra', requires: ['i3'], stars: 30,
    def: journey({
      id: 'ix', world: 'ice', name: { pt: 'Aurora Partida', en: 'Broken Aurora' }, slots: 6, coins: 360, towers: T7, pickups: 16,
      obelisks: [{ s: 60, side: -1 }, { s: 130, side: 1 }, { s: 200, side: -1 }, { s: 270, side: 1 }],
      features: [{ kind: 'canyon', from: 10, to: 100 }, { kind: 'lake', from: 110, to: 180, side: 1 }, { kind: 'forest', from: 190, to: 260, side: 0 }, { kind: 'canyon', from: 260, to: 330 }],
      moves: [
        { bars: 34, gen: { seed: 1001, b0: 20, b1: 30, pool: PEAKS, gap: 4, first: 2, tail: 4, hp: 1.2 } },
        { bars: 34, rest: 8, gen: { seed: 1002, b0: 28, b1: 38, pool: PEAKS, gap: 4, first: 1, tail: 4, hp: 1.2 } },
        { bars: 34, rest: 8, gen: { seed: 1003, b0: 34, b1: 45, pool: PEAKS, gap: 4, first: 1, tail: 4, hp: 1.25 }, set: [W(17, G('muffler', 2, 0, { hp: 4, elite: true, every: 4 }), G('phantom', 10, 168, { at: 2 }))] },
        { bars: 30, rest: 8, gen: { seed: 1004, b0: 40, b1: 52, pool: PEAKS, gap: 4, first: 1, tail: 4, hp: 1.25 } },
        { bars: 28, rest: 8, gen: { seed: 1005, b0: 46, b1: 60, pool: PEAKS, gap: 4, first: 1, tail: 4, hp: 1.3 } },
      ],
    }),
  },
  // ───────────────────────────── Forge ─────────────────────────────
  {
    id: 'f1', world: 'forge', map: [136, 36], kind: 'main', requires: ['i4'],
    def: journey({
      id: 'f1', world: 'forge', name: { pt: 'Brasas', en: 'Embers' }, slots: 6, coins: 420, towers: T8, newTower: 'bass', pickups: 15,
      features: [{ kind: 'canyon', from: 0, to: 70 }, { kind: 'lake', from: 70, to: 140, side: -1 }, { kind: 'ruins', from: 140, to: 210 }, { kind: 'canyon', from: 220, to: 290 }],
      moves: [
        { bars: 36, gen: { seed: 1101, b0: 20, b1: 30, pool: [['ember', 3], ['shield', 3], ['shell', 2], ['wolf', 2]], gap: 5, first: 2, tail: 4 } },
        { bars: 36, rest: 8, gen: { seed: 1102, b0: 27, b1: 37, pool: [['ember', 3], ['shield', 3], ['slug', 1], ['shell', 2], ['wolf', 1]], gap: 5, first: 1, tail: 4 }, set: [W(11, G('slug', 2, 0, { every: 4 }))] },
        { bars: 32, rest: 8, gen: { seed: 1103, b0: 33, b1: 44, pool: FORGE, gap: 5, first: 1, tail: 4 }, set: [W(16, G('slug', 1, 0, { hp: 3, elite: true, spread: 0 }), G('ember', 14, 180, { at: 3 }))] },
        { bars: 32, rest: 8, gen: { seed: 1104, b0: 38, b1: 51, pool: FORGE, gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'f2', world: 'forge', map: [124, 28], kind: 'main', requires: ['f1'],
    def: journey({
      id: 'f2', world: 'forge', name: { pt: 'Rios de Lava', en: 'Lava Rivers' }, slots: 7, coins: 440, towers: T8, pickups: 16,
      features: [{ kind: 'river', from: 50, to: 58 }, { kind: 'hills', from: 60, to: 120 }, { kind: 'river', from: 126, to: 134 }, { kind: 'canyon', from: 150, to: 220 }, { kind: 'river', from: 240, to: 248 }, { kind: 'ruins', from: 250, to: 310 }],
      moves: [
        { bars: 38, gen: { seed: 1201, b0: 22, b1: 32, pool: FORGE, gap: 5, first: 2, tail: 4 } },
        { bars: 38, rest: 8, gen: { seed: 1202, b0: 30, b1: 41, pool: FORGE, gap: 5, first: 1, tail: 4 }, set: [W(16, G('mender', 3, 0, { every: 2 }), G('shield', 4, 0, { at: 1 }))] },
        { bars: 36, rest: 8, gen: { seed: 1203, b0: 36, b1: 48, pool: FORGE, gap: 5, first: 1, tail: 4 }, set: [W(11, G('slug', 1, 0, { hp: 3.5, elite: true, spread: 0 }), G('mender', 2, 0, { at: 2 }), G('ember', 12, 180, { at: 4 }))] },
        { bars: 36, rest: 8, gen: { seed: 1204, b0: 42, b1: 55, pool: FORGE, gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'f3', world: 'forge', map: [112, 36], kind: 'main', requires: ['f2'],
    def: journey({
      id: 'f3', world: 'forge', name: { pt: 'A Bigorna', en: 'The Anvil' }, slots: 7, coins: 460, towers: T8, pickups: 17,
      obelisks: [{ s: 70, side: 1 }, { s: 140, side: -1 }, { s: 210, side: 1 }, { s: 280, side: -1 }],
      features: [{ kind: 'ruins', from: 20, to: 200 }, { kind: 'lake', from: 90, to: 150, side: 1 }, { kind: 'canyon', from: 220, to: 290 }, { kind: 'ruins', from: 290, to: 340 }],
      moves: [
        { bars: 38, gen: { seed: 1301, b0: 24, b1: 35, pool: FORGE, gap: 5, first: 2, tail: 4 } },
        { bars: 38, rest: 8, gen: { seed: 1302, b0: 32, b1: 44, pool: FORGE, gap: 5, first: 1, tail: 4 } },
        { bars: 38, rest: 8, gen: { seed: 1303, b0: 39, b1: 51, pool: FORGE, gap: 5, first: 1, tail: 4 }, set: [W(16, G('shield', 1, 0, { hp: 6, elite: true, spread: 0 }), G('slug', 2, 168, { at: 2, every: 4 }))] },
        { bars: 42, rest: 8, gen: { seed: 1304, b0: 45, b1: 59, pool: FORGE, gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'f4', world: 'forge', map: [100, 26], kind: 'boss', requires: ['f3'],
    def: journey({
      id: 'f4', world: 'forge', name: { pt: 'O Golem da Forja', en: 'The Forge Golem' }, slots: 8, coins: 500, towers: T8, pickups: 18, song: 'boss',
      features: [{ kind: 'canyon', from: 0, to: 80 }, { kind: 'hills', from: 80, to: 170 }, { kind: 'river', from: 176, to: 184 }, { kind: 'ruins', from: 190, to: 290 }, { kind: 'canyon', from: 300, to: 400 }],
      moves: [
        { bars: 38, gen: { seed: 1401, b0: 24, b1: 35, pool: FORGE, gap: 5, first: 2, tail: 4 } },
        { bars: 38, rest: 8, gen: { seed: 1402, b0: 32, b1: 44, pool: FORGE, gap: 5, first: 1, tail: 4 } },
        { bars: 38, rest: 8, gen: { seed: 1403, b0: 39, b1: 51, pool: FORGE, gap: 5, first: 1, tail: 4 }, set: [W(16, G('slug', 2, 0, { hp: 2.5, elite: true, every: 4 }), G('ember', 14, 168, { at: 3 }))] },
        { bars: 38, rest: 8, gen: { seed: 1404, b0: 44, b1: 57, pool: FORGE, gap: 5, first: 1, tail: 4 } },
        { bars: 54, rest: 8, notes: 10, gen: { seed: 1405, b0: 26, b1: 38, pool: [['ember', 3], ['wolf', 2], ['shield', 2], ['shell', 1]], gap: 6, first: 1, tail: 8 } },
      ],
      boss: { kind: 'bossGolem', at: 4 },
    }),
  },
  {
    id: 'fx', world: 'forge', map: [120, 14], kind: 'extra', requires: ['f3'], stars: 42,
    def: journey({
      id: 'fx', world: 'forge', name: { pt: 'Coração Vulcânico', en: 'Volcanic Heart' }, slots: 8, coins: 480, towers: T8, pickups: 18,
      obelisks: [{ s: 60, side: 1 }, { s: 120, side: -1 }, { s: 180, side: 1 }, { s: 240, side: -1 }, { s: 300, side: 1 }],
      features: [{ kind: 'canyon', from: 0, to: 120 }, { kind: 'ruins', from: 120, to: 220 }, { kind: 'canyon', from: 220, to: 400 }],
      moves: [
        { bars: 44, gen: { seed: 1501, b0: 26, b1: 38, pool: FORGE, gap: 4, first: 2, tail: 4, hp: 1.15 } },
        { bars: 44, rest: 8, gen: { seed: 1502, b0: 35, b1: 48, pool: FORGE, gap: 4, first: 1, tail: 4, hp: 1.2 } },
        { bars: 44, rest: 8, gen: { seed: 1503, b0: 43, b1: 57, pool: FORGE, gap: 4, first: 1, tail: 4, hp: 1.2 }, set: [W(20, G('slug', 2, 0, { hp: 3, elite: true, every: 4 }), G('mender', 3, 0, { at: 2 }))] },
        { bars: 40, rest: 8, gen: { seed: 1504, b0: 50, b1: 65, pool: FORGE, gap: 4, first: 1, tail: 4, hp: 1.25 } },
        { bars: 34, rest: 8, gen: { seed: 1505, b0: 56, b1: 72, pool: FORGE, gap: 4, first: 1, tail: 4, hp: 1.3 } },
      ],
    }),
  },
  // ───────────────────────────── Citadel ─────────────────────────────
  {
    id: 'c1', world: 'citadel', map: [84, 36], kind: 'main', requires: ['f4'],
    def: journey({
      id: 'c1', world: 'citadel', name: { pt: 'Degraus de Mármore', en: 'Marble Steps' }, slots: 8, coins: 500, towers: T8, pickups: 16,
      obelisks: [{ s: 90, side: -1 }, { s: 200, side: 1 }],
      features: [{ kind: 'ruins', from: 0, to: 300 }, { kind: 'hills', from: 60, to: 150 }, { kind: 'canyon', from: 160, to: 220 }],
      moves: [
        { bars: 40, gen: { seed: 1601, b0: 26, b1: 37, pool: [['knight', 2], ['mimic', 1], ['phantom', 2], ['ember', 2], ['shield', 2], ['wolf', 2], ['whirl', 2]], gap: 5, first: 2, tail: 4 } },
        { bars: 40, rest: 8, gen: { seed: 1602, b0: 34, b1: 46, pool: CITADEL, gap: 5, first: 1, tail: 4 }, set: [W(11, G('mimic', 1, 0, { spread: 0 }))] },
        { bars: 36, rest: 8, gen: { seed: 1603, b0: 41, b1: 54, pool: CITADEL, gap: 5, first: 1, tail: 4 }, set: [W(16, G('knight', 1, 0, { hp: 2, elite: true, spread: 0 }), G('mimic', 1, 180, { at: 4 }))] },
        { bars: 34, rest: 8, gen: { seed: 1604, b0: 47, b1: 61, pool: CITADEL, gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'c2', world: 'citadel', map: [72, 26], kind: 'main', requires: ['c1'],
    def: journey({
      id: 'c2', world: 'citadel', name: { pt: 'Ecos Vazios', en: 'Hollow Echoes' }, slots: 8, coins: 520, towers: T8, pickups: 17,
      obelisks: [{ s: 70, side: 1 }, { s: 150, side: -1 }, { s: 230, side: 1 }],
      features: [{ kind: 'canyon', from: 20, to: 110 }, { kind: 'ruins', from: 110, to: 330 }],
      moves: [
        { bars: 40, gen: { seed: 1701, b0: 28, b1: 39, pool: [...CITADEL, ['mimic', 2], ['echo', 2]], gap: 5, first: 2, tail: 4 } },
        { bars: 40, rest: 8, gen: { seed: 1702, b0: 36, b1: 48, pool: [...CITADEL, ['mimic', 2], ['echo', 2]], gap: 5, first: 1, tail: 4 }, set: [W(11, G('mimic', 1, 0), G('mimic', 1, 180, { at: 3 }))] },
        { bars: 40, rest: 8, gen: { seed: 1703, b0: 43, b1: 56, pool: [...CITADEL, ['mimic', 2], ['echo', 2]], gap: 5, first: 1, tail: 4 }, set: [W(21, G('mimic', 1, 0, { hp: 3, elite: true, spread: 0 }), G('echo', 8, 168, { at: 2 }))] },
        { bars: 36, rest: 8, gen: { seed: 1704, b0: 49, b1: 63, pool: [...CITADEL, ['mimic', 2], ['echo', 2]], gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'c3', world: 'citadel', map: [60, 36], kind: 'main', requires: ['c2'],
    def: journey({
      id: 'c3', world: 'citadel', name: { pt: 'A Última Escada', en: 'The Last Stair' }, slots: 8, coins: 540, towers: T8, pickups: 18,
      obelisks: [{ s: 80, side: -1 }, { s: 170, side: 1 }, { s: 260, side: -1 }],
      features: [{ kind: 'ruins', from: 0, to: 200 }, { kind: 'canyon', from: 200, to: 280 }, { kind: 'ruins', from: 280, to: 350 }],
      moves: [
        { bars: 42, gen: { seed: 1801, b0: 30, b1: 42, pool: CITADEL, gap: 5, first: 2, tail: 4 } },
        { bars: 42, rest: 8, gen: { seed: 1802, b0: 38, b1: 51, pool: [...CITADEL, ['conductor', 1]], gap: 5, first: 1, tail: 4 }, set: [W(11, G('conductor', 1, 0, { spread: 0 }), G('wolf', 10, 0, { at: 1 }))] },
        { bars: 40, rest: 8, gen: { seed: 1803, b0: 46, b1: 60, pool: [...CITADEL, ['conductor', 1]], gap: 5, first: 1, tail: 4 }, set: [W(21, G('conductor', 1, 0, { hp: 2, elite: true, spread: 0 }), G('knight', 3, 180, { at: 2 }))] },
        { bars: 39, rest: 8, gen: { seed: 1804, b0: 52, b1: 68, pool: [...CITADEL, ['conductor', 1]], gap: 5, first: 1, tail: 4 } },
      ],
    }),
  },
  {
    id: 'c4', world: 'citadel', map: [46, 24], kind: 'boss', requires: ['c3'],
    def: journey({
      id: 'c4', world: 'citadel', name: { pt: 'O Silêncio', en: 'The Silence' }, slots: 8, coins: 580, towers: T8, pickups: 20, song: 'finale',
      features: [{ kind: 'ruins', from: 0, to: 460 }, { kind: 'canyon', from: 120, to: 200 }, { kind: 'hills', from: 260, to: 340 }],
      moves: [
        { bars: 46, gen: { seed: 1901, b0: 30, b1: 42, pool: CITADEL, gap: 5, first: 2, tail: 4 } },
        { bars: 46, rest: 8, gen: { seed: 1902, b0: 38, b1: 52, pool: [...CITADEL, ['conductor', 1]], gap: 5, first: 1, tail: 4 } },
        { bars: 46, rest: 8, gen: { seed: 1903, b0: 45, b1: 60, pool: [...CITADEL, ['conductor', 1]], gap: 5, first: 1, tail: 4 }, set: [W(21, G('conductor', 1, 0, { hp: 2, elite: true, spread: 0 }), G('mimic', 2, 168, { at: 2, every: 4 }))] },
        { bars: 46, rest: 8, gen: { seed: 1904, b0: 51, b1: 67, pool: [...CITADEL, ['conductor', 1]], gap: 5, first: 1, tail: 4 } },
        { bars: 54, rest: 8, notes: 12, gen: { seed: 1905, b0: 30, b1: 42, pool: [['wolf', 2], ['ember', 2], ['shield', 2], ['whirl', 2]], gap: 6, first: 1, tail: 8 } },
      ],
      boss: { kind: 'silence', at: 4 },
    }),
  },
  {
    id: 'cx', world: 'citadel', map: [28, 16], kind: 'secret', requires: ['c4'], stars: 60,
    def: journey({
      id: 'cx', world: 'citadel', name: { pt: 'O Abismo', en: 'The Abyss' }, slots: 8, coins: 560, towers: T8, pickups: 22, song: 'finale',
      obelisks: [{ s: 60, side: 1 }, { s: 140, side: -1 }, { s: 220, side: 1 }, { s: 300, side: -1 }, { s: 380, side: 1 }, { s: 460, side: -1 }],
      features: [{ kind: 'canyon', from: 0, to: 520 }],
      moves: [
        { bars: 56, gen: { seed: 2001, b0: 32, b1: 46, pool: [...CITADEL, ['conductor', 1], ['slug', 1], ['muffler', 1]], gap: 4, first: 2, tail: 4, hp: 1.2 } },
        { bars: 56, rest: 8, gen: { seed: 2002, b0: 42, b1: 58, pool: [...CITADEL, ['conductor', 1], ['slug', 1], ['muffler', 1]], gap: 4, first: 1, tail: 4, hp: 1.25 } },
        { bars: 56, rest: 8, gen: { seed: 2003, b0: 51, b1: 69, pool: [...CITADEL, ['conductor', 1], ['slug', 1], ['muffler', 1]], gap: 4, first: 1, tail: 4, hp: 1.3 } },
        { bars: 54, rest: 8, gen: { seed: 2004, b0: 59, b1: 79, pool: [...CITADEL, ['conductor', 1], ['slug', 1], ['muffler', 1]], gap: 4, first: 1, tail: 4, hp: 1.35 } },
        { bars: 46, rest: 8, gen: { seed: 2005, b0: 66, b1: 88, pool: [...CITADEL, ['conductor', 1], ['slug', 1], ['muffler', 1]], gap: 4, first: 1, tail: 4, hp: 1.4 } },
      ],
    }),
  },
];

export const LEVEL_BY_ID = new Map(CAMPAIGN.map((l) => [l.id, l]));

/** tools: a level rebuilt with other difficulty factors per movement (and guardian health) */
export function rebuildDef(id: string, tune: number[], bossHp?: number): JourneyDef {
  const s = SPECS.get(id)!;
  return journey(bossHp !== undefined && s.boss ? { ...s, boss: { ...s.boss, hp: bossHp } } : s, tune);
}

/** tools: which movements of a level are generated (tunable) */
export function tunable(id: string): boolean[] {
  return SPECS.get(id)!.moves.map((m) => !!m.gen);
}

/** Endless "Bis": a very long walk in many movements, with waves that keep growing. */
export function endlessDef(world: WorldId, slots = 8): JourneyDef {
  const towers: TowerKind[] = world === 'meadow' ? T3 : world === 'desert' ? T5 : world === 'ice' ? T7 : T8;
  const pool: [EnemyKind, number][] = world === 'meadow' ? MEADOW : world === 'desert' ? DUNES : world === 'ice' ? PEAKS : world === 'forge' ? FORGE : CITADEL;
  const moves: MoveSpec[] = [];
  for (let k = 0; k < 8; k++) {
    moves.push({ bars: 30, rest: 8, notes: 8, gen: { seed: 2024 + world.length * 7 + k, b0: 10 + k * 3, b1: 16 + k * 3, pool, gap: 4, first: 1, tail: 3 } });
  }
  // an encore grows until the band gives way: every movement twice as hard (the record is how far you get)
  const ramp = moves.map((_, k) => Math.pow(2.1, k));
  return journey({
    id: `bis-${world}`, world, name: { pt: 'Bis', en: 'Encore' }, slots, coins: 320, towers, pickups: 34,
    features: [{ kind: 'hills', from: 0, to: 120 }, { kind: 'forest', from: 120, to: 240, side: 0 }, { kind: 'canyon', from: 240, to: 330 }, { kind: 'lake', from: 330, to: 420, side: 1 }, { kind: 'hills', from: 420, to: 520 }],
    moves,
  }, ramp);
}
