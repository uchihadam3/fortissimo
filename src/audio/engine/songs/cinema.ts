/**
 * The moods of the opening and the ending (docs/STORY.md). Each one starts on the next beat and
 * SUSTAINS — looping and evolving — until the next cue, so the cutscenes can be re-timed freely:
 *
 *   dawn       Harmonia wakes: glimmers, a string swell, the theme's head far away
 *   festival   the Great Tour begins — the main theme with the WHOLE band (all eight musicians);
 *              `approach` makes it decay (parts drop out, the filter closes, the pitch sags) under a
 *              growing tritone drone, and it stays there, a ghost of itself
 *   approach   (alone) the Silence's drone, when nothing was playing
 *   grey       cold wind, the turtle's sleeping breath, a broken music box that stops mid-phrase
 *   hope       one pure note, the turtle's heartbeat, strings rising to the dominant — held
 *   afterglow  after the title chord: a shimmering F major and the head, softly
 *   fall       the low drone after the Silence collapses
 *   alone      the tender solo (piano), the leitmotif in D minor, growing a little each pass
 *   after      after the rest: soft calls and answers over a growing pad
 *   bloom      THE HIGH POINT: the main theme in full glory with the full band and choir, lifting to
 *              G major; `bow` turns it into the final cadence (a broadened IV–ii | V7sus4–V7 | I)
 *              and then a shimmering tail that sustains until the credits
 */
import { SONGS } from '../../../sim/defs';
import { chordIn, Form, LEIT_A, LEIT_A_RICH_CHORDS, LEIT_B, LEIT_B_RICH_CHORDS, lineNotes, type BarInfo, type Line } from '../compose';
import type { ReverbMode } from '../core';
import type { BarCtx, Player } from '../music';
import { CELLO, CHOIR, DRONE, FLUTE, HORNLEAD, LOWBRASS, OBOE, PAD, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { chord, chordTones, type Chord, MODES, note, Scale } from '../theory';
import { clamp, pick, rand } from '../util';
import { Mood, palette } from './moods';

const MENU_BPM = SONGS.menu.bpm;
const END_BPM = SONGS.ending.bpm;
const F4 = note('F4');
const HOME = palette(null);

// ═════════════════════════════════════ DAWN ═════════════════════════════════════

export class DawnMood extends Mood {
  readonly bpm = MENU_BPM;
  readonly key = new Scale(F4, MODES.major);
  readonly warm: [BufInst, number, number][] = [['harp', 53, 93], ['celesta', 76, 100], ['piano', 60, 89], ['timp', 41, 50], ['glass', 79, 100]];
  protected readonly prog = new Form([{ name: 'dawn', bars: ['Fadd9', 'Bbmaj7/F', 'Fadd9', 'C7sus4', 'Dm9', 'Bbmaj7', 'Gm7', 'C7sus4'] }], [], ['dawn']);
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('strings', { gain: 0.5, wet: 0.5, vibratoCents: 8 });
    p.ch('harp', { gain: 0.36, wet: 0.5, pan: -0.25 });
    p.ch('celesta', { gain: 0.3, wet: 0.6, pan: 0.3 });
    p.ch('piano', { gain: 0.42, wet: 0.45 });
    p.ch('flute', { gain: 0.42, wet: 0.5, vibratoCents: 12, pan: 0.15 });
    p.ch('timp', { gain: 0.46, wet: 0.35 });
    this.padCh = 'strings';
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const grow = f.cycle === 0 ? Math.min(1, f.i / 5) : 1;
    this.chords(b, f, 'str', { ...STRINGS(0.35 + 0.25 * grow), attack: 2.2 }, 'strings', 53, 72, 4, 0.24 + 0.22 * grow, 0.6);
    for (let k = 0; k < 2 + Math.round(2 * grow); k++) this.play(b, 'celesta', 'celesta', rand(0, 3.6), pick(chordTones(f.chord, 79, 93)), 0.16 + 0.05 * grow, 2 * b.spb);
    for (let k = 0; k < 4; k++) if (Math.random() < 0.5) this.play(b, 'piano', 'piano', k + rand(0, 0.1), pick(chordTones(f.chord, 72, 86)), 0.15 + 0.04 * grow, 2 * b.spb, 1.2);
    const tones = chordTones(f.chord, 62, 91);
    const run = f.i === 3 || f.i === 7;
    const n = run ? 14 : 5;
    const at = run ? 2 : 3;
    for (let k = 0; k < n && tones.length; k++) this.play(b, 'harp', 'harp', at + (k * (4 - at)) / n, tones[k % tones.length], 0.14 + 0.014 * k, 1.4 * b.spb);
    // the theme's head, far away: celesta on the first pass, then the flute
    if (f.i === 4 || f.i === 5) {
      const notes = lineNotes(this.key, F4, this.beats, [LEIT_A[f.i - 4]], { vel: 0.6, shift: 7 });
      if (f.cycle === 0) this.notes(b, notes, 'celesta', 'celesta', 0.55, 1.3);
      else this.notes(b, notes, FLUTE(), 'flute', 0.7, 0.95);
    }
    if (f.i === 7) this.roll(b, 'timp', 'timp', 1, 4, 6, 0.05, 0.3 * grow + 0.05, note('C3'));
  }
}

// ═════════════════════════════════════ FESTIVAL ═════════════════════════════════════

/**
 * The festival — the whole band of the Grand Tour plays the main theme: Lira's harp, Bumbo's drum,
 * Dona Badalo's bells, Chocalho's shaker, Cristalina's crystal, Trompa's horn, the Coralitos'
 * choir and Grave's bass. `decayT` (approach) takes it apart.
 */
