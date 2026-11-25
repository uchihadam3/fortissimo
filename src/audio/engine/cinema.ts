/**
 * Cutscene scoring. Each cue changes the music state or plays a stinger so the whole cutscene is
 * scored. Cinematic sounds go to the MUSIC bus (they are the score: the music slider applies).
 *
 * Intro (≈80 s): dawn 0 · festival 8 · approach 24 · shatter 36 · grey 38 · hope 54 · title 70
 * Ending (≈95 s): fall 0 · alone 6 · rest 26 · bloom 36 · bow 74 — playSong('ending') runs this
 * timeline by itself; as soon as the game calls an ending cue, the game drives it instead.
 */
import type { CinematicCue } from '../api';
import type { SongId } from '../../sim/defs';
import type { Core } from './core';
import { Fx } from './fx';
import type { Director } from './music';
import { BufferBank, Channel, CHOIR, type ChannelOpts, LOWBRASS, playBuf, STRINGS, SUB, type StackOpts } from './synth';
import { chordTones, chord, MODES, note, Scale } from './theory';
import { disconnectAll, rand, report } from './util';

interface Bed {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

const PURE: StackOpts = { waves: ['sine', 'sine'], ratios: [1, 2], gains: [1, 0.04], attack: 1.8, release: 3, peak: 0.2, cat: 'cine', cap: 12 };

export class Cinema {
  private readonly fx: Fx;
  private drone: Bed | null = null;
  private grey: Bed | null = null;
  private hopeGain: GainNode | null = null;
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

  /** Stops every cinematic bed (drone, wind, the hope layer) and the self-timed ending. */
  reset(fade = 1): void {
    const t = this.core.now;
    this.auto = [];
    this.stopBed(this.drone, t, fade);
    this.drone = null;
    this.stopBed(this.grey, t, fade);
    this.grey = null;
    if (this.hopeGain) {
      this.hopeGain.gain.cancelScheduledValues(t);
      this.hopeGain.gain.setTargetAtTime(0, t, Math.max(0.02, fade / 4));
      this.hopeGain = null;
    }
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

  cue(c: CinematicCue, fromAuto = false): void {
    const now = this.core.now;
    if (!fromAuto && c.startsWith('ending:')) this.auto = [];
    const prev = this.last[c];
    if (prev !== undefined && now - prev < (c.startsWith('map:') ? 0.12 : 1.5)) return;
    this.last[c] = now;
    const t = now + 0.03;
    try {
      switch (c) {
        case 'intro:dawn': return this.dawn(t);
        case 'intro:festival': return this.festival(t);
        case 'intro:approach': return this.approach(t);
        case 'intro:shatter': return this.shatter(t);
        case 'intro:grey': return this.greyWorld(t);
        case 'intro:hope': return this.hopeRises(t);
        case 'intro:title': return this.title(t);
        case 'world:restored': return this.restored(t);
        case 'ending:fall': return this.fall(t);
        case 'ending:alone': return this.alone(t);
        case 'ending:rest': return this.rest(t);
        case 'ending:bloom': return this.bloom(t);
        case 'ending:bow': return this.bow(t);
        case 'map:unlock': return this.mapUnlock(t);
        case 'map:world': return this.mapWorld(t);
      }
    } catch (e) {
      report(`cinematic ${c}`, e);
    }
  }

  private stopBed(bed: Bed | null, t: number, fade: number): void {
    if (!bed) return;
    try {
      bed.gain.gain.cancelScheduledValues(t);
      bed.gain.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 4));
      for (const s of bed.sources) s.stop(t + fade + 0.2);
      if (typeof setTimeout === 'function') setTimeout(() => disconnectAll(bed.nodes), (fade + 1) * 1000 + (t - this.core.now) * 1000);
    } catch (e) {
      report('cine bed', e);
    }
  }

  // ───────────────────────────── intro ─────────────────────────────

  private dawn(t: number): void {
    this.stopBed(this.drone, t, 0.5);
    this.drone = null;
    this.stopBed(this.grey, t, 0.5);
    this.grey = null;
    this.director.play('cine:dawn', t, 1.5);
    this.onTrack(null, t, 92);
  }

  private festival(t: number): void {
    this.director.play('cine:festival', t, 0.8);
    this.onTrack(null, t, 92);
  }

