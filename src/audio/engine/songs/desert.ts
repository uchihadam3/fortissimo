/**
 * DESERT — "Dunas do Eco": D Hijaz (Phrygian dominant: D E♭ F♯ G A B♭ C), 104 bpm. The Harp of the
 * Dunes gives the world its melody, so this is the singing land: the ney (breathy bamboo flute with
 * turns and scoops), the oud and the qanun, darbuka and riq on the maqsum rhythm, frame drum steps,
 * finger cymbals, a drone, chant and the great golden harp.
 *
 * The leitmotif's head (D A. G F♯ — up a fifth, the dotted fall) answers with the augmented second
 * (F♯–E♭) that IS the desert. Tunes: A (the dune song) · B (the oud's dance) · C (the sandstorm) ·
 * N (the night lament, in D minor). Movements: D → G (Hijaz on the fourth) → the night → C → E.
 */
import { SONGS } from '../../../sim/defs';
import type { BarInfo, Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { DRONE, FLUTE, LOWBRASS, STRINGS, SUB, VIOLIN, CELLO, type BufInst } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

export const DESERT_A: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 0.5], [3, 0.5], [2, 0.5], [1, 0.5], [2, 1], [0, 1]],
  [[1, 1], [3, 1.5], [5, 0.5], [3, 1]],
  [[2, 1], [1, 0.5], [0, 2.5]],
  [[6, 1], [4, 1.5], [3, 0.5], [1, 1]],
  [[5, 1.5], [4, 0.5], [3, 2]],
  [[5, 1], [3, 1], [1, 1], [3, 1]],
  [[2, 1.5], [1, 0.5], [0, 2]],
];

export const DESERT_B: Line = [
  [[3, 0.5], [4, 0.5], [5, 1], [4, 0.5], [3, 0.5], [4, 1]],
  [[6, 1], [5, 0.5], [4, 0.5], [3, 2]],
  [[2, 0.5], [3, 0.5], [4, 1], [3, 0.5], [2, 0.5], [1, 1]],
  [[0, 3], [null, 1]],
  [[7, 1], [6, 0.5], [5, 0.5], [4, 1], [5, 1]],
  [[5, 1], [4, 0.5], [3, 0.5], [1, 2]],
  [[6, 0.5], [5, 0.5], [4, 0.5], [3, 0.5], [2, 1], [1, 1]],
  [[0, 2], [null, 2]],
];

/** the sandstorm: falling from the high E♭ to the dominant, twice, then the turn home */
export const DESERT_C: Line = [
  [[8, 1], [7, 0.5], [5, 0.5], [3, 1], [5, 1]],
  [[4, 1], [2, 0.5], [3, 0.5], [2, 1], [0, 1]],
  [[8, 1], [7, 0.5], [5, 0.5], [3, 1], [1, 1]],
  [[2, 0.5], [1, 0.5], [2, 0.5], [3, 0.5], [4, 2]],
  [[6, 1], [5, 0.5], [3, 0.5], [1, 1], [3, 1]],
  [[5, 1], [7, 1], [6, 1], [5, 1]],
  [[3, 1], [5, 1.5], [3, 0.5], [1, 1]],
  [[2, 1], [1, 1], [0, 2]],
];

/** the night lament (D minor, the leading tone borrowed for the cadence) */
export const DESERT_N: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1.5], [4, 0.5], [5, 2]],
  [[4, 1], [6.5, 1], [4, 1], [3, 1]],
  [[2, 1], [1, 1], [0, 2]],
  [[5, 1], [7, 1.5], [6, 0.5], [5, 1]],
  [[3, 1], [5, 1], [4, 1], [3, 1]],
  [[4, 2], [6.5, 1], [7, 1]],
  [[7, 3], [null, 1]],
];

const SECTIONS: SecDef[] = [
  { name: 'A', bars: ['D', 'D', 'Eb', 'D', 'Cm6', 'Gm', 'Eb', 'D'], tune: DESERT_A },
  { name: 'B', bars: ['Gm', 'Cm', 'D', 'D', 'Gm', 'Eb', ['Cm', 'D'], 'D'], tune: DESERT_B },
  { name: 'C', bars: ['Eb', 'D', 'Eb', 'D', 'Cm', 'Bb', 'Eb', 'D'], tune: DESERT_C },
  { name: 'N', bars: ['Dm', 'Gm', 'A7', 'Dm', 'Bb', 'Gm', 'A7', 'Dm'], tune: DESERT_N, mode: MODES.aeolian },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['A', 'B', 'A', 'C'], breaks: ['A', 'N', 'B'] },
  { shift: 5, order: ['B', 'A', 'C', 'B'], breaks: ['B', 'A', 'N'] },
  { shift: 0, order: ['N', 'B', 'N', 'C'], breaks: ['N', 'A'] },
  { shift: -2, order: ['C', 'A', 'B', 'A'], breaks: ['A', 'B', 'N'] },
  { shift: 2, order: ['A', 'B', 'C', 'A'], breaks: ['A', 'N', 'B'] },
];