export class FestivalMood extends Mood {
  readonly bpm = MENU_BPM;
  readonly level: number = 1.25;
  readonly key = new Scale(F4, MODES.major);
  readonly warm: [BufInst, number, number][] = [['pizz', 29, 62], ['harp', 53, 93], ['timp', 39, 53], ['tamb', 60, 60], ['taiko', 30, 40], ['snare', 60, 60], ['crash', 60, 60], ['shaker', 60, 60], ['tbell', 52, 72], ['zap', 72, 96], ['glass', 79, 100], ['choir', 53, 74], ['choiroo', 53, 72], ['brass', 41, 65], ['boom', 26, 40]];
  protected readonly energy: Record<string, number> = { A: 1, A2: 1.02, B: 0.96, A3: 1.08 };
  protected readonly prog = new Form(
    [
      { name: 'A', bars: LEIT_A_RICH_CHORDS },
      { name: 'A2', bars: LEIT_A_RICH_CHORDS },
      { name: 'B', bars: LEIT_B_RICH_CHORDS },
      { name: 'A3', bars: LEIT_A_RICH_CHORDS },
    ],
    [],
    ['A', 'A2', 'B', 'A3'],
  );
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('strings', { gain: 0.46, wet: 0.4, vibratoCents: 7 });
    p.ch('pizz', { gain: 0.6, wet: 0.22, pan: -0.1 });
    p.ch('bass', { gain: 0.4, wet: 0.06 });
    p.ch('harp', { gain: 0.4, wet: 0.36, pan: -0.25 });
    p.ch('horn', { gain: 0.62, wet: 0.4, vibratoCents: 5 });
    p.ch('horn2', { gain: 0.4, wet: 0.42, vibratoCents: 4, pan: -0.15 });
    p.ch('violins', { gain: 0.52, wet: 0.42, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('flute', { gain: 0.46, wet: 0.4, vibratoCents: 12, pan: 0.22 });
    p.ch('choir', { gain: 0.4, wet: 0.5, vibratoCents: 5 });
    p.ch('kit', { gain: 0.44, wet: 0.2 });
    p.ch('perc', { gain: 0.24, wet: 0.18, pan: 0.28 });
    p.ch('timp', { gain: 0.5, wet: 0.32 });
    p.ch('bells', { gain: 0.26, wet: 0.55, pan: 0.2 });
    p.ch('crystal', { gain: 0.22, wet: 0.5, pan: -0.3 });
    p.ch('drone', { gain: 0.5, wet: 0.35, filterLfoHz: 80, filterLfoRate: 0.05 });
    this.padCh = 'strings';
  }
  /** 0 = festive … 1 = decayed (set by the approach cue) */
  private decayOf(b: BarCtx): number {
    const t0 = b.p.state.decayT;
    if (t0 === undefined) return 0;
    return clamp((b.t - t0) / (b.p.state.decayDur ?? 12), 0, 1);
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const d = this.decayOf(b);
    const s = f.sec;
    const bar = s === 'B' ? LEIT_B[f.i] : LEIT_A[f.i];
    const mel = (shift: number) => lineNotes(this.key, F4, this.beats, [bar], { vel: 0.72, shift });
    const big = s === 'A3';
    const on = (x: number) => d < x;
    // strings and the bass (Grave)
    this.chords(b, f, 'str', STRINGS((big ? 0.85 : 0.65) * (1 - 0.6 * d)), 'strings', 53, 72, 4, (big ? 0.56 : 0.5) * (1 - 0.5 * d), 0.35);
    if (on(0.72)) this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.64], [1, 3, 0.5, 0.42], [2, 2, 0.6, 0.54], [3, 3, 0.5, 0.42]], 34);
    if (on(0.5)) this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.38 * (1 - d), b.beats * b.spb);
    // the melody: Trompa's horn (A, A3), the flute and violins (A2), the violins and oboe (B)
    if (on(0.85)) {
      if (s === 'A' || big) this.notes(b, mel(0).filter((n) => d < 0.6 || n.beat < 2), HORNLEAD(big ? 0.8 : 0.65), 'horn', 0.95 * (1 - 0.4 * d), 0.96);
      if (big && on(0.5)) {
        this.notes(b, mel(-12), HORNLEAD(0.4), 'horn2', 0.55, 0.96);
        this.notes(b, mel(12), VIOLIN(0.85), 'violins', 0.6, 0.96);
      }
      if (s === 'A2' && on(0.5)) {
        this.notes(b, mel(12), FLUTE(), 'flute', 0.75, 0.9);
        this.notes(b, mel(12), VIOLIN(0.7), 'violins', 0.5, 0.96);
      }
      if (s === 'B' && on(0.5)) this.notes(b, mel(12), VIOLIN(0.8), 'violins', 0.72, 0.97);
    }
    // Lira's harp
    if (on(0.55)) this.ostinato(b, f, 'harp', 'harp', 60, 84, s === 'B' ? [0, 2, 1, 3, 2, 4, 3, 1] : [0, 1, 2, 3, 4, 3, 2, 1], 0.36 * (1 - d), 1.0, [0, 4]);
    // the Coralitos' choir
    if (on(0.3)) {
      if (s === 'B') this.chords(b, f, 'cho', 'choiroo', 'choir', 55, 69, 3, 0.24, 0.6);
      if (big) this.chords(b, f, 'cho', 'choir', 'choir', 55, 72, 4, 0.24, 0.4);
    }
    // Bumbo's drum (the turtle's steps and a festive pattern), Chocalho's shaker, the snare
    if (on(0.2)) {
      this.drum(b, 'taiko', 'kit', 'x...x...x...x...', 0.4, 33);
      this.drum(b, 'taiko', 'kit', s === 'B' ? '..........x.....' : '......x...x...x.', 0.24, 40);
      this.drum(b, 'shaker', 'perc', 'oxoxoxoxoxoxoxox', 0.42);
      this.drum(b, 'snare', 'kit', s === 'B' ? '....x.......x...' : 'o...x..o....x.oo', 0.3);
      if (big) this.drum(b, 'tamb', 'perc', 'x.x.x.x.x.x.x.x.', 0.3);
      if (f.i === 0) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), big ? 0.34 : 0.26);
      if (f.i % 2 === 0) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.46, 3, undefined, 0.002);
    } else if (on(0.5)) this.drum(b, 'taiko', 'kit', 'x.......x.......', 0.3 * (1 - d), 33);
    // Dona Badalo's bells and Cristalina's crystal at the phrase ends
    if (on(0.4)) {
      if (f.i === 0 || f.i === 4) this.play(b, 'tbell', 'bells', 0, this.root(f, 0, 53), 0.3, 5);
      if (f.i === 3 || f.i === 7) {
        const tones = chordTones(this.cAt(f, 2), 79, 96);
        for (let k = 0; k < 6 && tones.length; k++) this.play(b, k % 2 ? 'glass' : 'zap', 'crystal', 2 + k * 0.25, tones[k % tones.length], 0.2, 0.6);
      }
      if (big) this.stabs(b, f, 'br', 'brass', 'horn2', 48, 62, 3, [0, 2.5], 0.3, 0.6);
    }
    // the Silence comes: a tritone drone grows under it all
    if (d > 0 && f.i % 2 === 0) {
      const v = 0.25 + 0.55 * d;
      this.play(b, DRONE(160 + 300 * d), 'drone', 0, note('F1'), v, 2.2 * b.beats * b.spb);
      this.play(b, DRONE(160 + 300 * d), 'drone', 0.05, note('B1'), v * 0.7, 2.2 * b.beats * b.spb);
    }
    // a ghost of the theme, after it has fallen apart
    if (d >= 0.85 && (f.i === 0 || f.i === 4)) this.notes(b, mel(-12).slice(0, 2), CELLO(), 'horn2', 0.35, 1.2);
  }
}