  /** the Silence approaches: the joyful music decays under a growing drone */
  private approach(t: number): void {
    const p = this.director.current;
    if (p) {
      p.state.decayT = t;
      p.state.decayDur = 12;
      p.decay(t, 12, 240, -150);
    }
    const ctx = this.core.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 11.5);
    const { ch } = this.temp(40, { wet: 0.3, gain: 0.9 });
    gain.connect(ch.input);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [gain];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(460, t + 12);
    lp.connect(gain);
    nodes.push(lp);
    for (const [m, det, g] of [[note('F1'), -6, 0.5], [note('F1'), 6, 0.5], [note('B1'), 0, 0.35]] as [number, number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = g * 0.12;
      o.connect(og).connect(lp);
      o.start(t);
      sources.push(o);
      nodes.push(o, og);
    }
    const n = this.core.noise('brown', t);
    const nlp = ctx.createBiquadFilter();
    nlp.type = 'lowpass';
    nlp.frequency.value = 120;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    n.connect(nlp).connect(ng).connect(gain);
    sources.push(n);
    nodes.push(n, nlp, ng);
    this.drone = { gain, sources, nodes };
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
    // everything else cuts
    this.director.stopAll(0.03, t + 0.02);
    this.stopBed(this.drone, t + 0.02, 0.04);
    this.drone = null;
    this.onTrack(null, t, 92);
  }

