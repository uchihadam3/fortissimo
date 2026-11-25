/**
 * Story moods (docs/STORY.md): every `story:*` cue is a mood that starts on the next beat and
 * SUSTAINS — looping and evolving — until the next cue, so cutscenes can be re-timed freely.
 *
 * Moods are coloured by the land the story is in (a palette: its key and mode, its leitmotif, its
 * lead, plucked and bell instruments, its drum), so a "wonder" in the dunes has the oud and the
 * Hijaz colour and a "camp" on the ice has the celesta — and the whole score stays one family.
 *
 * Every mood honours a spotlight (joinMotif): while a rescued musician plays its motif, the mood
 * holds its tonic and steps back.
 */
import { SONGS, type WorldId } from '../../../sim/defs';
import { chordIn, Form, LEIT_A, LEIT_A_RICH_CHORDS, LEIT_B, LEIT_B_RICH_CHORDS, lineNotes, type BarInfo, type Line, type MNote } from '../compose';
import type { ReverbMode } from '../core';
import type { BarCtx, Player } from '../music';
import { CELLO, CHOIR, CLARINET, DRONE, FLUTE, GLASSHARM, HORNLEAD, LOWBRASS, ORGAN, PAD, REED, STRINGS, SUB, VIOLIN, type BufInst, type StackOpts } from '../synth';
import { chord, chordTones, type Chord, MODES, nearestChordTone, note, pcOf, Scale, transpose } from '../theory';
import { pick, rand } from '../util';
import { type Inst, Song } from './base';
import { SECTIONS as CIT } from './citadel';
import { SECTIONS as DES } from './desert';
import { SECTIONS as FOR } from './forge';
import { SECTIONS as ICE } from './ice';
import { SECTIONS as MEA } from './meadow';

// ═════════════════════════════ palettes ═════════════════════════════

export interface Palette {
  world: WorldId | null;
  /** the land's battle tempo */
  bpm: number;
  /** tonic of the melodies (MIDI) */
  tonic: number;
  /** the land's own mode, and the bright mode its happy moods use */
  mode: readonly number[];
  bright: readonly number[];
  /** progressions flavour for the magical moods */
  flavour: 'lydian' | 'hijaz' | 'dorian';
  A: Line;
  Achords: (string | string[])[];
  B: Line;
  Bchords: (string | string[])[];
  lead: Inst;
  leadShift: number;
  grace: number;
  pluck: BufInst;
  color: BufInst;
  drum: BufInst;
  reverb: ReverbMode;
  /** the land's great Voice */
  voice: 'horn' | 'bell' | 'harp' | 'organ' | 'carillon' | 'choir';
}

const sec = (list: { name: string; bars: (string | string[])[]; tune?: Line }[], name: string) => list.find((s) => s.name === name)!;

export function palette(world: WorldId | null): Palette {
  switch (world) {
    case 'meadow':
      return { world, bpm: SONGS.meadow.bpm, tonic: note('G4'), mode: MODES.major, bright: MODES.lydian, flavour: 'lydian', A: sec(MEA, 'A').tune!, Achords: sec(MEA, 'A').bars, B: sec(MEA, 'B').tune!, Bchords: sec(MEA, 'B').bars, lead: FLUTE(), leadShift: 12, grace: 0.35, pluck: 'guitar', color: 'celesta', drum: 'kick', reverb: 'hall', voice: 'bell' };
    case 'desert':
      return { world, bpm: SONGS.desert.bpm, tonic: note('D4'), mode: MODES.phrygianDominant, bright: MODES.major, flavour: 'hijaz', A: sec(DES, 'A').tune!, Achords: sec(DES, 'A').bars, B: sec(DES, 'B').tune!, Bchords: sec(DES, 'B').bars, lead: FLUTE(true), leadShift: 12, grace: 0.5, pluck: 'oud', color: 'tile', drum: 'dum', reverb: 'hall', voice: 'harp' };
    case 'ice':
      return { world, bpm: SONGS.ice.bpm, tonic: note('E4'), mode: MODES.lydian, bright: MODES.lydian, flavour: 'lydian', A: sec(ICE, 'A').tune!, Achords: sec(ICE, 'A').bars, B: sec(ICE, 'B').tune!, Bchords: sec(ICE, 'B').bars, lead: 'celesta', leadShift: 12, grace: 0, pluck: 'harp', color: 'glass', drum: 'kick', reverb: 'spire', voice: 'organ' };
    case 'forge':
      return { world, bpm: SONGS.forge.bpm, tonic: note('C4'), mode: MODES.aeolian, bright: MODES.major, flavour: 'dorian', A: sec(FOR, 'A').tune!, Achords: sec(FOR, 'A').bars, B: sec(FOR, 'B').tune!, Bchords: sec(FOR, 'B').bars, lead: HORNLEAD(0.45), leadShift: 0, grace: 0, pluck: 'pizz', color: 'anvil', drum: 'taiko', reverb: 'cave', voice: 'carillon' };
    case 'citadel':
      return { world, bpm: SONGS.citadel.bpm, tonic: note('D4'), mode: MODES.aeolian, bright: MODES.major, flavour: 'dorian', A: sec(CIT, 'A').tune!, Achords: sec(CIT, 'A').bars, B: sec(CIT, 'B').tune!, Bchords: sec(CIT, 'B').bars, lead: ORGAN(0.75), leadShift: 0, grace: 0, pluck: 'harpsi', color: 'tbell', drum: 'tom', reverb: 'cave', voice: 'choir' };
    default:
      return { world: null, bpm: SONGS.menu.bpm, tonic: note('F4'), mode: MODES.major, bright: MODES.major, flavour: 'lydian', A: LEIT_A, Achords: LEIT_A_RICH_CHORDS, B: LEIT_B, Bchords: LEIT_B_RICH_CHORDS, lead: HORNLEAD(0.6), leadShift: 0, grace: 0, pluck: 'harp', color: 'celesta', drum: 'taiko', reverb: 'hall', voice: 'horn' };
  }
}

const MAGIC: Record<Palette['flavour'], (string | string[])[]> = {
  lydian: ['Cmaj9', 'D/C', 'Cmaj9', 'D/C', 'Am9', 'Em7', 'Bm7', ['Dsus4', 'D']],
  hijaz: ['C', 'Db', 'C', 'C', 'Bbm', 'Fm', 'Db', 'C'],
  dorian: ['Cm9', 'F/C', 'Cm9', 'F/C', 'Ebmaj7', 'Bb', 'Gm7', ['Fsus4', 'F']],
};
const MAGIC_MODE: Record<Palette['flavour'], readonly number[]> = { lydian: MODES.lydian, hijaz: MODES.phrygianDominant, dorian: MODES.dorian };

