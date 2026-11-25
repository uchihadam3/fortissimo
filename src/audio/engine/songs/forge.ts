/**
 * FORGE — "Forja do Trovão": C minor, 112 bpm. The Carillon of the Forge gives the world its timbre —
 * its force — so this is the heavy land: a taiko ensemble (the odaiko is the turtle's step), pitched
 * anvils, low brass riffs and horns, driving spiccato low strings, a men's choir, the carillon,
 * thunder.
 *
 * The head, in the horns (C G. F E♭), answers with a hammering descent onto the dominant's minor
 * ninth. Tunes: A (the forge song) · B (the heroes' climb, sequences rising by steps) · C (the anvil
 * chorus, Phrygian: repeated hammer notes, D♭). Movements: C → F → the anvil chorus → B♭ → C♯ minor.
 */
import { SONGS } from '../../../sim/defs';
import type { BarInfo, Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CELLO, DRONE, HORNLEAD, LOWBRASS, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { chordTones, MODES, note, Scale } from '../theory';
import type { PlanDef, SecDef } from './adaptive';
import { Battle, type Kit } from './battle';

export const FORGE_A: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1], [3, 0.5], [2, 0.5], [0, 2]],
  [[1, 1], [2, 0.5], [3, 0.5], [6, 2]],
  [[7, 1], [6.5, 1], [5, 1], [4, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[3, 1.5], [2, 0.5], [3, 1], [5, 1]],
  [[5, 1], [4, 1], [6.5, 2]],
  [[7, 3], [null, 1]],
];

export const FORGE_B: Line = [
  [[2, 1], [0, 0.5], [2, 0.5], [5, 2]],
  [[3, 1], [1, 0.5], [3, 0.5], [6, 2]],
  [[4, 1], [2, 0.5], [4, 0.5], [7, 1.5], [6, 0.5]],
  [[7, 3], [null, 1]],
  [[5, 1.5], [4, 0.5], [3, 1], [5, 1]],
  [[7, 1.5], [6, 0.5], [5, 1], [4, 1]],
  [[4, 1], [6.5, 1], [8, 1], [6.5, 1]],
  [[4, 2], [null, 2]],
];

/** the anvil chorus (C Phrygian): three hammer blows and a leap, in sequence */
export const FORGE_C: Line = [
  [[0, 0.5], [0, 0.5], [0, 0.5], [2, 0.5], [4, 1], [2, 1]],
  [[1, 0.5], [1, 0.5], [1, 0.5], [3, 0.5], [5, 1], [3, 1]],
  [[0, 0.5], [0, 0.5], [0, 0.5], [2, 0.5], [4, 1], [6, 1]],
  [[7, 2], [5, 1], [4, 1]],
  [[0, 0.5], [0, 0.5], [0, 0.5], [2, 0.5], [4, 1], [2, 1]],
  [[1, 0.5], [1, 0.5], [1, 0.5], [3, 0.5], [5, 1], [3, 1]],
  [[6, 1], [5, 1], [3, 1], [1, 1]],
  [[0, 4]],
];

export const SECTIONS: SecDef[] = [
  { name: 'A', bars: ['Cm', 'Ab', 'Bb', 'G', 'Cm', 'Fm', ['Ab', 'G'], 'Cm'], tune: FORGE_A },
  { name: 'B', bars: ['Ab', 'Bb', 'Cm', 'Cm', 'Fm', 'Ab', 'G', 'G'], tune: FORGE_B },
  { name: 'C', bars: ['Cm', 'Db', 'Cm', 'Fm', 'Cm', 'Db', 'Bbm', 'C'], tune: FORGE_C, mode: MODES.phrygian },
];

const PLANS: PlanDef[] = [
  { shift: 0, order: ['A', 'B', 'A', 'C'], breaks: ['A', 'B', 'C'] },
  { shift: 5, order: ['B', 'A', 'C', 'B'], breaks: ['B', 'C', 'A'] },
  { shift: 0, order: ['C', 'A', 'C', 'B'], breaks: ['C', 'A'] },
  { shift: -2, order: ['A', 'C', 'B', 'A'], breaks: ['B', 'A', 'C'] },
  { shift: 1, order: ['A', 'B', 'C', 'A'], breaks: ['A', 'C', 'B'] },
];

