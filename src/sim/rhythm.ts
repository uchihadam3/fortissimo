/**
 * The player's rhythm (v4: a true rhythm game). Everything the player does is on the beat: the
 * baton (or any empty spot of the screen), the golden notes, the creatures, the glowing musicians,
 * the Maestro's echo. Every judged tap feeds one POWER meter (0…100): perfect fills it, good a
 * little, a miss takes a clear chunk and breaks the combo; it fades when you stop playing. Power
 * makes the band stronger (×1.0 → ×1.6 damage), the FORTÍSSIMO and the solos charge faster, and
 * its thresholds are the music's groove layers (0…4). Each movement played with a high power
 * earns a crescendo star (the band stays a little stronger and the power never fades under it for
 * the rest of the journey), and three stars need a good rhythm accuracy.
 *
 * Judging a tap against the beat happens in the controller (it knows when the player heard the
 * music); the simulation only receives what came of it, as recorded actions: the power and the
 * tally of judged taps (`Journey.setPower`), a solo (`Journey.solo`), a collected note with its
 * quality (`Journey.collect`), a strike (`Journey.strike`) and a right echo (`Journey.echo`). That
 * keeps journeys deterministic and checkpoints replayable. This module is pure: the meter, the
 * judgement windows and the call patterns are shared by the battle, the bots and the tests.
 */
import type { TowerKind, WorldId } from './defs';

export type TapQuality = 'perfect' | 'good' | 'miss';
/** what a tap was aimed at: each kind can claim each grid point once (two fingers on one beat are fine) */
export type TapTarget = 'baton' | 'coin' | 'creature' | 'musician' | 'echo';

export const RHYTHM = {
  /** seconds from the beat (as heard) for a perfect / a good tap */
  perfect: 0.06,
  good: 0.12,
  /** power gained by a perfect / good tap (× the combo bonus) and lost by a miss */
  gainPerfect: 5,
  gainGood: 2.5,
  lossMiss: 10,
  /** the fuller the meter, the harder it climbs: gains × (1 − power/100)^gainCurve */
  gainCurve: 1.5,
  /** the combo lifts the gains: × (1 + comboBonus × min(combo, comboCap) / comboCap) */
  comboBonus: 0.6,
  comboCap: 24,
  /** quiet for this many beats, the power starts to fade by fadePerBeat every beat */
  idleBeats: 6,
  fadePerBeat: 1.5,
  /** the groove layers of the music (and the baton's segments): power thresholds for 1…4 */
  thresholds: [20, 45, 70, 90] as readonly number[],
  /** from this groove on, eighth notes count as well as the beats (baton) */
  eighthsFrom: 3,
  /** every tower's damage × (1 + powerDamage × power/100) */
  powerDamage: 0.6,
  /** the FORTÍSSIMO meter fills × (1 + powerFF × power/100) */
  powerFF: 0.6,
  maxGroove: 4,
};

/** a movement played at this average power (or more) earns a crescendo star */
export const CRESCENDO = {
  average: 55,
  /** each star: the band × (1 + damage) for the rest of the journey, and the power never fades under floor × stars */
  damage: 0.05,
  floor: 10,
  /** three stars need at least this rhythm accuracy (hits / judged taps) and about a tap per bar */
  accuracy: 0.85,
};

/** a golden note's value by the quality of the tap that took it */
export const COIN_VALUE: Record<TapQuality, number> = { perfect: 1.5, good: 1.15, miss: 0.5 };

/** the colossus strikes a creature tapped on the beat */
export const STRIKE = {
  /** damage = (flat + share × max hp) × quality × (1 + power/100); guardians: bossShare of max hp */
  flat: 14,
  share: 0.06,
  bossShare: 0.005,
  perfect: 1.3,
  /** bars before the same creature can be struck again */
  cooldownBars: 2,
  /** knock-back speed */
  push: 5,
  /** how far from the colossus a creature can be struck */
  reach: 40,
};

/** the groove level (0…4) of a power */
export function grooveOf(power: number): number {
  let g = 0;
  for (const t of RHYTHM.thresholds) if (power >= t) g++;
  return g;
}