// ═════════════════════════════ the mood base ═════════════════════════════

export abstract class Mood extends Song {
  /** the progression is written in C (or in absolute pitch when tx is set to 0) and transposed */
  protected abstract readonly prog: Form;
  protected get form(): Form {
    return this.prog;
  }
  protected tx = 0;
  /** soloist in the spotlight: the mood steps back on its tonic */
  protected quiet = false;
  private lastStart = -1;
  private readonly infos = new Map<number, BarInfo>();

  constructor(readonly P: Palette) {
    super();
  }

  /** the tonic chord the mood rests on under a soloist */
  protected tonicChord(): Chord {
    const minor = this.key.steps[2] === 3;
    return chord(`${['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][this.key.tonicPc]}${minor ? 'm' : ''}`);
  }

  protected tr(f: BarInfo): BarInfo {
    if (!this.tx) return f;
    let o = this.infos.get(f.bar);
    if (o) return o;
    const t = (c: Chord) => transpose(c, this.tx);
    o = { ...f, chords: f.chords.map(t), chord: t(f.chord), next: t(f.next) };
    if (this.infos.size > 256) this.infos.clear();
    this.infos.set(f.bar, o);
    return o;
  }

  chordAt(bar: number, beat: number, p: Player): Chord {
    if (p.inSpotlight(bar)) return this.tonicChord();
    return chordIn(this.tr(this.prog.at(bar)).chords, beat, this.beats);
  }

  compose(b: BarCtx): void {
    const f0 = this.prog.at(b.bar);
    this.quiet = b.p.inSpotlight(b.bar);
    const f = this.quiet ? { ...this.tr(f0), chords: [this.tonicChord()], chord: this.tonicChord() } : this.tr(f0);
    if (f.start !== this.lastStart) {
      this.lastStart = f.start;
      this.lines = {};
      this.vmul = this.energy[f.sec] ?? 1;
      this.onSection(b, f);
    }
    if (this.quiet) this.under(b, f);
    else this.arrange(b, f);
  }

  /** what the mood plays under a soloist (default: its pad, softly, on the tonic) */
  protected under(b: BarCtx, f: BarInfo): void {
    this.chords(b, f, 'under', PAD(1000), this.padCh, 50, 65, 3, 0.3, 0.6);
  }
  protected padCh = 'pad';

  /** notes of `line` bar `bi` in a scale (beats relative to the bar) */
  protected bar(line: Line, bi: number, k: Scale, shift = 0, vel = 0.72): MNote[] {
    const bar = line[((bi % line.length) + line.length) % line.length];
    return bar ? lineNotes(k, k.tonic, this.beats, [bar], { vel, shift }) : [];
  }

  /** strong-beat notes that clash with the chord of their beat move to its nearest chord tone */
  protected fit(notes: MNote[], f: BarInfo): MNote[] {
    return notes.map((n) => {
      const c = this.cAt(f, n.beat);
      const strong = n.beat % 1 === 0 || n.dur >= 1;
      if (!strong || c.pcs.includes(pcOf(n.midi))) return n;
      return { ...n, midi: nearestChordTone(c, n.midi) };
    });
  }

  /** the root of a chord nearest to `around` */
  protected rootNear(c: Chord, around: number): number {
    let m = around - 6;
    while (pcOf(m) !== c.root) m++;
    return m;
  }

  protected sparkle(b: BarCtx, f: BarInfo, inst: BufInst, ch: string, n: number, lo: number, hi: number, vel: number): void {
    for (let k = 0; k < n; k++) {
      const beat = rand(0.2, b.beats - 0.4);
      const tones = chordTones(this.cAt(f, beat), lo, hi);
      if (tones.length) this.play(b, inst, ch, beat, pick(tones), vel * rand(0.8, 1.1), 2);
    }
  }
}

const keyOf = (p: Palette, mode: readonly number[]): Scale => new Scale(p.tonic, mode);
const txOf = (k: Scale): number => k.tonicPc;

// ═════════════════════════════ WONDER ═════════════════════════════