export class ForgeTheme extends Battle {
  readonly bpm: number = SONGS.forge.bpm;
  readonly level: number = 0.8;
  readonly reverb = 'cave' as const;
  readonly key = new Scale(note('C4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['choir', 50, 70], ['choiroo', 50, 70], ['taiko', 28, 48], ['rim', 60, 60], ['anvil', 64, 92], ['brass', 36, 64], ['spicc', 40, 64], ['crash', 60, 60], ['tom', 40, 56], ['tbell', 48, 72], ['bell', 40, 60], ['timp', 36, 53], ['gong', 60, 60], ['pizz', 30, 50], ['shaker', 60, 60], ['clap', 60, 60], ['snare', 60, 60]];
  protected readonly sections = SECTIONS;
  protected readonly plans = PLANS;
  protected readonly kit: Kit = { snare: 'snare', perc: 'taiko', shake: 'shaker', clap: 'clap', glock: 'anvil', glockCh: 'anvil', bell: 'tbell', bellCh: 'carillon', brass: 'horns', choir: 'choir', bass: 'bass', timp: 'timp' };
  protected readonly breakGain: number = 1.18;

  setup(p: Player): void {
    p.ch('drone', { gain: 0.4, wet: 0.24, filterLfoHz: 110, filterLfoRate: 0.04 });
    p.ch('lowstr', { gain: 0.38, wet: 0.3, vibratoCents: 6 });
    p.ch('odaiko', { gain: 0.3, wet: 0.2 });
    p.ch('taiko', { gain: 0.3, wet: 0.18, pan: -0.15 });
    p.ch('shime', { gain: 0.2, wet: 0.14, pan: 0.28 });
    p.ch('anvil', { gain: 0.22, wet: 0.35, pan: 0.32 });
    p.ch('carillon', { gain: 0.26, wet: 0.5, pan: -0.2 });
    p.ch('brass', { gain: 0.32, wet: 0.22, pan: -0.05 });
    p.ch('bass', { gain: 0.4, wet: 0.04 });
    p.ch('spicc', { gain: 0.32, wet: 0.22, pan: 0.18 });
    p.ch('horns', { gain: 0.38, wet: 0.36, pan: 0.1 });
    p.ch('choir', { gain: 0.32, wet: 0.45, vibratoCents: 6 });
    p.ch('horn', { gain: 0.82, wet: 0.36, vibratoCents: 4, pan: -0.08 });
    p.ch('cello', { gain: 0.7, wet: 0.3, vibratoCents: 9, pan: 0.08 });
    p.ch('vln', { gain: 0.3, wet: 0.4, vibratoCents: 10, pan: 0.2 });
    p.ch('timp', { gain: 0.44, wet: 0.3 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const I = this.Ieff(b);
    const L = this.L(b);
    const brk = this.isBreak;
    const sec = f.sec;

    // ── core: the furnace drone, low strings, the odaiko step ──
    if (f.i % 4 === 0) {
      const tonic = this.k.tonic % 12;
      let d = 36;
      while (d % 12 !== tonic) d++;
      this.play(b, DRONE(380), 'drone', 0, d, 0.72, 4.2 * b.beats * b.spb);
      this.play(b, DRONE(380), 'drone', 0.05, d + 7, 0.44, 4.2 * b.beats * b.spb);
    }
    this.chords(b, f, 'ls', STRINGS(0.45), 'lowstr', 47, 62, 3, brk ? 0.42 : I === 0 ? 0.46 : 0.38, 0.4);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 31), brk ? 0.34 : 0.4, (brk ? 4 : 2) * b.spb);
    const sv = brk ? 0.32 : [0.38, 0.5, 0.56, 0.62][I];
    this.steps(b, sv, I < 3 ? [{ inst: 'taiko', ch: 'odaiko', midi: 31 }] : [{ inst: 'taiko', ch: 'odaiko', midi: 31 }, { inst: 'kick', ch: 'odaiko', v: 0.35 }]);

    // ── the tune (breakdowns): the horn and its cello shadow; the men's choir; the anvils sing ──
    if (brk) {
      const mk = 1 + 0.05 * (5 - L.h);
      if (sec === 'A') {
        this.tune(b, f, HORNLEAD(0.4), 'horn', 0.9 * mk, { legato: 0.97 });
        if (L.h >= 2) this.tune(b, f, CELLO(), 'cello', 0.5, { shift: -12, legato: 0.97 });
      } else if (sec === 'B') {
        this.tune(b, f, CELLO(), 'cello', 0.95 * mk, { legato: 1.0 });
        if (L.h >= 2) this.tune(b, f, HORNLEAD(0.3), 'horn', 0.45, { shift: 0, bars: [4, 5, 6, 7] });
      } else {
        this.tune(b, f, 'anvil', 'anvil', 0.9 * mk, { shift: 24 });
        this.tune(b, f, 'tbell', 'carillon', 0.5 * mk, { shift: 12 });
      }
      if (L.h >= 3 && L.voices && sec !== 'C') this.tune(b, f, 'choiroo', 'choir', 0.2, { shift: -12, legato: 1.0 });
    }

    // ── strings: driving spiccato ──
    if (L.strings) {
      const v = L.strings;
      if (brk) {
        if (f.i % 2 === 1) this.bassline(b, f, 'pizz', 'spicc', [[0, 0, 0.8, 0.4 * v], [1.5, 2, 0.4, 0.3 * v], [2, 0, 0.8, 0.36 * v]], 36);
      } else if (I <= 1) this.ostinato(b, f, 'spicc', 'spicc', 48, 64, [0, -1, 1, -1, 0, -1, 2, -1], 0.42 * v, 0.4, [0, 4]);
      else this.ostinato(b, f, 'spicc', 'spicc', 48, 64, [0, 1, 2, 1, 0, 1, 2, 1], 0.44 * v, 0.4, [0, 4]);
    }

    // ── percussion: hammer blows between the steps ──
    if (L.percussion && !b.build) {
      const v = L.percussion;
      if (brk) {
        if (f.i % 2 === 1) this.drum(b, 'taiko', 'taiko', '..........x..x..', 0.36 * v, 41);
      } else {
        this.drum(b, 'taiko', 'taiko', I >= 2 ? '..x..x.x..x..xxx' : I === 1 ? '..x...x...x...x.' : '..........x.....', 0.44 * v, 41);
        if (I >= 2) this.drum(b, 'rim', 'shime', 'xoxoxoxoxoxoxoxo', 0.38 * v);
        if (I >= 3 && f.i % 4 === 3 && !b.drop) this.roll(b, 'tom', 'taiko', 3, 4, 6, 0.35 * v, 0.7 * v, 45);
      }
      if (this.rise(b) || (I === 3 && f.i % 4 === 0 && !b.drop)) b.p.hit('crash', 'odaiko', this.T(b, 0, 0.001), 0.28);
    }

    // ── bells: the anvils (pitched to the chord) and the carillon ──
    if (L.bells) {
      const v = L.bells;
      const anvil = (pat: string, vel: number) => this.drum(b, 'anvil', 'anvil', pat, vel, this.tone(this.cAt(f, 1), 76, 0) + (this.barRand(b, 3) < 0.5 ? 0 : 7), 0.002);
      if (brk) {
        if (f.i % 2 === 1 && sec !== 'C') anvil('........x.......', 0.26 * v);
        if (f.i === 0) this.play(b, 'bell', 'carillon', 0, this.tone(f.chord, 43, 0), 0.3 * v, 6);
      } else {
        anvil(I >= 2 ? '....x.......x..x' : '....x.......x...', (I >= 3 ? 0.46 : 0.36) * v);
        if (I >= 2 && f.i % 4 === 0) this.play(b, 'tbell', 'carillon', 0, this.tone(f.chord, 55, 0), 0.3 * v, 5);
      }
    }

    // ── brass: the riff ──
    if (L.brass) {
      const v = L.brass;
      if (brk) {
        if (f.i % 4 === 3) this.chords(b, f, 'hp', { ...LOWBRASS(0.35), attack: 1 }, 'horns', 48, 62, 3, 0.38 * v, 0.4);
      } else {
        const c0 = this.cAt(f, 0);
        if (I <= 1) for (const m of [this.tone(c0, 36, 0), this.tone(c0, 36, 2)]) this.play(b, 'brass', 'brass', 0, m, 0.48 * v, 0.8 * b.spb, undefined, 0.002);
        else {
          const rh = [0, 1, 1.5, 2.5, 3, 3.5];
          const which = [0, 0, 1, 0, 2, 0];
          rh.forEach((beat, k) => {
            const c = this.cAt(f, beat);
            this.play(b, 'brass', 'brass', beat, this.tone(c, 36, which[k]), (k === 0 ? 0.58 : 0.42) * v, 0.45 * b.spb, undefined, 0.002);
          });
        }
        if (I >= 3) this.chords(b, f, 'horns', LOWBRASS(0.5), 'horns', 48, 62, 3, 0.5 * v, 0.3);
      }
    }

    // ── voices: the men's choir ──
    if (L.voices) {
      const v = L.voices;
      if (brk) this.chords(b, f, 'choir', 'choiroo', 'choir', 50, 62, 3, 0.16 * v, 0.6);
      else if (I >= 2) this.chords(b, f, 'choir', I >= 3 ? 'choir' : 'choiroo', 'choir', 52, 66, 3, (I >= 3 ? 0.2 : 0.18) * v, 0.5);
      else if (f.i % 2 === 0) this.chords(b, f, 'choir', 'choiroo', 'choir', 50, 62, 3, 0.15 * v, 0.6);
    }

    // ── low: the bass riff ──
    if (L.low) {
      const v = L.low;
      if (brk) this.bassline(b, f, SUB(), 'bass', [[0, 0, 2.5, 0.42 * v], [3, 0, 0.8, 0.3 * v]], 31);
      else if (I >= 1) this.bassline(b, f, SUB(), 'bass', [[0, 0, 1.4, 0.55 * v], [1.5, 0, 0.4, 0.3 * v], [2, 0, 1.8, 0.5 * v], [3.75, 3, 0.25, 0.28 * v]], 31);
      else this.play(b, SUB(), 'bass', 0, this.root(f, 0, 31), 0.42 * v, 4 * b.spb);
    }

    // ── harmony: a high violin line over the furnace; the horns sing the head at the climax ──
    if (!brk && I >= 1 && L.h >= 2) this.counters(b, f, [[[VIOLIN(0.5), 'vln', 72, 84]], [[CELLO(), 'cello', 50, 62]], [[HORNLEAD(0.4), 'horn', 58, 70]], [[VIOLIN(0.6), 'vln', 74, 86]], [[VIOLIN(0.6), 'vln', 74, 86], [CELLO(), 'cello', 50, 62]]], 0.26 + 0.04 * L.h, I >= 3 ? 2 : 4);
    if (!brk && I >= 3 && L.h >= 4 && L.brass) this.tune(b, f, HORNLEAD(0.55), 'horn', 0.6, { bars: [0, 4] });
    if (L.h >= 5 && f.i === 0 && !b.build) b.p.hit('gong', 'carillon', this.T(b, 0, 0.001), I >= 2 ? 0.22 : 0.14);
    this.glory(b, f, L, I, null);
    this.duets(b, f, L, I);
    this.dropExtras(b, f, { ch: 'odaiko' }, 'bass');
  }

  protected fill(b: BarCtx): void {
    this.roll(b, 'taiko', 'taiko', 3, 4, 4, 0.35, 0.6, 43);
  }
}
