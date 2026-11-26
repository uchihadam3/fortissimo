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
import { BufferBank, Channel, type BufInst, LOWBRASS, oscStack, playBuf } from './synth';
import { bassNote, chord, chordTones, type Chord, pcOf } from './theory';
import { clamp, rand } from './util';

export type TapQuality = 'perfect' | 'good' | 'miss';

const PANS = [-0.6, -0.3, 0, 0.3, 0.6];
/** per-instrument solo trims (measured: every solo bar ≈ +5…6 LU over the full band's backing) */
const SOLO: Record<TowerKind, number> = { harp: 0.95, drum: 1, bell: 0.27, shaker: 0.95, crystal: 0.55, horn: 0.62, choir: 0.6, bass: 0.42 };
/** the Maestro's call and the player's echo */
const CALL = 0.5;
/** level of the baton taps */
const TAP = 0.3;

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
    for (const [inst, lo, hi] of [['tdrum', 47, 67], ['rim', 60, 60], ['tek', 60, 60], ['tamb', 60, 60], ['celesta', 72, 98], ['glass', 76, 98], ['clap', 60, 60], ['crash', 60, 60], ['snare', 60, 60], ['tom', 40, 56], ['timp', 40, 53], ['tbass', 40, 64], ['choirx', 55, 80], ['choir', 55, 80], ['brass', 45, 75], ['harp', 48, 96], ['zap', 70, 99], ['tbell', 60, 84], ['shaker', 60, 60], ['anvil', 76, 92], ['boom', 26, 40]] as [BufInst, number, number][]) bank.warm(inst, lo, hi, 4);
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private ch(pan: number, wet = false): Channel {
    const i = clamp(Math.round((clamp(Number.isFinite(pan) ? pan : 0, -1, 1) + 1) * 2), 0, 4);
    return (wet ? this.wetChs : this.chs)[i];
  }

  private play(inst: BufInst, ch: Channel, t: number, midi: number, vel: number, dur: number, o: { release?: number; lp?: number; bend?: number; bendTime?: number; cents?: number } = {}): void {
    if (!(vel > 0.001) || !Number.isFinite(t)) return;
    playBuf(this.core, this.bank, inst, ch.input, Math.max(this.core.now, t), midi, vel * this.level, dur, { cat: 'rhythm', cap: 90, ...o });
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
      // a soft, muted thud: no pitch to speak of, no sparkle
      this.play('tom', ch, t, 45, 0.22 * TAP, 0.2, { release: 0.08, lp: 520 });
      this.play(P.body, ch, t, root - 5, 0.1 * TAP, 0.15, { release: 0.06, lp: 900 });
      return;
    }
    const perfect = q === 'perfect';
    // calibrated: over a full band at intensity 1 a tap on every beat adds ≈ +1.5 LU (it leads the
    // beat, it does not drown the band)
    const v = (perfect ? 1 : 0.8) * TAP;
    const downbeat = beat === 0;
    // the drum: tuned to the chord root, the downbeat a fifth-free octave lower accent
    this.play(P.body, ch, t, downbeat ? root : chordTones(c, root, root + 8)[beat % 2 === 1 ? 1 : 0] ?? root, 0.62 * v * (downbeat ? 1.1 : 1), 0.4, { release: 0.1 });
    this.play('tom', ch, t, Math.max(41, root - 12), 0.18 * v, 0.3, { release: 0.1 });
    this.play(P.click, ch, t, P.clickMidi + rand(-0.1, 0.1), (perfect ? 0.5 : 0.36) * v, 0.15);
    // the pitched voice on a chord tone (walks up the chord with the run)
    const tones = chordTones(c, P.toneLo, P.toneHi);
    if (tones.length) {
      const m = tones[(this.tapRun + (downbeat ? 0 : beat)) % Math.min(tones.length, 4)];
      this.play(P.tone, this.ch(pan * 0.5, true), t, m, (perfect ? 0.34 : 0.24) * TAP * (P.tone === 'tbell' ? 0.8 : 1), perfect ? 0.9 : 0.5, { release: 0.4, lp: perfect ? undefined : 5000 });
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
          this.play('choirx', chW, at(n.from), n.m, first ? vel : vel * 0.7, (to - n.from) * spb + (to >= 4 ? 0.3 : 0.02), { release: to >= 4 ? 0.7 : 0.08 });
          if (first) this.play('choir', chW, at(n.from) + 0.03, n.m, 0.25 * V, (4 - n.from) * spb + 0.3, { release: 0.9 });
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
