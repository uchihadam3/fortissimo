/**
 * The player's rhythm play (v3): the player conducts.
 *
 *  - beatTap: the baton taps the beat — a tight percussive hit in the land's palette, pitched to the
 *    chord of the moment (perfect = brighter, with a sparkle; good = normal; miss = a soft muted thud).
 *  - grooveRise: when the groove reaches 4, a riser into the bar line where it lands, and a drop.
 *  - solo: one bar of virtuoso flourish for a musician, in the chord(s) of that bar, loud and proud
 *    (the backing steps back for it).
 *  - callNote / echoNote / echoResult: the Maestro's 4-note call in a breather, the player's
 *    answer, and the verdict.
 *
 * Everything is scheduled at exact context times on the song grid and goes to the rhythm bus (dry,
 * beside the towers, never ducked or compressed by them), so taps are as tight as the engine allows.
 */
import type { TowerKind, WorldId } from '../../sim/defs';
import type { Core } from './core';
import { Fx } from './fx';
import type { Director } from './music';
import { BufferBank, Channel, type BufInst, LOWBRASS, ORGAN, oscStack, playBuf } from './synth';
import { bassNote, chord, chordTones, type Chord, pcOf } from './theory';
import { clamp, rand } from './util';

export type TapQuality = 'perfect' | 'good' | 'miss';

const PANS = [-0.6, -0.3, 0, 0.3, 0.6];
/** per-instrument solo trims (measured: every solo bar ≈ +5…6 LU over the full band's backing) */
const SOLO: Record<TowerKind, number> = { harp: 0.95, drum: 1, bell: 0.27, shaker: 0.95, crystal: 0.55, horn: 0.62, choir: 0.6, bass: 0.42 };
/** the Maestro's call and the player's echo */
const CALL = 0.5;
/** level of the baton taps */
const TAP = 0.36;
/** level of the coin pickups (v4) */
const PICK = 0.32;
/** level of the colossus' strikes (v4) */
const STRIKE = 0.5;
/** level of the virada's strokes (v7; measured: a perfect level-2 stroke stays under the song's own drum hits) */
const FILL = 0.155;
/** level of the virada's crash on the downbeat (measured against the song's own crash) */
const VCRASH = 0.09;
/** level of the "VIRADA!" chord swell */
const SWELL = 0.25;

/** each land's pickup voice (a coin collected on the beat rings a note of the song) */
interface PickVoice {
  inst: BufInst | 'organ';
  /** a second, softer layer an octave up (or the same pitch) */
  layer: BufInst | null;
  layerShift: number;
  lo: number;
  hi: number;
  /** the strike's land colour */
  colour: BufInst;
  colourLo: number;
  colourHi: number;
}

const PICKS: Record<WorldId | 'menu', PickVoice> = {
  // the meadow: kalimba under a glockenspiel (celesta) an octave up
  meadow: { inst: 'kalimba', layer: 'celesta', layerShift: 12, lo: 72, hi: 88, colour: 'tamb', colourLo: 60, colourHi: 60 },
  // the dunes: a santur-like pluck (koto) with the oud an octave down
  desert: { inst: 'koto', layer: 'oud', layerShift: -12, lo: 69, hi: 86, colour: 'tek', colourLo: 60, colourHi: 60 },
  // ice: celesta and glass
  ice: { inst: 'celesta', layer: 'glass', layerShift: 12, lo: 74, hi: 90, colour: 'glass', colourLo: 84, colourHi: 96 },
  // the forge: anvil-tuned metal, a celesta to make the pitch clear
  forge: { inst: 'anvil', layer: 'celesta', layerShift: 0, lo: 72, hi: 88, colour: 'anvil', colourLo: 76, colourHi: 88 },
  // the citadel: an organ pipe and the choir's 'ah'
  citadel: { inst: 'organ', layer: 'choirx', layerShift: 0, lo: 67, hi: 82, colour: 'tbell', colourLo: 62, colourHi: 74 },
  menu: { inst: 'kalimba', layer: 'celesta', layerShift: 12, lo: 72, hi: 88, colour: 'tamb', colourLo: 60, colourHi: 60 },
};

const pingpong = (i: number, n: number): number => {
  if (n <= 1) return 0;
  const p = 2 * n - 2;
  const k = ((i % p) + p) % p;
  return k < n ? k : p - k;
};

/**
 * Each land's drum fill (v7 viradas): the player's strokes ARE the fill while the song's kit steps
 * back. `drum` (tuned to the chord) tumbles down from hi to lo across the marks, `body` sits under it
 * (fuller on perfect), `hits` are unpitched strokes (high for the first half, low for the second),
 * `tone` is the land's pitched colour on a chord tone (also falling), `stick` the attack, `jingle`
 * a shimmer on perfect strokes.
 */
interface FillVoice {
  drum: BufInst;
  lo: number;
  hi: number;
  dv: number;
  body: BufInst | null;
  bodyLo: number;
  bodyHi: number;
  bv: number;
  hits: [BufInst, BufInst] | null;
  hv: number;
  tone: BufInst | 'organ' | null;
  toneLo: number;
  toneHi: number;
  tv: number;
  stick: BufInst | null;
  stickMidi: number;
  sv: number;
  jingle: BufInst | null;
  /** the land's trim (measured: every land's loudest stroke at or under its song's drum hits, K and phone) */
  trim: number;
}

/**
 * Each land's kit energy per bar (Director.kitEnergy) with the full band at intensity 1: the level
 * the strokes were calibrated against. A quieter kit (a breather, a band without percussion) plays a
 * quieter fill, never a louder one.
 */
const KIT_REF: Record<WorldId | 'menu', number> = { meadow: 0.147, desert: 0.257, ice: 0.105, forge: 0.076, citadel: 0.12, menu: 0.147 };

const FILLS: Record<WorldId | 'menu', FillVoice> = {
  // the meadow: a frame drum falling over a floor tom, a wood block on the chord, a tambourine
  meadow: { drum: 'tdrum', lo: 50, hi: 64, dv: 0.8, body: 'tom', bodyLo: 41, bodyHi: 53, bv: 0.45, hits: null, hv: 0, tone: 'wood', toneLo: 55, toneHi: 67, tv: 0.35, stick: 'rim', stickMidi: 60, sv: 0.22, jingle: 'tamb', trim: 1 },
  // the dunes: the darbuka (tek on the rim, then dum in the middle) over its tuned body, the riq's jingles
  desert: { drum: 'tdrum', lo: 49, hi: 62, dv: 0.66, body: null, bodyLo: 0, bodyHi: 0, bv: 0, hits: ['tek', 'dum'], hv: 0.62, tone: 'koto', toneLo: 64, toneHi: 76, tv: 0.2, stick: null, stickMidi: 60, sv: 0, jingle: 'tamb', trim: 0.94 },
  // ice: glassy toms (a tom ringing down under a crack, a glass ping on the chord)
  ice: { drum: 'tom', lo: 45, hi: 57, dv: 0.85, body: 'tdrum', bodyLo: 53, bodyHi: 65, bv: 0.3, hits: null, hv: 0, tone: 'glass', toneLo: 77, toneHi: 91, tv: 0.12, stick: 'rim', stickMidi: 63, sv: 0.1, jingle: null, trim: 0.52 },
  // the forge: the taiko falling under the war drum, the anvil rung on the chord
  forge: { drum: 'taiko', lo: 31, hi: 40, dv: 0.75, body: 'tdrum', bodyLo: 47, bodyHi: 59, bv: 0.3, hits: null, hv: 0, tone: 'anvil', toneLo: 72, toneHi: 88, tv: 0.12, stick: 'tek', stickMidi: 57, sv: 0.1, jingle: null, trim: 0.8 },
  // the citadel: timpani rolling down under a hollow drum, an organ pipe on the chord
  citadel: { drum: 'timp', lo: 41, hi: 53, dv: 0.75, body: 'tdrum', bodyLo: 50, bodyHi: 61, bv: 0.5, hits: null, hv: 0, tone: 'organ', toneLo: 60, toneHi: 74, tv: 0.32, stick: 'rim', stickMidi: 57, sv: 0.18, jingle: null, trim: 0.7 },
  menu: { drum: 'tdrum', lo: 50, hi: 64, dv: 0.8, body: 'tom', bodyLo: 41, bodyHi: 53, bv: 0.45, hits: null, hv: 0, tone: 'wood', toneLo: 55, toneHi: 67, tv: 0.35, stick: 'rim', stickMidi: 60, sv: 0.22, jingle: 'tamb', trim: 1 },
};