/** gentle, magical: harp (oud, celesta…) arpeggios, a soft pad, sparkles, the land's head on a soft lead */
export class WonderMood extends Mood {
  readonly level: number = 0.89;
  readonly bpm = 76;
  readonly key: Scale;
  readonly reverb: ReverbMode;
  readonly warm: [BufInst, number, number][];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, MAGIC_MODE[P.flavour]);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'w', bars: MAGIC[P.flavour] }], [], ['w']);
    this.reverb = P.reverb === 'cave' ? 'hall' : P.reverb;
    this.warm = [[P.pluck, 45, 84], [P.color, 76, 100], ['celesta', 76, 100], ['glass', 79, 100], ['choiroo', 55, 72]];
  }
  setup(p: Player): void {
    p.ch('pad', { gain: 0.4, wet: 0.55, filterLfoHz: 260, filterLfoRate: 0.05 });
    p.ch('pluck', { gain: 0.42, wet: 0.45, pan: -0.22 });
    p.ch('cel', { gain: 0.26, wet: 0.6, pan: 0.25 });
    p.ch('lead', { gain: 0.5, wet: 0.55, vibratoCents: 10, vibratoRate: 5, pan: 0.1 });
    p.ch('glass', { gain: 0.22, wet: 0.7, pan: -0.3 });
    p.ch('choir', { gain: 0.3, wet: 0.6 });
    p.ch('bass', { gain: 0.36, wet: 0.1 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const P = this.P;
    const cyc = f.cycle;
    this.chords(b, f, 'pad', PAD(1300), 'pad', 52, 69, 3, 0.42, 0.8);
    if (f.i % 2 === 0) this.play(b, SUB(), 'bass', 0, this.root(f, 0, 33), 0.26, 2 * b.beats * b.spb);
    const lo = P.pluck === 'oud' ? 50 : P.pluck === 'harpsi' ? 53 : 55;
    this.ostinato(b, f, P.pluck, 'pluck', lo, lo + 24, [0, 2, 4, 3, 1, 3, 2, 4], P.pluck === 'harp' || P.pluck === 'guitar' ? 0.3 : 0.24, 1.4, [0, 4], 0.08);
    // the land's head, as a question (bars 2–3) and its answer an octave up (bars 6–7)
    if (f.i === 2 || f.i === 3) this.notes(b, this.fit(this.bar(P.A, f.i - 2, this.key, 12, 0.66), f), P.color === 'anvil' || P.color === 'tbell' ? 'celesta' : P.color === 'tile' ? 'celesta' : P.color, 'cel', 1, 1.2);
    if (f.i === 6 || f.i === 7) {
      const lead: Inst = typeof P.lead === 'string' ? 'glass' : cyc % 2 === 0 ? FLUTE() : P.lead;
      this.notes(b, this.fit(this.bar(P.A, f.i - 6, this.key, 12, 0.66), f), lead, typeof lead === 'string' ? 'glass' : 'lead', typeof lead === 'string' ? 0.7 : 0.85, 1.0);
    }
    this.sparkle(b, f, 'glass', 'glass', f.i % 2 ? 2 : 1, 84, 98, 0.16);
    if (cyc >= 1) this.chords(b, f, 'cho', 'choiroo', 'choir', 57, 69, 3, 0.12 + 0.02 * Math.min(2, cyc), 0.8);
  }
}

// ═════════════════════════════ FROZEN ═════════════════════════════

/** eerie stillness: a suspended cluster over a pedal, a frozen music-box note, a slow clock */
export class FrozenMood extends Mood {
  readonly level: number = 1.26;
  readonly bpm = 60;
  readonly key: Scale;
  readonly reverb: ReverbMode = 'spire';
  readonly warm: [BufInst, number, number][] = [['mbox', 72, 96], ['glass', 79, 100], ['tick', 60, 60], ['bell', 30, 50]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, MODES.aeolian);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'f', bars: ['Csus2', 'Csus2', 'Db/C', 'Csus2', 'Csus2', 'Fm/C', 'Db/C', 'Csus2'] }], [], ['f']);
  }
  setup(p: Player): void {
    p.ch('pad', { gain: 0.34, wet: 0.6, filterLfoHz: 120, filterLfoRate: 0.03 });
    p.ch('drone', { gain: 0.36, wet: 0.4 });
    p.ch('box', { gain: 0.34, wet: 0.55, pan: 0.2 });
    p.ch('glass', { gain: 0.2, wet: 0.75, pan: -0.3 });
    p.ch('tick', { gain: 0.16, wet: 0.4, pan: 0.35 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    if (f.i % 4 === 0) this.play(b, DRONE(260), 'drone', 0, this.tone(f.chord, 26, 0) + 12, 0.6, 4.4 * b.beats * b.spb);
    this.chords(b, f, 'pad', { ...GLASSHARM(), attack: 2.5, release: 3 }, 'pad', 67, 84, 3, 0.32, 1.5);
    // the stuck note: the first note of the land's tune, repeated, a little out of tune, slowing
    const m = this.bar(this.P.A, 0, this.key, 12)[0]?.midi ?? this.key.tonic + 12;
    const reps = f.i % 2 === 0 ? 3 : 2;
    for (let k = 0; k < reps; k++) b.p.buf('mbox', 'box', this.T(b, k * (1.1 + k * 0.25), 0.02), m, (0.32 - k * 0.07) * this.vmul, 1.4, { cents: rand(-14, 6), release: 1 });
    for (let k = 0; k < 4; k++) b.p.hit('tick', 'tick', this.T(b, k, 0.003), (k === 0 ? 0.3 : 0.18) * this.vmul, k % 2 ? 57 : 62);
    if (f.i % 4 === 2) this.play(b, 'glass', 'glass', 2.5, nearestChordTone(this.cAt(f, 2.5), m + 13), 0.12, 3);
  }
}

// ═════════════════════════════ WAKE ═════════════════════════════

/** warm release: the swell (first bar) and then a glowing major hymn with the land's head on a warm lead */
export class WakeMood extends Mood {
  readonly level: number = 1.0;
  readonly bpm = 84;
  readonly key: Scale;
  readonly reverb: ReverbMode;
  readonly warm: [BufInst, number, number][] = [['harp', 48, 93], ['choir', 55, 72], ['celesta', 76, 100], ['timp', 39, 53], ['glass', 79, 100]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, P.bright === MODES.lydian ? MODES.lydian : MODES.major);
    this.tx = txOf(this.key);
    this.reverb = P.reverb === 'cave' ? 'hall' : P.reverb;
    this.prog = new Form(
      [
        { name: 'swell', bars: ['Csus2'] },
        { name: 'glow', bars: ['Cadd9', 'F/C', 'Am7', ['Fmaj7', 'G'], 'Cadd9', 'F/C', 'Dm7', ['Gsus4', 'G']] },
      ],
      ['swell'],
      ['glow'],
    );
  }
  setup(p: Player): void {
    p.ch('strings', { gain: 0.48, wet: 0.5, vibratoCents: 8 });
    p.ch('harp', { gain: 0.38, wet: 0.5, pan: -0.25 });
    p.ch('lead', { gain: 0.5, wet: 0.45, vibratoCents: 6, pan: 0.08 });
    p.ch('choir', { gain: 0.36, wet: 0.6, vibratoCents: 5 });
    p.ch('cel', { gain: 0.24, wet: 0.6, pan: 0.3 });
    p.ch('bass', { gain: 0.38, wet: 0.08 });
    p.ch('timp', { gain: 0.42, wet: 0.35 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    if (f.sec === 'swell') {
      this.chords(b, f, 'str', { ...STRINGS(0.7), attack: 2.6 }, 'strings', 52, 76, 5, 0.6, 1.2);
      const tones = chordTones(f.chord, 50, 96);
      for (let k = 0; k < 20; k++) this.play(b, 'harp', 'harp', 1.2 + k * 0.13, tones[k % tones.length], 0.16 + 0.012 * k, 1.6 * b.spb);
      this.roll(b, 'timp', 'timp', 1, 4, 5, 0.05, 0.34, this.tone(f.chord, 40, 0));
      return;
    }
    this.chords(b, f, 'str', STRINGS(0.65), 'strings', 52, 72, 4, 0.48, 0.5);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 31), 0.32, b.beats * b.spb);
    this.ostinato(b, f, 'harp', 'harp', 55, 81, [0, 1, 2, 3, 4, 3, 2, 1], 0.24, 1.2, [0, 4], 0.05);
    // the land's song, warmed into the major: the head and its answer, then again higher
    const bi = f.i % 4;
    if (bi < 2) {
      const lead: Inst = f.cycle % 2 === 0 ? HORNLEAD(0.5) : CELLO();
      this.notes(b, this.fit(this.bar(this.P.A, bi, this.key, f.i >= 4 ? 7 : 0, 0.7), f), lead, 'lead', 0.85, 0.97);
    }
    if (f.i % 2 === 1) this.chords(b, f, 'cho', 'choir', 'choir', 57, 72, 3, 0.16, 0.6);
    if (f.i === 3 || f.i === 7) this.sparkle(b, f, 'celesta', 'cel', 3, 79, 96, 0.2);
    if (f.i === 0) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.3, 3);
  }
}

