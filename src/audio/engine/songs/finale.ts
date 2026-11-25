/**
 * FINALE — the battle against the Silence (120 bpm): the FORTÍSSIMO theme itself, fighting its way
 * from F minor to F MAJOR. Every movement darkens or lifts the minor (F → B♭ → D → F♯ minor) until
 * the last one, where the theme turns to the major in full glory — the music wins.
 *
 * Tunes: Am (the leitmotif in the minor, the leading tone borrowed at the cadence) · Bm (its answer,
 * falling from D♭) · Cm (the struggle, over a Neapolitan G♭) · AM / BM / CM — the same in F major,
 * triumphant (LEIT_A over its warm film-score harmony, LEIT_B, and a soaring C).
 */
import { SONGS } from '../../../sim/defs';
import { LEIT_A, LEIT_A_CHORDS, LEIT_A_MINOR, LEIT_A_MINOR_CHORDS, LEIT_B, LEIT_B_CHORDS, type BarInfo, type Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CELLO, CHOIR, HORNLEAD, LOWBRASS, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

const FIN_BM: Line = [
  [[5, 1.5], [4, 0.5], [2, 2]],
  [[6, 1.5], [5, 0.5], [3, 2]],
  [[7, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1], [1, 1], [0, 2]],
  [[5, 1.5], [4, 0.5], [2, 2]],
  [[6, 1.5], [5, 0.5], [3, 2]],
  [[4, 1], [6.5, 1], [8, 1], [6.5, 1]],
  [[4, 2], [null, 2]],
];

const FIN_CM: Line = [
  [[3, 2], [5, 2]],
  [[4, 2], [2, 2]],
  [[5, 2], [2, 2]],
  [[1, 2], [-0.5, 2]],
  [[7, 2], [5, 2]],
  [[7, 1], [4, 1], [2, 1], [4, 1]],
  [[5, 2], [3, 2]],
  [[4, 2], [1, 2]],
];

/** the triumphant C: soaring over IV and V */
const FIN_CMAJ: Line = [
  [[8, 2], [7, 1], [6, 1]],
  [[7, 2], [4, 2]],
  [[5, 1.5], [6, 0.5], [7, 1], [8, 1]],
  [[8, 3], [null, 1]],
  [[8, 2], [7, 1], [6, 1]],
  [[7, 1], [6, 1], [5, 1], [4, 1]],
  [[3, 1], [5, 1], [7, 1], [10, 1]],
  [[11, 2], [8, 2]],
];

const SECTIONS: SecDef[] = [
  { name: 'Am', bars: LEIT_A_MINOR_CHORDS, tune: LEIT_A_MINOR },
  { name: 'Bm', bars: ['Db', 'Eb', 'Fm', 'Fm', 'Db', 'Eb', 'C', 'C'], tune: FIN_BM },
  { name: 'Cm', bars: ['Bbm', 'Fm', 'Db', 'C', 'Bbm', 'Fm', 'Gb', 'C'], tune: FIN_CM },
  { name: 'AM', bars: LEIT_A_CHORDS, tune: LEIT_A, mode: MODES.major },
  { name: 'BM', bars: LEIT_B_CHORDS, tune: LEIT_B, mode: MODES.major },
  { name: 'CM', bars: ['Gm7', 'F', 'Bb', 'C', 'Gm7', 'F/A', 'Bb', ['C', 'C7']], tune: FIN_CMAJ, mode: MODES.major },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['Am', 'Bm', 'Am', 'Cm'], breaks: ['Am', 'Bm'] },
  { shift: 5, order: ['Bm', 'Cm', 'Bm', 'Am'], breaks: ['Bm', 'Am'] },
  { shift: -3, order: ['Cm', 'Am', 'Cm', 'Bm'], breaks: ['Am', 'Cm'] },
  { shift: 1, order: ['Am', 'Cm', 'Bm', 'Am'], breaks: ['Bm', 'Am'] },
  { shift: 0, order: ['AM', 'BM', 'AM', 'CM'], breaks: ['AM', 'BM'] },
];

