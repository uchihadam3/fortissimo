/**
 * MEADOW — "Prado das Cantigas": pastoral folk in G major, 100 bpm. The Bell of the Meadow gives the
 * world its rhythm, so this is the dancing land: tin whistle and fiddle, strummed guitar, a pizzicato
 * bass, a folk bass drum for the turtle's steps, frame drum and tambourine, accordion and the bell.
 *
 * The leitmotif opens like the FORTÍSSIMO theme (up a fifth, a dotted fall: "For-TÍS-si-mo") and
 * answers with a skipping folk turn. Tunes: A (the meadow song) · B (its answer, in E minor) ·
 * C (a reel) · H (the bell's hymn, over a falling bass) · Ad/Bd (A and B in E dorian, the dusk).
 * Movements: G → C → E dorian → D → A (the final lift).
 */
import { SONGS } from '../../../sim/defs';
import type { BarInfo, Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { FLUTE, LOWBRASS, PAD, REED, SUB, VIOLIN, FIDDLE, type BufInst } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

export const MEADOW_A: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 0.5], [4, 0.5], [5, 1], [4, 0.5], [3, 0.5], [2, 1]],
  [[4, 1], [2, 0.5], [1, 0.5], [0, 1], [-3, 1]],
  [[-1, 1], [1, 1], [4, 2]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 0.5], [4, 0.5], [5, 1], [7, 1], [5, 1]],
  [[8, 1], [7, 0.5], [6, 0.5], [5, 1], [6, 1]],
  [[7, 3], [null, 1]],
];

export const MEADOW_B: Line = [
  [[2, 1.5], [1, 0.5], [2, 1], [4, 1]],
  [[5, 2], [4, 1], [3, 1]],
  [[4, 1.5], [3, 0.5], [2, 1], [0, 1]],
  [[1, 3], [null, 1]],
  [[2, 1.5], [1, 0.5], [2, 1], [4, 1]],
  [[5, 1], [7, 1.5], [6, 0.5], [5, 1]],
  [[5, 1], [4, 1], [3, 1], [2, 1]],
  [[1, 2], [-1, 1], [1, 1]],
];

/** the reel: running quavers, a sequence climbing by steps */
export const MEADOW_C: Line = [
  [[3, 0.5], [5, 0.5], [7, 1], [5, 0.5], [4, 0.5], [3, 1]],
  [[4, 0.5], [6, 0.5], [8, 1], [6, 0.5], [5, 0.5], [4, 1]],
  [[6, 0.5], [8, 0.5], [9, 1], [8, 0.5], [6, 0.5], [4, 1]],
  [[7, 1.5], [5, 0.5], [2, 2]],
  [[5, 0.5], [7, 0.5], [8, 1], [7, 0.5], [5, 0.5], [3, 1]],
  [[4, 0.5], [6, 0.5], [8, 1], [7, 1], [6, 1]],
  [[7, 1], [4, 0.5], [2, 0.5], [0, 1], [2, 1]],
  [[3, 1], [5, 1], [4, 1], [6, 1]],
];

/** the bell's hymn: the head turned upward, over a falling bass */
export const MEADOW_H: Line = [
  [[4, 1], [7, 1.5], [6, 0.5], [5, 1]],
  [[4, 2], [1, 1], [2, 1]],
  [[2, 1], [5, 1.5], [4, 0.5], [2, 1]],
  [[4, 3], [null, 1]],
  [[3, 1], [5, 1], [7, 1.5], [6, 0.5]],
  [[7, 1], [4, 1], [2, 2]],
  [[3, 1.5], [2, 0.5], [1, 1], [3, 1]],
  [[1, 3], [null, 1]],
];