// ═════════════════════════════ JOIN ═════════════════════════════

/** a happy little march: pizzicato, snare, glockenspiel and the leitmotif's head on clarinet and flute */
export class JoinMood extends Mood {
  readonly level: number = 1.12;
  readonly bpm = 112;
  readonly key: Scale;
  readonly warm: [BufInst, number, number][] = [['pizz', 31, 74], ['snare', 60, 60], ['celesta', 76, 100], ['tamb', 60, 60], ['kick', 60, 60], ['wood', 60, 90]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, MODES.major);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'm', bars: ['C', ['Dm7', 'G7'], 'C', 'G', 'C', ['F', 'G'], ['Am', 'D7'], ['G7', 'C']] }], [], ['m']);
  }
  setup(p: Player): void {
    p.ch('pizz', { gain: 0.6, wet: 0.2, pan: -0.12 });
    p.ch('chick', { gain: 0.32, wet: 0.22, pan: 0.18 });
    p.ch('kit', { gain: 0.42, wet: 0.14 });
    p.ch('glock', { gain: 0.26, wet: 0.4, pan: 0.3 });
    p.ch('clar', { gain: 0.5, wet: 0.32, vibratoCents: 6, pan: 0.08 });
    p.ch('flute', { gain: 0.46, wet: 0.36, vibratoCents: 12, pan: -0.1 });
    p.ch('pad', { gain: 0.26, wet: 0.4 });
  }
  protected under(b: BarCtx, f: BarInfo): void {
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.5], [2, 2, 0.6, 0.4]], 36);
    this.drum(b, 'kick', 'kit', 'x...x...x...x...', 0.22);
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.62], [1, 2, 0.4, 0.42], [2, 0, 0.6, 0.54], [3, 2, 0.4, 0.42]], 36);
    for (const beat of [0.5, 1.5, 2.5, 3.5]) for (const m of chordTones(this.cAt(f, beat), 60, 72).slice(0, 3)) this.play(b, 'pizz', 'chick', beat, m, 0.3, 0.25 * b.spb);
    this.drum(b, 'kick', 'kit', 'x...x...x...x...', 0.32);
    this.drum(b, 'snare', 'kit', f.i % 4 === 3 ? '....x.x.x.xoxoxx' : '....x..o....x...', 0.26);
    this.drum(b, 'tamb', 'kit', '..x...x...x...x.', 0.24);
    // the head of the leitmotif, bounced (clarinet), the flute answering
    const head: Line = [[[0, 0.5], [4, 0.5], [4, 0.5], [null, 0.5], [3, 0.5], [2, 0.5], [null, 1]], [[1, 0.5], [null, 0.5], [2, 0.5], [3, 0.5], [4, 1], [null, 1]]];
    if (f.i % 4 < 2) this.notes(b, this.fit(this.bar(head, f.i % 4, this.key, f.i >= 4 ? 7 : 0, 0.75), f), f.i >= 4 ? FLUTE() : CLARINET(), f.i >= 4 ? 'flute' : 'clar', 0.85, 0.7);
    if (f.i % 2 === 1) {
      const tones = chordTones(this.cAt(f, 2), 79, 96);
      [2, 2.5, 3, 3.5].forEach((beat, k) => tones.length && this.play(b, 'celesta', 'glock', beat, tones[(k * 2) % tones.length], 0.22, 0.8 * b.spb));
    }
    if (f.cycle >= 1 && f.i % 2 === 0) this.chords(b, f, 'pad', PAD(1600), 'pad', 55, 67, 3, 0.3, 0.4);
  }
}

// ═════════════════════════════ THREAT ═════════════════════════════

/** dark: a low pedal and its minor second, tremolo low strings, a brass swell, distant taiko */
export class ThreatMood extends Mood {
  readonly level: number = 1.2;
  readonly bpm = 70;
  readonly key: Scale;
  readonly reverb: ReverbMode = 'cave';
  readonly warm: [BufInst, number, number][] = [['taiko', 28, 40], ['brass', 36, 60], ['timp', 36, 50], ['gong', 60, 60]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, MODES.phrygian);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 't', bars: ['Cm', 'Db/C', 'Cm', 'Bbm/C', 'Cm', 'Db/C', 'Abmaj7/C', 'Db/C'] }], [], ['t']);
  }
  setup(p: Player): void {
    p.ch('drone', { gain: 0.42, wet: 0.35, filterLfoHz: 100, filterLfoRate: 0.06 });
    p.ch('trem', { gain: 0.34, wet: 0.4, tremolo: 0.5, tremoloRate: 9 });
    p.ch('brass', { gain: 0.34, wet: 0.45 });
    p.ch('drums', { gain: 0.42, wet: 0.35 });
    p.ch('cello', { gain: 0.48, wet: 0.4, vibratoCents: 6 });
    p.ch('bass', { gain: 0.4, wet: 0.08 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    if (f.i % 4 === 0) {
      const r = this.tone(f.chord, 26, 0);
      this.play(b, DRONE(300), 'drone', 0, r, 0.7, 4.3 * b.beats * b.spb);
      this.play(b, DRONE(260), 'drone', 0.1, r + 13, 0.32, 4.3 * b.beats * b.spb);
    }
    this.chords(b, f, 'tr', STRINGS(0.25), 'trem', 43, 58, 3, 0.42, 0.3);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 26), 0.36, b.beats * b.spb);
    if (f.i % 2 === 1) this.chords(b, f, 'sw', { ...LOWBRASS(0.4), attack: 2.4, release: 1.2 }, 'brass', 46, 60, 3, 0.48, 0.2);
    const pat = ['x.......', 'x.....x.', 'x.......', 'x...x.x.'][f.i % 4];
    this.drum(b, 'taiko', 'drums', pat, 0.5, 30);
    // the head, in the low cello, darkened (Phrygian)
    if (f.i >= 4 && f.i < 6) this.notes(b, this.bar(this.P.A, f.i - 4, this.key, -12, 0.7), CELLO(), 'cello', 0.9, 0.97);
    if (f.i === 7 && f.cycle % 2 === 1) b.p.hit('gong', 'drums', this.T(b, 0, 0.001), 0.2);
  }
}