export class FinaleTheme extends Battle {
  readonly bpm: number = SONGS.finale.bpm;
  readonly level: number = 0.64;
  readonly reverb = 'spire' as const;
  readonly key = new Scale(note('F4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['spicc', 45, 64], ['brass', 41, 65], ['snare', 60, 60], ['taiko', 30, 36], ['timp', 36, 53], ['crash', 60, 60], ['tbell', 52, 72], ['harp', 50, 90], ['choir', 52, 74], ['choiroo', 52, 72], ['celesta', 76, 98], ['glass', 79, 100], ['gong', 60, 60], ['kick', 60, 60], ['shaker', 60, 60], ['clap', 60, 60]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'snare', perc: 'kit', shake: 'shaker', clap: 'clap', glock: 'celesta', glockCh: 'bells', bell: 'tbell', bellCh: 'bells', brass: 'brass', choir: 'choir', bass: 'bass', timp: 'timp' };
  protected readonly breakGain: number = 1.26;

  setup(p: Player): void {
    p.ch('strings', { gain: 0.44, wet: 0.42, vibratoCents: 8 });
    p.ch('spicc', { gain: 0.34, wet: 0.26, pan: 0.15 });
    p.ch('brass', { gain: 0.38, wet: 0.3, pan: -0.1 });
    p.ch('horn', { gain: 0.66, wet: 0.42, vibratoCents: 5, pan: -0.05 });
    p.ch('horn2', { gain: 0.4, wet: 0.42, vibratoCents: 4, pan: -0.2 });
    p.ch('violins', { gain: 0.48, wet: 0.45, vibratoCents: 11, vibratoRate: 5.4, pan: 0.18 });
    p.ch('cello', { gain: 0.7, wet: 0.36, vibratoCents: 9, pan: 0.05 });
    p.ch('choir', { gain: 0.4, wet: 0.55, vibratoCents: 6 });
    p.ch('kit', { gain: 0.46, wet: 0.2 });
    p.ch('taiko', { gain: 0.52, wet: 0.24 });
    p.ch('timp', { gain: 0.5, wet: 0.34 });
    p.ch('bells', { gain: 0.26, wet: 0.6, pan: 0.25 });
    p.ch('harp', { gain: 0.32, wet: 0.45, pan: -0.28 });
    p.ch('bass', { gain: 0.46, wet: 0.05 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const maj = f.sec.endsWith('M');
    const A = f.sec === 'Am' || f.sec === 'AM';

    // ── core: the strings, the root, the march ──
    this.chords(b, f, 'str', STRINGS(maj ? 0.8 : 0.45), 'strings', 48, 67, I >= 2 ? 4 : 3, brk ? 0.56 : I === 0 ? 0.6 : 0.42, 0.35);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), brk ? 0.38 : 0.42, (I >= 1 && !brk ? 2 : 4) * b.spb);
    if (I >= 1 && !brk) this.play(b, SUB(), 'bass', 2, this.root(f, 2, 29), 0.36, 2 * b.spb);
    const sv = brk ? 0.26 : [0.3, 0.46, 0.54, 0.62][I];
    this.steps(b, sv, I < 2 ? [{ inst: 'taiko', ch: 'taiko', midi: 34 }] : [{ inst: 'taiko', ch: 'taiko', midi: 33 }, { inst: 'kick', ch: 'kit', v: 0.4 }]);

    // ── the theme: in the breakdowns on cello and violins; at the climax on the horns ──
    if (brk) {
      const mk = 1 + 0.04 * (5 - L.h);
      if (maj) {
        this.tune(b, f, HORNLEAD(0.75), 'horn', 0.95 * mk, { legato: 0.97 });
        this.tune(b, f, VIOLIN(0.85), 'violins', 0.6, { shift: 12, legato: 0.97 });
      } else {
        this.tune(b, f, CELLO(), 'cello', 1.0 * mk, { legato: 0.97 });
        this.tune(b, f, VIOLIN(0.4), 'violins', 0.5, { shift: 12, bars: [4, 5, 6, 7], legato: 0.97 });
      }
    } else if (I <= 2 && A && (f.i === 0 || f.i === 4)) this.tune(b, f, HORNLEAD(0.4), 'horn2', 0.75, { shift: -12 });
    else if (I >= 3) {
      this.tune(b, f, HORNLEAD(maj ? 0.85 : 0.6), 'horn', 0.85, {});
      this.tune(b, f, HORNLEAD(0.45), 'horn2', 0.55, { shift: -12 });
      if (maj && L.h >= 3) this.tune(b, f, VIOLIN(0.9), 'violins', 0.55, { shift: 12 });
    }

    // ── strings: spiccato ostinato ──
    if (L.strings && !brk && I >= 1) this.ostinato(b, f, 'spicc', 'spicc', 48, 62, [0, 1, 2, 1, 0, 1, 2, 3], 0.4 * L.strings, 0.42, [0, 4]);
    else if (L.strings && brk) this.ostinato(b, f, 'harp', 'harp', 53, 77, [0, 1, 2, 3, 4, 3, 2, 1], 0.26 * L.strings, 1.0, [0, 4], 0.05);

    // ── percussion: the snare march, timpani ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      if (brk) {
        if (f.i % 2 === 0) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.3 * v, 3, undefined, 0.002);
      } else if (I >= 1) {
        this.drum(b, 'snare', 'kit', I === 1 ? 'x..ox.oox..ox.oo' : 'x.ooxoo.x.oox.xo', (I === 1 ? 0.34 : 0.4) * v);
        if (I >= 2) {
          this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.46 * v, 3, undefined, 0.002);
          if (f.last && !b.drop) this.roll(b, 'timp', 'timp', 2, 4, 6, 0.2 * v, 0.55 * v, this.root(f, 2, 41));
        }
      }
      if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.3);
    }

    // ── bells ──
    if (L.bells) {
      const v = L.bells;
      if (f.i % 2 === 0 && (I >= 2 || brk)) this.play(b, 'tbell', 'bells', 0, this.root(f, 0, 53), (brk ? 0.22 : 0.28) * v, 5);
      if (maj && (f.i === 3 || f.i === 7)) {
        const tones = chordTones(this.cAt(f, 2), 79, 98);
        for (let k = 0; k < 8 && tones.length; k++) this.play(b, 'celesta', 'bells', 2 + k * 0.25, tones[k % tones.length], 0.16 * v, 0.6);
      }
    }

    // ── brass ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 >= 2) this.chords(b, f, 'hp', { ...LOWBRASS(maj ? 0.5 : 0.3), attack: 1 }, 'brass', 48, 62, 3, 0.36 * v, 0.4);
      } else if (I >= 2) {
        this.stabs(b, f, 'br', 'brass', 'brass', 45, 60, 3, [0, 2.5], (I >= 3 ? 0.42 : 0.34) * v, 0.6);
        if (I >= 3) this.chords(b, f, 'hch', LOWBRASS(maj ? 0.6 : 0.45), 'brass', 48, 62, 3, 0.44 * v, 0.3);
      }
      else if (f.i % 4 === 0) this.chords(b, f, 'hsw', { ...LOWBRASS(0.45), attack: 1.2 }, 'brass', 48, 62, 3, 0.4 * v, 0.3);
    }

    // ── voices ──
    if (L.voices) {
      const v = L.voices;
      if (brk) this.chords(b, f, 'cho', maj ? CHOIR('ah') : 'choiroo', 'choir', 55, 69, 3, (maj ? 0.4 : 0.18) * v, 0.5);
      else if (I >= 2) this.chords(b, f, 'cho', I >= 3 ? 'choir' : 'choiroo', 'choir', 55, 70, I >= 3 ? 4 : 3, (I >= 3 ? 0.26 : 0.26) * v, 0.5);
      else if (f.i % 2 === 0) this.chords(b, f, 'cho', 'choiroo', 'choir', 55, 67, 3, 0.18 * v, 0.6);
    }

    // ── low ──
    if (L.low && !brk && I >= 1) this.bassline(b, f, 'pizz', 'bass', [[0, 0, 0.6, 0.5 * L.low], [1, 3, 0.5, 0.34 * L.low], [2, 2, 0.6, 0.44 * L.low], [3, 3, 0.5, 0.34 * L.low]], 34);

    // ── harmony: harp glissandi in the major, a counter-line ──
    if (!brk && I >= 1 && L.h >= 2 && !(I >= 3)) this.counters(b, f, [[[VIOLIN(0.5), 'violins', 74, 86]], [[CELLO(), 'cello', 50, 62]], [[VIOLIN(0.6), 'violins', 76, 88]], [[CELLO(), 'cello', 52, 64]], [[VIOLIN(0.7), 'violins', 76, 88], [CELLO(), 'cello', 50, 62]]], 0.24 + 0.04 * L.h, 4);
    if (maj && I >= 3 && (f.i === 3 || f.i === 7)) for (let k = 0; k < 12; k++) this.play(b, 'harp', 'harp', 2 + k / 6, this.k.deg(this.k.degreeOf(this.k.tonic) + k), 0.28, 1.2 * b.spb);
    this.glory(b, f, L, I, 'harp');
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'kit' }, 'bass');
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'snare', 'kit', 3, 4, 6, 0.2, 0.5);
  }
}
