/**
 * CREDITS — an upbeat, celebratory medley (≈2.6 min loop): fanfare intro · the leitmotif ·
 * the meadow, desert, ice, forge and citadel grooves (their own arrangement code, each carrying
 * its leitmotif variation) · the leitmotif's B part · a tutti finale → back to the leitmotif.
 * Every section ends on the dominant of the next key, so the modulations flow.
 */
import { SONGS } from '../../../sim/defs';
import { Form, LEIT_A, LEIT_A_RICH_CHORDS, LEIT_B, LEIT_B_RICH_CHORDS, LEIT_HEAD, lineNotes, type BarInfo, type Line } from '../compose';
import type { BarCtx, Player } from '../music';
import { CHOIR, FLUTE, HORNLEAD, LOWBRASS, OBOE, ORGAN, STRINGS, SUB, VIOLIN, type BufInst } from '../synth';
import { MODES, note, Scale } from '../theory';
import { type Inst, Song } from './base';
import { Battle, CitadelTheme, CITADEL_PHRASE, DesertTheme, DESERT_PHRASE, ForgeTheme, FORGE_PHRASE, IceTheme, ICE_PHRASE, MeadowTheme, MEADOW_PHRASE } from './legacy';

interface Guest {
  song: Battle;
  I: number;
  line: Line;
  tonic: number;
  scale: Scale;
  lead: { inst: Inst; ch: string; vel: number; shift?: number; legato?: number }[];
}

const withLast = (line: Line, last: [number | null, number][]): Line => [...line.slice(0, 7), last];