// ═════════════════════════════ SHARD ═════════════════════════════

/** magic rising: arpeggios climbing through a rising sequence, shimmering, a choir lifting */
export class ShardMood extends Mood {
  readonly level: number = 1.26;
  readonly bpm = 88;
  readonly key: Scale;
  readonly reverb: ReverbMode = 'spire';
  readonly warm: [BufInst, number, number][] = [['harp', 48, 100], ['celesta', 72, 100], ['glass', 79, 104], ['choiroo', 52, 76], ['timp', 39, 53]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, MODES.major);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 's', bars: ['Cadd9', 'Dm9', 'Em7', 'Fmaj9', 'Gsus2', 'Am9', 'Bbmaj9', ['Csus2', 'C']] }], [], ['s']);
  }
  setup(p: Player): void {
    p.ch('shimmer', { gain: 0.24, wet: 0.7, tremolo: 0.12, tremoloRate: 4 });
    p.ch('harp', { gain: 0.4, wet: 0.5, pan: -0.2 });
    p.ch('cel', { gain: 0.24, wet: 0.6, pan: 0.25 });
    p.ch('choir', { gain: 0.32, wet: 0.6 });
    p.ch('strings', { gain: 0.4, wet: 0.5, vibratoCents: 8 });
    p.ch('timp', { gain: 0.36, wet: 0.4 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const lift = f.i / 7;
    this.chords(b, f, 'sh', GLASSHARM(), 'shimmer', 72, 88, 3, 0.2 + 0.1 * lift, 0.8);
    this.chords(b, f, 'str', { ...STRINGS(0.5 + 0.4 * lift), attack: 1.4 }, 'strings', 55 + f.i, 72 + f.i, 3, 0.3 + 0.2 * lift, 0.5);
    const tones = chordTones(f.chord, 50 + f.i * 2, 96);
    const n = 12;
    for (let k = 0; k < n && tones.length; k++) this.play(b, 'harp', 'harp', (k * b.beats) / n, tones[k % tones.length], 0.16 + 0.1 * (k / n), 1.2 * b.spb, undefined, 0.002);
    this.sparkle(b, f, 'celesta', 'cel', 2, 84, 100, 0.18);
    this.chords(b, f, 'cho', 'choiroo', 'choir', 57 + Math.floor(f.i / 2), 72 + Math.floor(f.i / 2), 3, 0.12 + 0.08 * lift, 0.7);
    if (f.last) this.roll(b, 'timp', 'timp', 2, 4, 6, 0.06, 0.36, this.tone(f.next, 40, 0));
  }
}

// ═════════════════════════════ GLORY (story:voice) ═════════════════════════════

/** a land's great Voice rings: its leitmotif in full glory — orchestra, choir and the Voice itself */
export class GloryMood extends Mood {
  readonly level: number = 1.0;
  readonly bpm: number;
  readonly key: Scale;
  readonly reverb: ReverbMode;
  readonly warm: [BufInst, number, number][] = [['harp', 45, 96], ['timp', 36, 53], ['crash', 60, 60], ['tbell', 48, 76], ['bell', 30, 60], ['choir', 50, 76], ['brass', 40, 66], ['glass', 79, 100], ['anvil', 72, 96], ['taiko', 28, 40], ['pizz', 30, 60], ['gong', 60, 60]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.bpm = P.world === 'citadel' || P.world === 'forge' ? 96 : P.bpm - 8;
    this.key = keyOf(P, P.mode);
    this.tx = 0;
    this.reverb = P.reverb === 'cave' ? 'hall' : P.reverb;
    this.prog = new Form(
      [
        { name: 'A', bars: P.Achords },
        { name: 'B', bars: P.Bchords },
      ],
      [],
      ['A', 'B', 'A'],
    );
  }
  setup(p: Player): void {
    p.ch('strings', { gain: 0.48, wet: 0.45, vibratoCents: 8 });
    p.ch('horn', { gain: 0.6, wet: 0.45, vibratoCents: 5 });
    p.ch('horn2', { gain: 0.42, wet: 0.45, vibratoCents: 4, pan: -0.15 });
    p.ch('violins', { gain: 0.5, wet: 0.48, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('lead', { gain: 0.5, wet: 0.45, vibratoCents: 10, pan: 0.2 });
    p.ch('choir', { gain: 0.42, wet: 0.55, vibratoCents: 5 });
    p.ch('harp', { gain: 0.36, wet: 0.45, pan: -0.28 });
    p.ch('timp', { gain: 0.5, wet: 0.35 });
    p.ch('kit', { gain: 0.42, wet: 0.3 });
    p.ch('voice', { gain: 0.34, wet: 0.6, pan: 0.1 });
    p.ch('bass', { gain: 0.44, wet: 0.06 });
    p.ch('pizz', { gain: 0.5, wet: 0.24, pan: -0.1 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const P = this.P;
    const tune = f.sec === 'A' ? P.A : P.B;
    const mel = (shift: number) => this.bar(tune, f.i, this.key, shift, 0.74);
    const second = f.occ % 2 === 1;
    this.notes(b, mel(0), HORNLEAD(0.8), 'horn', 0.95, 0.97);
    this.notes(b, mel(-12), HORNLEAD(0.45), 'horn2', 0.55, 0.97);
    this.notes(b, mel(12), VIOLIN(0.9), 'violins', 0.62, 0.97);
    if (second || f.sec === 'B') this.notes(b, mel(P.leadShift), P.lead, 'lead', typeof P.lead === 'string' ? 0.4 : 0.6, 1.0);
    this.chords(b, f, 'str', STRINGS(0.85), 'strings', 50, 72, 4, 0.56, 0.35);
    this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, 0.46, 0.4);
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.6], [1, 3, 0.5, 0.4], [2, 2, 0.6, 0.5], [3, 3, 0.5, 0.4]], 34);
    this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.4, b.beats * b.spb);
    this.ostinato(b, f, 'harp', 'harp', 57, 86, [0, 1, 2, 3, 4, 3, 2, 1], 0.32, 1.0, [0, 4]);
    // the steps of the turtle, the drum tuned to the land's tonic
    let step = 27;
    while (pcOf(step) !== this.key.tonicPc) step++;
    this.drum(b, 'taiko', 'kit', 'x...x...x...x...', 0.36, step);
    if (f.i === 0 || f.i === 4) {
      this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.5, 3);
      if (f.i === 0) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.32);
    }
    if (f.last) this.roll(b, 'timp', 'timp', 2, 4, 6, 0.1, 0.45, this.tone(f.next, 40, 0));
    // the Voice itself
    if (f.i % 2 === 0) {
      const r = this.root(f, 0, 43);
      switch (P.voice) {
        case 'bell': this.play(b, 'bell', 'voice', 0, r, 0.5, 7); break;
        case 'carillon': this.play(b, 'tbell', 'voice', 0, r + 12, 0.42, 6); this.play(b, 'anvil', 'voice', 2, this.tone(f.chord, 76, 0), 0.2, 2); break;
        case 'organ': this.chords(b, f, 'org', ORGAN(0.6), 'voice', 48, 67, 4, 0.5, 0.3); break;
        case 'harp': {
          const tones = chordTones(this.cAt(f, 2), 48, 96);
          for (let k = 0; k < 16 && tones.length; k++) this.play(b, 'harp', 'voice', 2 + k / 8, tones[k % tones.length], 0.2 + 0.01 * k, 1.4 * b.spb);
          break;
        }
        case 'choir': this.chords(b, f, 'vch', 'choir', 'voice', 62, 79, 3, 0.36, 0.5); break;
        default: this.play(b, 'tbell', 'voice', 0, r + 12, 0.36, 6);
      }
    }
    if (f.last || f.i === 3) this.sparkle(b, f, 'glass', 'voice', 4, 84, 100, 0.16);
  }
}

