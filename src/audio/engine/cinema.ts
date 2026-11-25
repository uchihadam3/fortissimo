/**
 * Cutscene scoring. Every cue is either a MOOD — a composition that starts on the next beat of the
 * music that is playing and SUSTAINS (loops and evolves) until the next cue, stopMusic() or
 * playSong(), so the cutscenes can be re-timed freely — or a STINGER that sounds at once (the
 * Heart shattering, the title chord, the Silence falling, the bar of rest…), usually followed by
 * a mood. Cinematic sounds go to the MUSIC bus (they are the score: the music slider applies).
 *
 *   intro:dawn · festival · approach · shatter (stinger → silence) · grey · hope · title (stinger → afterglow)
 *   ending:fall (stinger → drone) · alone · rest (silent bar, a note answered → after) · bloom · bow
 *   story:* (coloured by the land of the story) · land:<world> (the land's own song, calm, full orchestra)
 *   world:restored, map:* — stingers
 *
 * playSong('ending') runs the ending by itself on the old timeline; as soon as the game calls an
 * ending cue, the game drives it instead.
 */
import type { CinematicCue } from '../api';
import type { SongId, WorldId } from '../../sim/defs';
import type { Core } from './core';
import { Fx } from './fx';
import type { Director, TrackId } from './music';
import { BufferBank, Channel, CHOIR, type ChannelOpts, LOWBRASS, playBuf, STRINGS, SUB } from './synth';
import { chordTones, chord, MODES, note, Scale } from './theory';
import { disconnectAll, rand, report } from './util';

/** cue → mood, its crossfade (s), and whether it is part of the ending (public 'ending' clock) */
const MOODS: Partial<Record<CinematicCue, { mood: string; fade: number; land?: boolean; ending?: boolean }>> = {
  'intro:dawn': { mood: 'dawn', fade: 1.5 },
  'intro:festival': { mood: 'festival', fade: 0.8 },
  'intro:grey': { mood: 'grey', fade: 0.5 },
  'intro:hope': { mood: 'hope', fade: 6 },
  'ending:alone': { mood: 'alone', fade: 3, ending: true },
  'ending:bloom': { mood: 'bloom', fade: 0.6, ending: true },
  'story:wonder': { mood: 'wonder', fade: 1.6, land: true },
  'story:frozen': { mood: 'frozen', fade: 1.4, land: true },
  'story:wake': { mood: 'wake', fade: 0.6, land: true },
  'story:join': { mood: 'join', fade: 0.5, land: true },
  'story:threat': { mood: 'threat', fade: 0.7, land: true },
  'story:shard': { mood: 'shard', fade: 0.8, land: true },
  'story:voice': { mood: 'voice', fade: 0.8, land: true },
  'story:camp': { mood: 'camp', fade: 2, land: true },
  'story:memory': { mood: 'memory', fade: 1.5, land: true },
  'story:journey': { mood: 'journey', fade: 1.2, land: true },
  'story:dread': { mood: 'dread', fade: 1.5, land: true },
  'story:hush': { mood: 'hush', fade: 2.5, land: true },
  'story:comic': { mood: 'comic', fade: 0.25, land: true },
};

export class Cinema {
  private readonly fx: Fx;
  private auto: { at: number; cue: CinematicCue }[] = [];
  private readonly last: Partial<Record<CinematicCue, number>> = {};
  /** the public song clock changed: id null = no public song (intro, stingers) */
  onTrack: (id: SongId | null, t0: number, bpm: number) => void = () => {};

  constructor(
    private readonly core: Core,
    private readonly bank: BufferBank,
    private readonly director: Director,
  ) {
    this.fx = new Fx(core, bank);
  }

  /** a throw-away channel on the music bus (with its own gain for cuts); disposed after `life` s */
  private temp(life: number, o: ChannelOpts = {}): { ch: Channel; gain: GainNode; gainW: GainNode } {
    const ctx = this.core.ctx;
    const gain = ctx.createGain();
    const gainW = ctx.createGain();
    gain.connect(this.core.stingDry);
    gainW.connect(this.core.stingWet);
    const ch = new Channel(this.core, gain, gainW, { wet: 0.45, gain: 0.85, ...o });
    if (typeof setTimeout === 'function')
      setTimeout(() => {
        ch.dispose();
        disconnectAll([gain, gainW]);
      }, (life + 2) * 1000);
    return { ch, gain, gainW };
  }

