/**
 * The battle songs — "the walking orchestra": the turtle takes one step per beat, so every battle
 * groove is a majestic journey march whose deep drum on EVERY beat is its footstep (beat 1
 * strongest). During the ff build-up bar the turtle rears up (no steps); the drop is its stomp.
 * Every world keeps one pulse for the whole level and four intensity layers:
 *   0 calm     — pad + light percussion + bass, and now and then a melodic phrase (a variation of
 *                the leitmotif in the world's mode) — it stops the moment a wave starts
 *   1 wave     — the groove (drums) enters
 *   2 heavy    — fuller drums + an ostinato (strings / oud / harpsichord / low brass)
 *   3 climax   — everything: choir and brass, the biggest drums
 * The mid/high register stays mostly free during waves: the TOWERS play the melodies.
 * Harmony is a fixed form per bar (Form), so towers always know the chord.
 */
import { SONGS } from '../../../sim/defs';
import { Form, LEIT_A, LEIT_A_CHORDS, LEIT_A_MINOR, LEIT_A_MINOR_CHORDS, lineNotes, type BarInfo, type Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CELLO, CHOIR, DRONE, FLUTE, HORNLEAD, LOWBRASS, ORGAN, PAD, STRINGS, SUB, VIOLIN, GLASSHARM, type BufInst } from '../synth';
import { chordTones, type Chord, MODES, note, Scale } from '../theory';
import { pick } from '../util';
import { type Inst, Song } from './base';

interface Phrase {
  line: Line;
  tonic: number;
  inst: Inst;
  ch: string;
  vel: number;
  legato?: number;
  /** optional doubling an octave (or other) away */
  double?: { inst: Inst; ch: string; vel: number; shift: number };
}

export abstract class Battle extends Song {
  protected abstract readonly phrase: Phrase | null;

  /** the I0 phrase: 4 bars of the A section (first or second half by occurrence), only while calm */
  protected phraseNotes(b: BarCtx, f: BarInfo): void {
    const ph = this.phrase;
    if (!ph || f.sec !== 'A') return;
    const half = f.occ % 2 === 0 ? 0 : 4;
    if (f.i < half || f.i >= half + 4) return;
    for (let k = f.start + half; k <= b.bar; k++) if (b.p.intensityAt(k) !== 0 || b.p.dropIndex(k)) return;
    const bar = ph.line[f.i];
    if (!bar) return;
    const notes = lineNotes(this.key, ph.tonic, this.beats, [bar], { vel: 0.72 });
    this.notes(b, notes, ph.inst, ph.ch, ph.vel, ph.legato ?? 0.96);
    if (ph.double) {
      const d = ph.double;
      this.notes(b, lineNotes(this.key, ph.tonic, this.beats, [bar], { vel: 0.72, shift: d.shift }), d.inst, d.ch, d.vel, ph.legato ?? 0.96);
    }
  }

  /** Lend this song's arrangement to another player (the credits medley); call setup(p) first. */
  guest(b: BarCtx, f: BarInfo): void {
    this.arrange(b, f);
  }

  /** fill played on the last beat when the next bar is louder */
  protected fill(_b: BarCtx): void {}

  tail(b: BarCtx): void {
    if (b.build || b.drop) return;
    const nextI = b.p.intensityAt(b.bar + 1);
    if (nextI > b.I && !b.p.isBuild(b.bar + 1) && !b.p.dropIndex(b.bar + 1)) this.fill(b);
  }

  /** true when this bar starts a new, louder layer (crash-worthy) */
  protected rise(b: BarCtx): boolean {
    return !b.drop && b.I > b.Iprev && b.I >= 2;
  }

  /**
   * The turtle's footsteps: a deep drum on every beat (beat 1 accented, 3 a little), layered
   * per world. Silent in the ff build bar (it rears up); huge in the drop bars (the stomp).
   */
  protected steps(b: BarCtx, vel: number, layers: { inst: BufInst; ch: string; midi?: number; v?: number }[]): void {
    if (b.build) return;
    const big = b.drop ? 1.3 : 1;
    for (let beat = 0; beat < b.beats; beat++) {
      const acc = beat === 0 ? 1 : beat === 2 ? 0.88 : 0.78;
      for (const L of layers) b.p.hit(L.inst, L.ch, this.T(b, beat, 0.0015), Math.min(1.2, vel * acc * big * (L.v ?? 1)), (L.midi ?? 60) + (beat === 0 ? 0 : -0.15));
    }
  }

  /** extra weight during the two ff drop bars: sub octaves pumping, a crash on the second bar */
  protected dropExtras(b: BarCtx, f: BarInfo, crash: { ch: string } | null, sub: string): void {
    if (!b.drop) return;
    if (b.drop === 2 && crash) b.p.hit('crash', crash.ch, this.T(b, 0, 0.001), 0.5);
    for (let k = 0; k < 8; k++) {
      const c = this.cAt(f, k * 0.5);
      this.play(b, SUB(), sub, k * 0.5, this.tone(c, 28, k % 2 ? 3 : 0), k % 2 ? 0.42 : 0.6, 0.42 * b.spb, undefined, 0.001);
    }
  }
}

// ═════════════════════════════════════ MEADOW ═════════════════════════════════════

/** the leitmotif in G (bar 6 bends towards C) */
export const MEADOW_PHRASE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[5, 2], [4, 1], [2, 1]],
  [[3, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [6, 1]],
  [[7, 3], [null, 1]],
];