// ═════════════════════════════ CAMP ═════════════════════════════

/** a 3/4 lullaby around the Heart: plucked arpeggios, a soft flute, a little shaker, warm bass */
const LULLABY: Line = [
  [[0, 1], [4, 2]],
  [[3, 1], [2, 1], [1, 1]],
  [[2, 2], [0, 1]],
  [[1, 3]],
  [[5, 1], [7, 2]],
  [[7, 1], [5, 1], [4, 1]],
  [[3, 1], [2, 1], [1, 1]],
  [[0, 3]],
];

export class CampMood extends Mood {
  readonly level: number = 1.06;
  readonly bpm = 84;
  readonly beats = 3;
  readonly key: Scale;
  readonly warm: [BufInst, number, number][];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, P.bright === MODES.lydian && P.world === 'ice' ? MODES.lydian : MODES.major);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'l', bars: ['C', 'G7/B', 'Am', 'G', 'F', 'Am7', 'G7', 'C'] }], [], ['l']);
    this.warm = [[P.pluck === 'pizz' || P.pluck === 'harpsi' ? 'harp' : P.pluck, 45, 84], ['shaker', 60, 60], ['celesta', 76, 98]];
  }
  setup(p: Player): void {
    p.ch('pluck', { gain: 0.44, wet: 0.4, pan: -0.2 });
    p.ch('lead', { gain: 0.5, wet: 0.45, vibratoCents: 11, vibratoRate: 5, pan: 0.12 });
    p.ch('pad', { gain: 0.3, wet: 0.5, filterLfoHz: 150, filterLfoRate: 0.05 });
    p.ch('shaker', { gain: 0.16, wet: 0.2, pan: 0.3 });
    p.ch('bass', { gain: 0.4, wet: 0.1 });
    p.ch('cel', { gain: 0.2, wet: 0.55, pan: 0.3 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const P = this.P;
    const pluck: BufInst = P.pluck === 'pizz' || P.pluck === 'harpsi' ? 'harp' : P.pluck;
    this.chords(b, f, 'pad', PAD(1000), 'pad', 52, 65, 3, 0.32, 0.8);
    this.play(b, 'pizz', 'bass', 0, this.root(f, 0, 36), 0.5, 2 * b.spb);
    const tones = chordTones(f.chord, 52, 72);
    [0, 1, 2].forEach((beat, k) => tones.length && this.play(b, pluck, 'pluck', beat, tones[(k * 2 + (f.i % 2)) % tones.length], k === 0 ? 0.32 : 0.24, 1.6 * b.spb, undefined, 0.01));
    this.drum(b, 'shaker', 'shaker', '..x.x.', 0.34);
    const lead: Inst = f.cycle % 2 === 0 ? FLUTE() : typeof P.lead === 'string' ? P.lead : CLARINET();
    this.notes(b, this.fit(this.bar(LULLABY, f.i, this.key, 12, 0.66), f), lead, typeof lead === 'string' ? 'cel' : 'lead', typeof lead === 'string' ? 0.9 : 0.8, 1.0);
    if (f.cycle >= 1 && f.i % 4 === 3) this.sparkle(b, f, 'celesta', 'cel', 2, 79, 96, 0.14);
  }
}

// ═════════════════════════════ MEMORY ═════════════════════════════

/** a memory of the Silence: a broken music box plays the leitmotif in the minor, slowing, breaking off */
export class MemoryMood extends Mood {
  readonly level: number = 1.45;
  readonly bpm = 66;
  readonly key: Scale;
  readonly reverb: ReverbMode = 'spire';
  readonly warm: [BufInst, number, number][] = [['mbox', 70, 98], ['celesta', 72, 98], ['tick', 60, 60]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = new Scale(P.tonic, MODES.aeolian);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'm', bars: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', ['Fm', 'Db'], 'G'] }], [], ['m']);
  }
  setup(p: Player): void {
    p.ch('box', { gain: 0.4, wet: 0.55, pan: 0.15 });
    p.ch('pad', { gain: 0.3, wet: 0.6, filterLfoHz: 90, filterLfoRate: 0.04 });
    p.ch('swell', { gain: 0.3, wet: 0.6 });
    p.ch('cel', { gain: 0.22, wet: 0.65, pan: -0.25 });
    p.ch('tick', { gain: 0.14, wet: 0.35, pan: 0.3 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    this.chords(b, f, 'pad', PAD(700), 'pad', 48, 62, 3, 0.36, 1);
    // every pass breaks at a different bar (then rewinds: a few ticks of the crank)
    const breakAt = [5, 3, 7, 2][f.cycle % 4];
    if (f.i < breakAt) {
      const notes = this.bar(LEIT_A, f.i, this.key, 12, 0.62);
      const slow = 1 + 0.05 * f.i;
      notes.forEach((n, k) => {
        const last = f.i === breakAt - 1 && k === notes.length - 1;
        b.p.buf('mbox', 'box', this.T(b, Math.min(3.8, n.beat * slow + rand(0, 0.06)), 0.01), n.midi, n.vel * (0.42 - 0.02 * f.i) * this.vmul, last ? 0.3 : n.dur * b.spb, { cents: -5 * f.i + rand(-10, 10) - (last ? 40 : 0), release: last ? 0.1 : 1 });
      });
    } else if (f.i === breakAt) {
      for (let k = 0; k < 6; k++) b.p.hit('tick', 'tick', this.T(b, 1 + k * 0.33, 0.01), 0.2 + 0.03 * k, 66 + k);
    }
    if (f.i % 4 === 1) this.chords(b, f, 'sw', { ...STRINGS(0.3), attack: 3.2, release: 0.3 }, 'swell', 55, 67, 3, 0.36, -0.2);
    if (f.i === 7) this.play(b, 'celesta', 'cel', 2, this.tone(this.cAt(f, 2), 79, 0), 0.2, 3);
  }
}

// ═════════════════════════════ JOURNEY ═════════════════════════════

/** moving on: a light travelling theme — footsteps, a walking pizzicato, the land's pluck, its tune lightened */
export class JourneyMood extends Mood {
  readonly level: number = 1.4;
  readonly bpm = 100;
  readonly key: Scale;
  readonly warm: [BufInst, number, number][];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, P.mode);
    this.tx = 0;
    this.prog = new Form([{ name: 'A', bars: P.Achords }, { name: 'B', bars: P.Bchords }], [], ['A', 'B']);
    this.warm = [['pizz', 31, 70], [P.pluck, 45, 84], ['kick', 60, 60], ['shaker', 60, 60], [P.color, 76, 100]];
  }
  setup(p: Player): void {
    p.ch('pizz', { gain: 0.56, wet: 0.2, pan: -0.1 });
    p.ch('pluck', { gain: 0.34, wet: 0.3, pan: 0.2 });
    p.ch('kit', { gain: 0.34, wet: 0.14 });
    p.ch('shaker', { gain: 0.16, wet: 0.18, pan: 0.3 });
    p.ch('lead', { gain: 0.44, wet: 0.36, vibratoCents: 10, pan: -0.06 });
    p.ch('pad', { gain: 0.3, wet: 0.4 });
    p.ch('color', { gain: 0.2, wet: 0.5, pan: 0.32 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    const P = this.P;
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.6], [1, 2, 0.5, 0.42], [2, 0, 0.6, 0.52], [3, 3, 0.5, 0.42]], 36);
    this.drum(b, 'kick', 'kit', 'x...x...x...x...', 0.3);
    this.drum(b, 'shaker', 'shaker', 'o.x.o.x.o.x.o.x.', 0.4);
    this.ostinato(b, f, P.pluck === 'harpsi' ? 'harp' : P.pluck, 'pluck', 50, 72, [0, 2, 1, 2, 0, 2, 1, 3], 0.26, 0.8, [0, 4]);
    if (f.i % 2 === 0) this.chords(b, f, 'pad', PAD(1300), 'pad', 52, 66, 3, 0.3, 0.5);
    const tune = f.sec === 'A' ? P.A : P.B;
    const lead: Inst = typeof P.lead === 'string' ? CLARINET() : f.sec === 'A' ? CLARINET() : P.lead;
    if (f.cycle > 0 || f.sec === 'B' || f.i >= 2) this.notes(b, this.bar(tune, f.i, this.key, P.leadShift, 0.66), lead, 'lead', 0.75, 0.75);
    if (f.i === 7) this.sparkle(b, f, P.color === 'tbell' ? 'celesta' : P.color, 'color', 2, 79, 98, 0.18);
  }
}