  /** grey, silent world: cold wind, the turtle's sleeping breath, a broken music box */
  private greyWorld(t: number): void {
    const ctx = this.core.ctx;
    this.stopBed(this.grey, t, 0.5);
    const { ch } = this.temp(60, { wet: 0.35, gain: 0.9 });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.26, t + 2.5);
    gain.connect(ch.input);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [gain];
    const span = 40;
    const curve = (n: number, lo: number, hi: number) => {
      const c = new Float32Array(n);
      let v = (lo + hi) / 2;
      for (let i = 0; i < n; i++) {
        v += (rand(lo, hi) - v) * 0.35;
        c[i] = v;
      }
      return c;
    };
    for (const [f0, pan, g] of [[380, -0.5, 0.5], [620, 0.5, 0.42]] as [number, number, number][]) {
      const src = this.core.noise('pink', t);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.7;
      bp.frequency.setValueCurveAtTime(curve(24, f0 * 0.6, f0 * 1.6), t, span);
      const gg = ctx.createGain();
      gg.gain.setValueCurveAtTime(curve(24, g * 0.25, g), t, span);
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      src.connect(bp).connect(gg).connect(pn).connect(gain);
      sources.push(src);
      nodes.push(src, bp, gg, pn);
    }
    {
      const src = this.core.noise('white', t);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 8;
      bp.frequency.setValueCurveAtTime(curve(20, 1500, 2400), t, span);
      const gg = ctx.createGain();
      gg.gain.setValueCurveAtTime(curve(20, 0.0, 0.05), t, span);
      src.connect(bp).connect(gg).connect(gain);
      sources.push(src);
      nodes.push(src, bp, gg);
    }
    {
      // the turtle's slow sleeping breath
      const src = this.core.noise('brown', t);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const gg = ctx.createGain();
      const n = 160;
      const c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ph = ((i / n) * span) / 4.6;
        const x = ph - Math.floor(ph);
        c[i] = 0.02 + 0.12 * (x < 0.42 ? Math.sin((x / 0.42) * Math.PI * 0.5) : Math.cos(((x - 0.42) / 0.58) * Math.PI * 0.5));
      }
      gg.gain.value = c[0];
      gg.gain.setValueCurveAtTime(c, t + 3, span);
      src.connect(lp).connect(gg).connect(gain);
      sources.push(src);
      nodes.push(src, lp, gg);
    }
    this.grey = { gain, sources, nodes };
    // the broken music box: the leitmotif, winding down, stopping mid-phrase
    const box = [note('F5'), note('C6'), note('A#5'), note('A5'), note('G5'), note('A5'), note('A#5')];
    const gaps = [0.55, 0.85, 0.38, 0.72, 1.05, 0.62];
    let tt = t + 2.6;
    box.forEach((m, i) => {
      const cents = -6 * i + rand(-12, 12) - (i === box.length - 1 ? 35 : 0);
      playBuf(this.core, this.bank, 'mbox', ch.input, tt, m, 0.13 - i * 0.009, i === box.length - 1 ? 0.35 : 1.6, { cents, release: i === box.length - 1 ? 0.12 : 1.2, cat: 'cine', cap: 96 });
      tt += gaps[i] ?? 0.8;
    });
    this.onTrack(null, t, 92);
  }

  /** the baton glows: one pure note, the turtle's heartbeat, strings rising towards the title */
  private hopeRises(t: number): void {
    if (this.grey) {
      this.stopBed(this.grey, t, 6);
      this.grey = null;
    }
    const { ch, gain } = this.temp(40, { wet: 0.5, gain: 0.9, vibratoCents: 5, vibratoRate: 4.6 });
    this.hopeGain = gain;
    this.fx.stack(PURE, ch, t, note('F5'), 0.5, 14);
    for (let i = 0; i < 18; i++) {
      const tb = t + 2 + i * 0.909;
      const v = 0.12 + 0.3 * (i / 17);
      playBuf(this.core, this.bank, 'kick', ch.input, tb, 43, v, 0.5, { lp: 320, cat: 'cine', cap: 96 });
      playBuf(this.core, this.bank, 'kick', ch.input, tb + 0.27, 42, v * 0.65, 0.5, { lp: 280, cat: 'cine', cap: 96 });
    }
    const plan: [number, string[], number, number][] = [
      [4.0, ['C3', 'F3', 'A3', 'C4'], 4.0, 0.36],
      [7.3, ['D3', 'F3', 'A3', 'D4', 'F4'], 4.0, 0.46],
      [10.6, ['D3', 'F3', 'A#3', 'D4', 'F4', 'A#4'], 3.8, 0.56],
      [13.6, ['C3', 'G3', 'A#3', 'C4', 'E4', 'G4', 'C5'], 6.5, 0.7],
    ];
    plan.forEach(([at, names, len, vel], k) => {
      for (const nm of names) this.fx.stack({ ...STRINGS(0.4 + 0.18 * k), attack: 1.6, release: 2.2 }, ch, t + at, note(nm), vel, len);
    });
    this.onTrack(null, t, 92);
  }

  /** FORTÍSSIMO: the turtle wakes with a huge step — a huge orchestral chord and choir (~7 s) */
  private title(t: number): void {
    if (this.hopeGain) {
      this.hopeGain.gain.cancelScheduledValues(t);
      this.hopeGain.gain.setTargetAtTime(0, t, 0.15);
    }
    this.hopeGain = null;
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
    this.onTrack(null, t, 92);
  }

  // ───────────────────────────── world restored ─────────────────────────────

  /** when world:restored last played, and its chord/melody layer (yields to a victory fanfare) */
  private restoredAt = -1e9;
  private restoredLayer: { gain: GainNode; gainW: GainNode } | null = null;

  /**
   * The landmark rings and colour floods the land (≈12 s), in the key of the song that was
   * playing: a great bell, a rising glissando with sparkles, then a warm triumphant chord with the
   * leitmotif's opening on horns.
   */
  private restored(t: number): void {
    const key = this.director.current?.theme.key ?? new Scale(note('F4'), MODES.major);
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
    // the bell, the glissando, the colour
    this.buf(a.ch, 'bell', t, T - 12, 0.75, 7, 3);
    this.buf(a.ch, 'tbell', t + 0.01, T, 0.5, 7, 3);
    this.buf(a.ch, 'gong', t, 60, 0.2, 6);
    this.buf(a.ch, 'bell', t + 1.6, T - 5, 0.4, 6, 3);
    for (let i = 0; i < 22; i++) this.buf(a.ch, 'harp', t + 0.5 + 1.8 * Math.pow(i / 22, 0.75), deg(i), 0.2 + i * 0.006, 1.6, 1.2);
    for (let i = 0; i < 8; i++) this.buf(a.ch, 'celesta', t + 0.8 + rand(0, 1.6), deg(14 + Math.floor(rand(0, 8))), 0.14, 1.2, 1);
    // the warm chord and the leitmotif (this layer yields if the victory fanfare follows)
    const h = t + 2.4;
    const spb = 60 / 84;
    const I = [0, 4, 7, 12, 16, 19];
    const plan: [number, number[], number, number][] = [
      [0, I.map((x) => T - 12 + x), 4, 0],
      [4, [2, 9, 12, 17, 21, 26].map((x) => T - 12 + x), 2, 0],
      [6, [7, 11, 14, 17, 19, 23].map((x) => T - 12 + x), 2, 0],
      [8, [0, 7, 12, 16, 19, 24, 28].map((x) => T - 12 + x), 5, 0],
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
    const k = this.director.current?.theme.key ?? new Scale(note('C4'), MODES.major);
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

  /** the Silence collapses: an enormous descending crash, then a soft low drone */
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
    this.director.play('cine:fall', t + 2.6, 1);
    this.onTrack('ending', t + 2.6, 84);
  }

  private alone(t: number): void {
    this.director.play('cine:alone', t + 0.05, 3);
    this.onTrack('ending', t + 0.05, 84);
  }

  /** the Maestro conducts a rest: everything hushes, a full bar of silence, one soft note — answered */
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
  }

  private bloom(t: number): void {
    this.director.play('cine:bloom', t, 0.5);
    this.onTrack('ending', t, 84);
  }

  private bow(t: number): void {
    const p = this.director.current;
    if (p && p.id === 'cine:bloom') {
      p.state.bowBar = Math.max(p.composedUntil, p.barAt(t) + 1);
      return;
    }
    const np = this.director.play('cine:bloom', t, 0.5);
    if (np) np.state.bowBar = 0;
    this.onTrack('ending', t, 84);
  }
}