export class MeadowTheme extends Battle {
  readonly bpm: number = SONGS.meadow.bpm;
  readonly level: number = 0.72;
  readonly key = new Scale(note('G4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['choir', 53, 70], ['guitar', 43, 70], ['pizz', 31, 50], ['spicc', 45, 64], ['kick', 60, 60], ['brush', 60, 60], ['snare', 60, 60], ['hat', 60, 60], ['tamb', 60, 60], ['crash', 60, 60], ['tom', 40, 56], ['timp', 41, 53]];
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: ['G', 'D/F#', 'Em', 'C', 'G', 'C', ['Am7', 'D'], 'G'] },
      { name: 'B', bars: ['C', 'G/B', 'Am', 'Em', 'C', 'G', 'Am7', ['Dsus4', 'D']] },
      { name: 'C', bars: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am7', 'D'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  protected readonly phrase: Phrase = { line: MEADOW_PHRASE, tonic: note('G4'), inst: FLUTE(), ch: 'flute', vel: 0.85 };

  setup(p: Player): void {
    p.ch('pad', { gain: 0.42, wet: 0.36, filterLfoHz: 180, filterLfoRate: 0.06 });
    p.ch('guitar', { gain: 0.5, wet: 0.22, pan: -0.22 });
    p.ch('bass', { gain: 0.58, wet: 0.08 });
    p.ch('sub', { gain: 0.42, wet: 0.04 });
    p.ch('kit', { gain: 0.5, wet: 0.14 });
    p.ch('hat', { gain: 0.22, wet: 0.12, pan: 0.25 });
    p.ch('tamb', { gain: 0.22, wet: 0.15, pan: -0.3 });
    p.ch('fiddle', { gain: 0.36, wet: 0.26, pan: 0.18 });
    p.ch('horns', { gain: 0.42, wet: 0.4, pan: -0.1 });
    p.ch('choir', { gain: 0.36, wet: 0.48, vibratoCents: 5 });
    p.ch('flute', { gain: 0.45, wet: 0.38, vibratoCents: 13, vibratoRate: 5.3, pan: 0.15 });
    p.ch('timp', { gain: 0.5, wet: 0.3 });
  }

  private strum(b: BarCtx, f: BarInfo, beat: number, up: boolean, vel: number): void {
    const tones = chordTones(this.cAt(f, beat), 50, 67).slice(0, up ? 4 : 6);
    const order = up ? [...tones].reverse() : tones;
    order.forEach((m, k) => this.play(b, 'guitar', 'guitar', beat + k * 0.018 / b.spb, m, vel * (1 - k * 0.05), 1.2 * b.spb, undefined, 0.002));
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    this.chords(b, f, 'pad', PAD(I >= 2 ? 1500 : 1100), 'pad', 50, 66, 3, I === 0 ? 0.58 : 0.4, 0.3);

    // guitar: fingerpicked at rest, strummed on the march
    if (I === 0) this.ostinato(b, f, 'guitar', 'guitar', 47, 64, [0, 2, 1, 3, 0, 2, 1, 3], 0.4, 1.2, [0, 4], 0.1);
    else {
      const pat = I === 1 ? 'D.DU.UDU' : 'D.DUDUDU';
      for (let k = 0; k < 8; k++) if (pat[k] !== '.') this.strum(b, f, k * 0.5, pat[k] === 'U', pat[k] === 'U' ? 0.24 : k % 4 === 0 ? 0.4 : 0.32);
    }

    // bass
    if (I === 0) this.bassline(b, f, 'pizz', 'bass', [[0, 0, 2, 0.55], [2, 2, 2, 0.45]], 31);
    else if (I === 1) this.bassline(b, f, 'pizz', 'bass', [[0, 0, 1, 0.6], [2, 2, 1, 0.52], [3.5, 3, 0.4, 0.32]], 31);
    else this.bassline(b, f, 'pizz', 'bass', [[0, 0, 0.9, 0.62], [1, 2, 0.9, 0.5], [2, 0, 0.9, 0.58], [3, 2, 0.5, 0.48], [3.5, 3, 0.4, 0.4]], 31);
    if (I >= 1) this.play(b, SUB(), 'sub', 0, this.root(f, 0, 31), 0.45, b.beats * b.spb * 0.95);

    // the footsteps (folk bass drum, a taiko under it once the march is on)
    const sv = [0.32, 0.52, 0.6, 0.68][I];
    this.steps(b, sv, I === 0 ? [{ inst: 'kick', ch: 'kit' }] : [{ inst: 'kick', ch: 'kit' }, { inst: 'taiko', ch: 'kit', midi: 34, v: 0.25 + 0.1 * I }]);
    if (I === 0) this.drum(b, 'brush', 'kit', '....o.......o...', 0.55);
    else if (I === 1) {
      this.drum(b, 'brush', 'kit', '....x......ox..o', 0.6);
      this.drum(b, 'hat', 'hat', 'x.o.x.o.x.o.x.o.', 0.45);
    } else if (I === 2) {
      this.drum(b, 'snare', 'kit', 'o...x..o....x.oo', 0.42);
      this.drum(b, 'hat', 'hat', 'xoxoxoxoxoxoxoxo', 0.42);
      this.drum(b, 'tamb', 'tamb', '....x.......x...', 0.45);
    } else {
      this.drum(b, 'snare', 'kit', 'o...X..o....X.oo', 0.46);
      this.drum(b, 'hat', 'hat', 'xoxoxoxoxoxoxoxo', 0.42);
      this.drum(b, 'tamb', 'tamb', 'x.x.x.x.x.x.x.x.', 0.38);
      this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.5, 3, undefined, 0.002);
      if (f.i % 4 === 3 && !b.drop) [52, 48, 45, 41].forEach((m, k) => b.p.hit('tom', 'kit', this.T(b, 3 + k * 0.25, 0.002), 0.5 + k * 0.06, m));
    }
    if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), I === 3 ? 0.32 : 0.28);

    // ostinato & climax
    if (I >= 2) this.ostinato(b, f, 'spicc', 'fiddle', 48, 62, [0, 2, 1, 2, 0, 2, 1, 2], 0.42, 0.42, [0, 3, 6]);
    if (I >= 3) {
      this.chords(b, f, 'horns', LOWBRASS(0.55), 'horns', 48, 62, 3, 0.55, 0.3);
      this.chords(b, f, 'choir', 'choir', 'choir', 55, 67, 3, 0.19, 0.5);
    }
    this.dropExtras(b, f, { ch: 'kit' }, 'sub');
    this.phraseNotes(b, f);
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'snare', 'kit', 3, 4, 4, 0.18, 0.4);
  }
}

// ═════════════════════════════════════ DESERT ═════════════════════════════════════

/** the leitmotif in D hijaz, with the characteristic augmented second */
export const DESERT_PHRASE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [1, 0.5], [2, 1], [0, 1]],
  [[1, 1], [3, 1.5], [5, 0.5], [3, 1]],
  [[2, 1], [1, 0.5], [0, 2.5]],
  [[6, 1], [4, 1.5], [3, 0.5], [1, 1]],
  [[5, 1.5], [4, 0.5], [3, 2]],
  [[5, 1], [3, 1], [1, 1], [3, 1]],
  [[2, 1.5], [1, 0.5], [0, 2]],
];