// ═════════════════════════════ DREAD ═════════════════════════════

/** the Citadel: an organ pedal, a low choir, a slow chromatic descent, a distant bell */
export class DreadMood extends Mood {
  readonly level: number = 1.0;
  readonly bpm = 56;
  readonly key: Scale;
  readonly reverb: ReverbMode = 'cave';
  readonly warm: [BufInst, number, number][] = [['tbell', 45, 64], ['choiroo', 45, 64]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = new Scale(P.tonic, MODES.aeolian);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'd', bars: ['Cm', 'Cm/B', 'Cm/Bb', 'F/A', 'Abmaj7', 'Fm/Ab', 'G7sus4', 'G'] }], [], ['d']);
  }
  setup(p: Player): void {
    p.ch('organ', { gain: 0.36, wet: 0.5 });
    p.ch('choir', { gain: 0.34, wet: 0.6 });
    p.ch('cello', { gain: 0.42, wet: 0.45, vibratoCents: 5 });
    p.ch('bell', { gain: 0.24, wet: 0.7, pan: -0.25 });
    p.ch('bass', { gain: 0.36, wet: 0.1 });
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    if (f.i % 2 === 0) this.play(b, ORGAN(0.15), 'organ', 0, this.tone(f.chord, 26, 0) + 12, 0.5, 2 * b.beats * b.spb);
    this.chords(b, f, 'org', ORGAN(0.2), 'organ', 48, 62, 3, 0.36, 0.3);
    this.chords(b, f, 'cho', 'choiroo', 'choir', 45, 58, 3, 0.2, 0.8);
    this.play(b, CELLO(), 'cello', 0, this.root(f, 0, 40), 0.6, b.beats * b.spb * 0.98);
    this.play(b, SUB(), 'bass', 0, this.tone(f.chord, 26, 0), 0.3, b.beats * b.spb);
    if (f.i % 2 === 0) this.play(b, 'tbell', 'bell', 2, this.tone(f.chord, 50, 0), 0.28, 6);
  }
}

// ═════════════════════════════ HUSH ═════════════════════════════