/** the Silence approaches with nothing playing: its drone alone, a slow heartbeat of taiko */
export class ApproachMood extends Mood {
  readonly bpm = 60;
  readonly key = new Scale(F4, MODES.phrygian);
  readonly reverb: ReverbMode = 'cave';
  readonly warm: [BufInst, number, number][] = [['taiko', 28, 36]];
  protected readonly prog = new Form([{ name: 'a', bars: ['F5', 'F5', 'Gb/F', 'F5'] }], [], ['a']);
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('drone', { gain: 0.5, wet: 0.35, filterLfoHz: 90, filterLfoRate: 0.05 });
    p.ch('drums', { gain: 0.42, wet: 0.4 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const grow = Math.min(1, (b.bar + 1) / 6);
    if (f.i % 2 === 0) {
      this.play(b, DRONE(180 + 260 * grow), 'drone', 0, note('F1'), 0.4 + 0.4 * grow, 2.3 * b.beats * b.spb);
      this.play(b, DRONE(180 + 260 * grow), 'drone', 0.05, note('B1'), 0.3 + 0.3 * grow, 2.3 * b.beats * b.spb);
    }
    this.drum(b, 'taiko', 'drums', 'x.......', 0.3 + 0.2 * grow, 29);
  }
}

// ═════════════════════════════════════ GREY ═════════════════════════════════════

/** grey, silent world: cold wind, the turtle's sleeping breath, a broken music box stopping mid-phrase */
export class GreyMood extends Mood {
  readonly bpm = 60;
  readonly key = new Scale(F4, MODES.major);
  readonly reverb: ReverbMode = 'spire';
  readonly warm: [BufInst, number, number][] = [['mbox', 70, 98]];
  protected readonly prog = new Form([{ name: 'g', bars: ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'F'] }], [], ['g']);
  private bed: { srcs: AudioScheduledSourceNode[]; nodes: AudioNode[] } | null = null;
  private mods: (() => void)[] = [];
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    const ch = p.ch('wind', { gain: 0.42, wet: 0.4 });
    p.ch('box', { gain: 0.4, wet: 0.55, pan: 0.2 });
    const core = p.core;
    const ctx = core.ctx;
    const srcs: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    for (const [f0, pan, g0] of [[380, -0.5, 0.5], [620, 0.5, 0.42], [1900, 0.1, 0.03]] as [number, number, number][]) {
      const src = core.noise(f0 > 1000 ? 'white' : 'pink', core.now);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f0;
      bp.Q.value = f0 > 1000 ? 8 : 0.7;
      const g = ctx.createGain();
      g.gain.value = g0 * 0.5;
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      src.connect(bp).connect(g).connect(pn).connect(ch.input);
      srcs.push(src);
      nodes.push(src, bp, g, pn);
      this.mods.push(() => {
        const t = core.now;
        bp.frequency.setTargetAtTime(f0 * rand(0.6, 1.5), t, 1.3);
        g.gain.setTargetAtTime(g0 * rand(0.25, 1), t, 1.1);
      });
    }
    // the turtle's slow sleeping breath
    const br = core.noise('brown', core.now);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const bg = ctx.createGain();
    bg.gain.value = 0.02;
    br.connect(lp).connect(bg).connect(ch.input);
    srcs.push(br);
    nodes.push(br, lp, bg);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 4.6;
    const lg = ctx.createGain();
    lg.gain.value = 0.1;
    lfo.connect(lg).connect(bg.gain);
    lfo.start(core.now);
    srcs.push(lfo);
    nodes.push(lfo, lg);
    this.bed = { srcs, nodes };
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    for (const m of this.mods) m();
    // every eight bars the box tries the theme again, and breaks at a different note
    if (f.i !== 1) return;
    const box = [note('F5'), note('C6'), note('A#5'), note('A5'), note('G5'), note('A5'), note('A#5'), note('C6'), note('D6')];
    const stop = [6, 4, 7, 5, 9][f.cycle % 5];
    const gaps = [0.55, 0.85, 0.38, 0.72, 1.05, 0.62, 0.7, 0.9];
    let at = 0.2;
    for (let i = 0; i < stop; i++) {
      const last = i === stop - 1;
      b.p.buf('mbox', 'box', this.T(b, at, 0.01), box[i], (0.15 - i * 0.008) * this.vmul, last ? 0.35 : 1.6, { cents: -6 * i + rand(-12, 12) - (last ? 35 : 0), release: last ? 0.12 : 1.2 });
      at += (gaps[i] ?? 0.8) * (1 + 0.06 * i);
    }
  }
  dispose(): void {
    if (!this.bed) return;
    for (const s of this.bed.srcs) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    for (const n of this.bed.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.bed = null;
  }
}