export class DesertTheme extends Battle {
  readonly bpm: number = SONGS.desert.bpm;
  readonly level: number = 0.9;
  readonly key = new Scale(note('D4'), MODES.phrygianDominant);
  readonly warm: [BufInst, number, number][] = [['choir', 55, 70], ['oud', 45, 70], ['dum', 60, 60], ['tek', 60, 60], ['tamb', 60, 60], ['clap', 60, 60], ['taiko', 30, 36], ['spicc', 50, 70], ['crash', 60, 60]];
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: ['D', 'D', 'Eb', 'D', 'Cm', 'Gm', 'Eb', 'D'] },
      { name: 'B', bars: ['Gm', 'Cm', 'D', 'D', 'Gm', 'Eb', ['Cm', 'Eb'], 'D'] },
      { name: 'C', bars: ['Eb', 'D', 'Eb', 'D', 'Cm', 'Cm', 'Eb', 'D'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  protected readonly phrase: Phrase = { line: DESERT_PHRASE, tonic: note('D5'), inst: FLUTE(true), ch: 'ney', vel: 0.8 };

  setup(p: Player): void {
    p.ch('drone', { gain: 0.42, wet: 0.3, filterLfoHz: 140, filterLfoRate: 0.09 });
    p.ch('strings', { gain: 0.36, wet: 0.36, vibratoCents: 9 });
    p.ch('oud', { gain: 0.5, wet: 0.22, pan: -0.18 });
    p.ch('darb', { gain: 0.55, wet: 0.16, pan: 0.12 });
    p.ch('riq', { gain: 0.2, wet: 0.14, pan: 0.3 });
    p.ch('clap', { gain: 0.24, wet: 0.24, pan: -0.25 });
    p.ch('davul', { gain: 0.5, wet: 0.2 });
    p.ch('bass', { gain: 0.45, wet: 0.05 });
    p.ch('spicc', { gain: 0.34, wet: 0.26, pan: 0.2 });
    p.ch('choir', { gain: 0.32, wet: 0.48, vibratoCents: 7 });
    p.ch('ney', { gain: 0.45, wet: 0.4, pan: 0.12, vibratoCents: 18, vibratoRate: 5.8 });
  }

  /** a modal figure from the chord root along the hijaz scale */
  private figure(f: BarInfo, beat: number, lo: number, degs: number[], k: number): number {
    const c = this.cAt(f, beat);
    let r = lo;
    while ((r - c.root + 120) % 12 !== 0) r++;
    const d0 = this.key.degreeOf(r);
    return this.key.deg(d0 + degs[k % degs.length]);
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    if (f.i % 4 === 0) {
      this.play(b, DRONE(520), 'drone', 0, note('D2'), 0.8, 4.2 * b.beats * b.spb);
      this.play(b, DRONE(520), 'drone', 0.05, note('A2'), 0.5, 4.2 * b.beats * b.spb);
    }
    this.chords(b, f, 'str', STRINGS(0.25), 'strings', 50, 64, 2, I === 0 ? 0.42 : 0.36, 0.4);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 33), 0.45, (I >= 1 ? 1.5 : 4) * b.spb);
    if (I >= 1) this.play(b, SUB(), 'bass', 2, this.root(f, 2, 33), 0.38, 1.5 * b.spb);

    // the footsteps: darbuka dum, the davul joins when the caravan marches
    const sv = [0.42, 0.62, 0.68, 0.76][I];
    this.steps(b, sv, I === 0 ? [{ inst: 'dum', ch: 'darb' }] : [{ inst: 'dum', ch: 'darb' }, { inst: 'taiko', ch: 'davul', midi: 33, v: 0.2 + 0.12 * I }]);
    if (I === 0) {
      if (f.i % 2 === 1) this.drum(b, 'tamb', 'riq', '..............x.', 0.5);
      if (f.i % 2 === 0) this.play(b, 'oud', 'oud', 0, this.root(f, 0, 50), 0.4, 2 * b.spb);
    } else {
      // maqsum teks over the steps
      this.drum(b, 'tek', 'darb', I >= 2 ? '..x.o.x.o.o.x.oo' : '..x...x.....x...', 0.5);
      const degs = [0, 1, 2, 1, 0, -1, 0, 1];
      for (let k = 0; k < 8; k++) this.play(b, 'oud', 'oud', k * 0.5, this.figure(f, k * 0.5, 50, degs, k), k % 4 === 0 ? 0.48 : 0.34, 0.6 * b.spb, undefined, 0.003);
    }
    if (I >= 2) {
      this.drum(b, 'tamb', 'riq', 'xoxoxoxoxoxoxoxo', 0.42);
      this.drum(b, 'clap', 'clap', '....x.......x...', 0.5);
      if (f.i % 2 === 1) for (let k = 0; k < 4; k++) b.p.hit('tek', 'darb', this.T(b, 3 + k * 0.25, 0.002), 0.3 + k * 0.08);
    }
    if (I >= 3) {
      const degs = [0, 2, 1, 2, 3, 2, 1, 0];
      for (let k = 0; k < 8; k++) this.play(b, 'spicc', 'spicc', k * 0.5, this.figure(f, k * 0.5, 57, degs, k), k % 2 ? 0.34 : 0.44, 0.45 * b.spb, undefined, 0.003);
      this.chords(b, f, 'choir', 'choir', 'choir', 57, 69, 3, 0.18, 0.5);
      if (f.i % 4 === 0 && !b.drop) b.p.hit('crash', 'clap', this.T(b, 0, 0.001), 0.25);
    }
    if (this.rise(b)) b.p.hit('crash', 'clap', this.T(b, 0, 0.001), 0.25);
    this.dropExtras(b, f, { ch: 'clap' }, 'bass');
    this.phraseNotes(b, f);
  }

  protected fill(b: BarCtx): void {
    for (let k = 0; k < 4; k++) b.p.hit('tek', 'darb', this.T(b, 3 + k * 0.25, 0.002), 0.3 + k * 0.1);
  }
}