/** the band's damage multiplier at a power (0…100) */
export function powerMul(power: number): number {
  return 1 + (RHYTHM.powerDamage * Math.max(0, Math.min(100, power))) / 100;
}

export const SOLO = {
  /** charge per bar a musician gets just for playing (while the journey is under way) … */
  perBar: 1 / 120,
  /** … × (1 + powerCharge × power/100) (what it charges by its damage is lifted the same way) */
  powerCharge: 3,
  /** a fighter also charges with the damage it deals: a full charge is this many bars of its own playing */
  damageBars: 48,
  /** strength of a solo by the timing of its tap: perfect / good / off the beat */
  perfect: 1.35,
  good: 1,
  miss: 0.6,
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
 * The power meter. A judged tap moves it (perfect +5, good +2.5, both lifted by the combo up to
 * ×1.6 and harder to win the fuller the meter is; a miss −10 and the combo breaks); quiet for a while it fades a little every beat (never
 * under the floor the crescendo stars earned). Each kind of target claims each grid point once:
 * hammering one target on one beat is a miss, two fingers (baton + a coin) on the same beat are not.
 */
export class Power {
  power = 0;
  combo = 0;
  best = 0;
  floor = 0;
  /** last time (heard, in song seconds) a tap was judged */
  lastTap = -Infinity;
  private lastFade = -Infinity;
  private claimed = new Map<TapTarget, string>();
  perfects = 0;
  goods = 0;
  misses = 0;

  constructor(power = 0) {
    this.power = Math.max(0, Math.min(100, power));
  }

  get level(): number {
    return grooveOf(this.power);
  }

  get judged(): number {
    return this.perfects + this.goods + this.misses;
  }

  /** hits / judged taps (1 before any tap) */
  get accuracy(): number {
    return this.judged ? (this.perfects + this.goods) / this.judged : 1;
  }

  /** judges a tap heard at `heard` (song seconds) aimed at `target`; quarters (baton: eighths from groove 3) */
  tap(heard: number, spb: number, target: TapTarget = 'baton'): { q: TapQuality; at: number; delta: number } {
    const g = nearestGrid(heard, spb, target === 'baton' ? this.level : 0);
    let q = quality(g.delta);
    const key = `${g.grid.toFixed(5)}:${g.index}`;
    if (q !== 'miss' && this.claimed.get(target) === key) q = 'miss';
    if (q !== 'miss') this.claimed.set(target, key);
    this.lastTap = heard;
    this.judge(q);
    return { q, at: g.at, delta: g.delta };
  }

  /** applies a judged tap to the meter and the combo */
  judge(q: TapQuality) {
    if (q === 'miss') {
      this.misses++;
      this.combo = 0;
      this.power = Math.max(0, this.power - RHYTHM.lossMiss);
      return;
    }
    if (q === 'perfect') this.perfects++;
    else this.goods++;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    const lift = 1 + (RHYTHM.comboBonus * Math.min(this.combo, RHYTHM.comboCap)) / RHYTHM.comboCap;
    const room = Math.pow(Math.max(0, 1 - this.power / 100), RHYTHM.gainCurve);
    this.power = Math.min(100, this.power + (q === 'perfect' ? RHYTHM.gainPerfect : RHYTHM.gainGood) * lift * room);
  }

  /** time passes: quiet for a while, the power fades a little every beat (true when it changed) */
  idle(heard: number, spb: number): boolean {
    if (!isFinite(this.lastTap)) return false;
    if (heard - this.lastTap < RHYTHM.idleBeats * spb) return false;
    if (heard - this.lastFade < spb) return false;
    this.lastFade = heard;
    let changed = false;
    if (this.combo > 0 && heard - this.lastTap > RHYTHM.idleBeats * spb * 2) {
      this.combo = 0;
      changed = true;
    }
    if (this.power > this.floor) {
      this.power = Math.max(this.floor, this.power - RHYTHM.fadePerBeat);
      changed = true;
    }
    return changed;
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
