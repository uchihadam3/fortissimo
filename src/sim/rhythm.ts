/**
 * The player's rhythm (v3): the baton, the groove, solos and the Maestro's call & response.
 *
 * Judging a tap against the beat happens in the controller (it knows when the player heard the
 * music); the simulation only receives what came of it, as recorded actions: the groove level
 * (`Journey.setGroove`), a solo (`Journey.solo`) and an echo that succeeded (`Journey.echo`). That
 * keeps journeys deterministic and checkpoints replayable. This module is pure: the groove state
 * machine, the judgement windows and the call patterns are shared by the battle, the bots and the
 * tests.
 */
import type { TowerKind, WorldId } from './defs';

export type TapQuality = 'perfect' | 'good' | 'miss';

export const RHYTHM = {
  /** seconds from the beat (as heard) for a perfect / a good tap */
  perfect: 0.06,
  good: 0.12,
  /** on-beat taps in a row needed for groove 1…4 */
  thresholds: [4, 12, 24, 40] as readonly number[],
  /** from this groove on, eighth notes count as well as the beats */
  eighthsFrom: 3,
  /** bars without a tap before the groove starts to fade (one level per this many bars) */
  idleBars: 2,
  /** every tower's damage × (1 + grooveDamage[groove]): groove 4 is where everything kicks in */
  grooveDamage: [0, 0.05, 0.11, 0.18, 0.3] as readonly number[],
  /** the FORTÍSSIMO meter fills × (1 + grooveFF × groove) */
  grooveFF: 0.15,
  maxGroove: 4,
};

export const SOLO = {
  /** charge per bar a musician gets just for playing (while the journey is under way) … */
  perBar: 1 / 120,
  /** … × (1 + grooveCharge × groove) */
  grooveCharge: 1.5,
  /** a fighter also charges with the damage it deals: a full charge is this many bars of its own playing */
  damageBars: 48,
  /** strength of a perfectly timed solo (a good one is 1) */
  perfect: 1.35,
  /** steps a solo lasts (one bar of 16ths) */
  steps: 16,
  /** choir solo: the whole band plays × (1 + choirBuff × strength) for choirBars bars */
  choirBuff: 0.22,
  choirBars: 2,
};

export const ECHO = {
  /** golden notes for a right echo: base + perMovement × breather index */
  coins: 30,
  perMovement: 10,
  /** the chord blast at the next movement: damage = flat + share × max hp (guardians: bossFlat + bossShare) */
  flat: 60,
  share: 0.2,
  bossFlat: 160,
  bossShare: 0.03,
  /** it waits for this many creatures near the colossus (or fires anyway after `wait` bars) */
  crowd: 3,
  radius: 32,
  wait: 8,
};

/** distance from a heard time to the nearest grid point (quarters, or eighths at high groove) */
export function nearestGrid(heard: number, spb: number, groove: number): { at: number; index: number; delta: number; grid: number } {
  const grid = groove >= RHYTHM.eighthsFrom ? spb / 2 : spb;
  const index = Math.round(heard / grid);
  const at = index * grid;
  return { at, index, delta: heard - at, grid };
}

export function quality(delta: number): TapQuality {
  const d = Math.abs(delta);
  return d <= RHYTHM.perfect ? 'perfect' : d <= RHYTHM.good ? 'good' : 'miss';
}

/**
 * The groove: a run of on-beat taps lifts it (4/12/24/40 in a row for levels 1…4); a miss drops
 * one level and starts the run again from that level's threshold; two quiet bars let it fade one
 * level at a time. A grid point can only be claimed once (hammering is a miss).
 */
export class Groove {
  level = 0;
  /** on-beat taps in the current run */
  run = 0;
  /** last time (heard, in song seconds) a tap was judged */
  lastTap = -Infinity;
  /** the last grid point claimed (`${grid}:${index}`) */
  private claimed = '';
  perfects = 0;
  goods = 0;
  misses = 0;

  constructor(level = 0) {
    this.set(level);
  }