export class CreditsTheme extends Song {
  readonly bpm: number = SONGS.credits.bpm;
  readonly level: number = 0.95;
  readonly key = new Scale(note('F4'), MODES.major);
  private readonly guests: Record<string, Guest>;
  private readonly ready = new Set<string>();
  readonly warm: [BufInst, number, number][];
  protected readonly energy: Record<string, number> = { intro: 1, theme: 1, themeB: 0.96, finaleS: 1.08 };
  protected readonly form: Form = new Form(
    [
      { name: 'intro', bars: ['F', 'Bb/F', 'F', 'C7'] },
      { name: 'theme', bars: [...LEIT_A_RICH_CHORDS.slice(0, 7), ['F', 'D7']] },
      { name: 'meadowS', bars: ['G', 'D/F#', 'Em', 'C', 'G', 'C', ['Am7', 'D'], 'D7'] },
      { name: 'desertS', bars: ['D', 'D', 'Eb', 'D', 'Cm', 'Gm', 'Eb', ['D', 'B7']] },
      { name: 'iceS', bars: ['Em9', 'Cmaj7', 'G', 'D', 'Em9', 'Cmaj7', 'Am7', 'G7'] },
      { name: 'forgeS', bars: ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Fm', 'G', ['G', 'A7']] },
      { name: 'citadelS', bars: ['Dm', 'Dm', 'C', 'G', 'Dm', 'F', 'G', 'A'] },
      { name: 'themeB', bars: LEIT_B_RICH_CHORDS },
      { name: 'finaleS', bars: LEIT_A_RICH_CHORDS },
    ],
    ['intro'],
    ['theme', 'meadowS', 'desertS', 'iceS', 'forgeS', 'citadelS', 'themeB', 'finaleS'],
  );

  constructor() {
    super();
    const meadow = new MeadowTheme();
    const desert = new DesertTheme();
    const ice = new IceTheme();
    const forge = new ForgeTheme();
    const citadel = new CitadelTheme();
    this.guests = {
      meadowS: { song: meadow, I: 2, line: withLast(MEADOW_PHRASE, [[6, 2], [4, 2]]), tonic: note('G4'), scale: meadow.key, lead: [{ inst: FLUTE(), ch: 'flute', vel: 0.85, shift: 7 }, { inst: VIOLIN(0.7), ch: 'violins', vel: 0.5 }] },
      desertS: { song: desert, I: 2, line: withLast(DESERT_PHRASE, [[2, 1.5], [1, 0.5], [null, 2]]), tonic: note('D5'), scale: desert.key, lead: [{ inst: FLUTE(true), ch: 'ney', vel: 0.85 }] },
      iceS: { song: ice, I: 2, line: ICE_PHRASE, tonic: note('E5'), scale: ice.key, lead: [{ inst: 'celesta', ch: 'celesta', vel: 0.62, legato: 1.3 }, { inst: 'glass', ch: 'glass', vel: 0.24, shift: 7 }] },
      forgeS: { song: forge, I: 2, line: withLast(FORGE_PHRASE, [[-0.5, 2], [null, 2]]), tonic: note('C4'), scale: forge.key, lead: [{ inst: HORNLEAD(0.55), ch: 'horn', vel: 0.95 }, { inst: HORNLEAD(0.35), ch: 'horn2', vel: 0.55, shift: -7 }] },
      citadelS: { song: citadel, I: 2, line: CITADEL_PHRASE, tonic: note('D4'), scale: citadel.key, lead: [{ inst: ORGAN(0.85), ch: 'organ', vel: 0.85 }, { inst: CHOIR('ah'), ch: 'choir', vel: 0.4, shift: -7 }] },
    };
    const warm: [BufInst, number, number][] = [['pizz', 29, 62], ['harp', 48, 89], ['timp', 39, 53], ['snare', 60, 60], ['taiko', 30, 36], ['tamb', 60, 60], ['crash', 60, 60], ['brass', 41, 65]];
    for (const g of Object.values(this.guests)) warm.push(...g.song.warm);
    this.warm = warm;
  }

  setup(p: Player): void {
    p.ch('strings', { gain: 0.46, wet: 0.4, vibratoCents: 7 });
    p.ch('pizz', { gain: 0.6, wet: 0.22, pan: -0.1 });
    p.ch('bass', { gain: 0.42, wet: 0.05 });
    p.ch('harp', { gain: 0.38, wet: 0.36, pan: -0.25 });
    p.ch('horn', { gain: 0.56, wet: 0.4, vibratoCents: 5 });
    p.ch('horn2', { gain: 0.4, wet: 0.42, vibratoCents: 4, pan: -0.15 });
    p.ch('hornpad', { gain: 0.4, wet: 0.42, pan: 0.15 });
    p.ch('brass', { gain: 0.42, wet: 0.36 });
    p.ch('violins', { gain: 0.5, wet: 0.42, vibratoCents: 11, vibratoRate: 5.4, pan: 0.15 });
    p.ch('flute', { gain: 0.46, wet: 0.38, vibratoCents: 12, vibratoRate: 5.2, pan: 0.2 });
    p.ch('ney', { gain: 0.46, wet: 0.4, vibratoCents: 18, vibratoRate: 5.8, pan: 0.12 });
    p.ch('oboe', { gain: 0.48, wet: 0.38, vibratoCents: 10, pan: 0.06 });
    p.ch('celesta', { gain: 0.42, wet: 0.5, pan: 0.15 });
    p.ch('glass', { gain: 0.3, wet: 0.6, pan: -0.25 });
    p.ch('organ', { gain: 0.4, wet: 0.5, pan: 0.1, vibratoCents: 3, vibratoRate: 6 });
    p.ch('choir', { gain: 0.4, wet: 0.52, vibratoCents: 5 });
    p.ch('kit', { gain: 0.46, wet: 0.18 });
    p.ch('timp', { gain: 0.52, wet: 0.32 });
    p.ch('perc', { gain: 0.24, wet: 0.18, pan: 0.28 });
  }

  protected arrange(b: BarCtx, f: BarInfo): void {
    const g = this.guests[f.sec];
    if (g) {
      this.guest(f.sec, g, b, f);
      return;
    }
    this.orchestra(b, f);
  }

  private guest(name: string, g: Guest, b: BarCtx, f: BarInfo): void {
    const p = b.p;
    try {
      p.prefix = `${name}:`;
      if (!this.ready.has(name)) {
        this.ready.add(name);
        p.levelScale = g.song.level;
        g.song.setup(p);
        p.levelScale = 1;
      }
      g.song.guest({ ...b, I: g.I, Iprev: g.I, drop: 0, build: false }, f);
    } finally {
      p.prefix = '';
    }
    const bar = g.line[f.i];
    if (!bar) return;
    for (const l of g.lead) this.notes(b, lineNotes(g.scale, g.tonic, this.beats, [bar], { vel: 0.72, shift: l.shift ?? 0 }), l.inst, l.ch, l.vel, l.legato ?? 0.95);
  }

  private orchestra(b: BarCtx, f: BarInfo): void {
    const s = f.sec;
    const F4 = note('F4');
    const big = s === 'finaleS';
    if (s === 'intro') {
      this.chords(b, f, 'str', STRINGS(0.5 + 0.1 * f.i), 'strings', 53, 72, 4, 0.35 + 0.1 * f.i, 0.3);
      if (f.i < 2) this.roll(b, 'snare', 'kit', 0, 4, 4, 0.1 + 0.15 * f.i, 0.25 + 0.15 * f.i);
      if (f.i === 0) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.2);
      if (f.i === 2) {
        const head = lineNotes(this.key, F4, this.beats, [LEIT_HEAD], { vel: 0.8 });
        this.notes(b, head, HORNLEAD(0.8), 'horn', 1, 0.92);
        this.notes(b, head.map((n) => ({ ...n, midi: n.midi - 12 })), HORNLEAD(0.5), 'horn2', 0.7, 0.92);
        this.play(b, 'timp', 'timp', 0, note('F2'), 0.55, 3, undefined, 0.002);
      }
      if (f.i === 3) {
        this.stabs(b, f, 'br', 'brass', 'brass', 48, 64, 4, [0], 0.55, 1.6);
        this.roll(b, 'snare', 'kit', 2, 4, 6, 0.15, 0.5);
        this.roll(b, 'timp', 'timp', 2, 4, 6, 0.15, 0.5, note('C3'));
      }
      return;
    }

    // melodies
    const bar = s === 'themeB' ? LEIT_B[f.i] : s === 'theme' && f.last ? ([[7, 2], [null, 2]] as [number | null, number][]) : LEIT_A[f.i];
    const notes = (shift: number) => lineNotes(this.key, F4, this.beats, [bar], { vel: 0.72, shift });
    if (s === 'theme') {
      this.notes(b, notes(0), HORNLEAD(0.65), 'horn', 0.95, 0.96);
      this.notes(b, notes(-7), HORNLEAD(0.4), 'horn2', 0.5, 0.96);
      if (f.last) [[2, note('D5')], [2.5, note('E5')], [3, note('F#5')]].forEach(([beat, m]) => this.play(b, FLUTE(), 'flute', beat, m, 0.6, 0.45 * b.spb));
    } else if (s === 'themeB') {
      this.notes(b, notes(0), OBOE(), 'oboe', 0.85, 0.97);
      if (f.i >= 4) this.notes(b, notes(7), VIOLIN(0.7), 'violins', 0.55, 0.97);
    } else {
      this.notes(b, notes(0), HORNLEAD(0.85), 'horn', 1, 0.97);
      this.notes(b, notes(-7), HORNLEAD(0.45), 'horn2', 0.6, 0.97);
      this.notes(b, notes(7), VIOLIN(0.9), 'violins', 0.65, 0.97);
    }

    // accompaniment
    this.chords(b, f, 'str', STRINGS(big ? 0.85 : 0.5), 'strings', 53, 72, big ? 4 : 3, big ? 0.6 : 0.5, 0.35);
    if (s === 'themeB') {
      this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 2, 0.6], [2, 2, 2, 0.48]], 34);
      this.ostinato(b, f, 'harp', 'harp', 50, 74, [0, 2, 1, 3, 2, 4, 3, 1], 0.34, 1.1, [0, 4]);
      this.chords(b, f, 'cho', CHOIR('oo'), 'choir', 55, 69, 3, 0.42, 0.5);
      this.drum(b, 'tamb', 'perc', '....x.......x...', 0.4);
    } else {
      this.bassline(b, f, 'pizz', 'pizz', [[0, 0, 0.6, 0.64], [1, 3, 0.5, 0.42], [2, 2, 0.6, 0.54], [3, 3, 0.5, 0.42]], 34);
      this.play(b, SUB(), 'bass', 0, this.root(f, 0, 29), 0.42, b.beats * b.spb);
      this.ostinato(b, f, 'harp', 'harp', 57, 81, [0, 1, 2, 3, 4, 3, 2, 1], 0.36, 1.0, [0, 4]);
      this.drum(b, 'snare', 'kit', 'x..ox.o.x..ox.oo', 0.32);
      this.drum(b, 'taiko', 'timp', 'x.......x.......', 0.36, 33);
      this.drum(b, 'tamb', 'perc', 'x.o.x.o.x.o.x.o.', 0.38);
      if (f.i === 0 || f.i === 4 || big) this.play(b, 'timp', 'timp', 0, this.root(f, 0, 41), 0.5, 3, undefined, 0.002);
    }
    if (big) {
      this.chords(b, f, 'cho', CHOIR('ah'), 'choir', 55, 72, 4, 0.55, 0.4);
      this.chords(b, f, 'hp', LOWBRASS(0.55), 'hornpad', 48, 62, 3, 0.5, 0.35);
      if (f.i === 0 || f.i === 4) b.p.hit('crash', 'kit', this.T(b, 0, 0.001), 0.32);
      if (f.i === 3 || f.i === 7) {
        this.roll(b, 'timp', 'timp', 2, 4, 6, 0.15, 0.5, this.root(f, 2, 41));
        for (let k = 0; k < 12; k++) this.play(b, 'harp', 'harp', 2 + k / 6, this.key.deg(this.key.degreeOf(F4) + k), 0.28, 1.2 * b.spb);
      }
    }
  }
}