// ═════════════════════════════════════ HOPE ═════════════════════════════════════

/** the baton glows: a pure note, the turtle's heartbeat, strings rising — then held on the dominant */
export class HopeMood extends Mood {
  readonly bpm = 66;
  readonly key = new Scale(F4, MODES.major);
  readonly warm: [BufInst, number, number][] = [['kick', 60, 60]];
  protected readonly prog = new Form(
    [
      { name: 'rise', bars: ['F/C', 'Dm', 'Bb', 'C7sus4'] },
      { name: 'hold', bars: ['C7sus4', 'C7'] },
    ],
    ['rise'],
    ['hold'],
  );
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('pure', { gain: 0.9, wet: 0.5, vibratoCents: 5, vibratoRate: 4.6 });
    p.ch('strings', { gain: 0.5, wet: 0.5, vibratoCents: 8 });
    p.ch('trem', { gain: 0.3, wet: 0.5, tremolo: 0.35, tremoloRate: 7 });
    p.ch('heart', { gain: 0.5, wet: 0.2 });
    this.padCh = 'strings';
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const rise = f.sec === 'rise';
    const k = rise ? f.i : 4;
    if (b.bar % 2 === 0) this.play(b, { waves: ['sine', 'sine'], ratios: [1, 2], gains: [1, 0.04], attack: 1.8, release: 3, peak: 0.2, cat: 'cine', cap: 12 }, 'pure', 0, note('F5'), 0.5, 2 * b.beats * b.spb + 1);
    for (let beat = 0; beat < 4; beat++) {
      const v = 0.12 + 0.05 * Math.min(4, k);
      b.p.buf('kick', 'heart', this.T(b, beat, 0.002), 43, v, 0.5, { lp: 320 });
      b.p.buf('kick', 'heart', this.T(b, beat + 0.3, 0.002), 42, v * 0.65, 0.5, { lp: 280 });
    }
    this.chords(b, f, 'str', { ...STRINGS(0.4 + 0.12 * k), attack: 1.6, release: 2.2 }, 'strings', 48 + k, 67 + 2 * k, 4 + Math.min(2, k), 0.36 + 0.07 * k, 0.6);
    if (!rise) this.chords(b, f, 'tr', STRINGS(0.9), 'trem', 67, 79, 3, 0.3, 0.3);
  }
}

// ═════════════════════════════════════ AFTERGLOW ═════════════════════════════════════

/** after the title chord: F major shimmering, the head on a distant horn */
export class AfterglowMood extends Mood {
  readonly bpm = MENU_BPM;
  readonly key = new Scale(F4, MODES.major);
  readonly warm: [BufInst, number, number][] = [['harp', 53, 93], ['celesta', 76, 100], ['glass', 79, 100]];
  protected readonly prog = new Form([{ name: 'g', bars: ['Fadd9', 'Bbmaj7/F', 'Fadd9', 'Fadd9', 'Dm9', 'Bbmaj7', 'Fadd9/C', 'C7sus4'] }], [], ['g']);
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('strings', { gain: 0.42, wet: 0.55, vibratoCents: 8 });
    p.ch('harp', { gain: 0.32, wet: 0.5, pan: -0.25 });
    p.ch('cel', { gain: 0.24, wet: 0.6, pan: 0.3 });
    p.ch('horn', { gain: 0.42, wet: 0.55, vibratoCents: 5 });
    this.padCh = 'strings';
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    this.chords(b, f, 'str', { ...STRINGS(0.7), attack: 2 }, 'strings', 57, 77, 4, 0.36, 0.8);
    this.ostinato(b, f, 'harp', 'harp', 60, 86, [0, 2, 4, 3, 1, 3, 2, 4], 0.22, 1.4, [0, 4], 0.1);
    this.sparkle(b, f, f.i % 2 ? 'glass' : 'celesta', 'cel', 2, 79, 98, 0.16);
    if (f.i === 4 || f.i === 5) this.notes(b, lineNotes(this.key, F4, this.beats, [LEIT_A[f.i - 4]], { vel: 0.6 }), HORNLEAD(0.4), 'horn', 0.6, 0.97);
  }
}

// ═════════════════════════════════════ FALL ═════════════════════════════════════