/** a virada in progress (v7) */
interface ViradaState {
  start: number;
  end: number;
  n: number;
  level: number;
  /** the last pitch of each layer (the fill only ever falls) */
  prev: Record<string, number>;
  /** the crash on `end` is booked (the first hit books it) */
  crash: boolean;
  /** the virada's own gain (its crash can be cancelled by a new cue) */
  bus: GainNode | null;
  /** the strokes follow the song's kit: its level before the virada vs the land's reference (≤ 1) */
  scale: number;
}

/** each land's baton: the drum it taps, the click on top, the pitched voice and the sparkle */
interface Palette {
  body: BufInst;
  bodyLo: number;
  bodyHi: number;
  click: BufInst;
  clickMidi: number;
  tone: BufInst;
  toneLo: number;
  toneHi: number;
  sparkle: BufInst;
  jingle: BufInst | null;
}

const PALETTES: Record<WorldId | 'menu', Palette> = {
  // frame drum (bodhrán) and a tambourine, a celesta note
  meadow: { body: 'tdrum', bodyLo: 52, bodyHi: 63, click: 'rim', clickMidi: 60, tone: 'celesta', toneLo: 76, toneHi: 90, sparkle: 'glass', jingle: 'tamb' },
  // darbuka: dum/tek and finger cymbals, a koto-like pluck
  desert: { body: 'tdrum', bodyLo: 50, bodyHi: 61, click: 'tek', clickMidi: 60, tone: 'koto', toneLo: 72, toneHi: 86, sparkle: 'anvil', jingle: 'tamb' },
  // crisp ice: a rim crack and a glass ping
  ice: { body: 'tdrum', bodyLo: 55, bodyHi: 66, click: 'rim', clickMidi: 62, tone: 'glass', toneLo: 79, toneHi: 93, sparkle: 'celesta', jingle: null },
  // the forge: a hammer on the anvil over a war drum
  forge: { body: 'tdrum', bodyLo: 48, bodyHi: 59, click: 'tek', clickMidi: 58, tone: 'anvil', toneLo: 76, toneHi: 88, sparkle: 'glass', jingle: null },
  // the citadel: a hollow drum and a bell
  citadel: { body: 'tdrum', bodyLo: 50, bodyHi: 61, click: 'rim', clickMidi: 58, tone: 'tbell', toneLo: 67, toneHi: 79, sparkle: 'glass', jingle: null },
  menu: { body: 'tdrum', bodyLo: 52, bodyHi: 63, click: 'rim', clickMidi: 60, tone: 'celesta', toneLo: 76, toneHi: 90, sparkle: 'glass', jingle: 'tamb' },
};

export class Rhythm {
  private readonly fx: Fx;
  private readonly chs: Channel[];
  private readonly wetChs: Channel[];
  /** the call's four pitches (locked by callNote(0), reused by the echo) */
  private call: { t: number; notes: number[] } | null = null;
  private lastTap = -1;
  private tapRun = 0;
  private lastSolo = -1;
  /** the virada in progress (v7) */
  private vir: ViradaState | null = null;
  /** gains of earlier viradas (disconnected once their crash has rung out) */
  private oldBuses: { bus: GainNode; until: number }[] = [];
  private lastDrop = -1e9;
  private lastTell = -1e9;
  private tellIdx = 0;
  private drops: number[] = [];
  /** a trim for everything played (the verdict of the echo plays a little softer) */
  private level = 1;