export const SECTIONS: SecDef[] = [
  { name: 'A', bars: ['G', 'C', 'G', 'D', 'G', 'Am7', ['Am7', 'D'], 'G'], tune: MEADOW_A },
  { name: 'B', bars: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'D'], tune: MEADOW_B },
  { name: 'C', bars: ['C', 'D', 'Bm7', 'Em', 'Am7', 'D', ['G', 'G/B'], ['C', 'D']], tune: MEADOW_C },
  { name: 'H', bars: ['G', 'D/F#', 'Em', 'G/D', 'C', 'G/B', 'Am7', 'D'], tune: MEADOW_H },
  // the dusk: written in G dorian, sounding in E dorian (plan shift −3)
  { name: 'Ad', bars: ['Gm', 'C', 'Gm', 'Dm', 'Gm', 'C', 'F', 'Gm'], tune: MEADOW_A },
  { name: 'Bd', bars: ['Bb', 'C', 'Gm', 'Dm', 'Bb', 'C', 'C', 'Dm'], tune: MEADOW_B },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['A', 'B', 'A', 'C'], breaks: ['A', 'B', 'H'] },
  { shift: 5, order: ['B', 'C', 'B', 'A'], breaks: ['B', 'H', 'A'] },
  { shift: -3, mode: MODES.dorian, order: ['Ad', 'Bd', 'Ad', 'Bd'], breaks: ['Ad', 'Bd'] },
  { shift: -5, order: ['C', 'A', 'B', 'A'], breaks: ['H', 'A', 'B'] },
  { shift: 2, order: ['A', 'B', 'C', 'A'], breaks: ['A', 'H', 'B'] },
];