/** near silence: the wind and a breath of a drone, nothing else */
export class HushMood extends Mood {
  readonly level: number = 1.6;
  readonly bpm = 60;
  readonly key: Scale;
  protected readonly prog: Form = new Form([{ name: 'h', bars: ['C5'] }], [], ['h']);
  private wind: { srcs: AudioBufferSourceNode[]; nodes: AudioNode[] } | null = null;
  constructor(P: Palette) {
    super(P);
    this.key = new Scale(P.tonic, P.mode);
    this.tx = txOf(this.key);
  }
  setup(p: Player): void {
    const ch = p.ch('wind', { gain: 0.5, wet: 0.5 });
    const core = p.core;
    const ctx = core.ctx;
    const srcs: AudioBufferSourceNode[] = [];
    const nodes: AudioNode[] = [];
    for (const [f0, pan] of [[420, -0.5], [640, 0.5]] as [number, number][]) {
      const src = core.noise('pink', core.now);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f0;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      src.connect(bp).connect(g).connect(pn).connect(ch.input);
      srcs.push(src);
      nodes.push(src, bp, g, pn);
      this.mods.push(() => {
        const t = core.now;
        bp.frequency.setTargetAtTime(f0 * rand(0.6, 1.6), t, 1.4);
        g.gain.setTargetAtTime(rand(0.05, 0.2), t, 1.2);
      });
    }
    this.wind = { srcs, nodes };
  }
  private mods: (() => void)[] = [];
  protected arrange(_b: BarCtx, _f: BarInfo): void {
    for (const m of this.mods) m();
  }
  dispose(): void {
    if (!this.wind) return;
    for (const s of this.wind.srcs) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    for (const n of this.wind.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.wind = null;
  }
}

// ═════════════════════════════ COMIC ═════════════════════════════

const BASSOON = (): StackOpts => ({ ...REED(), detunes: [-5, 5], cutoff: 1300, hp: 60, peak: 0.2, attack: 0.03, release: 0.12 });

/** a funny beat: a slide whistle swoops, the pizzicato tiptoes, a cheeky bassoon line */
export class ComicMood extends Mood {
  readonly level: number = 0.89;
  readonly bpm = 120;
  readonly key: Scale;
  readonly warm: [BufInst, number, number][] = [['pizz', 30, 76], ['wood', 60, 96], ['celesta', 76, 98]];
  protected readonly prog: Form;
  constructor(P: Palette) {
    super(P);
    this.key = keyOf(P, MODES.major);
    this.tx = txOf(this.key);
    this.prog = new Form([{ name: 'c', bars: ['C', 'G7', 'C', ['F', 'G7'], 'C', 'G7', ['Am', 'D7'], ['G7', 'C']] }], [], ['c']);
  }
  setup(p: Player): void {
    p.ch('pizz', { gain: 0.56, wet: 0.2, pan: 0.15 });
    p.ch('bsn', { gain: 0.55, wet: 0.22, pan: -0.12 });
    p.ch('wood', { gain: 0.3, wet: 0.2, pan: 0.3 });
    p.ch('whistle', { gain: 0.3, wet: 0.3, pan: -0.2 });
    p.ch('cel', { gain: 0.2, wet: 0.45, pan: 0.3 });
  }
  /** a slide whistle: a sine gliding between two pitches */
  whistle(b: BarCtx, beat: number, from: number, to: number, dur: number): void {
    const ch = b.p.channels.get(b.p.prefix + 'whistle');
    if (!ch) return;
    const core = b.p.core;
    const ctx = core.ctx;
    const t = this.T(b, beat, 0.002);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(440 * Math.pow(2, (from - 69) / 12), t);
    o.frequency.exponentialRampToValueAtTime(440 * Math.pow(2, (to - 69) / 12), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.03);
    g.gain.setValueAtTime(0.16, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(ch.input);
    o.start(t);
    o.stop(t + dur + 0.05);
    core.track('cine', o, [o, g]);
  }
  protected arrange(b: BarCtx, f: BarInfo): void {
    // tiptoeing pizzicato: bass on 1 and 3, chords on the off-beats
    this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.4, 0.6], [2, 2, 0.4, 0.5]], 38);
    for (const beat of [1, 3]) for (const m of chordTones(this.cAt(f, beat), 60, 72).slice(0, 3)) this.play(b, 'pizz', 'pizz', beat, m, 0.28, 0.2 * b.spb);
    this.drum(b, 'wood', 'wood', f.i % 2 ? 'x...x.x.x...x...' : 'x...x...x...x.x.', 0.3, 84);
    // the cheeky bassoon: up the chord in skips, a sly chromatic slide back
    const c = this.cAt(f, 0);
    const r = this.rootNear(c, 48);
    const line = f.i % 4 === 3 ? [[0, r + 7], [0.5, r + 6], [1, r + 5], [1.5, r + 4], [2, r]] : [[0, r], [0.75, r + 4], [1, r + 7], [2, r + 12], [3, r + 7]];
    for (const [beat, m] of line) {
      const cc = this.cAt(f, beat);
      const mm = beat % 1 === 0 ? nearestChordTone(cc, m) : m;
      this.play(b, BASSOON(), 'bsn', beat, mm, 0.75, 0.35 * b.spb);
    }
    if (f.i === 0 || f.i === 5) this.whistle(b, 3, 72, 91, 0.35);
    if (f.i === 3) this.whistle(b, 2, 91, 67, 0.55);
    if (f.i === 7) {
      const tones = chordTones(this.cAt(f, 3), 79, 96);
      tones.slice(0, 4).forEach((m, k) => this.play(b, 'celesta', 'cel', 3 + k * 0.125, m, 0.2, 0.5));
    }
  }
}

// ═════════════════════════════ registry ═════════════════════════════

export type StoryMood = 'wonder' | 'frozen' | 'wake' | 'join' | 'threat' | 'shard' | 'voice' | 'camp' | 'memory' | 'journey' | 'dread' | 'hush' | 'comic';

export function makeMood(name: string, world: WorldId | null): Song | null {
  const P = palette(world);
  switch (name) {
    case 'wonder': return new WonderMood(P);
    case 'frozen': return new FrozenMood(P);
    case 'wake': return new WakeMood(P);
    case 'join': return new JoinMood(P);
    case 'threat': return new ThreatMood(P);
    case 'shard': return new ShardMood(P);
    case 'voice': return new GloryMood(P);
    case 'camp': return new CampMood(P);
    case 'memory': return new MemoryMood(P);
    case 'journey': return new JourneyMood(P);
    case 'dread': return new DreadMood(P);
    case 'hush': return new HushMood(P);
    case 'comic': return new ComicMood(P);
    default: return null;
  }
}