  private buf(ch: Channel, inst: Parameters<Fx['buf']>[0], t: number, midi: number, vel: number, dur: number, release?: number): void {
    this.fx.buf(inst, ch, t, midi, vel, dur, { release, cat: 'cine', cap: 96 });
  }

  /** Stops the self-timed ending. (Moods are players: playSong / stopMusic stop them.) */
  reset(_fade = 1): void {
    this.auto = [];
  }

  startEnding(): void {
    const now = this.core.now;
    const plan: [CinematicCue, number][] = [['ending:fall', 0], ['ending:alone', 6], ['ending:rest', 26], ['ending:bloom', 36], ['ending:bow', 74]];
    for (const k of Object.keys(this.last) as CinematicCue[]) if (k.startsWith('ending:')) delete this.last[k];
    this.auto = plan.map(([cue, s]) => ({ cue, at: now + s }));
    this.tick();
  }

  tick(): void {
    const now = this.core.now;
    while (this.auto.length && this.auto[0].at <= now + 0.02) {
      const a = this.auto.shift()!;
      this.cue(a.cue, true);
    }
  }

  /** the next beat of the music that is playing (moods start there), or a moment from now */
  private nextBeat(): number {
    const now = this.core.now;
    const p = this.director.current;
    if (!p || p.stopped) return now + 0.06;
    const k = Math.ceil((now + 0.06 - p.t0) / p.spb - 1e-6);
    const t = p.t0 + k * p.spb;
    return t > now + 1.2 ? now + 0.06 : t;
  }

  private startMood(name: string, fade: number, at?: number, ending = false, world?: WorldId | null): void {
    const w = world === undefined ? this.director.world : world;
    const id = (w ? `mood:${name}@${w}` : `mood:${name}`) as TrackId;
    const t = at ?? this.nextBeat();
    const p = this.director.play(id, t, fade, 0, t);
    if (p) this.onTrack(ending ? 'ending' : null, t, p.theme.bpm);
  }

  cue(c: CinematicCue, fromAuto = false): void {
    const now = this.core.now;
    if (!fromAuto && c.startsWith('ending:')) this.auto = [];
    const prev = this.last[c];
    if (prev !== undefined && now - prev < (c.startsWith('map:') ? 0.12 : 1.5)) return;
    this.last[c] = now;
    const t = now + 0.03;
    try {
      const m = MOODS[c];
      if (m) return this.startMood(m.mood, m.fade, undefined, !!m.ending, m.land ? undefined : null);
      if (c.startsWith('land:')) {
        const w = c.slice(5) as WorldId;
        this.director.world = w;
        return this.startMood('land', 1.5, undefined, false, w);
      }
      switch (c) {
        case 'intro:approach': return this.approach();
        case 'intro:shatter': return this.shatter(t);
        case 'intro:title': return this.title(t);
        case 'world:restored': return this.restored(t);
        case 'ending:fall': return this.fall(t);
        case 'ending:rest': return this.rest(t);
        case 'ending:bow': return this.bow();
        case 'map:unlock': return this.mapUnlock(t);
        case 'map:world': return this.mapWorld(t);
      }
    } catch (e) {
      report(`cinematic ${c}`, e);
    }
  }

  // ───────────────────────────── intro ─────────────────────────────

  /** the Silence approaches: the festival decays under a growing drone (or the drone alone) */
  private approach(): void {
    const p = this.director.current;
    if (p && !p.stopped && p.id === 'mood:festival') {
      const t = this.nextBeat();
      p.state.decayT = t;
      p.state.decayDur = 12;
      p.decay(t, 12, 240, -150);
      return;
    }
    this.startMood('approach', 1.2, undefined, false, null);
  }