export class FallMood extends Mood {
  readonly bpm = END_BPM;
  readonly key = new Scale(F4, MODES.major);
  readonly warm: [BufInst, number, number][] = [['tbell', 45, 64]];
  protected readonly prog = new Form([{ name: 'drone', bars: ['F5', 'F5'] }], [], ['drone']);
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('drone', { gain: 0.5, wet: 0.35, filterLfoHz: 90, filterLfoRate: 0.05 });
    p.ch('pad', { gain: 0.32, wet: 0.5 });
    p.ch('choir', { gain: 0.26, wet: 0.6, vibratoCents: 4 });
    p.ch('bell', { gain: 0.2, wet: 0.7 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    if (f.i !== 0) return;
    const len = 2 * b.beats * b.spb + 2;
    this.play(b, DRONE(300), 'drone', 0, note('F1'), 0.7, len);
    this.play(b, DRONE(300), 'drone', 0.1, note('C2'), 0.45, len);
    this.play(b, { ...PAD(520), attack: 3 }, 'pad', 0.2, note('F2'), 0.5, len);
    this.play(b, { ...PAD(520), attack: 3 }, 'pad', 0.3, note('C3'), 0.4, len);
    if (f.occ % 2 === 1) this.play(b, CHOIR('mm'), 'choir', 1, note('F3'), 0.35, len - 2);
    if (f.occ % 3 === 2) this.play(b, 'tbell', 'bell', 2, note('C4'), 0.18, 6);
  }
}

// ═════════════════════════════════════ ALONE ═════════════════════════════════════

/** the leitmotif in D minor, slow and sparse — the Silence, small and alone */
const ALONE: Line = [
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [1, 0.5], [0, 2]],
  [[5, 1], [4, 1], [3, 1], [null, 1]],
  [[1, 3], [null, 1]],
  [[0, 1], [4, 1.5], [3, 0.5], [2, 1]],
  [[2, 1.5], [3, 0.5], [4, 1], [5, 1]],
  [[6, 1], [5, 1], [4, 1], [3, 1]],
  [[4, 4]],
];

export class AloneMood extends Mood {
  readonly bpm = END_BPM;
  readonly level: number = 0.48;
  readonly key = new Scale(note('D4'), MODES.aeolian);
  readonly warm: [BufInst, number, number][] = [['piano', 36, 89], ['celesta', 76, 96]];
  protected readonly prog = new Form([{ name: 'alone', bars: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'C', ['A7sus4', 'A7']] }], [], ['alone']);
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('piano', { gain: 0.6, wet: 0.45 });
    p.ch('lh', { gain: 0.4, wet: 0.45, pan: -0.1 });
    p.ch('celesta', { gain: 0.3, wet: 0.6, pan: 0.2 });
    p.ch('pad', { gain: 0.3, wet: 0.55, filterLfoHz: 120, filterLfoRate: 0.04 });
    p.ch('cello', { gain: 0.4, wet: 0.45, vibratoCents: 8, pan: -0.15 });
    p.ch('bass', { gain: 0.3, wet: 0.1 });
  }
  private cnt = 50;
  protected arrange(b: BarCtx, f: BarInfo): void {
    const cyc = f.cycle;
    const high = cyc % 4 === 3 ? 12 : 0;
    const mel = lineNotes(this.key, note('D5') + high, this.beats, [ALONE[f.i]], { vel: 0.62 });
    this.notes(b, mel, 'piano', 'piano', cyc % 4 === 3 ? 0.8 : 1, 1.15, 1.2);
    if (cyc % 4 >= 1 && cyc % 4 <= 2) this.notes(b, mel.map((n) => ({ ...n, midi: n.midi + 12 })), 'celesta', 'celesta', 0.4, 1.1);
    this.chords(b, f, 'pad', PAD(800), 'pad', 50, 65, 3, 0.4, 0.8);
    this.play(b, 'piano', 'lh', 0, this.root(f, 0, 38), 0.32, 3 * b.spb, 1.5);
    if (f.i % 2 === 1) this.play(b, 'piano', 'lh', 2, this.tone(this.cAt(f, 2), 45, 2), 0.22, 2 * b.spb, 1.2);
    if (f.i === 0) this.play(b, SUB(), 'bass', 0, note('D2'), 0.3, 4 * b.beats * b.spb * 0.5);
    // the second pass on: a cello sings the guide tones under it
    if (cyc % 4 === 2) {
      const c = this.cAt(f, 0);
      const want = [c.pcs[1], c.pcs[0]];
      let best = this.cnt;
      let cost = Infinity;
      for (let m = 45; m <= 57; m++) {
        const i = want.indexOf(((m % 12) + 12) % 12);
        if (i < 0) continue;
        const cc = Math.abs(m - this.cnt) + i;
        if (cc < cost) {
          cost = cc;
          best = m;
        }
      }
      this.cnt = best;
      this.play(b, CELLO(), 'cello', 0, best, 0.5, b.beats * b.spb * 0.98);
    }
  }
}

// ═════════════════════════════════════ AFTER THE REST ═════════════════════════════════════