export class DesertTheme extends Battle {
  readonly bpm: number = SONGS.desert.bpm;
  readonly level: number = 0.9;
  readonly key = new Scale(note('D4'), MODES.phrygianDominant);
  readonly warm: [BufInst, number, number][] = [['choir', 55, 70], ['choiroo', 52, 70], ['oud', 45, 74], ['koto', 62, 88], ['dum', 60, 60], ['tek', 60, 60], ['tamb', 60, 60], ['clap', 60, 60], ['taiko', 30, 36], ['crash', 60, 60], ['tile', 84, 100], ['glass', 84, 100], ['harp', 50, 90], ['brass', 45, 64], ['timp', 40, 53], ['shaker', 60, 60], ['tbell', 52, 68]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'tek', perc: 'darb', shake: 'shaker', clap: 'clap', glock: 'glass', glockCh: 'zills', bell: 'tbell', bellCh: 'zills', brass: 'horns', choir: 'choir', bass: 'bass', timp: 'timp' };

  setup(p: Player): void {
    p.ch('drone', { gain: 0.4, wet: 0.3, filterLfoHz: 140, filterLfoRate: 0.09 });
    p.ch('strings', { gain: 0.34, wet: 0.36, vibratoCents: 9 });
    p.ch('oud', { gain: 0.5, wet: 0.22, pan: -0.2 });
    p.ch('qanun', { gain: 0.3, wet: 0.3, pan: 0.26 });
    p.ch('darb', { gain: 0.5, wet: 0.16, pan: 0.1 });
    p.ch('riq', { gain: 0.2, wet: 0.14, pan: 0.3 });
    p.ch('clap', { gain: 0.22, wet: 0.24, pan: -0.25 });
    p.ch('davul', { gain: 0.42, wet: 0.2 });
    p.ch('bass', { gain: 0.42, wet: 0.05 });
    p.ch('zills', { gain: 0.2, wet: 0.45, pan: 0.34 });
    p.ch('horns', { gain: 0.38, wet: 0.4, pan: -0.08 });
    p.ch('choir', { gain: 0.32, wet: 0.5, vibratoCents: 7 });
    p.ch('ney', { gain: 0.56, wet: 0.42, pan: 0.12, vibratoCents: 16, vibratoRate: 5.6 });
    p.ch('vln', { gain: 0.34, wet: 0.45, vibratoCents: 12, vibratoRate: 5.6, pan: 0.22 });
    p.ch('cello', { gain: 0.5, wet: 0.36, vibratoCents: 9, pan: -0.1 });
    p.ch('timp', { gain: 0.44, wet: 0.3 });
    p.ch('harp', { gain: 0.32, wet: 0.48, pan: -0.32 });
  }