  /** the Heart is torn: a huge crash, then a hard cut to near-silence */
  private shatter(t: number): void {
    const { ch, gain, gainW } = this.temp(8, { wet: 0.5, gain: 0.5 });
    for (const g of [gain.gain, gainW.gain]) {
      g.setValueAtTime(1, t);
      g.setValueAtTime(1, t + 0.85);
      g.exponentialRampToValueAtTime(0.03, t + 1.05);
      g.linearRampToValueAtTime(0, t + 3.5);
    }
    this.buf(ch, 'crash', t, 60, 0.95, 3);
    this.buf(ch, 'crash', t + 0.004, 53, 0.7, 3);
    this.buf(ch, 'gong', t, 60, 0.55, 5);
    this.buf(ch, 'boom', t, note('F1'), 1, 2.4);
    this.buf(ch, 'taiko', t, 29, 1, 2);
    this.buf(ch, 'kick', t, 55, 0.8, 0.6);
    this.fx.burst(ch.input, t, { noise: 'brown', type: 'lowpass', f: 300, a: 0.005, d: 1.5, g: 0.6, cat: 'cine' });
    this.fx.burst(ch.input, t, { noise: 'white', type: 'highpass', f: 3000, a: 0.002, d: 0.45, g: 0.25, cat: 'cine' });
    for (let i = 0; i < 24; i++) this.buf(ch, 'glass', t + Math.pow(Math.random(), 1.6) * 0.55, 84 + Math.floor(rand(0, 16)), rand(0.12, 0.3), 1.2, 0.8);
    // everything else cuts: the silence holds until the next cue
    this.director.stopAll(0.03, t + 0.02);
    this.onTrack(null, t, 92);
  }

  /** FORTÍSSIMO: the turtle wakes with a huge step — a huge orchestral chord and choir — then the afterglow */
  private title(t: number): void {
    this.director.stopAll(0.25, t);
    const { ch } = this.temp(12, { wet: 0.5, gain: 0.32, vibratoCents: 4 });
    // the step
    this.buf(ch, 'boom', t, note('F1'), 1, 2.4);
    this.buf(ch, 'taiko', t, 29, 1, 2);
    this.buf(ch, 'kick', t, 55, 0.85, 0.7);
    this.fx.tone(ch.input, t, { f: 58, f1: 36, a: 0.004, d: 2, g: 0.45, cat: 'cine' });
    this.fx.burst(ch.input, t, { noise: 'brown', type: 'lowpass', f: 150, a: 0.01, d: 1.6, g: 0.55, cat: 'cine' });
    // the chord
    const h = t + 0.05;
    for (const nm of ['F2', 'C3', 'F3', 'A3', 'C4', 'F4']) this.buf(ch, 'brass', h, note(nm), 0.55, 3.5, 2.5);
    for (const nm of ['F3', 'C4', 'F4', 'A4']) this.fx.stack({ ...LOWBRASS(0.85), attack: 0.06, release: 2.5 }, ch, h, note(nm), 0.7, 4);
    for (const nm of ['F2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4', 'C5', 'F5']) this.fx.stack({ ...STRINGS(1), attack: 0.08, release: 3 }, ch, h, note(nm), 0.62, 4.5);
    for (const nm of ['F3', 'A3', 'C4', 'F4', 'A4']) this.buf(ch, 'choir', h, note(nm), 0.45, 4, 2.5);
    for (const nm of ['C4', 'F4', 'A4', 'C5']) this.fx.stack({ ...CHOIR('ah'), attack: 0.25, release: 3 }, ch, h, note(nm), 0.5, 4.5);
    this.buf(ch, 'timp', h, note('F2'), 0.85, 3);
    this.buf(ch, 'crash', h, 60, 0.7, 3.5);
    this.buf(ch, 'gong', h, 60, 0.35, 6);
    const F = new Scale(note('F3'), MODES.major);
    for (let i = 0; i < 16; i++) this.buf(ch, 'harp', h + 0.1 + i * 0.05, F.deg(i), 0.22, 1.6, 1.2);
    for (let i = 0; i < 6; i++) this.buf(ch, 'glass', h + 0.5 + i * 0.25, chordTones(chord('F'), 84, 101)[i % 5], 0.14, 2.5, 2);
    this.fx.stack({ ...SUB(), attack: 0.02, release: 3 }, ch, h, note('F1'), 0.6, 4);
    // as the chord rings away, the afterglow (soft F major) takes over and sustains
    this.startMood('afterglow', 0.5, t + 3.6, false, null);
  }