export class MeadowTheme extends Battle {
  readonly bpm: number = SONGS.meadow.bpm;
  readonly level: number = 0.74;
  readonly key = new Scale(note('G4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['choir', 53, 70], ['choiroo', 52, 70], ['guitar', 43, 70], ['pizz', 31, 50], ['spicc', 45, 64], ['kick', 60, 60], ['brush', 60, 60], ['snare', 60, 60], ['hat', 60, 60], ['tamb', 60, 60], ['crash', 60, 60], ['tom', 40, 56], ['timp', 40, 53], ['celesta', 76, 98], ['tbell', 52, 68], ['harp', 55, 86], ['brass', 45, 64], ['shaker', 60, 60], ['clap', 60, 60]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'snare', perc: 'kit', shake: 'shaker', clap: 'clap', glock: 'celesta', glockCh: 'glock', bell: 'tbell', bellCh: 'bell', brass: 'horns', choir: 'choir', bass: 'sub', timp: 'timp' };

  setup(p: Player): void {
    p.ch('pad', { gain: 0.42, wet: 0.36, filterLfoHz: 180, filterLfoRate: 0.06 });
    p.ch('guitar', { gain: 0.5, wet: 0.22, pan: -0.24 });
    p.ch('fiddle', { gain: 0.34, wet: 0.26, pan: 0.2 });
    p.ch('bass', { gain: 0.6, wet: 0.08 });
    p.ch('sub', { gain: 0.4, wet: 0.04 });
    p.ch('kit', { gain: 0.5, wet: 0.14 });
    p.ch('hat', { gain: 0.2, wet: 0.12, pan: 0.26 });
    p.ch('tamb', { gain: 0.2, wet: 0.15, pan: -0.3 });
    p.ch('glock', { gain: 0.3, wet: 0.45, pan: 0.32 });
    p.ch('bell', { gain: 0.3, wet: 0.5, pan: -0.12 });
    p.ch('horns', { gain: 0.4, wet: 0.4, pan: -0.1 });
    p.ch('choir', { gain: 0.36, wet: 0.48, vibratoCents: 5 });
    p.ch('lead', { gain: 0.66, wet: 0.36, vibratoCents: 12, vibratoRate: 5.4, pan: 0.12 });
    p.ch('fid', { gain: 0.9, wet: 0.36, vibratoCents: 13, vibratoRate: 5.6, pan: -0.14 });
    p.ch('acc', { gain: 0.56, wet: 0.3, tremolo: 0.06, tremoloRate: 5.5, pan: 0.18 });
    p.ch('vln', { gain: 0.34, wet: 0.45, vibratoCents: 10, vibratoRate: 5.2, pan: 0.24 });
    p.ch('timp', { gain: 0.46, wet: 0.3 });
    p.ch('harp', { gain: 0.32, wet: 0.4, pan: -0.3 });
  }

  private strum(b: BarCtx, f: BarInfo, beat: number, up: boolean, vel: number): void {
    const tones = chordTones(this.cAt(f, beat), 50, 67).slice(0, up ? 4 : 6);
    const order = up ? [...tones].reverse() : tones;
    order.forEach((m, k) => this.play(b, 'guitar', 'guitar', beat + (k * 0.018) / b.spb, m, vel * (1 - k * 0.05), 1.2 * b.spb, undefined, 0.002));
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const sec = f.sec;

    // ── core: the meadow's air, a soft root, the footsteps ──
    this.chords(b, f, 'pad', PAD(I >= 2 ? 1500 : 1150), 'pad', 50, 66, 3, brk ? 0.4 : I === 0 ? 0.42 : 0.32, 0.3);
    this.play(b, SUB(), 'sub', 0, this.root(f, 0, 31), brk ? 0.26 : 0.34, b.beats * b.spb * 0.95);
    const sv = brk ? 0.2 : [0.28, 0.38, 0.44, 0.5][I];
    this.steps(b, sv, I === 0 ? [{ inst: 'kick', ch: 'kit' }] : [{ inst: 'kick', ch: 'kit' }, { inst: 'taiko', ch: 'kit', midi: 34, v: 0.25 + 0.1 * I }]);

    // ── the tune (breakdowns): whistle, fiddle or accordion by section ──
    if (brk) {
      // a small band leaves the tune more room: it carries a little more
      const mk = 1 + 0.05 * (5 - L.h);
      if (sec === 'A' || sec === 'Ad') this.tune(b, f, FLUTE(), 'lead', 0.9 * mk, { shift: 12, grace: 0.4 });
      else if (sec === 'B' || sec === 'Bd') this.tune(b, f, VIOLIN(0.55), 'fid', 0.85 * mk, { legato: 1.0 });
      else this.tune(b, f, REED(), 'acc', 0.75 * mk, { legato: 0.98 });
      // a second voice when the band is larger
      if (L.h >= 2) {
        if (sec === 'A' || sec === 'Ad') this.tuneHarmony(b, f, FIDDLE(), 'fid', 0.42, 2, 0, 1);
        else if (sec === 'H') this.tuneHarmony(b, f, FLUTE(), 'lead', 0.5, -5, 12, 1);
        else this.tuneHarmony(b, f, REED(), 'acc', 0.4, 2, 0, 1);
      }
      if (L.h >= 4 && L.bells) this.tune(b, f, 'celesta', 'glock', 0.2, { shift: 24, bars: [0, 4], to: 3 });
    }

    // ── strings: guitar (picked in the calm, strummed on the march), spiccato fiddles ──
    if (L.strings) {
      const v = L.strings;
      if (brk) this.ostinato(b, f, 'guitar', 'guitar', 47, 64, [0, 2, 1, 3, 0, 2, 1, 3], 0.34 * v, 1.2, [0, 4], 0.08);
      else {
        const pat = I <= 1 ? 'D.DU.UDU' : 'D.DUDUDU';
        for (let k = 0; k < 8; k++) if (pat[k] !== '.') this.strum(b, f, k * 0.5, pat[k] === 'U', v * (pat[k] === 'U' ? 0.22 : k % 4 === 0 ? 0.38 : 0.3));
        if (I >= 2) this.ostinato(b, f, 'spicc', 'fiddle', 48, 62, [0, 2, 1, 2, 0, 2, 1, 2], 0.4 * v, 0.42, [0, 3, 6]);
      }
    }

    // ── percussion: brushes, frame drum, tambourine ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      if (brk) {
        this.drum(b, 'brush', 'kit', '....o.......o...', 0.5 * v);
        if (f.i % 2 === 1) this.drum(b, 'tamb', 'tamb', '............o...', 0.4 * v);
      } else if (I <= 1) {
        this.drum(b, 'brush', 'kit', '....x......ox..o', 0.58 * v);
        this.drum(b, 'hat', 'hat', I === 0 ? '' : 'x.o.x.o.x.o.x.o.', 0.42 * v);
        if (I === 1) this.drum(b, 'tom', 'kit', 'o.....o...o.....', 0.22 * v, 45);
      } else if (I === 2) {
        this.drum(b, 'snare', 'kit', 'o...x..o....x.oo', 0.42 * v);
        this.drum(b, 'hat', 'hat', 'xoxoxoxoxoxoxoxo', 0.4 * v);
        this.drum(b, 'tamb', 'tamb', '....x.......x...', 0.45 * v);
      } else {
        this.drum(b, 'snare', 'kit', 'o...X..o....X.oo', 0.46 * v);
        this.drum(b, 'hat', 'hat', 'xoxoxoxoxoxoxoxo', 0.4 * v);
        this.drum(b, 'tamb', 'tamb', 'x.x.x.x.x.x.x.x.', 0.36 * v);
        this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.46 * v, 3, undefined, 0.002);
        if (f.i % 4 === 3 && !b.drop) [52, 48, 45, 41].forEach((m, k) => b.p.hit('tom', 'kit', this.T(b, 3 + k * 0.25, 0.002), (0.46 + k * 0.06) * v, m));
      }
      if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), I === 3 ? 0.3 : 0.26);
    }

    // ── bells: celesta sparkle, the Meadow's bell ──
    if (L.bells) {
      const v = L.bells;
      if (brk) {
        if (f.i % 2 === 1) this.tune(b, f, 'celesta', 'glock', 0.24 * v, { shift: 24, from: 2 });
        if (f.i === 0) this.play(b, 'tbell', 'bell', 0, this.tone(f.chord, 55, 0), 0.22 * v, 5);
      } else {
        if (f.i % 2 === 0) {
          const hi = chordTones(f.chord, 84, 96);
          if (hi.length) this.play(b, 'celesta', 'glock', 0, hi[(f.i / 2) % hi.length], 0.22 * v, 1.2);
        }
        if (I >= 2 && (f.i === 3 || f.i === 7)) {
          const tones = chordTones(this.cAt(f, 2), 79, 96);
          [2, 2.5, 3, 3.5].forEach((beat, k) => this.play(b, 'celesta', 'glock', beat, tones[(k * 2) % Math.max(1, tones.length)], 0.2 * v, 0.8 * b.spb));
        }
        if (I >= 3 && f.i === 0) this.play(b, 'tbell', 'bell', 0, this.tone(f.chord, 55, 0), 0.28 * v, 5);
      }
    }

    // ── brass: warm horns ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 >= 2) this.chords(b, f, 'hornpad', { ...LOWBRASS(0.3), attack: 0.9 }, 'horns', 50, 64, 3, 0.36 * v, 0.4);
      } else if (I <= 1) {
        if (f.i % 4 === 0) this.chords(b, f, 'hornsw', { ...LOWBRASS(0.45), attack: 1.4, release: 1.2 }, 'horns', 48, 62, 3, 0.46 * v, 0.3);
      } else {
        this.stabs(b, f, 'hst', 'brass', 'horns', 48, 62, 3, I >= 3 ? [0, 1.5, 2.5] : [0, 2.5], (I >= 3 ? 0.4 : 0.36) * v, 0.5);
        if (I >= 3) this.chords(b, f, 'horns', LOWBRASS(0.55), 'horns', 48, 62, 3, 0.42 * v, 0.3);
      }
    }

    // ── voices ──
    if (L.voices) {
      const v = L.voices;
      if (brk) this.chords(b, f, 'choir', 'choiroo', 'choir', 55, 67, 3, 0.15 * v, 0.6);
      else this.chords(b, f, 'choir', I >= 3 ? 'choir' : 'choiroo', 'choir', 55, I >= 3 ? 69 : 67, 3, (I >= 3 ? 0.18 : 0.17) * v, 0.5);
    }

    // ── low: the pizzicato bass line ──
    if (L.low) {
      const v = L.low;
      if (brk || I === 0) this.bassline(b, f, 'pizz', 'bass', [[0, 0, 2, 0.55 * v], [2, 2, 2, 0.45 * v]], 31);
      else if (I === 1) this.bassline(b, f, 'pizz', 'bass', [[0, 0, 1, 0.6 * v], [2, 2, 1, 0.52 * v], [3.5, 3, 0.4, 0.32 * v]], 31);
      else this.bassline(b, f, 'pizz', 'bass', [[0, 0, 0.9, 0.62 * v], [1, 2, 0.9, 0.5 * v], [2, 0, 0.9, 0.58 * v], [3, 2, 0.5, 0.48 * v], [3.5, 3, 0.4, 0.4 * v]], 31);
    }

    // ── harmony: counter-melody, doublings ──
    if (!brk && I >= 1 && L.h >= 2) this.counter(b, f, VIOLIN(0.45), 'vln', 71, 83, 0.3 + 0.05 * L.h, I >= 3 ? 2 : 4);
    if (!brk && I >= 3 && L.h >= 4 && L.brass) this.tune(b, f, LOWBRASS(0.7), 'horns', 0.55, { shift: -12, bars: [0, 4] });
    this.glory(b, f, L, I, 'harp');
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'kit' }, 'sub');
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'snare', 'kit', 3, 4, 4, 0.18, 0.4);
  }
}