  /** sets a level directly (e.g. a right echo, or a journey resumed from a checkpoint) */
  set(level: number) {
    this.level = Math.max(0, Math.min(RHYTHM.maxGroove, Math.round(level)));
    this.run = this.level > 0 ? RHYTHM.thresholds[this.level - 1] : 0;
  }

  /** progress toward the next level, 0…1 (1 at the top) */
  get progress(): number {
    if (this.level >= RHYTHM.maxGroove) return 1;
    const lo = this.level > 0 ? RHYTHM.thresholds[this.level - 1] : 0;
    const hi = RHYTHM.thresholds[this.level];
    return Math.max(0, Math.min(1, (this.run - lo) / (hi - lo)));
  }

  /** judges a tap heard at `heard` (song seconds); returns its quality and the grid point it landed on */
  tap(heard: number, spb: number): { q: TapQuality; at: number; delta: number } {
    const g = nearestGrid(heard, spb, this.level);
    let q = quality(g.delta);
    const key = `${g.grid.toFixed(5)}:${g.index}`;
    if (q !== 'miss' && key === this.claimed) q = 'miss';
    if (q !== 'miss') this.claimed = key;
    this.lastTap = heard;
    this.judge(q);
    return { q, at: g.at, delta: g.delta };
  }

  /** applies a judged tap to the run and the level */
  judge(q: TapQuality) {
    if (q === 'miss') {
      this.misses++;
      this.set(this.level - 1);
      return;
    }
    if (q === 'perfect') this.perfects++;
    else this.goods++;
    this.run++;
    while (this.level < RHYTHM.maxGroove && this.run >= RHYTHM.thresholds[this.level]) this.level++;
  }

  /** time passes without taps: two quiet bars fade the groove by one level (and again every two bars) */
  idle(heard: number, barDur: number): boolean {
    if (this.level <= 0 || !isFinite(this.lastTap)) return false;
    if (heard - this.lastTap < RHYTHM.idleBars * barDur) return false;
    this.set(this.level - 1);
    this.lastTap = heard;
    return true;
  }
}

/**
 * The Maestro's calls: four notes in one bar, positions in eighth notes (0…7). Each land has its own
 * set; the later lands syncopate.
 */
export const CALLS: Record<WorldId, number[][]> = {
  meadow: [[0, 2, 4, 6], [0, 2, 4, 5], [0, 1, 2, 4], [0, 2, 3, 4]],
  desert: [[0, 1, 2, 4], [0, 2, 3, 4], [0, 2, 4, 5], [0, 1, 4, 6], [0, 3, 4, 6]],
  ice: [[0, 3, 4, 6], [0, 2, 5, 6], [1, 2, 4, 6], [0, 3, 4, 5]],
  forge: [[0, 3, 5, 6], [1, 3, 4, 6], [0, 3, 6, 7], [0, 1, 3, 6]],
  citadel: [[1, 3, 4, 6], [0, 3, 5, 7], [1, 2, 5, 7], [0, 3, 6, 7], [1, 3, 5, 6]],
};

/** the call of breather k (1…) of a journey: same journey, same calls */
export function callPattern(world: WorldId, seed: number, k: number, attempt: number): number[] {
  const list = CALLS[world];
  // the very first call of the game is the plainest one
  if (world === 'meadow' && k === 1 && attempt === 0) return list[0];
  const i = Math.abs((seed * 7 + k * 3 + attempt * 5) | 0) % list.length;
  return list[i];
}

/**
 * When the calls of a breather of `rest` bars happen: the bars (relative to the breather's first bar)
 * in which the Maestro plays; the echo is the bar after each.
 */
export function callBars(rest: number): number[] {
  const first = rest >= 8 ? 2 : 1;
  const out = [first];
  if (first + 4 < rest) out.push(first + 3);
  return out;
}

/** what a solo does, per instrument (for the HUD/view and the docs) */
export const SOLO_KIND: Record<TowerKind, string> = {
  harp: 'volley',
  drum: 'shockwave',
  bell: 'ring',
  shaker: 'coins',
  crystal: 'storm',
  horn: 'blast',
  choir: 'anthem',
  bass: 'drop',
};