  /** a modal figure from the chord root along the movement's scale */
  private figure(f: BarInfo, beat: number, lo: number, degs: number[], k: number): number {
    const c = this.cAt(f, beat);
    let r = lo;
    while ((r - c.root + 120) % 12 !== 0) r++;
    const d0 = this.k.degreeOf(r);
    return this.k.deg(d0 + degs[k % degs.length]);
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const sec = f.sec;
    const night = sec === 'N';

    // ── core: the drone on the movement's tonic, a veil of strings, the frame-drum steps ──
    if (f.i % 4 === 0) {
      const T = this.rootNear(this.cAt(f, 0), 38);
      const tonic = this.k.tonic % 12;
      let d = 36;
      while (d % 12 !== tonic) d++;
      this.play(b, DRONE(night ? 420 : 520), 'drone', 0, d, brk ? 0.7 : 0.6, 4.2 * b.beats * b.spb);
      this.play(b, DRONE(night ? 420 : 520), 'drone', 0.05, d + 7, brk ? 0.42 : 0.36, 4.2 * b.beats * b.spb);
      void T;
    }
    this.chords(b, f, 'str', STRINGS(0.25), 'strings', 50, 64, 2, brk ? 0.36 : I === 0 ? 0.4 : 0.32, 0.4);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 33), brk ? 0.3 : 0.36, (brk ? 4 : 2) * b.spb);
    const sv = brk ? 0.3 : [0.36, 0.5, 0.56, 0.62][I];
    this.steps(b, sv, I === 0 ? [{ inst: 'dum', ch: 'darb' }] : [{ inst: 'dum', ch: 'darb' }, { inst: 'taiko', ch: 'davul', midi: 33, v: 0.18 + 0.1 * I }]);

    // ── the tune (breakdowns): the ney, the cello in the night ──
    if (brk) {
      const mk = 1 + 0.05 * (5 - L.h);
      if (night) {
        this.tune(b, f, CELLO(), 'cello', 0.95 * mk, { legato: 1.0 });
        if (L.h >= 2) this.tune(b, f, FLUTE(true), 'ney', 0.5, { shift: 12, bars: [4, 5, 6, 7], grace: 0.5, graceBelow: true });
      } else {
        this.tune(b, f, FLUTE(true), 'ney', 0.9 * mk, { shift: 12, grace: 0.55, graceBelow: true });
        if (L.h >= 2) this.tuneHarmony(b, f, VIOLIN(0.4), 'vln', 0.36, 2, 0, 1.5);
      }
      if (L.h >= 4 && L.strings) this.tune(b, f, 'koto', 'qanun', 0.3, { shift: 12, bars: [1, 3, 5, 7] });
    }

    // ── strings: the oud (and the qanun's tremolo when the band is big) ──
    if (L.strings) {
      const v = L.strings;
      if (brk) {
        if (f.i % 2 === 0) this.play(b, 'oud', 'oud', 0, this.root(f, 0, 50), 0.4 * v, 2 * b.spb);
        else {
          const degs = [0, 1, 2, 1];
          for (let k = 0; k < 4; k++) this.play(b, 'oud', 'oud', 2 + k * 0.5, this.figure(f, 2 + k * 0.5, 50, degs, k), (k === 0 ? 0.36 : 0.28) * v, 0.6 * b.spb, undefined, 0.003);
        }
      } else {
        const degs = I >= 2 ? [0, 1, 2, 1, 0, -1, 0, 1] : [0, -1, 0, 1, 0, 2, 1, 0];
        for (let k = 0; k < 8; k++) this.play(b, 'oud', 'oud', k * 0.5, this.figure(f, k * 0.5, 50, degs, k), (k % 4 === 0 ? 0.46 : 0.32) * v, 0.6 * b.spb, undefined, 0.003);
        if (I >= 3) {
          const degs2 = [0, 2, 1, 2, 3, 2, 1, 0];
          for (let k = 0; k < 8; k++) this.play(b, 'koto', 'qanun', k * 0.5, this.figure(f, k * 0.5, 62, degs2, k), (k % 2 ? 0.26 : 0.34) * v, 0.45 * b.spb, undefined, 0.003);
        }
      }
    }

    // ── percussion: the maqsum on darbuka, riq and claps ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      if (brk) {
        if (f.i % 2 === 1) this.drum(b, 'tamb', 'riq', '..............x.', 0.45 * v);
        this.drum(b, 'tek', 'darb', '..o.......o.....', 0.36 * v);
      } else {
        this.drum(b, 'tek', 'darb', I >= 2 ? '..x.o.x.o.o.x.oo' : I === 1 ? '..x...x.....x...' : '..o.......o.....', 0.5 * v);
        if (I >= 2) {
          this.drum(b, 'tamb', 'riq', 'xoxoxoxoxoxoxoxo', 0.4 * v);
          this.drum(b, 'clap', 'clap', '....x.......x...', 0.48 * v);
          if (f.i % 2 === 1) for (let k = 0; k < 4; k++) b.p.hit('tek', 'darb', this.T(b, 3 + k * 0.25, 0.002), (0.28 + k * 0.08) * v);
        } else if (I === 1) this.drum(b, 'tamb', 'riq', 'x...x...x...x...', 0.36 * v);
        if (I >= 3 && f.i % 4 === 0 && !b.drop) b.p.hit('crash', 'clap', this.T(b, 0, 0.001), 0.24);
      }
      if (this.rise(b)) b.p.hit('crash', 'clap', this.T(b, 0, 0.001), 0.24);
    }

    // ── bells: finger cymbals and a glint of glass ──
    if (L.bells) {
      const v = L.bells;
      if (brk) {
        if (f.i % 2 === 1) this.drum(b, 'tile', 'zills', '........x...x...', 0.28 * v, 96);
        if (f.i === 0 || f.i === 4) {
          const hi = chordTones(f.chord, 86, 98);
          if (hi.length) this.play(b, 'glass', 'zills', 0, hi[hi.length - 1], 0.18 * v, 2);
        }
      } else {
        this.drum(b, 'tile', 'zills', I >= 2 ? '..x...x...x...x.' : '......x.......x.', 0.26 * v, 96);
        if (I >= 2 && f.i % 2 === 1) {
          const tones = chordTones(this.cAt(f, 3), 84, 98);
          [3, 3.25, 3.5, 3.75].forEach((beat, k) => tones.length && this.play(b, 'glass', 'zills', beat, tones[k % tones.length], 0.16 * v, 0.6));
        }
      }
    }

    // ── brass: low swells, stabs on the maqsum accents ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 === 3) this.chords(b, f, 'hp', { ...LOWBRASS(0.3), attack: 1.2 }, 'horns', 50, 62, 3, 0.36 * v, 0.4);
      } else if (I <= 1) {
        if (f.i % 4 === 0) this.chords(b, f, 'hsw', { ...LOWBRASS(0.45), attack: 1.3 }, 'horns', 48, 62, 3, 0.44 * v, 0.3);
      } else {
        this.stabs(b, f, 'hst', 'brass', 'horns', 48, 62, 3, I >= 3 ? [0, 1.5, 3] : [0, 3], 0.38 * v, 0.45);
        if (I >= 3) this.chords(b, f, 'hch', LOWBRASS(0.5), 'horns', 48, 62, 3, 0.38 * v, 0.3);
      }
    }

    // ── voices: the chant ──
    if (L.voices) {
      const v = L.voices;
      if (brk) this.chords(b, f, 'choir', 'choiroo', 'choir', 55, 67, 3, 0.14 * v, 0.6);
      else this.chords(b, f, 'choir', I >= 3 ? 'choir' : 'choiroo', 'choir', 57, 69, 3, (I >= 2 ? 0.18 : 0.15) * v, 0.5);
    }

    // ── low: the dum-tek bass (the maqsum in the bass) ──
    if (L.low) {
      const v = L.low;
      if (brk) this.bassline(b, f, SUB(), 'bass', [[0, 0, 1.4, 0.4 * v], [2.5, 0, 1.2, 0.3 * v]], 33);
      else {
        const pat: [number, number, number, number][] = I >= 2 ? [[0, 0, 0.8, 0.5 * v], [1.5, 0, 0.4, 0.36 * v], [2, 0, 0.8, 0.46 * v], [3, 2, 0.4, 0.34 * v], [3.5, 0, 0.4, 0.3 * v]] : [[0, 0, 1.2, 0.48 * v], [2, 0, 1.2, 0.4 * v], [3.5, 3, 0.4, 0.26 * v]];
        this.bassline(b, f, SUB(), 'bass', pat, 33);
      }
    }

    // ── harmony: a violin counter-line; the golden harp in glory ──
    if (!brk && I >= 1 && L.h >= 2) this.counter(b, f, VIOLIN(0.5), 'vln', 69, 81, 0.28 + 0.05 * L.h, I >= 3 ? 2 : 4);
    if (!brk && I >= 3 && L.h >= 4 && L.brass) this.tune(b, f, LOWBRASS(0.65), 'horns', 0.52, { shift: -12, bars: [0, 4] });
    if (L.h >= 5 && (f.i === 3 || f.i === 7)) {
      const tones = chordTones(this.cAt(f, 2), 57, 91);
      for (let k = 0; k < 14 && tones.length; k++) this.play(b, 'harp', 'harp', 2 + k / 7, tones[k % tones.length], 0.14 + 0.012 * k, 1.2 * b.spb, undefined, 0.002);
    }
    this.glory(b, f, L, I, null);
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'clap' }, 'bass');
  }

  protected fill(b: BarCtx): void {
    for (let k = 0; k < 4; k++) b.p.hit('tek', 'darb', this.T(b, 3 + k * 0.25, 0.002), 0.3 + k * 0.1);
  }
}