// ═════════════════════════════════════ ICE ═════════════════════════════════════

/** the leitmotif in E minor, its second bar touching the lydian #11 */
export const ICE_PHRASE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[4, 2], [3, 1], [1, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [3, 1]],
  [[4, 2], [null, 2]],
];

export class IceTheme extends Battle {
  readonly bpm: number = SONGS.ice.bpm;
  readonly level: number = 0.85;
  readonly reverb = 'spire' as const;
  readonly key = new Scale(note('E4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['choiroo', 53, 70], ['celesta', 72, 96], ['glass', 76, 96], ['tick', 60, 60], ['kick', 60, 60], ['snare', 60, 60], ['harp', 45, 66], ['timp', 39, 52], ['ohat', 60, 60], ['crash', 60, 60], ['tom', 40, 56]];
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: ['Em9', 'Cmaj7', 'G', 'D', 'Em9', 'Cmaj7', 'Am7', ['Bsus4', 'B']] },
      { name: 'B', bars: ['Cmaj7#11', 'D/C', 'Bm7', 'Em7', 'Cmaj7#11', 'D/C', 'G/B', ['Bsus4', 'B']] },
      { name: 'C', bars: ['Am7', 'Em9', 'Cmaj7', 'G', 'Am7', 'Em9', 'Cmaj7#11', 'D'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  protected readonly phrase: Phrase = {
    line: ICE_PHRASE, tonic: note('E5'), inst: 'celesta', ch: 'celesta', vel: 0.52, legato: 1.3,
    double: { inst: 'glass', ch: 'glass', vel: 0.22, shift: 7 },
  };

  setup(p: Player): void {
    p.ch('pad', { gain: 0.42, wet: 0.5, filterLfoHz: 320, filterLfoRate: 0.05 });
    p.ch('shimmer', { gain: 0.22, wet: 0.65, tremolo: 0.1, tremoloRate: 3.1 });
    p.ch('celesta', { gain: 0.42, wet: 0.5, pan: 0.15 });
    p.ch('glass', { gain: 0.3, wet: 0.6, pan: -0.25 });
    p.ch('bass', { gain: 0.48, wet: 0.06 });
    p.ch('ticks', { gain: 0.24, wet: 0.2, pan: 0.28 });
    p.ch('kit', { gain: 0.5, wet: 0.22 });
    p.ch('snare', { gain: 0.4, wet: 0.55 });
    p.ch('harp', { gain: 0.36, wet: 0.4, pan: -0.2 });
    p.ch('choir', { gain: 0.28, wet: 0.6, vibratoCents: 5 });
    p.ch('timp', { gain: 0.42, wet: 0.38 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    this.chords(b, f, 'pad', PAD(I >= 2 ? 1300 : 950), 'pad', 52, 71, 4, I === 0 ? 0.38 : 0.45, 0.6);
    if (I === 0 && f.i % 2 === 0) this.chords(b, f, 'sh', GLASSHARM(), 'shimmer', 76, 88, 2, 0.22, 1.2);
    // bass
    if (I <= 1) this.play(b, SUB(), 'bass', 0, this.root(f, 0, 28), 0.5, (I === 0 ? 4 : 2.5) * b.spb);
    if (I === 1) this.play(b, SUB(), 'bass', 2.5, this.root(f, 2.5, 28), 0.4, 1.5 * b.spb);
    if (I >= 2) this.bassline(b, f, SUB(), 'bass', [[0, 0, 0.8, 0.52], [0.75, 0, 0.5, 0.34], [1.5, 0, 0.9, 0.44], [2.5, 0, 0.8, 0.46], [3.5, 3, 0.4, 0.3]], 28);

    // footsteps in the snow: a deep, soft drum (a taiko beneath from intensity 2)
    const sv = [0.3, 0.46, 0.54, 0.62][I];
    this.steps(b, sv, I < 2 ? [{ inst: 'kick', ch: 'kit', midi: 55 }] : [{ inst: 'kick', ch: 'kit', midi: 55 }, { inst: 'taiko', ch: 'kit', midi: 35, v: 0.3 + 0.1 * I }]);
    this.drum(b, 'tick', 'ticks', I === 0 ? 'x.o.x.o.x.o.x.o.' : 'xoxoxoxoxoxoxoxo', I === 0 ? 0.35 : 0.42, 72, 0.002);
    if (I === 1) this.drum(b, 'snare', 'snare', '........x.......', 0.42);
    else if (I >= 2) {
      this.drum(b, 'snare', 'snare', I >= 3 ? '....x......ox..o' : '....x.......x...', 0.46);
      this.ostinato(b, f, 'harp', 'harp', 45, 64, [0, 1, 2, 3, 4, 3, 2, 1], 0.34, 1.0, [0, 4]);
      if (f.i % 2 === 0) this.play(b, 'glass', 'glass', 0, pick(chordTones(f.chord, 79, 91)), 0.3, 3);
    }
    if (I >= 3) {
      this.chords(b, f, 'choir', 'choiroo', 'choir', 55, 69, 3, 0.29, 0.6);
      this.play(b, 'timp', 'timp', 0, this.root(f, 0, 40), 0.4, 3, undefined, 0.002);
      this.play(b, 'timp', 'timp', 2, this.root(f, 2, 40), 0.3, 3, undefined, 0.002);
      b.p.hit('ohat', 'kit', this.T(b, 3.5, 0.002), 0.25);
      if (f.i % 4 === 3 && !b.drop) [50, 47, 44, 40].forEach((m, k) => b.p.hit('tom', 'kit', this.T(b, 3 + k * 0.25, 0.002), 0.45 + k * 0.05, m));
    }
    if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.26);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
    this.phraseNotes(b, f);
  }

  protected fill(b: BarCtx): void {
    for (let k = 0; k < 8; k++) b.p.hit('tick', 'ticks', this.T(b, 3 + k * 0.125, 0.001), 0.25 + k * 0.05, 74 + k);
  }
}

// ═════════════════════════════════════ FORGE ═════════════════════════════════════

/** the leitmotif in C minor on a dark horn (ends on the leading tone over G) */
export const FORGE_PHRASE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[5, 2], [4, 1], [2, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[4, 1.5], [3, 0.5], [2, 1], [1, 1]],
  [[-0.5, 2], [null, 2]],
];

export class ForgeTheme extends Battle {
  readonly bpm: number = SONGS.forge.bpm;
  readonly level: number = 0.8;
  readonly reverb = 'cave' as const;
  readonly key = new Scale(note('C4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['choir', 53, 70], ['taiko', 28, 48], ['rim', 60, 60], ['anvil', 72, 92], ['brass', 36, 62], ['spicc', 45, 64], ['crash', 60, 60], ['tom', 40, 56]];
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Fm', 'G', 'G'] },
      { name: 'B', bars: ['Ab', 'Bb', 'Cm', 'Cm', 'Fm', 'Ab', ['G', 'G7'], 'G'] },
      { name: 'C', bars: ['Fm', 'Cm', 'Ab', 'Bb', 'Fm', 'Cm', 'Db', 'G'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  protected readonly phrase: Phrase = {
    line: FORGE_PHRASE, tonic: note('C4'), inst: HORNLEAD(0.35), ch: 'horn', vel: 0.9,
    double: { inst: CELLO(), ch: 'cello', vel: 0.6, shift: -7 },
  };

  setup(p: Player): void {
    p.ch('drone', { gain: 0.42, wet: 0.24, filterLfoHz: 110, filterLfoRate: 0.04 });
    p.ch('lowstr', { gain: 0.4, wet: 0.3, vibratoCents: 6 });
    p.ch('odaiko', { gain: 0.3, wet: 0.2 });
    p.ch('taiko', { gain: 0.32, wet: 0.18, pan: -0.15 });
    p.ch('shime', { gain: 0.22, wet: 0.14, pan: 0.28 });
    p.ch('anvil', { gain: 0.16, wet: 0.35, pan: 0.32 });
    p.ch('brass', { gain: 0.32, wet: 0.22, pan: -0.05 });
    p.ch('bass', { gain: 0.42, wet: 0.04 });
    p.ch('spicc', { gain: 0.32, wet: 0.22, pan: 0.18 });
    p.ch('horns', { gain: 0.4, wet: 0.36, pan: 0.1 });
    p.ch('choir', { gain: 0.34, wet: 0.45, vibratoCents: 6 });
    p.ch('horn', { gain: 0.5, wet: 0.36, vibratoCents: 4, pan: -0.08 });
    p.ch('cello', { gain: 0.4, wet: 0.3, vibratoCents: 9, pan: 0.08 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    if (f.i % 4 === 0) {
      this.play(b, DRONE(380), 'drone', 0, note('C2'), 0.8, 4.2 * b.beats * b.spb);
      this.play(b, DRONE(380), 'drone', 0.05, note('G2'), 0.5, 4.2 * b.beats * b.spb);
    }
    this.chords(b, f, 'ls', STRINGS(0.2), 'lowstr', 45, 60, 3, I === 0 ? 0.5 : 0.42, 0.4);
    if (I >= 1) this.bassline(b, f, SUB(), 'bass', [[0, 0, 1.4, 0.55], [1.5, 0, 0.4, 0.3], [2, 0, 1.8, 0.5]], 31);
    else this.play(b, SUB(), 'bass', 0, this.root(f, 0, 31), 0.42, 4 * b.spb);

    // the footsteps are the great odaiko itself
    const sv = [0.4, 0.62, 0.7, 0.8][I];
    this.steps(b, sv, I < 3 ? [{ inst: 'taiko', ch: 'odaiko', midi: 31 }] : [{ inst: 'taiko', ch: 'odaiko', midi: 31 }, { inst: 'kick', ch: 'odaiko', v: 0.35 }]);
    const anvil = (pat: string, v: number) => this.drum(b, 'anvil', 'anvil', pat, v, this.tone(this.cAt(f, 1), 76, 0) + (Math.random() < 0.5 ? 0 : 7), 0.002);
    if (I === 0) {
      if (f.i % 2 === 1) anvil('........x.......', 0.3);
    } else {
      // hammer blows between the steps
      this.drum(b, 'taiko', 'taiko', I >= 2 ? '..x..x.x..x..xxx' : '..x...x...x...x.', 0.46, 41);
      anvil(I >= 2 ? '....x.......x..x' : '....x.......x...', I >= 3 ? 0.48 : 0.38);
      const c0 = this.cAt(f, 0);
      if (I === 1) for (const m of [this.tone(c0, 36, 0), this.tone(c0, 36, 2)]) this.play(b, 'brass', 'brass', 0, m, 0.5, 0.8 * b.spb, undefined, 0.002);
    }
    if (I >= 2) {
      this.drum(b, 'rim', 'shime', 'xoxoxoxoxoxoxoxo', 0.4);
      const rh = [0, 1, 1.5, 2.5, 3, 3.5];
      const which = [0, 0, 1, 0, 2, 0];
      rh.forEach((beat, k) => {
        const c = this.cAt(f, beat);
        this.play(b, 'brass', 'brass', beat, this.tone(c, 36, which[k]), k === 0 ? 0.6 : 0.44, 0.45 * b.spb, undefined, 0.002);
      });
      this.ostinato(b, f, 'spicc', 'spicc', 48, 60, [0, 1, 2, 1, 0, 1, 2, 1], 0.4, 0.4, [0, 4]);
    }
    if (I >= 3) {
      this.chords(b, f, 'choir', 'choir', 'choir', 55, 69, 3, 0.2, 0.5);
      this.chords(b, f, 'horns', LOWBRASS(0.5), 'horns', 48, 62, 3, 0.55, 0.3);
      if (f.i % 4 === 3 && !b.drop) this.roll(b, 'tom', 'taiko', 3, 4, 6, 0.35, 0.7, 45);
    }
    if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'odaiko', this.T(b, 0, 0.001), 0.3);
    this.dropExtras(b, f, { ch: 'odaiko' }, 'bass');
    this.phraseNotes(b, f);
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'taiko', 'taiko', 3, 4, 4, 0.35, 0.6, 43);
  }
}

// ═════════════════════════════════════ CITADEL ═════════════════════════════════════

/** the leitmotif in D dorian on the organ, rising to the leading tone of the dominant */
export const CITADEL_PHRASE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[8, 2], [7, 1], [6, 1]],
  [[5, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [4, 0.5], [6, 2]],
  [[7, 1.5], [8, 0.5], [7, 1], [5, 1]],
  [[6.5, 3], [null, 1]],
];

export class CitadelTheme extends Battle {
  readonly bpm: number = SONGS.citadel.bpm;
  readonly level: number = 0.66;
  readonly reverb = 'cave' as const;
  readonly key = new Scale(note('D4'), MODES.dorian);
  readonly warm: [BufInst, number, number][] = [['choir', 55, 72], ['choiroo', 53, 68], ['tick', 60, 60], ['tbell', 48, 64], ['tom', 40, 56], ['kick', 60, 60], ['snare', 60, 60], ['harpsi', 50, 66], ['timp', 39, 52], ['taiko', 30, 36], ['crash', 60, 60]];
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: ['Dm', 'Dm', 'C', 'G', 'Dm', 'F', 'G', 'A'] },
      { name: 'B', bars: ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A', 'A'] },
      { name: 'C', bars: ['Gm', 'Dm', 'Bb', 'F', 'Gm', 'Dm', 'E7', 'A'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  protected readonly phrase: Phrase = {
    line: CITADEL_PHRASE, tonic: note('D4'), inst: ORGAN(0.85), ch: 'organlead', vel: 0.85,
    double: { inst: CHOIR('oo'), ch: 'choirlead', vel: 0.45, shift: -7 },
  };

  setup(p: Player): void {
    p.ch('organ', { gain: 0.36, wet: 0.45, pan: -0.05 });
    p.ch('organlead', { gain: 0.4, wet: 0.5, pan: 0.1, vibratoCents: 3, vibratoRate: 6 });
    p.ch('choirlead', { gain: 0.32, wet: 0.55, vibratoCents: 6 });
    p.ch('choir', { gain: 0.36, wet: 0.55, vibratoCents: 6, vibratoRate: 4.6 });
    p.ch('ticks', { gain: 0.24, wet: 0.3, pan: 0.3 });
    p.ch('bells', { gain: 0.3, wet: 0.6, pan: -0.2 });
    p.ch('kit', { gain: 0.5, wet: 0.24 });
    p.ch('harpsi', { gain: 0.26, wet: 0.36, pan: 0.22 });
    p.ch('timp', { gain: 0.5, wet: 0.35 });
    p.ch('horns', { gain: 0.4, wet: 0.42 });
    p.ch('bass', { gain: 0.45, wet: 0.05 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    // organ: pedal and chords
    if (f.i % 2 === 0) this.play(b, ORGAN(0.2), 'organ', 0, this.root(f, 0, 38), 0.55, 2 * b.beats * b.spb);
    this.chords(b, f, 'org', ORGAN(0.3), 'organ', 50, 64, 3, I === 0 ? 0.5 : 0.42, 0.25);
    if (I <= 2) this.chords(b, f, 'ch', I === 0 ? CHOIR('mm') : 'choiroo', 'choir', 55, 67, 3, I === 0 ? 0.36 : 0.29, 0.6);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 26), 0.42, (I >= 1 ? 2 : 4) * b.spb);
    if (I >= 1) this.play(b, SUB(), 'bass', 2, this.root(f, 2, 26), 0.36, 2 * b.spb);

    // clockwork: tick-tock
    const tk = I === 0 ? 'x.x.x.x.x.x.x.x.' : 'xoxoxoxoxoxoxoxo';
    for (let i = 0; i < 16; i++) {
      if (tk[i] === '.') continue;
      b.p.hit('tick', 'ticks', this.T(b, i * 0.25, 0.001), (tk[i] === 'x' ? 0.42 : 0.2) * this.vmul, i % 4 === 0 ? 64 : i % 2 === 0 ? 57 : 60);
    }
    if (f.i % 4 === 0) this.play(b, 'tbell', 'bells', 0, note('D3') + 12, 0.36, 6);

    // footsteps on marble: low tom, then kick, then the great drum
    const sv = [0.26, 0.48, 0.58, 0.66][I];
    const L: { inst: BufInst; ch: string; midi?: number; v?: number }[] = I === 0 ? [{ inst: 'tom', ch: 'kit', midi: 43 }] : [{ inst: 'kick', ch: 'kit' }, { inst: 'tom', ch: 'kit', midi: 43, v: 0.6 }];
    if (I >= 3) L.push({ inst: 'taiko', ch: 'kit', midi: 33, v: 0.7 });
    this.steps(b, sv, L);
    if (I >= 2) {
      this.drum(b, 'snare', 'kit', I >= 3 ? '....x......ox..o' : '....x.......x...', 0.45);
      this.play(b, 'timp', 'timp', 0, this.root(f, 0, 38), 0.45, 3, undefined, 0.002);
      this.ostinato(b, f, 'harpsi', 'harpsi', 50, 66, [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 1, 2, 3], 0.34, 0.3, [0, 8]);
    }
    if (I >= 3) {
      this.chords(b, f, 'cha', 'choir', 'choir', 57, 72, 4, 0.23, 0.4);
      this.chords(b, f, 'hn', LOWBRASS(0.5), 'horns', 48, 62, 3, 0.55, 0.3);
      if (f.i % 2 === 0) this.play(b, 'tbell', 'bells', 0, this.root(f, 0, 50), 0.32, 5);
    }
    if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.26);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
    this.phraseNotes(b, f);
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'timp', 'timp', 3, 4, 6, 0.2, 0.5, note('A2'));
  }
}

// ═════════════════════════════════════ BOSS ═════════════════════════════════════

export const BOSS_PHRASE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [4, 1]],
  [[5, 2], [4, 1], [2, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[1, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [3, 1]],
  [[4, 2], [6.5, 1], [4, 1]],
];

export class BossTheme extends Battle {
  readonly bpm: number = SONGS.boss.bpm;
  readonly level: number = 0.74;
  readonly key = new Scale(note('A3'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['choir', 55, 72], ['spicc', 43, 64], ['brass', 45, 64], ['kick', 60, 60], ['snare', 60, 60], ['hat', 60, 60], ['taiko', 30, 36], ['timp', 39, 52], ['crash', 60, 60], ['tom', 40, 56]];
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'Dm', 'E'] },
      { name: 'B', bars: ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'] },
      { name: 'C', bars: ['Dm', 'Am', 'F', 'E', 'Dm', 'Am', 'Bb', 'E'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  protected readonly phrase: Phrase = { line: BOSS_PHRASE, tonic: note('A3'), inst: CELLO(), ch: 'cello', vel: 0.95, double: { inst: HORNLEAD(0.3), ch: 'horn', vel: 0.5, shift: 0 } };

  setup(p: Player): void {
    p.ch('lowstr', { gain: 0.42, wet: 0.32, vibratoCents: 7 });
    p.ch('spicc', { gain: 0.36, wet: 0.22, pan: 0.15 });
    p.ch('brass', { gain: 0.4, wet: 0.24, pan: -0.12 });
    p.ch('bass', { gain: 0.5, wet: 0.04 });
    p.ch('kit', { gain: 0.5, wet: 0.16 });
    p.ch('hat', { gain: 0.2, wet: 0.12, pan: 0.28 });
    p.ch('taiko', { gain: 0.55, wet: 0.22 });
    p.ch('timp', { gain: 0.5, wet: 0.32 });
    p.ch('choir', { gain: 0.36, wet: 0.48, vibratoCents: 6 });
    p.ch('cello', { gain: 0.48, wet: 0.32, vibratoCents: 10, vibratoRate: 5.2, pan: -0.06 });
    p.ch('horn', { gain: 0.36, wet: 0.36, vibratoCents: 4, pan: 0.1 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    this.chords(b, f, 'ls', STRINGS(0.3), 'lowstr', 45, 62, 3, I === 0 ? 0.62 : 0.4, 0.35);
    // pulsing bass: eighths
    for (let k = 0; k < 8; k++) {
      const c = this.cAt(f, k * 0.5);
      const m = this.tone(c, 28, I >= 2 && k % 4 === 3 ? 3 : 0);
      this.play(b, SUB(), 'bass', k * 0.5, m, (k % 2 ? 0.3 : 0.42) * (I === 0 ? 0.8 : 1), 0.4 * b.spb, undefined, 0.001);
    }
    // heavy footsteps (the taiko joins at the climax)
    const sv = [0.44, 0.62, 0.66, 0.72][I];
    this.steps(b, sv, I < 3 ? [{ inst: 'kick', ch: 'kit' }] : [{ inst: 'kick', ch: 'kit' }, { inst: 'taiko', ch: 'taiko', midi: 33, v: 0.6 }]);
    if (I === 0) this.drum(b, 'hat', 'hat', 'x.x.x.x.x.x.x.x.', 0.3);
    else {
      this.drum(b, 'snare', 'kit', I === 1 ? '....x.......x...' : '....x..x....x.ox', 0.5);
      this.drum(b, 'hat', 'hat', I === 1 ? 'x.x.x.x.x.x.x.x.' : 'xoxoxoxoxoxoxoxo', 0.4);
      this.ostinato(b, f, 'spicc', 'spicc', 45, 60, [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 1, 0, 1], I === 1 ? 0.32 : 0.4, 0.3, [0, 4, 8, 12]);
    }
    if (I >= 2) {
      for (const beat of [0, 2.5]) {
        const c = this.cAt(f, beat);
        for (const m of [this.tone(c, 45, 0), this.tone(c, 45, 2), this.tone(c, 45, 3)]) this.play(b, 'brass', 'brass', beat, m, beat === 0 ? 0.55 : 0.45, 0.55 * b.spb, undefined, 0.002);
      }
      if (f.i % 4 === 3 && !b.drop) [52, 48, 45, 41].forEach((m, k) => b.p.hit('tom', 'kit', this.T(b, 3 + k * 0.25, 0.002), 0.5 + k * 0.06, m));
    }
    if (I >= 3) {
      this.chords(b, f, 'choir', 'choir', 'choir', 57, 72, 4, 0.185, 0.4);
      if (f.i % 2 === 1 && !b.drop) this.roll(b, 'timp', 'timp', 3, 4, 8, 0.2, 0.5, this.root(f, 3, 40));
    }
    if (this.rise(b) || (I === 3 && f.i % 2 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.3);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
    this.phraseNotes(b, f);
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'snare', 'kit', 3, 4, 6, 0.2, 0.5);
  }
}

// ═════════════════════════════════════ FINALE ═════════════════════════════════════

/**
 * The finale: the leitmotif in F minor — choir and full orchestra. At intensity 3 it turns to
 * F MAJOR at the next 4-bar phrase (harmony = f(bar, intensity log), still deterministic: the mode
 * of a bar depends only on the intensity of the bar before its phrase, which is final by then).
 */
export class FinaleTheme extends Battle {
  readonly bpm: number = SONGS.finale.bpm;
  readonly level: number = 0.62;
  readonly reverb = 'spire' as const;
  readonly key = new Scale(note('F4'), MODES.aeolian);
  private readonly major = new Scale(note('F4'), MODES.major);
  readonly warm: [BufInst, number, number][] = [['spicc', 45, 64], ['brass', 41, 65], ['snare', 60, 60], ['taiko', 30, 36], ['timp', 39, 53], ['crash', 60, 60], ['tbell', 52, 68], ['harp', 53, 89], ['choir', 53, 72]];
  protected readonly phrase: Phrase | null = null;
  protected readonly form: Form = new Form(
    [
      { name: 'A', bars: LEIT_A_MINOR_CHORDS },
      { name: 'B', bars: ['Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'C', 'C'] },
      { name: 'C', bars: ['Bbm', 'Fm', 'Db', 'C', 'Bbm', 'Fm', 'Gb', 'C'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );
  private readonly formMajor: Form = new Form(
    [
      { name: 'A', bars: LEIT_A_CHORDS },
      { name: 'B', bars: ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'Gm7', 'C'] },
      { name: 'C', bars: ['Gm7', 'F', 'Bb', 'C', 'Gm7', 'F/A', 'Bb', 'C'] },
    ],
    [],
    ['A', 'B', 'A', 'C'],
  );

  /** major from the first 4-bar phrase that starts after intensity 3 began */
  isMajor(bar: number, p: Player): boolean {
    const q = bar - (((bar % 4) + 4) % 4);
    return q > 0 && p.intensityAt(q - 1) >= 3;
  }

  chordAt(bar: number, beat: number, p: Player): Chord {
    const form = this.isMajor(bar, p) ? this.formMajor : this.form;
    const f = form.at(bar);
    const k = f.chords.length;
    return f.chords[Math.min(k - 1, Math.floor((beat / this.beats) * k + 1e-9))];
  }

  compose(b: BarCtx): void {
    // swap the harmony of this bar for the major form when it has turned
    const maj = this.isMajor(b.bar, b.p);
    const f = (maj ? this.formMajor : this.form).at(b.bar);
    this.arrangeMode(b, f, maj);
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    this.arrangeMode(b, f, false);
  }

  setup(p: Player): void {
    p.ch('strings', { gain: 0.45, wet: 0.42, vibratoCents: 8 });
    p.ch('spicc', { gain: 0.34, wet: 0.26, pan: 0.15 });
    p.ch('brass', { gain: 0.38, wet: 0.3, pan: -0.1 });
    p.ch('horn', { gain: 0.55, wet: 0.42, vibratoCents: 5, pan: -0.05 });
    p.ch('horn2', { gain: 0.4, wet: 0.42, vibratoCents: 4, pan: -0.2 });
    p.ch('violins', { gain: 0.48, wet: 0.45, vibratoCents: 11, vibratoRate: 5.4, pan: 0.18 });
    p.ch('cello', { gain: 0.45, wet: 0.36, vibratoCents: 9, pan: 0.05 });
    p.ch('choir', { gain: 0.4, wet: 0.55, vibratoCents: 6 });
    p.ch('kit', { gain: 0.48, wet: 0.2 });
    p.ch('taiko', { gain: 0.55, wet: 0.24 });
    p.ch('timp', { gain: 0.52, wet: 0.34 });
    p.ch('bells', { gain: 0.26, wet: 0.6, pan: 0.25 });
    p.ch('harp', { gain: 0.32, wet: 0.45, pan: -0.28 });
    p.ch('bass', { gain: 0.48, wet: 0.05 });
  }

  private melodyBar(f: BarInfo, maj: boolean): { line: Line; scale: Scale } | null {
    if (f.sec !== 'A') return null;
    return { line: maj ? LEIT_A : LEIT_A_MINOR, scale: maj ? this.major : this.key };
  }

  private arrangeMode(b: BarCtx, f: BarInfo, maj: boolean): void {
    const I = this.Ieff(b);
    if (f.start !== this.lastStart) {
      this.lastStart = f.start;
      this.vmul = 1;
    }
    this.chords(b, f, 'str', STRINGS(maj ? 0.8 : 0.45), 'strings', 48, 67, I >= 2 ? 4 : 3, I === 0 ? 0.62 : 0.46, 0.35);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.45, (I >= 1 ? 2 : 4) * b.spb);
    if (I >= 1) this.play(b, SUB(), 'bass', 2, this.root(f, 2, 29), 0.4, 2 * b.spb);

    // the leitmotif: whole (I0 low strings, I3 horns + violins), or just its head (I1–2)
    const mb = this.melodyBar(f, maj);
    if (mb) {
      const bar = mb.line[f.i];
      const notes = (shift: number) => lineNotes(mb.scale, note('F4'), this.beats, [bar], { vel: 0.72, shift });
      if (I === 0) {
        this.notes(b, notes(-7), CELLO(), 'cello', 1.0, 0.97);
        this.notes(b, notes(0), VIOLIN(0.4), 'violins', 0.55, 0.97);
      } else if (I <= 2) {
        if (f.i === 0 || f.i === 4) this.notes(b, notes(-7), HORNLEAD(0.4), 'horn2', 0.75, 0.95);
      } else {
        this.notes(b, notes(0), HORNLEAD(maj ? 0.85 : 0.6), 'horn', 0.9, 0.97);
        this.notes(b, notes(-7), HORNLEAD(0.45), 'horn2', 0.55, 0.97);
        if (maj) this.notes(b, notes(7), VIOLIN(0.9), 'violins', 0.6, 0.97);
      }
    }

    // the march: the bass drum is the turtle's step
    const sv = [0.3, 0.52, 0.62, 0.74][I];
    this.steps(b, sv, I < 2 ? [{ inst: 'taiko', ch: 'taiko', midi: 34 }] : [{ inst: 'taiko', ch: 'taiko', midi: 33 }, { inst: 'kick', ch: 'kit', v: 0.4 }]);
    if (I === 0) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.32, 3, undefined, 0.002);
    else {
      this.drum(b, 'snare', 'kit', I === 1 ? 'x..ox.oox..ox.oo' : 'x.ooxoo.x.oox.xo', I === 1 ? 0.36 : 0.42);
      this.ostinato(b, f, 'spicc', 'spicc', 48, 62, [0, 1, 2, 1, 0, 1, 2, 3], 0.4, 0.42, [0, 4]);
    }
    if (I >= 2) {
      this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.48, 3, undefined, 0.002);
      if (f.last && !b.drop) this.roll(b, 'timp', 'timp', 2, 4, 6, 0.2, 0.55, this.root(f, 2, 41));
      this.chords(b, f, 'cho', I >= 3 ? 'choir' : 'choiroo', 'choir', 55, 70, I >= 3 ? 4 : 3, I >= 3 ? 0.21 : 0.29, 0.5);
      this.stabs(b, f, 'br', 'brass', 'brass', 45, 60, 3, [0, 2.5], I >= 3 ? 0.42 : 0.34, 0.6);
    }
    if (I >= 3) {
      if (f.i % 2 === 0) this.play(b, 'tbell', 'bells', 0, this.root(f, 0, 53), 0.3, 5);
      if (maj && (f.i === 3 || f.i === 7)) for (let k = 0; k < 12; k++) this.play(b, 'harp', 'harp', 2 + k / 6, this.major.deg(this.major.degreeOf(note('F4')) + k), 0.3, 1.2 * b.spb);
    }
    if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.32);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
  }
  private lastStart = -1;

  protected fill(b: BarCtx): void {
    this.roll(b, 'snare', 'kit', 3, 4, 6, 0.2, 0.5);
  }
}