/** after the bar of silence: a soft note, answered, again and again, over a pad that slowly grows */
export class AfterRestMood extends Mood {
  readonly bpm = END_BPM;
  readonly key = new Scale(F4, MODES.major);
  readonly warm: [BufInst, number, number][] = [['piano', 41, 89], ['celesta', 76, 98]];
  protected readonly prog = new Form([{ name: 'r', bars: ['Fadd9', 'Fadd9', 'Bbmaj7/F', 'Fadd9', 'Dm9', 'Bbmaj7', 'Gm7', 'C7sus4'] }], [], ['r']);
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('cel', { gain: 0.3, wet: 0.6, pan: 0.2 });
    p.ch('piano', { gain: 0.5, wet: 0.5, pan: -0.1 });
    p.ch('pad', { gain: 0.3, wet: 0.55 });
    p.ch('choir', { gain: 0.28, wet: 0.6 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const grow = Math.min(1, b.bar / 12);
    if (b.bar % 2 === 0) {
      this.play(b, 'celesta', 'cel', 0.05, this.tone(this.cAt(f, 0), 84, 2), 0.22, 2.2 * b.spb, 2);
      this.play(b, 'piano', 'piano', 2, this.root(f, 2, 53), 0.28, 3 * b.spb, 2);
    }
    if (b.bar >= 2) this.chords(b, f, 'pad', PAD(700 + 500 * grow), 'pad', 50, 65, 3, 0.16 + 0.24 * grow, 1);
    if (b.bar >= 6 && f.i % 2 === 1) this.chords(b, f, 'cho', CHOIR('mm'), 'choir', 53, 65, 3, 0.2 + 0.1 * grow, 1);
  }
}

// ═════════════════════════════════════ BLOOM ═════════════════════════════════════

const G4 = note('G4');
const LEIT_A_RICH_G: (string | string[])[] = ['Gmaj7', ['Am7', 'D7sus4'], 'Cmaj7', ['Bm7', 'D7sus4'], 'Gmaj7', ['Am7', 'C'], ['Cmaj7', 'D'], 'Gadd9'];
const LEIT_B_RICH_G: (string | string[])[] = ['Em9', 'Cmaj7', 'Am7', 'B7', 'Em7', 'Cmaj7', ['Am7', 'D7'], ['D7sus4', 'D7']];
/** a soprano descant over the tutti: long notes above the tune */
const DESCANT: Line = [[[9, 4]], [[8, 2], [9, 2]], [[10, 4]], [[8, 4]], [[9, 2], [11, 2]], [[10, 2], [8, 2]], [[11, 2], [12, 2]], [[14, 4]]];

/**
 * The world blooms — the musical high point of the game: the FORTÍSSIMO theme in full glory with
 * the whole band (all eight musicians), the orchestra and the choir, lifting from F to G major.
 * `bow` (state.bowBar) turns it into the final cadence and a shimmering tail.
 */
export class BloomMood extends Mood {
  readonly bpm = END_BPM;
  readonly level: number = 1.5;
  readonly key = new Scale(F4, MODES.major);
  private readonly keyG = new Scale(G4, MODES.major);
  readonly reverb = 'spire' as const;
  readonly warm: [BufInst, number, number][] = [['pizz', 29, 62], ['harp', 48, 96], ['timp', 36, 53], ['taiko', 30, 40], ['crash', 60, 60], ['tbell', 50, 76], ['glass', 79, 100], ['zap', 72, 98], ['choir', 50, 76], ['choiroo', 50, 76], ['brass', 40, 67], ['gong', 60, 60], ['shaker', 60, 60], ['celesta', 76, 100], ['boom', 26, 40]];
  protected readonly energy: Record<string, number> = { A: 1, B: 0.95, A2: 1.05, A3: 1.08, B2: 1, A4: 1.12 };
  protected readonly prog = new Form(
    [
      { name: 'swell', bars: ['Fsus2', 'Bbmaj7/F'] },
      { name: 'A', bars: LEIT_A_RICH_CHORDS },
      { name: 'B', bars: LEIT_B_RICH_CHORDS },
      { name: 'A2', bars: LEIT_A_RICH_CHORDS },
      { name: 'turn', bars: ['Bbmaj7', ['Am7', 'D7']] },
      { name: 'A3', bars: LEIT_A_RICH_G },
      { name: 'B2', bars: LEIT_B_RICH_G },
      { name: 'A4', bars: LEIT_A_RICH_G },
      { name: 'turn2', bars: ['Cmaj7', ['Gm7', 'C7']] },
    ],
    ['swell'],
    ['A', 'B', 'A2', 'turn', 'A3', 'B2', 'A4', 'turn2'],
  );
  constructor() {
    super(HOME);
  }
  setup(p: Player): void {
    p.ch('strings', { gain: 0.48, wet: 0.45, vibratoCents: 8 });
    p.ch('pizz', { gain: 0.5, wet: 0.25, pan: -0.1 });
    p.ch('harp', { gain: 0.38, wet: 0.45, pan: -0.25 });
    p.ch('horn', { gain: 0.6, wet: 0.45, vibratoCents: 5 });
    p.ch('horn2', { gain: 0.42, wet: 0.45, vibratoCents: 4, pan: -0.15 });
    p.ch('violins', { gain: 0.55, wet: 0.48, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('oboe', { gain: 0.48, wet: 0.42, vibratoCents: 9, pan: 0.08 });
    p.ch('choir', { gain: 0.44, wet: 0.55, vibratoCents: 5 });
    p.ch('descant', { gain: 0.3, wet: 0.6, vibratoCents: 6, pan: 0.1 });
    p.ch('brass', { gain: 0.42, wet: 0.4 });
    p.ch('timp', { gain: 0.55, wet: 0.35 });
    p.ch('kit', { gain: 0.42, wet: 0.3 });
    p.ch('perc', { gain: 0.2, wet: 0.25, pan: 0.3 });
    p.ch('bells', { gain: 0.3, wet: 0.65, pan: 0.25 });
    p.ch('glass', { gain: 0.26, wet: 0.65, pan: -0.3 });
    p.ch('bass', { gain: 0.45, wet: 0.06 });
    this.padCh = 'strings';
  }

  private bowBar(p: Player): number {
    return p.state.bowBar ?? Infinity;
  }
  /** the key the cadence lands in (the section the bow arrived in) */
  private bowKey(p: Player): Scale {
    const k = p.state.bowKey;
    return k === undefined ? this.key : new Scale(k, MODES.major);
  }
  private sectionKey(sec: string): Scale {
    return sec === 'A3' || sec === 'B2' || sec === 'A4' ? this.keyG : this.key;
  }
  keyAt(bar: number, p: Player): Scale {
    if (bar >= this.bowBar(p)) return this.bowKey(p);
    return this.sectionKey(this.prog.at(Math.max(0, bar)).sec);
  }

  /** the cadence (bars 0–2 after the bow) and the tail, in the bow's key: IV–ii7 | V7sus4–V7 | I … */
  private cadenceChords(p: Player, k: number): Chord[] {
    const K = this.bowKey(p);
    const n = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const T = K.tonicPc;
    const at = (x: number) => n[(T + x) % 12];
    if (k === 0) return [chord(`${at(5)}maj7`), chord(`${at(2)}m7`)];
    if (k === 1) return [chord(`${at(7)}7sus4`), chord(`${at(7)}7`)];
    return [chord(`${at(0)}add9`)];
  }

  chordAt(bar: number, beat: number, p: Player): Chord {
    const k = bar - this.bowBar(p);
    if (k >= 0) return chordIn(this.cadenceChords(p, k), beat, this.beats);
    return super.chordAt(bar, beat, p);
  }

  compose(b: BarCtx): void {
    const k = b.bar - this.bowBar(b.p);
    if (k >= 0) {
      this.bow(b, k);
      return;
    }
    super.compose(b);
  }

  /** the bow: a broadened cadence, the big last chord, then a shimmering tail that sustains */
  private bow(b: BarCtx, k: number): void {
    const K = this.bowKey(b.p);
    const T = K.tonic;
    const cs = this.cadenceChords(b.p, k);
    const f: BarInfo = { bar: b.bar, sec: 'bow', i: k, n: 3, start: b.bar - k, occ: 0, chords: cs, chord: cs[0], next: cs[0], cycle: 0, pos: 0, last: k === 1, intro: false };
    const deg = (d: number) => K.deg(K.degreeOf(T) + d);
    if (k < 2) {
      // broadening: the second chord of each bar arrives a little late (a written ritardando)
      const late = k === 0 ? 2.15 : 2.35;
      const voice = (c: Chord, beat: number, lenBeats: number, vel: number) => {
        for (const m of chordTones(c, 50, 74).slice(0, 5)) this.play(b, { ...STRINGS(0.92), attack: 0.35, release: 0.9 }, 'strings', beat, m, vel, lenBeats * b.spb + 0.15);
        for (const m of chordTones(c, 55, 72).slice(0, 4)) this.play(b, { ...CHOIR('ah'), attack: 0.4, release: 0.9 }, 'choir', beat, m, vel * 0.85, lenBeats * b.spb + 0.15);
        this.play(b, SUB(), 'bass', beat, this.rootNear(c, 36), 0.45, lenBeats * b.spb);
        this.play(b, 'pizz', 'pizz', beat, this.rootNear(c, 40), 0.5, 1.5 * b.spb);
      };
      voice(cs[0], 0, late, 0.62);
      voice(cs[1], late, 4 - late + (k === 1 ? 0.5 : 0), 0.6);
      const mel = k === 0 ? [[0, 3, late], [late, 2, 1.8]] : [[0, 4, late], [late, 6, 1.8]];
      for (const [beat, d, len] of mel) {
        this.play(b, HORNLEAD(0.85), 'horn', beat, deg(d), 0.95, len * b.spb * 0.97);
        this.play(b, VIOLIN(0.9), 'violins', beat, deg(d) + 12, 0.6, len * b.spb * 0.97);
      }
      this.drum(b, 'taiko', 'kit', 'x.......x.......', 0.36, 33);
      if (k === 1) {
        this.roll(b, 'timp', 'timp', 1, 4.3, 9, 0.1, 0.62, deg(-3) - 12);
        for (let i = 0; i < 16; i++) this.play(b, 'harp', 'harp', 2.4 + i * 0.1, deg(-7 + i), 0.24, 1.4 * b.spb);
      }
      return;
    }
    if (k === 2) {
      // the last chord, a breath late, enormous, then ringing
      const at = 0.35;
      const ring = 7;
      const I = chord(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][K.tonicPc]);
      for (const m of [T - 24, T - 17, T - 12, T - 8, T - 5, T, T + 4, T + 7]) this.play(b, { ...STRINGS(1), attack: 0.08, release: 3.5 }, 'strings', at, m, 0.7, ring, undefined, 0.002);
      for (const m of [T - 12, T - 8, T - 5, T, T + 4, T + 7]) this.play(b, { ...CHOIR('ah'), attack: 0.25, release: 3.5 }, 'choir', at, m, 0.6, ring, undefined, 0.002);
      for (const m of [T - 24, T - 17, T - 12, T - 8, T - 5]) this.play(b, 'brass', 'brass', at, m, 0.5, 3, 1.5, 0.002);
      for (const m of [T - 12, T - 5, T]) this.play(b, { ...LOWBRASS(0.8), attack: 0.06, release: 3 }, 'brass', at, m, 0.6, ring - 1, undefined, 0.002);
      this.play(b, HORNLEAD(0.9), 'horn', at, T + 12, 1, ring - 2.5);
      this.play(b, VIOLIN(0.95), 'violins', at, T + 24, 0.62, ring - 2.5);
      this.play(b, 'timp', 'timp', at, T - 24 >= 36 ? T - 24 : T - 12, 0.8, 4, undefined, 0.001);
      b.p.hit('crash', 'kit', this.T(b, at, 0.001), 0.6);
      b.p.hit('gong', 'kit', this.T(b, at, 0.001), 0.3);
      this.play(b, 'taiko', 'kit', at, 29, 0.8, 2, undefined, 0.001);
      this.play(b, { ...SUB(), attack: 0.02, release: 3 }, 'bass', at, T - 36 >= 24 ? T - 36 : T - 24, 0.6, ring - 1, undefined, 0.001);
      this.play(b, 'tbell', 'bells', at + 0.02, T, 0.35, 7);
      chordTones(chord(`${I.sym}add9`), 77, 101).forEach((m, i) => this.play(b, 'glass', 'glass', at + 0.4 + i * 0.22, m, 0.2, 3.5, 2.5));
      return;
    }
    if (k < 4) return;
    // the tail: the tonic shimmering — high strings, glass, a harp glimmer — until the credits
    const fc: BarInfo = { ...f, chords: cs, chord: cs[0] };
    this.chords(b, fc, 'tail', { ...STRINGS(0.6), attack: 2.4, release: 3 }, 'strings', 60, 81, 4, 0.22, 1.2);
    if (k % 2 === 0) {
      const tones = chordTones(cs[0], 62, 96);
      for (let i = 0; i < 6 && tones.length; i++) this.play(b, 'harp', 'harp', 0.5 + i * 0.35, tones[(i * 2) % tones.length], 0.12, 1.6 * b.spb);
    }
    this.sparkle(b, fc, 'glass', 'glass', 2, 84, 100, 0.12);
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const s = f.sec;
    if (s === 'swell') {
      this.chords(b, f, 'str', { ...STRINGS(0.5 + 0.3 * f.i), attack: 1.8 }, 'strings', 53, 72, 4, 0.4 + 0.2 * f.i, 0.5);
      this.roll(b, 'timp', 'timp', f.i === 0 ? 2 : 0, 4, 6, 0.08 + 0.15 * f.i, 0.25 + 0.3 * f.i, note('C3'));
      const tones = chordTones(f.chord, 55, 93);
      if (f.i === 1) for (let k = 0; k < 16; k++) this.play(b, 'harp', 'harp', 2 + k / 8, tones[k % tones.length], 0.2 + 0.01 * k, 1.4 * b.spb);
      return;
    }
    if (s === 'turn' || s === 'turn2') {
      this.chords(b, f, 'str', STRINGS(0.85), 'strings', 50, 72, 5, 0.58, 0.4);
      this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, 0.42, 0.4);
      this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 1, 0.6], [2, 0, 1, 0.55]], 34);
      this.drum(b, 'taiko', 'kit', 'x...x...x...x...', 0.36, 33);
      if (f.i === 1) {
        this.roll(b, 'timp', 'timp', 0, 4, 8, 0.12, 0.6, this.root(f, 2, 40));
        const K = s === 'turn' ? this.keyG : this.key;
        for (let k = 0; k < 14; k++) this.play(b, 'harp', 'harp', 2 + k / 7, K.deg(K.degreeOf(K.tonic - 12) + k), 0.26, 1.4 * b.spb);
      }
      return;
    }
    const K = this.sectionKey(s);
    const isB = s === 'B' || s === 'B2';
    const bar = isB ? LEIT_B[f.i] : LEIT_A[f.i];
    const mel = (shift: number) => lineNotes(K, K.tonic, this.beats, [bar], { vel: 0.74, shift });
    const big = s === 'A2' || s === 'A3' || s === 'A4';
    const biggest = s === 'A4';
    // the melody: horns in octaves with the violins above (A); violins and oboe (B)
    if (isB) {
      this.notes(b, mel(12), VIOLIN(0.85), 'violins', 0.75, 0.97);
      this.notes(b, mel(0), OBOE(), 'oboe', 0.55, 0.97);
      if (s === 'B2') this.notes(b, mel(-12), CELLO(), 'horn2', 0.5, 0.97);
    } else {
      this.notes(b, mel(0), HORNLEAD(big ? 0.85 : 0.75), 'horn', 1, 0.97);
      this.notes(b, mel(-12), HORNLEAD(0.45), 'horn2', 0.55, 0.97);
      this.notes(b, mel(12), VIOLIN(0.9), 'violins', 0.66, 0.97);
    }
    // the descant (the choir's sopranos) over the biggest statements
    if (big && s !== 'A2') this.notes(b, lineNotes(K, K.tonic, this.beats, [DESCANT[f.i]], { vel: 0.7 }), 'choir', 'descant', 0.4, 1.0);
    // the orchestra and choir
    this.chords(b, f, 'str', STRINGS(0.85), 'strings', 50, 72, 4, big ? 0.6 : 0.54, 0.35);
    this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, big ? 0.54 : 0.46, 0.4);
    if (biggest || s === 'A3') this.chords(b, f, 'lb', LOWBRASS(0.6), 'brass', 48, 62, 3, 0.42, 0.3);
    // Grave's bass, Lira's harp, Bumbo's drum and the turtle's steps
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.62], [1, 3, 0.5, 0.4], [2, 2, 0.6, 0.52], [3, 3, 0.5, 0.4]], 34);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.42, b.beats * b.spb);
    this.ostinato(b, f, 'harp', 'harp', 60, 86, [0, 1, 2, 3, 4, 3, 2, 1], 0.34, 1.0, [0, 4]);
    this.drum(b, 'taiko', 'kit', 'x...x...x...x...', big ? 0.38 : 0.32, 33);
    if (f.i === 0 || f.i === 4 || big) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), big ? 0.52 : 0.46, 3, undefined, 0.002);
    // Chocalho's shaker, Dona Badalo's bells, Cristalina's crystal
    if (big || isB) this.drum(b, 'shaker', 'perc', 'o.x.o.x.o.x.o.x.', big ? 0.4 : 0.3);
    if (f.i === 0) {
      b.p.hit('crash', 'kit', this.T(b, 0, 0.001), biggest ? 0.48 : big ? 0.42 : 0.34);
      this.play(b, 'tbell', 'bells', 0, K.tonic, 0.32, 6);
    }
    if (f.i % 2 === 0 && big) this.play(b, 'tbell', 'bells', 0, this.root(f, 0, 55), 0.24, 5);
    if (f.i === 3 || f.i === 7) {
      const tones = chordTones(this.cAt(f, 2), 79, 98);
      for (let k = 0; k < 8 && tones.length; k++) this.play(b, k % 2 ? 'glass' : 'zap', 'glass', 2 + k * 0.25, tones[k % tones.length], 0.18, 0.7);
    }
    if (big) for (let k = 0; k < 2; k++) this.play(b, 'glass', 'glass', rand(0.5, 3.5), pick(chordTones(f.chord, 84, 98)), 0.16, 2.5);
    if (biggest && f.i === 0) b.p.hit('gong', 'kit', this.T(b, 0, 0.001), 0.2);
  }
}