  // ───────────────────────────── world restored ─────────────────────────────

  /** when world:restored last played, and its chord/melody layer (yields to a victory fanfare) */
  private restoredAt = -1e9;
  private restoredLayer: { gain: GainNode; gainW: GainNode } | null = null;

  /**
   * The landmark rings and colour floods the land (≈12 s), in the key the music was in: a great
   * bell, a rising glissando with sparkles, then a warm triumphant chord with the leitmotif's opening.
   */
  private restored(t: number): void {
    const key = this.director.keyAt(this.core.now) ?? new Scale(note('F4'), MODES.major);
    this.director.stop(1.2);
    this.onTrack(null, t, 84);
    let T = 48;
    while ((T - key.tonic + 1200) % 12 !== 0) T++;
    const S = new Scale(T, MODES.major);
    const d0 = S.degreeOf(T);
    const deg = (d: number) => S.deg(d0 + d);
    const a = this.temp(16, { wet: 0.55, gain: 0.5, vibratoCents: 5 });
    const b = this.temp(16, { wet: 0.55, gain: 0.5, vibratoCents: 5 });
    this.restoredAt = t;
    this.restoredLayer = { gain: b.gain, gainW: b.gainW };
    this.buf(a.ch, 'bell', t, T - 12, 0.75, 7, 3);
    this.buf(a.ch, 'tbell', t + 0.01, T, 0.5, 7, 3);
    this.buf(a.ch, 'gong', t, 60, 0.2, 6);
    this.buf(a.ch, 'bell', t + 1.6, T - 5, 0.4, 6, 3);
    for (let i = 0; i < 22; i++) this.buf(a.ch, 'harp', t + 0.5 + 1.8 * Math.pow(i / 22, 0.75), deg(i), 0.2 + i * 0.006, 1.6, 1.2);
    for (let i = 0; i < 8; i++) this.buf(a.ch, 'celesta', t + 0.8 + rand(0, 1.6), deg(14 + Math.floor(rand(0, 8))), 0.14, 1.2, 1);
    const h = t + 2.4;
    const spb = 60 / 84;
    const I = [0, 4, 7, 12, 16, 19];
    const plan: [number, number[], number][] = [
      [0, I.map((x) => T - 12 + x), 4],
      [4, [2, 9, 12, 17, 21, 26].map((x) => T - 12 + x), 2],
      [6, [7, 11, 14, 17, 19, 23].map((x) => T - 12 + x), 2],
      [8, [0, 7, 12, 16, 19, 24, 28].map((x) => T - 12 + x), 5],
    ];
    for (const [beat, ms, len] of plan) {
      for (const m of ms) this.fx.stack({ ...STRINGS(0.85), attack: beat === 0 ? 0.5 : 0.25, release: 2.4 }, b.ch, h + beat * spb, m, 0.6, len * spb);
      for (const m of ms.slice(1, 5)) this.fx.stack({ ...CHOIR('ah'), attack: 0.4, release: 2.4 }, b.ch, h + beat * spb, m + 12, 0.4, len * spb);
      for (const m of ms.slice(0, 3)) this.fx.stack({ ...LOWBRASS(0.6), attack: 0.2, release: 1.6 }, b.ch, h + beat * spb, m + 12, 0.5, len * spb);
    }
    const head: [number, number, number][] = [[0, 0, 1], [4, 1, 1.5], [3, 2.5, 0.5], [2, 3, 1], [1, 4, 1.5], [2, 5.5, 0.5], [3, 6, 1], [4, 7, 1], [7, 8, 4]];
    for (const [d, beat, len] of head) {
      const m = deg(d) + 12;
      this.fx.stack({ ...STRINGS(1), attack: 0.08, release: 0.6 }, b.ch, h + beat * spb, m + 12, 0.42, len * spb * 0.97);
      this.fx.stack({ waves: ['sawtooth', 'sawtooth'], detunes: [-4, 4], attack: 0.06, decay: 0.35, sustain: 0.82, release: 0.4, peak: 0.1, cutoff: 2000, envFrom: 0.32, envTime: 0.11, q: 0.8, hp: 80, scoop: 22, cat: 'cine', cap: 24 }, b.ch, h + beat * spb, m, 0.95, len * spb * 0.97);
    }
    this.buf(b.ch, 'timp', h, T - 12, 0.7, 3);
    this.buf(b.ch, 'crash', h, 60, 0.4, 3.5);
    this.fx.stack({ ...SUB(), attack: 0.3, release: 3 }, b.ch, h, T - 24, 0.5, 8 * spb);
    this.buf(b.ch, 'timp', h + 8 * spb, T - 12, 0.6, 3);
    const top = chordTones(chord(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][S.tonicPc]), 77, 101);
    for (let i = 0; i < 8; i++) this.buf(a.ch, 'glass', h + 8 * spb + 0.2 + i * 0.12, top[i % top.length], 0.18, 2.5, 2);
  }

  /** A victory fanfare is starting: if world:restored just played, its chord/melody layer steps aside. */
  yieldToVictory(): void {
    const now = this.core.now;
    if (!this.restoredLayer || now - this.restoredAt > 6) return;
    for (const g of [this.restoredLayer.gain.gain, this.restoredLayer.gainW.gain]) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0, now, 0.08);
    }
    this.restoredLayer = null;
  }

  // ───────────────────────────── map ─────────────────────────────

  private mapUnlock(t: number): void {
    this.core.duck(0.2, 1);
    const { ch } = this.temp(5, { wet: 0.5, gain: 0.85 });
    const c = this.director.chordAt(t) ?? chord('C');
    const tones = chordTones(c, 79, 100);
    tones.slice(0, 5).forEach((m, i) => this.buf(ch, i % 2 ? 'celesta' : 'glass', t + i * 0.07, m, 0.24, 1.4, 1.2));
    this.fx.burst(ch.input, t, { noise: 'white', type: 'highpass', f: 4000, f1: 9000, a: 0.2, d: 0.6, g: 0.03, cat: 'cine' });
  }

  private mapWorld(t: number): void {
    this.core.duck(0.5, 4);
    const { ch } = this.temp(8, { wet: 0.5, gain: 0.85, vibratoCents: 5 });
    const k = this.director.keyAt(t) ?? new Scale(note('C4'), MODES.major);
    let T = 48;
    while ((T - k.tonic + 1200) % 12 !== 0) T++;
    const S = new Scale(T, MODES.major);
    for (let i = 0; i < 15; i++) this.buf(ch, 'harp', t + i * 0.06, S.deg(7 + i), 0.22, 1.4, 1);
    const h = t + 0.95;
    const spb = 0.5;
    const call: [number, number, number][] = [[7, 0, 1], [11, 1, 1.5], [10, 2.5, 0.5], [9, 3, 1], [14, 4, 3]];
    for (const [d, beat, len] of call) {
      this.fx.stack({ waves: ['sawtooth', 'sawtooth'], detunes: [-4, 4], attack: 0.06, decay: 0.35, sustain: 0.82, release: 0.4, peak: 0.1, cutoff: 2100, envFrom: 0.32, envTime: 0.11, q: 0.8, hp: 80, scoop: 22, cat: 'cine', cap: 24 }, ch, h + beat * spb, S.deg(d), 0.9, len * spb);
      this.buf(ch, 'brass', h + beat * spb, S.deg(d) - 12, 0.35, len * spb, 0.3);
    }
    for (const d of [0, 2, 4, 7]) this.fx.stack({ ...STRINGS(0.8), attack: 0.4, release: 1.6 }, ch, h + 4 * spb, S.deg(d + 7), 0.55, 3 * spb);
    for (const d of [2, 4, 7]) this.buf(ch, 'choir', h + 4 * spb, S.deg(d + 7), 0.3, 2, 1);
    for (let i = 0; i < 10; i++) this.buf(ch, 'timp', h + 2 * spb + i * 0.1, T - 12, 0.08 + i * 0.04, 1);
    this.buf(ch, 'timp', h + 4 * spb, T - 12, 0.6, 2.5);
    this.buf(ch, 'crash', h + 4 * spb, 62, 0.3, 3);
  }

  // ───────────────────────────── ending ─────────────────────────────

  /** the Silence collapses: an enormous descending crash, then a soft low drone (the fall mood) */
  private fall(t: number): void {
    this.director.stopAll(1);
    const { ch } = this.temp(10, { wet: 0.55, gain: 0.45 });
    this.buf(ch, 'crash', t, 60, 0.85, 3.5);
    this.buf(ch, 'crash', t + 0.01, 52, 0.7, 3.5);
    this.buf(ch, 'gong', t, 60, 0.6, 6);
    this.buf(ch, 'boom', t, note('F1'), 1, 2.4);
    this.buf(ch, 'taiko', t, 29, 0.95, 2);
    for (const [a, b] of [[note('F4'), note('F2')], [note('C5'), note('C3')], [note('A4'), note('A2')], [note('F3'), note('F1')]] as [number, number][]) {
      const f0 = 440 * Math.pow(2, (a - 69) / 12);
      const f1 = 440 * Math.pow(2, (b - 69) / 12);
      for (const det of [-8, 8]) this.fx.glide(ch.input, t, { f0, f1, dur: 3.2, g: 0.03, a: 0.04, lp0: 3200, lp1: 260, detune: det, cat: 'cine' });
    }
    this.fx.burst(ch.input, t, { noise: 'pink', f: 4000, f1: 150, q: 0.9, a: 0.02, d: 3.5, g: 0.22, cat: 'cine' });
    this.fx.burst(ch.input, t, { noise: 'brown', type: 'lowpass', f: 220, a: 0.01, d: 2.5, g: 0.5, cat: 'cine' });
    this.startMood('fall', 1, t + 2.6, true, null);
  }

  /** the Maestro conducts a rest: everything hushes, a full bar of silence, one soft note — answered — and then the after-rest mood */
  private rest(t: number): void {
    const bar = (60 / 84) * 4;
    const t2 = t + 0.7;
    const t3 = t2 + bar;
    this.core.hushWindow(t, t2, t3);
    this.director.stopAll(0.05, t2 - 0.02);
    const { ch } = this.temp(12, { wet: 0.55, gain: 0.9 });
    const q = t3 + 0.05;
    this.buf(ch, 'celesta', q, note('C6'), 0.28, 2.2, 2);
    this.buf(ch, 'piano', q, note('C5'), 0.24, 2.5, 2);
    const a = q + 2 * (60 / 84);
    this.buf(ch, 'piano', a, note('F3'), 0.3, 3, 2.5);
    this.buf(ch, 'celesta', a + 0.01, note('F5'), 0.14, 2.5, 2);
    this.fx.stack({ ...CHOIR('mm'), attack: 0.8, release: 2.5 }, ch, a, note('F3'), 0.45, 3.5);
    this.startMood('after', 0.5, a + 4 * (60 / 84), true, null);
  }

  /** the bow: the bloom turns into its final cadence at the next bar line (or the cadence alone) */
  private bow(): void {
    const p = this.director.current;
    if (p && !p.stopped && p.id === 'mood:bloom') {
      const bar = Math.max(p.composedUntil, p.barAt(this.core.now) + 1);
      p.state.bowKey = p.keyAtTime(p.barStart(bar) - 0.01).tonic;
      p.state.bowBar = bar;
      p.theme.invalidate(bar);
      return;
    }
    const t = this.nextBeat();
    const np = this.director.play('mood:bloom', t, 0.5, 0, t);
    if (np) {
      np.state.bowBar = 0;
      np.state.bowKey = note('F4');
      this.onTrack('ending', t, np.theme.bpm);
    }
  }
}
