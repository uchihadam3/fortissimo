/**
 * The player's rhythm (v4: a true rhythm game). Everything the player does is on the beat: the
 * baton (or any empty spot of the screen), the golden notes, the creatures, the glowing musicians,
 * the viradas (v7: drum fills tapped on golden marks in the world). Every judged tap feeds one POWER meter (0…100): perfect fills it, good a
 * little, a miss takes a clear chunk and breaks the combo; it fades when you stop playing. Power
 * makes the band stronger (×1.0 → ×1.6 damage), the FORTÍSSIMO and the solos charge faster, and
 * its thresholds are the music's groove layers (0…4). Each movement played with a high power
 * earns a crescendo star (the band stays a little stronger and the power never fades under it for
 * the rest of the journey), and three stars need a good rhythm accuracy.
 *
 * Judging a tap against the beat happens in the controller (it knows when the player heard the
 * music); the simulation only receives what came of it, as recorded actions: the power and the
 * tally of judged taps (`Journey.setPower`), a solo (`Journey.solo`), a collected note with its
 * quality (`Journey.collect`), a strike (`Journey.strike`), a virada cued (`Journey.viradaCue`) and
 * how it went (`Journey.virada`). That keeps journeys deterministic and checkpoints replayable. This
 * module is pure: the meter, the judgement windows and the virada patterns are shared by the battle,
 * the bots and the tests.
 */
import type { TowerKind, WorldId } from './defs';

export type TapQuality = 'perfect' | 'good' | 'miss';
/** what a tap was aimed at: each kind can claim each grid point once (two fingers on one beat are fine) */
export type TapTarget = 'baton' | 'coin' | 'creature' | 'musician' | 'virada';

export const RHYTHM = {
  /** seconds from the beat (as heard) for a perfect / a good tap */
  perfect: 0.075,
  good: 0.15,
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
  /** from this groove on, eighth notes count as well as the beats (baton and creatures) */
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

  /** judges a tap heard at `heard` (song seconds) aimed at `target`; quarters (baton and creatures: eighths from groove 3) */
  tap(heard: number, spb: number, target: TapTarget = 'baton'): { q: TapQuality; at: number; delta: number } {
    const g = nearestGrid(heard, spb, target === 'baton' || target === 'creature' ? this.level : 0);
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
 * The viradas (v7, docs/DESIGN-v7.md): drum fills the player taps on golden marks in the world.
 * A virada is slow and clear: one mark at a time, one stroke every two beats (tan … tan … tan),
 * so the beat between two strokes is free for the baton. Its last stroke falls on beat 3 of a
 * phrase's last bar and the song comes back with a crash on the next downbeat. It comes on a streak
 * (a combo or a groove, ending at a phrase end, not too often) and in every breather. Full viradas in a row raise its level (one more mark, a bigger reward).
 */
export const VIRADA = {
  /**
   * off (v7.2): the player did not like marks to tap in the world; the journeys play without
   * viradas (the machinery stays for the tests and for a better idea later)
   */
  enabled: false,
  /** a streak: this combo, or this groove */
  combo: 8,
  groove: 2,
  /** phrases are this many bars; a streak's virada ends in the last bar of one */
  phrase: 4,
  /** journey bars from one virada to a streak's next (at least) */
  gapBars: 8,
  /** the bars of a breather a virada ends in: (its movement's bar) − 5 and − 1 */
  breather: [5, 1] as readonly number[],
  /** bars ahead (of its last bar) a virada is cued: its first stroke is still ≥ 1 bar away */
  cueBars: 4,
  /** 16th steps between two strokes: two beats (a half note) */
  spacing: 8,
  /** beats before its stroke a mark appears (its ring takes this long to close): one spacing */
  lead: 2,
  maxLevel: 2,
  /** marks of a level-0 virada per land (the legends and the bosses: hardest patterns), + level, at most 6 */
  marks: { meadow: 4, desert: 5, ice: 5, forge: 5, citadel: 5 } as Record<WorldId, number>,
  maxMarks: 6,
  /** all marks hit: the power jumps (perfect: more) */
  power: 15,
  powerPerfect: 20,
  /** golden notes for a full virada (by land) × (1 + perLevel × level); all perfect × perfect; half the marks or more: × half */
  coins: { meadow: 6, desert: 7, ice: 8, forge: 9, citadel: 10 } as Record<WorldId, number>,
  coinsPerLevel: 0.5,
  /** a breather's viradas sing for the movement ahead: + breather + perMovement × its index (the Maestro's old echo) */
  breatherCoins: 24,
  breatherPerMovement: 10,
  coinsPerfect: 1.3,
  coinsHalf: 0.8,
  /** the virada boost: the whole band × mul for `boostBars` bars (+ perLevel × level, + perfect) */
  boost: 1.2,
  boostPerLevel: 0.03,
  boostPerfect: 0.05,
  boostBars: 4,
  /** the FORTÍSSIMO meter fills this much (perfect: more) */
  ff: 0.06,
  ffPerfect: 0.1,
};

/** how many marks a virada has in a land, at a chain level (the hardest ones: never fewer than 5) */
export function viradaMarks(world: WorldId, level: number, hard = false): number {
  const base = Math.max(VIRADA.marks[world], hard ? 5 : 0);
  return Math.min(VIRADA.maxMarks, base + Math.max(0, Math.min(VIRADA.maxLevel, level | 0)));
}

/** how many bars a virada of n marks spans (its strokes end on beat 3 of the last one) */
export function viradaSpan(n: number): number {
  return Math.max(1, Math.ceil((n * VIRADA.spacing) / 16));
}

/**
 * The strokes of virada k (1…) of a journey at a chain level, as 16th steps from the first bar of
 * its span: one every two beats, the last on beat 3 of the last bar. Same journey, same viradas.
 * `hard` (a legend or a boss in the fight) only adds marks; the player's challenge grows with where
 * the marks are, never with how fast they come.
 */
export function viradaPattern(world: WorldId, _seed: number, _k: number, level: number, hard = false): number[] {
  const n = viradaMarks(world, level, hard);
  const span = viradaSpan(n) * 16;
  return Array.from({ length: n }, (_, i) => span - (n - i) * VIRADA.spacing);
}

/**
 * What a virada brings: coins, the boost (×, bars), the FORTÍSSIMO fill and the power jump. `into`:
 * the movement a breather's virada leads into (0: a streak's).
 */
export function viradaReward(world: WorldId, level: number, hits: number, n: number, perfects: number, into = 0) {
  const full = n > 0 && hits >= n;
  const perfect = full && perfects >= n;
  const half = !full && n > 0 && hits * 2 >= n;
  const lv = Math.max(0, Math.min(VIRADA.maxLevel, level | 0));
  const base = VIRADA.coins[world] * (1 + VIRADA.coinsPerLevel * lv) + (into > 0 ? VIRADA.breatherCoins + VIRADA.breatherPerMovement * into : 0);
  const coins = full ? Math.round(base * (perfect ? VIRADA.coinsPerfect : 1)) : half ? Math.round(base * VIRADA.coinsHalf) : 0;
  return {
    full,
    perfect,
    coins,
    boost: full ? VIRADA.boost + VIRADA.boostPerLevel * lv + (perfect ? VIRADA.boostPerfect : 0) : 1,
    boostBars: full ? VIRADA.boostBars : 0,
    ff: full ? (perfect ? VIRADA.ffPerfect : VIRADA.ff) : 0,
    power: full ? (perfect ? VIRADA.powerPerfect : VIRADA.power) : 0,
  };
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