  constructor(
    private readonly core: Core,
    private readonly bank: BufferBank,
    private readonly director: Director,
  ) {
    this.fx = new Fx(core, bank);
    this.chs = PANS.map((pan) => new Channel(core, core.rhythmBus, core.sfxWet, { pan, wet: 0.12, gain: 1 }));
    this.wetChs = PANS.map((pan) => new Channel(core, core.rhythmBus, core.sfxWet, { pan, wet: 0.35, gain: 1 }));
    for (const [inst, lo, hi] of [['tdrum', 47, 67], ['rim', 60, 60], ['tek', 60, 60], ['tamb', 60, 60], ['celesta', 72, 98], ['glass', 76, 98], ['clap', 60, 60], ['crash', 60, 60], ['snare', 60, 60], ['tom', 40, 56], ['timp', 40, 53], ['tbass', 40, 64], ['choirx', 55, 80], ['choir', 55, 80], ['brass', 45, 75], ['harp', 48, 96], ['zap', 70, 99], ['tbell', 60, 84], ['shaker', 60, 60], ['anvil', 72, 92], ['boom', 26, 40], ['kalimba', 72, 91], ['koto', 69, 88], ['oud', 57, 76], ['wood', 50, 62], ['tick', 60, 60], ['choiroo', 48, 66], ['gong', 60, 60], ['taiko', 28, 40], ['dum', 60, 60]] as [BufInst, number, number][]) bank.warm(inst, lo, hi, 4);
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private ch(pan: number, wet = false): Channel {
    const i = clamp(Math.round((clamp(Number.isFinite(pan) ? pan : 0, -1, 1) + 1) * 2), 0, 4);
    return (wet ? this.wetChs : this.chs)[i];
  }

  private play(inst: BufInst, ch: Channel, t: number, midi: number, vel: number, dur: number, o: { release?: number; lp?: number; bend?: number; bendTime?: number; cents?: number; dest?: AudioNode } = {}): void {
    if (!(vel > 0.001) || !Number.isFinite(t)) return;
    const { dest, ...rest } = o;
    playBuf(this.core, this.bank, inst, dest ?? ch.input, Math.max(this.core.now, t), midi, vel * this.level, dur, { cat: 'rhythm', cap: 90, ...rest });
  }

  private chordAt(t: number): Chord {
    return this.director.chordAt(t, true) ?? chord('C');
  }

  private grid(): { t0: number; spb: number; barDur: number; beats: number } {
    const p = this.director.ref;
    if (!p) return { t0: 0, spb: 0.6, barDur: 2.4, beats: 4 };
    return { t0: p.t0, spb: p.spb, barDur: p.barDur, beats: p.theme.beats };
  }

  /** t moved onto the nearest 16th of the song grid */
  private snap(t: number): number {
    const g = this.grid();
    const sd = g.spb / 4;
    return g.t0 + Math.round((t - g.t0) / sd) * sd;
  }

  /** beat index inside the bar at t (0…beats−1) */
  private beatOf(t: number): number {
    const g = this.grid();
    const b = Math.round((t - g.t0) / g.spb);
    return ((b % g.beats) + g.beats) % g.beats;
  }

  /** how long (s) `midi` stays a chord tone from t (at most `maxBeats` beats) */
  private holdBeats(t: number, midi: number, spb: number, maxBeats: number): number {
    const pc = pcOf(midi);
    for (let k = 1; k <= maxBeats * 2; k++) {
      const c = this.director.chordAt(t + (k * spb) / 2 - 0.001);
      if (c && !c.pcs.includes(pc)) return Math.max(spb * 0.45, (k * spb) / 2 - 0.02);
    }
    return maxBeats * spb;
  }

  private get palette(): Palette {
    return PALETTES[this.director.world ?? 'menu'] ?? PALETTES.menu;
  }

  private rootIn(c: Chord, lo: number, hi: number): number {
    let best = lo;
    let d = Infinity;
    const mid = (lo + hi) / 2;
    for (let m = lo; m <= hi; m++) if (pcOf(m) === c.root && Math.abs(m - mid) < d) {
      d = Math.abs(m - mid);
      best = m;
    }
    return best;
  }

  // ───────────────────────────── the baton ─────────────────────────────

  beatTap(t: number, q: TapQuality, pan: number): void {
    const P = this.palette;
    const ch = this.ch(pan * 0.5);
    const c = this.chordAt(t);
    const g = this.grid();
    // a run of taps (one per beat) climbs the chord: the conductor's beat becomes a little tune
    this.tapRun = t - this.lastTap < g.spb * 1.6 && t > this.lastTap ? this.tapRun + 1 : 0;
    this.lastTap = t;
    const beat = this.beatOf(t);
    const root = this.rootIn(c, P.bodyLo, P.bodyHi);
    if (q === 'miss') {
      // a dead, muted thunk: no pitch to speak of, no click, no sparkle — unmistakably not a hit
      this.play('tom', ch, t, 43, 0.3 * TAP, 0.16, { release: 0.05, lp: 420 });
      this.play('wood', ch, t, 50, 0.3 * TAP, 0.08, { release: 0.04, lp: 1100, cents: -40 });
      return;
    }
    const perfect = q === 'perfect';
    // calibrated: over a full band at intensity 1 a tap on every beat adds ≈ +1.5 LU (it leads the
    // beat, it does not drown the band)
    const v = (perfect ? 1 : 0.92) * TAP;
    const downbeat = beat === 0;
    // the drum: tuned to the chord root, the downbeat a fifth-free octave lower accent
    this.play(P.body, ch, t, downbeat ? root : chordTones(c, root, root + 8)[beat % 2 === 1 ? 1 : 0] ?? root, 0.62 * v * (downbeat ? 1.1 : 1), 0.4, { release: 0.1 });
    this.play('tom', ch, t, Math.max(41, root - 12), 0.18 * v, 0.3, { release: 0.1 });
    this.play(P.click, ch, t, P.clickMidi + rand(-0.1, 0.1), (perfect ? 0.5 : 0.46) * v, 0.15);
    // the pitched voice on a chord tone (walks up the chord with the run)
    const tones = chordTones(c, P.toneLo, P.toneHi);
    if (tones.length) {
      const m = tones[(this.tapRun + (downbeat ? 0 : beat)) % Math.min(tones.length, 4)];
      this.play(P.tone, this.ch(pan * 0.5, true), t, m, (perfect ? 0.34 : 0.3) * TAP * (P.tone === 'tbell' ? 0.8 : 1), perfect ? 0.9 : 0.5, { release: 0.4, lp: perfect ? undefined : 5000 });
      if (perfect) {
        // the sparkle: two chord tones flicked up an octave above, and a jingle
        const hi = chordTones(c, m + 7, m + 19);
        hi.slice(0, 2).forEach((x, k) => this.play(P.sparkle, this.ch(-pan * 0.6, true), t + 0.035 + k * 0.035, x <= 98 ? x : x - 12, (0.16 - k * 0.03) * TAP * 1.3, 0.5, { release: 0.4 }));
        this.fx.burst(ch.input, t, { noise: 'white', type: 'highpass', f: 7000, a: 0.0008, d: 0.045, g: 0.05 * TAP, cat: 'rhythm' });
      }
    }
    if (P.jingle && (perfect || beat % 2 === 1)) this.play(P.jingle, this.ch(pan * 0.5 + 0.2), t, 60, (perfect ? 0.32 : 0.2) * TAP, 0.25, { release: 0.08 });
  }

  /**
   * The groove reached 4: a one-beat riser (noise sweep and a snare roll) into the bar line where
   * the full groove lands, then the drop on it: crash, sub boom, a brass stab and the choir's "Hey!".
   */
  grooveRise(tLand: number): void {
    const now = this.core.now;
    const g = this.grid();
    if (!(tLand > now + 0.05)) return;
    const from = Math.max(now + 0.03, tLand - Math.min(g.barDur, 2 * g.spb));
    const ch = this.ch(0, true);
    const d = tLand - from;
    this.fx.burst(ch.input, from, { noise: 'white', type: 'bandpass', f: 500, f1: 7000, q: 1.2, a: d * 0.95, d: 0.06, g: 0.12, cat: 'rhythm' });
    const sd = g.spb / 4;
    const n = Math.floor(d / (sd / 2));
    for (let k = 0; k < n; k++) {
      const tk = tLand - (n - k) * (sd / 2);
      if (tk < from) continue;
      this.play('snare', this.ch(0.15), tk, 60 + k * 0.05, 0.08 + 0.3 * (k / Math.max(1, n)), 0.2, { release: 0.06 });
    }
    // the drop
    const c = this.chordAt(tLand);
    const dry = this.ch(0);
    this.play('crash', ch, tLand, 60, 0.45, 3, { release: 1 });
    this.play('boom', dry, tLand, bassNote(c, 28), 0.55, 1.6, { release: 0.5 });
    this.play('tdrum', dry, tLand, this.rootIn(c, 52, 63), 0.7, 0.4);
    chordTones(c, 55, 70).slice(0, 4).forEach((m, k) => this.play('brass', this.ch(k % 2 ? 0.35 : -0.35), tLand, m, 0.3, 0.55 * g.spb, { release: 0.2 }));
    chordTones(c, 62, 76).slice(0, 3).forEach((m, k) => this.play('choirx', this.ch(k - 1, true), tLand + 0.01, m, 0.26, 0.4 * g.spb, { release: 0.15 }));
  }


  // ───────────────────────────── v4: coins, strikes, power ─────────────────────────────

  private get pick(): PickVoice {
    return PICKS[this.director.world ?? 'menu'] ?? PICKS.menu;
  }

  /**
   * A coin collected on the beat rings a note of the song: the run climbs the scale (up an octave
   * and back), strong beats land on chord tones — collecting in rhythm writes a little melody.
   */
  pickupTap(t: number, q: TapQuality, pan: number, run: number): void {
    const V = this.pick;
    const ch = this.ch(pan * 0.7, true);
    if (q === 'miss') {
      // a dull, muted clink (no melody)
      this.play('tick', this.ch(pan * 0.7), t, 58, 0.5 * PICK, 0.06, { lp: 1000 });
      this.play('wood', this.ch(pan * 0.7), t, 62, 0.2 * PICK, 0.06, { release: 0.04, lp: 1300, cents: -35 });
      return;
    }
    const c = this.chordAt(t);
    const k = this.director.keyAt(t);
    const beat = this.beatOf(t);
    const n = k ? k.steps.length : 7;
    let m: number;
    if (k) {
      // the run's degree above the tonic placed in the voice's register
      let base = k.deg(0);
      while (base < V.lo) base += 12;
      while (base > V.lo + 11) base -= 12;
      const d0 = k.degreeOf(base);
      m = k.deg(d0 + pingpong(Math.max(0, run), n + 1));
      if (beat % 2 === 0 || !k.has(m)) m = this.nearestTone(c, m);
    } else {
      const tones = chordTones(c, V.lo, V.hi);
      m = tones[pingpong(Math.max(0, run), tones.length)] ?? V.lo;
    }
    while (m > V.hi) m -= 12;
    const perfect = q === 'perfect';
    const v = (perfect ? 1 : 0.8) * PICK;
    const dur = perfect ? 0.8 : 0.5;
    if (V.inst === 'organ') oscStack(this.core, ch, Math.max(this.core.now, t), m, 0.8 * v * this.level, dur * 0.6, { ...ORGAN(0.7), attack: 0.006, release: 0.25, cat: 'rhythm', cap: 40 });
    else this.play(V.inst, ch, t, m, (V.inst === 'anvil' ? 0.5 : 0.75) * v, dur, { release: 0.4 });
    if (V.layer) {
      const lm = m + V.layerShift;
      this.play(V.layer, ch, t, lm > 98 ? lm - 12 : lm, (V.layer === 'choirx' ? 0.4 : 0.32) * v, V.layer === 'choirx' ? 0.35 : dur, { release: 0.3 });
    }
    if (perfect) {
      // the sparkle: a glint an octave (and a chord tone) above, and a bright tick of air
      const hi = chordTones(c, m + 12, m + 19);
      this.play('glass', this.ch(-pan * 0.5, true), t + 0.03, hi[0] !== undefined && hi[0] <= 98 ? hi[0] : m, 0.22 * v, 0.6, { release: 0.5 });
      this.fx.burst(ch.input, t, { noise: 'white', type: 'highpass', f: 8000, a: 0.0006, d: 0.03, g: 0.05 * PICK, cat: 'rhythm' });
    }
  }

  /** nearest chord tone (prefers below on ties) */
  private nearestTone(c: Chord, m: number): number {
    for (let d = 0; d < 12; d++) {
      if (c.pcs.includes(pcOf(m - d))) return m - d;
      if (c.pcs.includes(pcOf(m + d))) return m + d;
    }
    return m;
  }

  /**
   * The colossus strikes a creature on the beat: timpani on the chord root, a short sub thump, the
   * battle drum's crack for the mids (what a phone speaker plays) and the land's colour; perfect adds
   * a snare crack and a short cymbal. miss = a thin swish.
   */
  strike(t: number, q: TapQuality, pan: number): void {
    const P = this.pick;
    if (q === 'miss') {
      this.fx.burst(this.ch(pan * 0.6).input, t, { noise: 'white', type: 'bandpass', f: 4200, f1: 1100, q: 1.6, a: 0.025, d: 0.12, g: 0.06 * STRIKE, cat: 'rhythm' });
      return;
    }
    const perfect = q === 'perfect';
    const v = (perfect ? 1 : 0.8) * STRIKE;
    const c = this.chordAt(t);
    const low = this.ch(pan * 0.25);
    const mid = this.ch(pan * 0.5);
    this.play('timp', low, t, this.rootIn(c, 40, 51), 0.6 * v, 0.9, { release: 0.4 });
    this.play('boom', low, t, bassNote(c, 28), 0.35 * v, 0.22, { release: 0.08 });
    this.play('tdrum', mid, t, this.rootIn(c, 52, 63), 1.0 * v, 0.3, { release: 0.1 });
    this.play('rim', mid, t, 60, 0.45 * v, 0.1);
    this.play('snare', mid, t, 60, (perfect ? 0.6 : 0.35) * v, 0.2, { release: 0.06 });
    const col = P.colourLo === P.colourHi ? P.colourLo : chordTones(c, P.colourLo, P.colourHi)[0] ?? P.colourLo;
    this.play(P.colour, this.ch(pan * 0.6, true), t, col, (P.colour === 'tamb' || P.colour === 'tek' ? 0.5 : 0.3) * v, 0.4, { release: 0.25 });
    if (perfect) {
      this.play('clap', mid, t, 60, 0.3 * v, 0.2, { release: 0.06 });
      this.play('crash', this.ch(-pan * 0.4, true), t, 61, 0.22 * v, 0.7, { release: 0.35 });
    }
  }

  /**
   * "You broke the run": a short, soft downward slide that lands on the chord root (a horn and a
   * low hum sighing down a fifth, a falling whoosh, a muted thud) while the music sags for a moment.
   * At most one per ¾ bar; when they come in a row each one is softer.
   */
  powerDrop(t: number): void {
    const g = this.grid();
    if (t - this.lastDrop < g.barDur * 0.75) return;
    this.lastDrop = t;
    this.drops = this.drops.filter((x) => x > t - 4 * g.barDur);
    this.drops.push(t);
    const v = Math.pow(0.7, this.drops.length - 1);
    const c = this.chordAt(t);
    const root = this.rootIn(c, 55, 66);
    const ch = this.ch(0, true);
    this.play('brass', ch, t, root, 0.36 * v, 0.42, { release: 0.25, bend: 700, bendTime: 0.32 });
    this.play('choiroo', ch, t, root - 12 >= 48 ? root - 12 : root, 0.3 * v, 0.45, { release: 0.3, bend: 700, bendTime: 0.36 });
    this.fx.burst(ch.input, t, { noise: 'pink', type: 'bandpass', f: 2400, f1: 320, q: 1.1, a: 0.015, d: 0.4, g: 0.07 * v, cat: 'rhythm' });
    this.play('tom', this.ch(0), t + 0.3, 43, 0.25 * v, 0.2, { release: 0.08, lp: 500 });
    this.core.duck(0.22 * v, 0.45);
  }


  // ───────────────────────────── v5: the duel ─────────────────────────────

  /**
   * The boss winds up: one tense count-in hit per warning beat, climbing the chord (a muted drum,
   * a metallic tick and a pitched synth ping a step higher each beat); the landing beat (`last`) is
   * a sharp accent with a short swell into it — the player's parry or the blow sounds on top.
   */
  bossTell(t: number, pan: number, last: boolean): void {
    const g = this.grid();
    this.tellIdx = t - this.lastTell < g.spb * 2.5 && t > this.lastTell ? this.tellIdx + 1 : 0;
    this.lastTell = t;
    const c = this.chordAt(t);
    const tones = chordTones(c, 67, 91);
    const m = tones.length ? tones[Math.min(tones.length - 1, this.tellIdx + (last ? 1 : 0))] : 76;
    const ch = this.ch(pan * 0.7);
    if (!last) {
      this.play('tom', ch, t, 47 + Math.min(6, this.tellIdx * 2), 0.32, 0.2, { release: 0.06, lp: 2500 });
      this.play('tek', ch, t, 62 + this.tellIdx * 0.6, 0.22, 0.1);
      this.play('zap', this.ch(pan * 0.7, true), t, m, 0.16, 0.25, { release: 0.15, lp: 6000 });
      return;
    }
    const sw = Math.min(g.spb * 0.9, 0.4);
    this.fx.burst(ch.input, t - sw, { noise: 'white', type: 'bandpass', f: 1200, f1: 6000, q: 1.4, a: sw * 0.95, d: 0.03, g: 0.05, cat: 'rhythm' });
    this.play('zap', this.ch(pan * 0.7, true), t, m, 0.22, 0.3, { release: 0.2 });
    this.play('rim', ch, t, 64, 0.3, 0.1);
  }

  /** The player parries the blow on the beat: perfect = a triumphant clang and a chord stab (the blow is reflected); good = a solid block. */
  parry(t: number, q: 'perfect' | 'good', pan: number): void {
    const c = this.chordAt(t);
    const ch = this.ch(pan * 0.5);
    this.play('tdrum', ch, t, this.rootIn(c, 52, 63), 0.5, 0.3, { release: 0.1 });
    this.play('wood', ch, t, 62, 0.3, 0.1);
    this.play('tom', this.ch(pan * 0.3), t, 45, 0.36, 0.3, { release: 0.1 });
    if (q !== 'perfect') return;
    const w = this.ch(-pan * 0.4, true);
    const hi = chordTones(c, 79, 91);
    this.play('anvil', w, t, hi[hi.length - 1] ?? 84, 0.34, 1.2, { release: 0.8 });
    this.play('tbell', w, t, this.rootIn(c, 60, 71), 0.3, 1.6, { release: 1 });
    this.play('crash', w, t, 62, 0.3, 1.2, { release: 0.5 });
    chordTones(c, 55, 70).slice(0, 4).forEach((m, k) => this.play('brass', this.ch(k % 2 ? 0.4 : -0.4), t + 0.004 * k, m, 0.3, 0.5 * this.grid().spb, { release: 0.2 }));
    chordTones(c, 64, 79).slice(0, 3).forEach((m, k) => this.play('choirx', this.ch(k - 1, true), t + 0.01, m, 0.2, 0.45 * this.grid().spb, { release: 0.2 }));
  }

  /** The blow lands on the colossus: a heavy impact (sub, war drums, a dark crash) and the music reels. */
  bossBlow(t: number, pan: number, strength: number): void {
    const s = clamp(Number.isFinite(strength) ? strength : 1, 0.2, 1.5);
    const c = this.chordAt(t);
    const low = this.ch(pan * 0.25);
    this.play('boom', low, t, bassNote(c, 26), 0.5 * s, 0.9, { release: 0.3 });
    this.play('taiko', low, t, 31, 0.6 * s, 1, { release: 0.4 });
    this.play('tdrum', this.ch(pan * 0.5), t, this.rootIn(c, 45, 56), 0.45 * s, 0.3, { release: 0.1 });
    this.play('crash', this.ch(pan * 0.5, true), t, 54, 0.3 * s, 1.2, { release: 0.5, lp: 3500 });
    this.fx.burst(low.input, t, { noise: 'brown', type: 'lowpass', f: 600, f1: 120, a: 0.004, d: 0.5, g: 0.22 * s, cat: 'rhythm' });
    this.core.duck(0.3 * Math.min(1, s), 0.4);
  }

  /**
   * A boss fight begins at the bar line tStart: a one-bar riser (noise sweep, snare and timpani
   * rolls) into it and the hit on it (crash, gong, sub, brass) — or, back to the level's song
   * (enter = false), a victory flourish: a harp sweep and a bright major fanfare on the old key.
   */
  bossTransition(tStart: number, enter: boolean, big: number): void {
    const now = this.core.now;
    const g = this.grid();
    const from = Math.max(now + 0.03, tStart - g.barDur);
    const rise = tStart - from;
    const ch = this.ch(0, true);
    const dry = this.ch(0);
    if (enter) {
      if (rise > 0.2) {
        this.fx.burst(ch.input, from, { noise: 'white', type: 'bandpass', f: 300, f1: 5000, q: 1.1, a: rise * 0.97, d: 0.05, g: 0.1 * big, cat: 'rhythm' });
        const n = Math.floor(rise / (g.spb / 4));
        for (let k = 0; k < n; k++) {
          const tk = tStart - (n - k) * (g.spb / 4);
          this.play('snare', this.ch(0.2), tk, 60, 0.05 + 0.3 * (k / Math.max(1, n)), 0.2, { release: 0.06 });
          if (k % 2 === 0) this.play('timp', dry, tk, 40, 0.1 + 0.3 * (k / Math.max(1, n)), 0.5, { release: 0.2 });
        }
      }
      const c = this.chordAt(tStart + 0.01);
      this.play('crash', ch, tStart, 59, 0.5 * big, 3, { release: 1 });
      this.play('gong', ch, tStart, 60, 0.32 * big, 4, { release: 1.5 });
      this.play('boom', dry, tStart, bassNote(c, 26), 0.6 * big, 1.5, { release: 0.5 });
      this.play('taiko', dry, tStart, 31, 0.6 * big, 1.2, { release: 0.4 });
      chordTones(c, 45, 64).slice(0, 4).forEach((m, k) => this.play('brass', this.ch(k % 2 ? 0.4 : -0.4), tStart, m, 0.36 * big, 1.2 * g.spb, { release: 0.3 }));
      return;
    }
    // the victory flourish (in the harmony the level's song resumes with)
    const c = this.chordAt(tStart + 0.01);
    // the chord the song resumes with, voiced bright (root, third, fifth from middle C up)
    const tri = chordTones(c, 60, 74).slice(0, 3);
    while (tri.length < 3) tri.push((tri[tri.length - 1] ?? 64) + 12);
    for (let i = 0; i < 12; i++) {
      // the sweep runs through the boss's last bar: it follows that bar's harmony
      const tones = chordTones(this.chordAt(from + (rise * i) / 12 + 0.001), 60, 91);
      if (tones.length) this.play('harp', ch, from + (rise * i) / 12, tones[Math.min(tones.length - 1, Math.floor((i / 12) * tones.length))], 0.2 + 0.015 * i, 0.8, { release: 0.4 });
    }
    this.play('crash', ch, tStart, 62, 0.4, 3, { release: 1 });
    tri.forEach((m, i) => {
      this.play('brass', this.ch(i - 1), tStart, m, 0.4, 1.6 * g.spb, { release: 0.4 });
      this.play('choirx', this.ch(1 - i, true), tStart + 0.01, m + 12 <= 84 ? m + 12 : m, 0.24, 1.8 * g.spb, { release: 0.6 });
    });
    this.play('glass', ch, tStart + 0.02, tri[2] + 12 <= 98 ? tri[2] + 12 : tri[2], 0.3, 2, { release: 1 });
    this.play('timp', dry, tStart, this.rootIn(c, 40, 51), 0.5, 1.5, { release: 0.5 });
  }

  /** The boss's new phase lands at tStart: a short riser and a heavier hit (gong, brass, choir). */
  bossPhaseHit(tStart: number, phase: number): void {
    this.bossTransition(tStart, true, phase >= 3 ? 1.2 : 1);
    if (phase >= 3) {
      const c = this.chordAt(tStart + 0.01);
      chordTones(c, 60, 76).slice(0, 4).forEach((m, k) => this.play('choir', this.ch(k % 2 ? 0.5 : -0.5, true), tStart + 0.02, m, 0.26, 2.2 * this.grid().spb, { release: 0.8 }));
    }
  }

  // ───────────────────────────── solos ─────────────────────────────

  solo(kind: TowerKind, level: number, t0: number, pan: number, voice: number): void {
    const t = this.snap(t0);
    if (Math.abs(t - this.lastSolo) < 0.05) return;
    this.lastSolo = t;
    const g = this.grid();
    const spb = g.spb;
    const lv = clamp(Math.round(Number.isFinite(level) ? level : 0), 0, 2);
    const V = (0.78 + 0.11 * lv) * SOLO[kind];
    const ch = this.ch(pan * 0.6);
    const chW = this.ch(pan * 0.6, true);
    const at = (beat: number) => t + beat * spb;
    const cAt = (beat: number) => this.chordAt(at(beat) + 0.001);
    // the backing steps back for the soloist
    this.core.duck(0.32, g.barDur * 0.95);
    const v2 = (Math.abs(Math.round(voice)) || 0) % 2;
    switch (kind) {
      case 'harp': {
        // a glissando up two octaves (32nds) over the chord, an arpeggio cascading back down, a rolled chord
        for (let k = 0; k < 16; k++) {
          const b = k * 0.125;
          const tones = chordTones(cAt(b), 55, 91);
          this.play('harp', chW, at(b), tones[Math.min(tones.length - 1, Math.floor((k / 16) * tones.length) + v2)] ?? 67, (0.34 + 0.02 * k) * V, 0.9 * spb, { release: 0.4 });
        }
        for (let k = 0; k < 8; k++) {
          const b = 2 + k * 0.25;
          const tones = chordTones(cAt(b), 60, 93);
          this.play('harp', chW, at(b), tones[Math.max(0, tones.length - 1 - ((k * 2) % tones.length))] ?? 72, (0.5 - 0.02 * k) * V, 1.1 * spb, { release: 0.4 });
        }
        const last = chordTones(cAt(3.5), 52, 79);
        last.forEach((m, k) => this.play('harp', chW, at(3.5) + k * 0.018, m, 0.42 * V, this.holdBeats(at(3.5), m, spb, 2), { release: 0.4 }));
        break;
      }
      case 'drum': {
        // a fill that builds: accents and ghost strokes, flams, then the toms tumbling down and a crash
        const pat = 'X.xoX.oxX.xoXoxx'; // beats 0–3, 16ths
        for (let k = 0; k < 16; k++) {
          const ch2 = pat[k];
          if (ch2 === '.') continue;
          const c = cAt(k * 0.25);
          const root = this.rootIn(c, 53, 64);
          const vel = (ch2 === 'X' ? 0.75 : ch2 === 'x' ? 0.52 : 0.28) * (0.85 + k * 0.012) * V;
          const m = k >= 12 ? root - [0, 3, 5, 7][k - 12] : ch2 === 'X' ? root : chordTones(c, root + 3, root + 8)[0] ?? root;
          this.play('tdrum', ch, at(k * 0.25), m, vel, 0.35, { release: 0.1 });
          if (ch2 === 'X') this.play('tdrum', ch, at(k * 0.25) - 0.022, m + 2, vel * 0.35, 0.1, { release: 0.05 });
          if (k >= 12) this.play('tom', this.ch(pan * 0.6 + (k - 13.5) * 0.25), at(k * 0.25), clamp(m - 9, 40, 56), vel * 0.8, 0.5, { release: 0.2 });
        }
        // 32nd-note roll on the last beat (level 1+), the landing on the next downbeat
        if (lv >= 1) for (let k = 0; k < 8; k++) this.play('snare', ch, at(3 + k * 0.125), 60, (0.15 + 0.05 * k) * V, 0.15, { release: 0.05 });
        this.play('crash', chW, at(4), 60, 0.42 * V, 3, { release: 1 });
        this.play('boom', ch, at(4), bassNote(cAt(4), 28), 0.4 * V, 1.2, { release: 0.4 });
        break;
      }
      case 'bell': {
        // a carillon: change-ringing down and up two octaves of the chord, the big bell on the downbeat
        const order = [0, 2, 1, 3, 2, 4, 3, 5, 5, 3, 4, 2, 3, 1, 2, 0];
        for (let k = 0; k < 16; k++) {
          const b = k * 0.25;
          const tones = chordTones(cAt(b), 67, 91);
          if (!tones.length) continue;
          const m = tones[tones.length - 1 - Math.min(tones.length - 1, order[k])];
          this.play('tbell', chW, at(b), m > 84 ? m - 12 : m, (k % 4 === 0 ? 0.5 : 0.34) * V, Math.min(1.5 * spb, this.holdBeats(at(b), m, spb, 2)), { release: 0.5 });
          this.play('celesta', chW, at(b), m + 12 <= 98 ? m + 12 : m, 0.22 * V, 0.8 * spb, { release: 0.6 });
        }
        this.play('tbell', ch, at(0), bassNote(cAt(0), 55), 0.5 * V, this.holdBeats(at(0), bassNote(cAt(0), 55), spb, 4), { release: 1 });
        this.play('glass', chW, at(3.5), chordTones(cAt(3.5), 86, 98)[0] ?? 91, 0.3 * V, 2 * spb, { release: 1 });
        break;
      }
      case 'shaker': {
        // a samba break: surdo-like drum on 2 and 4, shaker sixteenths, tambourine, agogô bells, claps
        const shk = 'XoxoXoxoXoxoXoxX';
        for (let k = 0; k < 16; k++) {
          const b = k * 0.25;
          const sv = shk[k] === 'X' ? 0.62 : shk[k] === 'x' ? 0.42 : 0.26;
          this.play('shaker', this.ch(pan * 0.6 - 0.3), at(b), 60 + rand(-0.2, 0.2), sv * V, 0.15, { release: 0.04 });
          if (k % 4 === 2 || k === 15) this.play('tamb', this.ch(pan * 0.6 + 0.3), at(b), 60, 0.4 * V, 0.25, { release: 0.08 });
        }
        const ago = '1.1.2.1..2.1.2..';
        for (let k = 0; k < 16; k++) {
          if (ago[k] === '.') continue;
          const c = cAt(k * 0.25);
          const hi = chordTones(c, 79, 91);
          const m = ago[k] === '2' ? hi[hi.length - 1] ?? 88 : hi[0] ?? 81;
          this.play('anvil', chW, at(k * 0.25), m, 0.2 * V, 0.25, { release: 0.15 });
        }
        for (const b of [1, 3]) this.play('tdrum', ch, at(b), this.rootIn(cAt(b), 48, 57), 0.55 * V, 0.4, { release: 0.12 });
        for (const b of [0.75, 1.5, 3.5]) this.play('clap', this.ch(pan * 0.6), at(b), 60, 0.4 * V, 0.3, { release: 0.1 });
        break;
      }
      case 'crystal': {
        // a cascade: a shower of zaps falling through three octaves of the chord, a sparkle climbing back
        for (let k = 0; k < 24; k++) {
          const b = k * (2.5 / 24);
          const tones = chordTones(cAt(b), 67, 98);
          const m = tones[Math.max(0, tones.length - 1 - (k % tones.length))] ?? 84;
          this.play('zap', this.ch(Math.sin(k * 0.9) * 0.8, true), at(b), m, (0.42 - 0.006 * k) * V, 0.3, { release: 0.2 });
        }
        for (let k = 0; k < 6; k++) {
          const b = 2.75 + k * 0.125;
          const tones = chordTones(cAt(b), 79, 98);
          this.play('glass', chW, at(b), tones[Math.min(tones.length - 1, k)] ?? 91, (0.2 + 0.03 * k) * V, 1.2 * spb, { release: 0.8 });
        }
        this.play('zap', chW, at(3.5), chordTones(cAt(3.5), 84, 99).pop() ?? 96, 0.5 * V, 1.5 * spb, { release: 0.5 });
        break;
      }
      case 'horn': {
        // a fanfare: ta-ta-taa on the root, the leap to the fifth, a triplet climb, the octave held
        const c0 = cAt(0);
        const r = this.rootIn(c0, 55, 66);
        const fifth = (x: Chord, m: number) => chordTones(x, m + 5, m + 8)[0] ?? m + 7;
        const notes: [number, number, number][] = [
          [0, r, 0.3], [1 / 3, r, 0.3], [2 / 3, r, 0.3], [1, fifth(cAt(1), r), 0.9],
          [2, chordTones(cAt(2), r, r + 5)[1] ?? r + 4, 0.3], [2 + 1 / 3, fifth(cAt(2), r), 0.3], [2 + 2 / 3, chordTones(cAt(2.6), r + 9, r + 12).pop() ?? r + 12, 0.3],
          [3, chordTones(cAt(3), r + 10, r + 14)[0] ?? r + 12, 1.4],
        ];
        for (const [b, m, len] of notes) {
          const big = len > 0.5;
          this.play('brass', ch, at(b), m, (big ? 0.62 : 0.5) * V, len * spb, { release: 0.25 });
          this.play('brass', this.ch(-pan * 0.5), at(b) + 0.006, m - 12, (big ? 0.36 : 0.28) * V, len * spb, { release: 0.25 });
          if (lv >= 1 && big) oscStack(this.core, chW, at(b), m + 12 <= 84 ? m + 12 : m, 0.3 * V, len * spb, { ...LOWBRASS(0.8), attack: 0.03, release: 0.3, cat: 'rhythm', cap: 40 });
        }
        this.play('tdrum', ch, at(3), this.rootIn(cAt(3), 52, 62), 0.5 * V, 0.4);
        break;
      }
      case 'choir': {
        // a chord swell: the voices enter one by one (beats 0, 1, 2, the descant on 3) and the full
        // choir blooms; every voice moves to the nearest chord tone whenever the harmony changes
        const parts: [number, number, number][] = [[0, 55, 62], [1, 62, 67], [2, 67, 72], [2, 72, 77], [3, 76, 84]];
        const cuts = new Set<number>([0, 1, 2, 3, 4]);
        for (let h = 0.5; h < 4; h += 0.5) if (cAt(h).sym !== cAt(h - 0.5).sym) cuts.add(h);
        const edges = [...cuts].sort((x, y) => x - y);
        const held: ({ m: number; from: number } | null)[] = parts.map(() => null);
        const emit = (k: number, to: number) => {
          const n = held[k];
          if (!n) return;
          const first = n.from === parts[k][0];
          const vel = (0.36 + 0.05 * parts[k][0] + (k === 4 ? 0.06 : 0)) * V;
          const len = (to - n.from) * spb + (to >= 4 ? 0.3 : 0.02);
          const rel = to >= 4 ? 0.7 : 0.08;
          this.play('choirx', chW, at(n.from), n.m, first ? vel : vel * 0.7, len, { release: rel });
          this.play('choir', chW, at(n.from) + (first ? 0.03 : 0), n.m, (first ? 0.25 : 0.2) * V, len, { release: rel });
          held[k] = null;
        };
        for (let e = 0; e < edges.length - 1; e++) {
          const b0 = edges[e];
          const c = cAt(b0);
          parts.forEach(([entry, lo, hi], k) => {
            if (entry > b0) return;
            const tones = chordTones(c, lo, hi);
            const prev = held[k]?.m ?? (lo + hi) / 2;
            const m = tones.length ? tones.reduce((a, x) => (Math.abs(x - prev) < Math.abs(a - prev) ? x : a)) : Math.round(prev);
            if (held[k] && held[k]!.m === m) return;
            emit(k, b0);
            held[k] = { m, from: b0 };
          });
        }
        parts.forEach((_, k) => emit(k, 4));
        this.play('tbell', chW, at(0), bassNote(cAt(0), 60), 0.22 * V, Math.min(3 * spb, this.holdBeats(at(0), bassNote(cAt(0), 60), spb, 3)), { release: 1.5 });
        this.play('crash', this.ch(0, true), at(3), 60, 0.16 * V, 2, { release: 1 });
        break;
      }
      case 'bass': {
        // a slap riff: thumb on the root, popped octaves, a fifth, ghost notes — and a sub drop under it
        const pat: (number | null)[] = [0, null, 12, 0, null, 7, 12, null, 0, 0, null, 7, 12, 7, 0, 12];
        for (let k = 0; k < 16; k++) {
          const iv = pat[k];
          if (iv === null) continue;
          const b = k * 0.25;
          const c = cAt(b);
          const r = this.rootIn(c, 36, 47);
          const m = iv === 7 ? chordTones(c, r + 5, r + 8)[0] ?? r + 7 : r + iv;
          const pop = iv === 12;
          this.play('tbass', ch, at(b), m, (pop ? 0.6 : 0.75) * V * (k % 4 === 0 ? 1.1 : 1), 0.22 * spb, { release: 0.06 });
          if (pop) this.play('tek', ch, at(b), 64, 0.15 * V, 0.08);
        }
        this.play('boom', ch, at(0), bassNote(cAt(0), 28), 0.5 * V, 2 * spb, { release: 0.4 });
        this.play('boom', ch, at(2), bassNote(cAt(2), 28), 0.4 * V, 2 * spb, { release: 0.4 });
        break;
      }
    }
  }

  // ───────────────────────────── v7: viradas (the player plays the fill) ─────────────────────────────

  private get fillVoice(): FillVoice {
    return FILLS[this.director.world ?? 'menu'] ?? FILLS.menu;
  }

  /**
   * A virada is coming: from `start` to `end` (context times; moved onto the 16th grid) the song's
   * own drum kit steps back (Director.setVirada: tacet, the footsteps a faint ghost) so the
   * player's strokes are the fill. A new cue replaces the previous one (its crash is cancelled).
   */
  viradaCue(start: number, end: number, n: number, level: number): void {
    const now = this.core.now;
    const g = this.grid();
    const a = this.snap(start);
    const b = this.snap(end);
    if (!(b > a) || b - a > 4 * g.barDur + 1e-6 || b < now) return;
    this.cancelVirada(now);
    this.director.setVirada(a, b);
    this.warmVirada();
    const e = this.director.kitEnergy(a);
    const ref = KIT_REF[this.director.world ?? 'menu'] ?? KIT_REF.menu;
    const scale = e === null ? 1 : clamp(Math.sqrt(e / ref), 0.35, 1);
    this.vir = { start: a, end: b, n: clamp(Math.round(Number.isFinite(n) ? n : 5), 1, 16), level: clamp(Math.round(Number.isFinite(level) ? level : 0), 0, 2), prev: {}, crash: false, bus: null, scale };
  }

  /** the fill's voices for this land (rendered in the background: the cue comes a bar ahead) */
  warmVirada(): void {
    const F = this.fillVoice;
    this.bank.warm(F.drum, F.lo, F.hi, 2);
    if (F.body) this.bank.warm(F.body, F.bodyLo, F.bodyHi, 2);
    if (F.tone && F.tone !== 'organ') this.bank.warm(F.tone, F.toneLo, F.toneHi, 2);
    for (const x of [...(F.hits ?? []), F.stick, F.jingle, 'tick', 'crash'] as (BufInst | null)[]) if (x) this.bank.warm(x, 60, 60, 2);
    this.bank.warm('timp', 40, 51, 3);
    this.bank.warm('celesta', 76, 96, 3);
    this.bank.warm('glass', 88, 98, 3);
    this.bank.warm('choirx', 67, 81, 3);
  }

  /** the song changed or stopped: a virada in progress is dropped (its crash too), the drums are back */
  dropVirada(): void {
    if (!this.vir && !this.director.viradas.length) return;
    this.cancelVirada(this.core.now);
    this.director.viradas = [];
  }

  /** drops the virada in progress: its crash (if booked and still ahead) fades out */
  private cancelVirada(now: number): void {
    const v = this.vir;
    this.vir = null;
    if (v?.bus && v.end > now - 0.01) this.silence(v.bus);
    this.oldBuses = this.oldBuses.filter((o) => {
      if (o.until > now) return true;
      try {
        o.bus.disconnect();
      } catch {
        /* ignore */
      }
      return false;
    });
    if (v?.bus) this.oldBuses.push({ bus: v.bus, until: v.end + 6 });
  }

  private silence(bus: GainNode): void {
    const now = this.core.now;
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + 0.03);
    } catch {
      /* ignore */
    }
  }

  /** the pitch of a falling layer: x 0 (first mark, high) … 1 (last, low), on a chord tone, never above the layer's last stroke */
  private fall(v: ViradaState | null, layer: string, c: Chord, lo: number, hi: number, x: number): number {
    const target = hi - x * (hi - lo);
    const tones = chordTones(c, lo, hi);
    if (!tones.length) return Math.round(target);
    const prev = v?.prev[layer];
    const ok = prev === undefined ? tones : tones.filter((m) => m <= prev);
    const pool = ok.length ? ok : [tones[0]];
    const m = pool.reduce((best, y) => (Math.abs(y - target) < Math.abs(best - target) ? y : best), pool[0]);
    if (v) v.prev[layer] = m;
    return m;
  }

  /**
   * Mark i of n was tapped at the judged grid time t: one stroke of the fill, at the level of the
   * song's drums (never above it). perfect = brighter and fuller; miss = no stroke, a faint muted tick.
   */
  viradaHit(i: number, n: number, t0: number, q: TapQuality, pan: number): void {
    const t = this.snap(t0);
    // a stroke reported long after its mark is no longer part of the fill
    if (t < this.core.now - 0.25) return;
    const ch = this.ch(pan * 0.6);
    if (q === 'miss') {
      this.play('tick', ch, t, 56, 0.1 * FILL, 0.05, { lp: 800 });
      return;
    }
    const vv = this.vir;
    const v = vv && t > vv.start - this.grid().barDur && t < vv.end + 0.2 ? vv : null;
    const N = clamp(Math.round(Number.isFinite(n) ? n : v?.n ?? 5), 1, 16);
    const k = clamp(Math.round(Number.isFinite(i) ? i : 0), 0, N - 1);
    const x = N > 1 ? k / (N - 1) : 1;
    const lv = v?.level ?? 0;
    const perfect = q === 'perfect';
    const F = this.fillVoice;
    const c = this.chordAt(t);
    const chW = this.ch(pan * 0.6, true);
    // the first stroke announces the fill, the last one lands heaviest
    const acc = k === N - 1 ? 1.04 : k === 0 ? 1 : 0.9;
    const vel = FILL * F.trim * (v?.scale ?? 1) * (perfect ? 1 : 0.8) * (1 + 0.03 * lv) * acc;
    const dm = this.fall(v, 'drum', c, F.lo, F.hi, x);
    this.play(F.drum, ch, t, dm, F.dv * vel, 0.6, { release: 0.2, lp: perfect ? undefined : 3800 });
    // the strokes are two beats apart: a perfect one answers itself a 16th later (ta-dum), softer and lower
    if (perfect) this.play(F.drum, ch, t + this.grid().barDur / 16, dm - 5, F.dv * vel * 0.45, 0.5, { release: 0.18, lp: 3200 });
    if (F.body && (perfect || lv >= 1 || x >= 0.5)) this.play(F.body, this.ch(pan * 0.4), t, this.fall(v, 'body', c, F.bodyLo, F.bodyHi, x), F.bv * vel * (perfect ? 1 : 0.75), 0.5, { release: 0.15 });
    // a stroke's slight detune comes from its index (no randomness: the fill is the same every time)
    const jit = ((k * 7) % 5) * 0.04 - 0.08;
    if (F.hits) this.play(x < 0.5 ? F.hits[0] : F.hits[1], ch, t, 60 + jit, F.hv * vel, 0.3, { release: 0.1 });
    if (F.tone) {
      const m = this.fall(v, 'tone', c, F.toneLo, F.toneHi, x);
      const tv = F.tv * vel * (perfect ? 1 : 0.75);
      if (F.tone === 'organ') oscStack(this.core, chW, Math.max(this.core.now, t), m, 0.9 * tv * this.level, perfect ? 0.22 : 0.14, { ...ORGAN(perfect ? 0.8 : 0.5), attack: 0.006, release: 0.2, cat: 'rhythm', cap: 40 });
      else this.play(F.tone, chW, t, m, tv, perfect ? 0.5 : 0.3, { release: 0.3, lp: perfect ? undefined : 4000 });
    }
    if (F.stick) this.play(F.stick, ch, t, F.stickMidi + jit, F.sv * vel, 0.1);
    // perfect: the shimmer of the land's jingle (or a bright tick of air)
    if (perfect) this.play(F.jingle ?? 'shaker', this.ch(pan * 0.6 + 0.2), t, 60 + jit, (F.jingle ? 0.32 : 0.2) * vel, 0.25, { release: 0.08 });
    // the first hit books the crash on the downbeat (no hit at all: the song simply resumes)
    if (v && !v.crash) {
      v.crash = true;
      this.bookCrash(v, v.end);
    }
  }

  private bookCrash(v: ViradaState | null, t: number): void {
    if (t < this.core.now - 0.12) return; // too late to land on the downbeat
    const lv = v?.level ?? 0;
    const ch = this.ch(0, true);
    let dest: AudioNode | undefined;
    if (v) {
      if (!v.bus) {
        v.bus = this.core.ctx.createGain();
        v.bus.connect(ch.input);
      }
      dest = v.bus;
    }
    this.play('crash', ch, t, 60, VCRASH * (1 + 0.1 * lv) * Math.max(0.6, v?.scale ?? 1), 2.6, { release: 1, dest });
  }

  /**
   * The virada ended at t (the downbeat after it). All hit: the crash and a sparkling one-bar chord
   * swell with the band ("VIRADA!"); some: just the crash; none: the song simply resumes.
   */
  viradaEnd(t0: number, hits: number, n: number, perfect: boolean): void {
    const g = this.grid();
    const v = this.vir;
    const T = v && Math.abs(t0 - v.end) < g.barDur * 0.5 ? v.end : this.snap(t0);
    const h = Math.max(0, Math.round(Number.isFinite(hits) ? hits : 0));
    const N = Math.max(0, Math.round(Number.isFinite(n) ? n : v?.n ?? 0));
    this.vir = null;
    if (v) this.director.endVirada(T);
    if (h > 0 && !v?.crash) this.bookCrash(v, T);
    // no hit after all: no crash (the song simply resumes)
    if (h === 0 && v?.bus) this.silence(v.bus);
    if (v?.bus) this.oldBuses.push({ bus: v.bus, until: T + 6 });
    if (N > 0 && h >= N) this.viradaSwell(T, v?.level ?? 0, !!perfect);
  }

  /** "VIRADA!": a sparkle climbing the chord, the band's chord swelling for a bar, the land's drum on the downbeat */
  private viradaSwell(T: number, lv: number, perfect: boolean): void {
    const now = this.core.now;
    const g = this.grid();
    const sd = g.spb / 4;
    const S = SWELL * (1 + 0.08 * lv) * (perfect ? 1.06 : 1);
    // a late call plays only what is still ahead (never a burst of overdue notes)
    const ahead = (x: number) => x >= now - 0.005;
    const c = this.chordAt(T + 0.01);
    if (ahead(T)) {
      // the land's drum lands with the crash, on the chord root
      const F = this.fillVoice;
      this.play(F.drum, this.ch(0), T, this.rootIn(c, F.lo, F.hi), F.dv * 0.6 * S, 0.6, { release: 0.2 });
      this.play('timp', this.ch(0), T, this.rootIn(c, 40, 51), 0.3 * S, 1.4, { release: 0.5 });
    }
    // the sparkle: celesta up the chord in 16ths across two beats (each note on that moment's chord), glass on top
    for (let k = 0; k < 8; k++) {
      const tk = T + k * sd;
      if (!ahead(tk)) continue;
      const tones = chordTones(this.chordAt(tk + 0.001), 76, 96);
      if (!tones.length) continue;
      const m = tones[Math.min(tones.length - 1, k)];
      this.play('celesta', this.ch(-0.5 + k * 0.14, true), tk, m, (0.2 + 0.012 * k) * S, 0.7, { release: 0.5 });
      if (k === 7 || (perfect && k % 2 === 1)) this.play('glass', this.ch(0.4, true), tk, m + 12 <= 98 ? m + 12 : m, (k === 7 ? 0.24 : 0.12) * S, 1.2, { release: 0.8 });
    }
    // the band's chord swells through the bar (low brass and the choir's "ah"), held while it stays a chord tone
    if (!ahead(T)) return;
    chordTones(c, 55, 69).slice(0, 3).forEach((m, k) => {
      const hold = Math.min(g.barDur, this.holdBeats(T, m, g.spb, g.beats));
      oscStack(this.core, this.ch(k - 1), T, m, 0.42 * S * this.level, hold, { ...LOWBRASS(0.6), attack: hold * 0.5, release: 0.5, cat: 'rhythm', cap: 40 });
      this.play('choirx', this.ch(1 - k, true), T, m + 12, 0.18 * S, hold + 0.2, { release: 0.6 });
    });
  }

  // ───────────────────────────── call & echo ─────────────────────────────

  /** the call's four pitches: the tonic triad and its octave in the key of the moment (all distinct) */
  private callPitches(t: number): number[] {
    const k = this.director.keyAt(t);
    if (!k) return [72, 76, 79, 84];
    let base = k.deg(0);
    while (base < 72) base += 12;
    while (base > 83) base -= 12;
    const d = k.deg(0);
    const sh = base - d;
    return [k.deg(0) + sh, k.deg(2) + sh, k.deg(4) + sh, k.deg(7) + sh];
  }

  callNote(i: number, t: number): void {
    const idx = clamp(Math.round(Number.isFinite(i) ? i : 0), 0, 3);
    if (idx === 0 || !this.call || t - this.call.t > 12) this.call = { t, notes: this.callPitches(t) };
    const m = this.call.notes[idx];
    const pan = [-0.45, -0.15, 0.15, 0.45][idx];
    // the Maestro's voice: a clear bell-like note (celesta + glass an octave up + a soft harp body)
    this.play('celesta', this.ch(pan, true), t, m, 0.5 * CALL, 0.9, { release: 0.6 });
    this.play('glass', this.ch(pan, true), t, m + 12 <= 98 ? m + 12 : m, 0.22 * CALL, 0.9, { release: 0.6 });
    this.play('harp', this.ch(pan), t, m - 12, 0.3 * CALL, 0.8, { release: 0.4 });
  }

  echoNote(i: number, t: number, ok: boolean): void {
    const idx = clamp(Math.round(Number.isFinite(i) ? i : 0), 0, 3);
    const notes = this.call && t - this.call.t < 30 ? this.call.notes : this.callPitches(t);
    const m = notes[idx];
    const pan = [-0.45, -0.15, 0.15, 0.45][idx];
    if (ok) {
      // the player's answer: the same pitch on the baton's voice (harp + celesta), bright and sure
      this.play('harp', this.ch(pan, true), t, m, 0.5 * CALL, 0.9, { release: 0.5 });
      this.play('celesta', this.ch(pan, true), t, m, 0.32 * CALL, 0.7, { release: 0.5 });
      this.play('tdrum', this.ch(pan), t, this.rootIn(this.chordAt(t), 52, 63), 0.3 * CALL, 0.3, { release: 0.1 });
    } else {
      // a little off: a quarter-tone flat sagging further, muted, and a dull tick
      this.play('harp', this.ch(pan), t, m, 0.3 * CALL, 0.4, { release: 0.2, lp: 1200, cents: -45, bend: -30, bendTime: 0.25 });
      this.play('tom', this.ch(pan), t, 45, 0.15 * CALL, 0.2, { release: 0.08, lp: 600 });
    }
  }

  echoResult(success: boolean): void {
    const g = this.grid();
    const now = this.core.now;
    // on the next eighth of the grid
    const e = g.spb / 2;
    const t = g.t0 + Math.ceil((now + 0.06 - g.t0) / e) * e;
    const notes = this.call ? this.call.notes : this.callPitches(t);
    this.level = 0.6;
    try {
      this.verdict(success, t, e, notes);
    } finally {
      this.level = 1;
    }
  }

  private verdict(success: boolean, t: number, e: number, notes: number[]): void {
    if (success) {
      // a short fanfare: the call's notes flash up, then the chord rings with brass, choir and a crash
      notes.forEach((m, k) => this.play('celesta', this.ch(-0.4 + k * 0.27, true), t + k * 0.06, m, 0.4, 0.7, { release: 0.5 }));
      const tc = t + 4 * 0.06 + 0.02;
      const c = this.chordAt(tc);
      const tonicChord: number[] = [notes[0] - 12, notes[1] - 12, notes[2] - 12];
      const voicing = tonicChord.every((m) => c.pcs.includes(pcOf(m))) ? tonicChord : chordTones(c, 60, 71).slice(0, 3);
      voicing.forEach((m, k) => {
        this.play('brass', this.ch(k - 1), tc, m, 0.42, 0.9, { release: 0.4 });
        this.play('choirx', this.ch(1 - k, true), tc + 0.01, m + 12, 0.3, 1.1, { release: 0.6 });
      });
      this.play('glass', this.ch(0.3, true), tc, notes[3] + 12 <= 98 ? notes[3] + 12 : notes[3], 0.3, 1.5, { release: 1 });
      this.play('crash', this.ch(0, true), tc, 60, 0.3, 2.5, { release: 1 });
      this.play('tdrum', this.ch(0), tc, this.rootIn(c, 52, 63), 0.6, 0.4);
    } else {
      // gentle: the call's top note sighs down to its root, softly ("not quite — again!")
      this.play('celesta', this.ch(0.2, true), t, notes[2], 0.28, 0.6, { release: 0.4, lp: 3000 });
      this.play('celesta', this.ch(-0.2, true), t + e, notes[0], 0.22, 0.9, { release: 0.6, lp: 2500 });
      this.play('tom', this.ch(0), t + e, 45, 0.16, 0.3, { release: 0.1, lp: 700 });
    }
  }
}
