/**
 * Game and UI sound effects, stingers and fanfares. Everything that can be is tuned to the music:
 * pitches come from the chord at `t` or from the key of the song that is playing.
 * The studio sting is TESSELLA's, unchanged (the studio's audio signature).
 */
import type { Core } from './core';
import { Fx } from './fx';
import type { Director } from './music';
import { BufferBank, Channel, CHOIR, drum, HORNLEAD, LOWBRASS, OBOE, CELLO, PAD, STRINGS, SUB, type BufInst } from './synth';
import { bassNote, chord, chordTones, type Chord, MODES, note, pcOf, Scale } from './theory';
import { clamp, pick, rand } from './util';

const PANS = [-0.6, -0.3, 0, 0.3, 0.6];

export class Sfx {
  readonly fx: Fx;
  private readonly ui: Channel;
  private readonly big: Channel;
  /** battle hits (the stomp, boss entrances, the heart, the title hit) */
  private readonly boom: Channel;
  private readonly fan: Channel;
  private readonly world: Channel[];
  private lastHover = 0;
  /** the key of the last song (stingers after the music stopped) */
  lastKey: Scale = new Scale(note('F4'), MODES.major);

  constructor(
    private readonly core: Core,
    private readonly bank: BufferBank,
    private readonly director: Director,
  ) {
    this.fx = new Fx(core, bank);
    this.ui = new Channel(core, core.sfxDry, core.sfxWet, { pan: 0, wet: 0.08, gain: 0.8 });
    // TESSELLA's stinger channel (the studio sting must sound identical)
    this.big = new Channel(core, core.sfxDry, core.sfxWet, { wet: 0.6, gain: 0.85, vibratoCents: 6 });
    this.boom = new Channel(core, core.sfxDry, core.sfxWet, { wet: 0.5, gain: 0.45, vibratoCents: 6 });
    this.fan = new Channel(core, core.sfxDry, core.sfxWet, { wet: 0.42, gain: 0.42, vibratoCents: 5 });
    this.world = PANS.map((pan) => new Channel(core, core.sfxDry, core.sfxWet, { pan, wet: 0.22, gain: 0.5 }));
    bank.warm('wood', 50, 90, 4);
    bank.warm('tile', 60, 96, 4);
  }

  private get now(): number {
    return this.core.now;
  }

  private at(pan: number): Channel {
    const p = clamp(Number.isFinite(pan) ? pan : 0, -1, 1);
    return this.world[clamp(Math.round((p + 1) * 2), 0, 4)];
  }

  private buf(inst: BufInst, ch: Channel, t: number, midi: number, vel: number, dur: number, o: { release?: number; lp?: number; cat?: string; cap?: number } = {}): void {
    this.fx.buf(inst, ch, t, midi, vel, dur, o);
  }

  /** the key sounding now (a movement may have lifted it), or the last one heard */
  key(): Scale {
    const k = this.director.current ? this.director.keyAt(this.core.now) : null;
    if (k) this.lastKey = k;
    return this.lastKey;
  }

  /** the parallel major of the current key (fanfares are always bright) */
  private majorKey(): Scale {
    return new Scale(this.key().tonic, MODES.major);
  }

  private chordAt(t: number): Chord {
    return this.director.chordAt(t) ?? chord(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][this.key().tonicPc]);
  }

  private spb(): number {
    return this.director.current?.spb ?? 0.6;
  }

  // ───────────────────────────── building ─────────────────────────────

  build(t: number, pan: number): void {
    const ch = this.at(pan);
    const c = this.chordAt(t);
    const low = chordTones(c, 50, 62);
    this.buf('wood', ch, t, low[0] ?? 50, 0.45, 0.25);
    this.buf('wood', ch, t + 0.085, (low[1] ?? 55) + 0, 0.38, 0.25);
    this.buf('kick', ch, t, 54, 0.3, 0.3, { lp: 1200 });
    this.fx.burst(ch.input, t, { noise: 'pink', type: 'lowpass', f: 900, d: 0.12, g: 0.1 });
    const up = chordTones(c, 67, 84);
    if (up.length) {
      this.buf('harp', ch, t + 0.17, up[0], 0.32, 0.8, { release: 0.6 });
      this.buf('celesta', ch, t + 0.24, up[Math.min(2, up.length - 1)] + 12, 0.16, 0.8, { release: 0.6 });
    }
  }

  upgrade(t: number, pan: number, level: number): void {
    const ch = this.at(pan);
    const lv = clamp(Math.round(Number.isFinite(level) ? level : 1), 1, 2);
    const c = this.chordAt(t);
    const tones = chordTones(c, 67, 96);
    const n = lv === 2 ? 6 : 4;
    for (let k = 0; k < n && k < tones.length; k++) this.buf(k % 2 ? 'celesta' : 'harp', ch, t + k * 0.055, tones[k], 0.22 - k * 0.012, 1.0, { release: 0.8 });
    this.fx.burst(ch.input, t, { noise: 'white', type: 'highpass', f: 3000, f1: 8000, a: 0.15, d: 0.4, g: 0.035 });
    if (lv === 2) {
      for (const m of chordTones(c, 57, 69).slice(0, 3)) this.buf('choir', ch, t + 0.05, m, 0.16, 1.4, { release: 0.8 });
      this.buf('glass', ch, t + n * 0.055, (tones[n] ?? tones[tones.length - 1]) + 12, 0.18, 1.5, { release: 1.2 });
    }
  }

  sell(t: number, pan: number): void {
    const ch = this.at(pan);
    const tones = chordTones(this.chordAt(t), 72, 93).reverse();
    for (let k = 0; k < 5 && k < tones.length; k++) this.buf('celesta', ch, t + k * 0.05, tones[k], 0.22 - k * 0.025, 0.6, { release: 0.5 });
    this.buf('wood', ch, t, 47, 0.3, 0.2);
    this.fx.burst(ch.input, t, { noise: 'pink', f: 2400, f1: 500, q: 0.8, a: 0.02, d: 0.25, g: 0.06 });
  }

  towerMuted(t: number, pan: number, muted: boolean): void {
    const ch = this.at(pan);
    const c = this.chordAt(t);
    const m = chordTones(c, 60, 72)[0] ?? 64;
    if (muted) {
      this.buf('harp', ch, t, m, 0.5, 0.3, { lp: 500, release: 0.2 });
      this.fx.tone(ch.input, t, { f: 520, f1: 150, a: 0.01, d: 0.35, g: 0.12, lp: 700 });
      this.fx.burst(ch.input, t, { noise: 'pink', type: 'lowpass', f: 400, a: 0.01, d: 0.25, g: 0.2 });
    } else {
      this.fx.tone(ch.input, t, { type: 'triangle', f: 260, f1: 980, a: 0.02, d: 0.25, g: 0.08, lp: 3000 });
      this.buf('glass', ch, t + 0.18, m + 24, 0.3, 0.8, { release: 0.6 });
      this.buf('harp', ch, t + 0.16, m + 12, 0.4, 0.6, { release: 0.4 });
    }
  }

  switchFlip(t: number, pan: number): void {
    const ch = this.at(pan);
    for (let k = 0; k < 3; k++) this.buf('tick', ch, t + k * 0.03, 64 + k, 0.4, 0.1);
    this.buf('wood', ch, t + 0.1, 45, 0.65, 0.3);
    this.buf('rim', ch, t + 0.1, 60, 0.45, 0.2);
    this.buf('anvil', ch, t + 0.11, 80, 0.07, 0.5, { release: 0.4 });
    this.fx.burst(ch.input, t + 0.1, { noise: 'pink', type: 'lowpass', f: 600, d: 0.1, g: 0.1 });
  }

  // ───────────────────────────── waves & bosses ─────────────────────────────

  /** a horn call on the downbeat: root · root · fifth · octave of the chord sounding at t
   *  (index < 0: the journey begins — the leitmotif's opening, from the chord sounding at t) */
  waveStart(t: number, index: number, total: number): void {
    if (Number.isFinite(index) && index < 0) {
      this.journeyCall(t);
      return;
    }
    const n = Math.max(1, Math.round(Number.isFinite(total) ? total : 1));
    const i = clamp(Math.round(Number.isFinite(index) ? index : 0), 0, n - 1);
    const prog = n > 1 ? i / (n - 1) : 1;
    const last = i === n - 1 && n > 1;
    const c = this.chordAt(t + 0.01);
    const spb = this.spb();
    const root = bassNote(c, 53);
    const fifthPc = c.pcs[Math.min(2, c.pcs.length - 1)];
    let fifth = root + 1;
    while (pcOf(fifth) !== fifthPc) fifth++;
    const call: [number, number, number][] = [[0, root, 0.7], [0.75, root, 0.22], [1, fifth, 0.95], [2, root + 12, 1.9]];
    const horns = last ? 3 : prog >= 0.5 ? 2 : 1;
    const vel = 0.42 + 0.18 * prog;
    for (const [beat, m, len] of call) {
      const tt = t + beat * spb;
      this.buf('brass', this.fan, tt, m, vel, len * spb, { release: 0.3 });
      this.fx.stack(HORNLEAD(0.6), this.fan, tt, m, vel * 0.55, len * spb * 0.95);
      if (horns >= 2) this.buf('brass', this.fan, tt + 0.006, m - 12, vel * 0.6, len * spb, { release: 0.3 });
      if (horns >= 3) this.buf('brass', this.fan, tt + 0.004, m + (beat >= 2 ? 4 : 7), vel * 0.45, len * spb, { release: 0.3 });
    }
    this.buf('taiko', this.fan, t, 31, 0.6 + 0.3 * prog, 2, { release: 0.6 });
    if (last) {
      for (const m of chordTones(c, 57, 72).slice(0, 4)) this.buf('choir', this.fan, t + 2 * spb, m, 0.3, 2 * spb + 0.5, { release: 0.8 });
      this.buf('crash', this.fan, t + 2 * spb, 60, 0.35, 3);
      for (let k = 0; k < 8; k++) this.buf('timp', this.fan, t + (1 + k * 0.125) * spb, bassNote(c, 41), 0.12 + k * 0.04, 1);
    }
  }

  private journeyCall(t: number): void {
    const c = this.chordAt(t + 0.01);
    const k = this.key();
    const spb = this.spb();
    const root = bassNote(c, 53);
    const d0 = k.degreeOf(root);
    const call: [number, number, number][] = [[0, 0, 1], [4, 1, 1.5], [3, 2.5, 0.5], [2, 3, 1], [7, 4, 2.5]];
    for (const [d, beat, len] of call) {
      const m = k.deg(d0 + d);
      const tt = t + beat * spb;
      this.buf('brass', this.fan, tt, m, 0.5, len * spb, { release: 0.35 });
      this.fx.stack(HORNLEAD(0.7), this.fan, tt, m, 0.55, len * spb * 0.96);
      this.buf('brass', this.fan, tt + 0.004, m - 12, 0.32, len * spb, { release: 0.35 });
    }
    this.buf('taiko', this.fan, t, 31, 0.75, 2, { release: 0.6 });
    this.buf('crash', this.fan, t + 4 * spb, 62, 0.22, 3);
  }

  bossAppear(t: number): void {
    const k = this.key();
    let root = 33;
    while (pcOf(root) !== k.tonicPc) root++;
    const spb = this.spb();
    this.core.duck(0.45, 2.4);
    this.buf('gong', this.boom, t, 60, 0.42, 6);
    this.buf('boom', this.boom, t, root, 0.7, 2.2);
    // three heavy footsteps
    for (let s = 0; s < 3; s++) {
      this.buf('taiko', this.boom, t + s * spb, 29, 0.7 - s * 0.06, 2);
      this.fx.burst(this.boom.input, t + s * spb, { noise: 'brown', type: 'lowpass', f: 160, a: 0.01, d: 0.5, g: 0.3 });
    }
    for (const m of [root + 12, root + 19, root + 24]) {
      this.buf('brass', this.boom, t, m, 0.45, 2.6 * spb, { release: 0.8 });
      this.fx.stack({ ...LOWBRASS(0.7), attack: 0.08, release: 1.2 }, this.boom, t, m, 0.6, 3 * spb);
    }
    // a dissonant shiver above (minor ninth), fading
    for (const m of [root + 37, root + 36]) this.fx.stack({ ...STRINGS(0.6), attack: 0.4, release: 1.5 }, this.boom, t + 0.2, m, 0.35, 2.4 * spb);
    for (let i = 0; i < 12; i++) this.buf('timp', this.boom, t + 2 * spb + i * spb / 6, root + 12, 0.12 + i * 0.035, 1);
    this.buf('crash', this.boom, t + 4 * spb, 57, 0.4, 3);
  }

  countIn(t: number, beat: number): void {
    const b = ((Math.round(Number.isFinite(beat) ? beat : 0) % 4) + 4) % 4;
    this.buf('wood', this.ui, t, b === 0 ? 84 : 79, b === 0 ? 0.55 : 0.36, 0.2);
    this.buf('tick', this.ui, t, b === 0 ? 64 : 60, b === 0 ? 0.3 : 0.18, 0.1);
  }

  // ───────────────────────────── FORTÍSSIMO power ─────────────────────────────

  ffReady(): void {
    const t = this.now + 0.01;
    const c = this.chordAt(t);
    const tones = chordTones(c, 79, 100);
    tones.slice(0, 6).forEach((m, k) => this.buf('glass', this.fan, t + k * 0.06, m, 0.26 - k * 0.02, 1.6, { release: 1.2 }));
    for (const m of chordTones(c, 60, 72).slice(0, 3)) this.buf('choir', this.fan, t + 0.1, m, 0.2, 1.4, { release: 0.9 });
    this.fx.burst(this.fan.input, t, { noise: 'white', f: 2000, f1: 8000, q: 1.5, a: 0.4, d: 0.5, g: 0.04 });
    this.fx.tone(this.fan.input, t, { f: 55, f1: 110, a: 0.3, d: 0.9, g: 0.12 });
  }

  /** One bar of build-up (noise sweep, snare roll, rising pitch) and the turtle's STOMP at tDrop. */
  ffUnleash(t: number, tDrop: number): void {
    const now = this.now;
    let t0 = Math.max(now, t);
    let td = tDrop;
    if (!(td > t0 + 0.2)) td = t0 + Math.max(0.2, this.spb() * 4);
    if (td - t0 > 8) t0 = td - 8;
    const dur = td - t0;
    this.core.ffBuild(t0, td);
    this.director.current?.addFF(td);
    const c = this.chordAt(td + 0.01);
    const ctx = this.core.ctx;
    const out = this.fan.input;

    // noise riser (cut dead at the drop)
    {
      const src = this.core.noise('white', t0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(400, t0);
      bp.frequency.exponentialRampToValueAtTime(9000, td);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, td - 0.01);
      g.gain.linearRampToValueAtTime(0, td + 0.004);
      src.connect(bp).connect(g).connect(out);
      src.stop(td + 0.05);
      this.core.track('sfx', src, [src, bp, g]);
    }
    // snare roll, accelerating 16ths → 32nds
    const spb = dur / 4;
    let tt = t0;
    let i = 0;
    while (tt < td - 0.02 && i < 64) {
      const x = (tt - t0) / dur;
      this.buf('snare', this.fan, tt, 60 + x * 2, 0.12 + 0.5 * x * x, 0.3, { cat: 'roll', cap: 40 });
      tt += x < 0.5 ? spb / 4 : spb / 8;
      i++;
    }
    // rising pitch: two detuned saws from an octave below the drop chord to an octave above
    const r = bassNote(c, 45);
    for (const det of [-9, 9]) this.fx.glide(out, t0, { f0: 440 * Math.pow(2, (r - 69) / 12), f1: 440 * Math.pow(2, (r + 24 - 69) / 12), dur: dur + 0.005, g: 0.035, a: dur * 0.6, lp0: 500, lp1: 7000, q: 2, detune: det });

    // ── the STOMP ──
    let sub = 28;
    while (pcOf(sub) !== c.root) sub++;
    this.buf('boom', this.boom, td, sub, 1, 2.4);
    this.buf('taiko', this.boom, td, 29, 1, 2);
    this.buf('kick', this.boom, td, 57, 0.9, 0.8);
    this.fx.tone(this.boom.input, td, { f: 58, f1: 36, a: 0.004, d: 1.5, g: 0.45 });
    this.fx.burst(this.boom.input, td, { noise: 'brown', type: 'lowpass', f: 140, a: 0.01, d: 1.6, g: 0.5 });
    this.buf('crash', this.boom, td, 60, 0.75, 3.5);
    this.buf('crash', this.boom, td + 0.003, 55, 0.45, 3.5);
    for (const m of chordTones(c, 48, 67).slice(0, 4)) this.buf('brass', this.fan, td, m, 0.55, 0.55, { release: 0.25 });
    for (const m of chordTones(c, 57, 72).slice(0, 4)) this.buf('choir', this.fan, td, m, 0.42, 1.6, { release: 0.8 });
    for (const m of chordTones(c, 55, 76).slice(0, 4)) this.fx.stack({ ...STRINGS(1), attack: 0.01, release: 0.6 }, this.fan, td, m, 0.7, 0.35);
  }

  // ───────────────────────────── results ─────────────────────────────

  victory(): void {
    const t = this.now + 0.3;
    const k = this.majorKey();
    let T = 55;
    while (pcOf(T) !== k.tonicPc) T++;
    const d0 = k.degreeOf(T);
    const deg = (d: number) => k.deg(d0 + d);
    const beat = 0.5;
    this.buf('snare', this.fan, t - 0.25, 60, 0.15, 0.2);
    for (let i = 0; i < 6; i++) this.buf('snare', this.fan, t - 0.25 + i * 0.04, 60.5, 0.12 + i * 0.05, 0.2, { cat: 'roll', cap: 40 });
    const mel: [number, number, number][] = [[0, 0, 0.16], [0, 0.17, 0.16], [0, 0.34, 0.16], [4, 0.5, 0.72], [3, 1.25, 0.24], [2, 1.5, 0.48], [7, 2, 2.2]];
    for (const [d, at, len] of mel) {
      const m = deg(d);
      this.buf('brass', this.fan, t + at * 2 * beat, m, 0.5, len * 2 * beat, { release: 0.4 });
      this.fx.stack(HORNLEAD(0.8), this.fan, t + at * 2 * beat, m, 0.5, len * 2 * beat * 0.97);
      this.buf('brass', this.fan, t + at * 2 * beat + 0.005, m - 12, 0.4, len * 2 * beat, { release: 0.4 });
    }
    const I = chord(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][k.tonicPc]);
    const V = chord(['G', 'G#', 'A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#'][k.tonicPc]);
    const IV = chord(['F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E'][k.tonicPc]);
    const chordAt = (cc: Chord, at: number, len: number, vel: number) => {
      for (const m of chordTones(cc, 50, 69).slice(0, 4)) this.fx.stack({ ...STRINGS(0.8), attack: 0.06, release: 1.2 }, this.fan, t + at, m, vel, len);
    };
    chordAt(I, 0.5, 1.0, 0.6);
    chordAt(IV, 1.5, 0.5, 0.55);
    chordAt(V, 2.0, 0.5, 0.6);
    // the final chord
    const tf = t + 2 * 2 * beat;
    chordAt(I, 2 * 2 * beat, 2.2, 0.75);
    for (const m of chordTones(I, 55, 72).slice(0, 4)) this.buf('choir', this.fan, tf, m, 0.42, 2.4, { release: 1.2 });
    this.buf('timp', this.fan, t + 0.5, bassNote(I, 41), 0.55, 2);
    this.buf('timp', this.fan, tf, bassNote(I, 41), 0.7, 3);
    this.buf('crash', this.fan, tf, 60, 0.55, 3.5);
    this.buf('taiko', this.fan, tf, 31, 0.7, 2);
    for (let i = 0; i < 10; i++) this.buf('harp', this.fan, tf - 0.4 + i * 0.04, k.deg(d0 + 7 + i), 0.24, 1.4, { release: 1 });
    this.fx.stack({ ...SUB(), attack: 0.02, release: 1.5 }, this.fan, tf, bassNote(I, 29), 0.6, 2.2);
  }

  defeat(): void {
    const t = this.now + 1.25;
    const k = new Scale(this.key().tonic, MODES.aeolian);
    let T = 64;
    while (pcOf(T) !== k.tonicPc) T++;
    const d0 = k.degreeOf(T);
    const phrase: [number, number, number][] = [[4, 0, 0.55], [3, 0.6, 0.55], [2, 1.2, 0.55], [1, 1.8, 0.9], [0, 2.8, 2.2]];
    for (const [d, at, len] of phrase) this.fx.stack(OBOE(), this.fan, t + at, k.deg(d0 + d), 0.62, len);
    const tonicName = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][k.tonicPc];
    const i = chord(`${tonicName}m`);
    for (const m of chordTones(i, 45, 60).slice(0, 3)) this.fx.stack({ ...PAD(700), attack: 1.2, release: 2 }, this.fan, t - 0.3, m, 0.8, 4.2);
    this.fx.stack(CELLO(), this.fan, t, bassNote(i, 36), 0.55, 4.5);
    for (let j = 0; j < 10; j++) this.buf('timp', this.fan, t + 2.2 + j * 0.06, bassNote(i, 38), 0.05 + j * 0.015, 1);
    this.buf('timp', this.fan, t + 2.8, bassNote(i, 38), 0.4, 3);
  }

  star(i: number): void {
    const t = this.now + 0.01;
    const n = clamp(Math.round(Number.isFinite(i) ? i : 0), 0, 2);
    const k = this.majorKey();
    let T = 79;
    while (pcOf(T) !== k.tonicPc) T++;
    const m = [T, T + 4, T + 7][n];
    this.buf('glass', this.fan, t, m, 0.32, 2, { release: 1.6 });
    this.buf('celesta', this.fan, t + 0.005, m - 12, 0.25, 1.2, { release: 1 });
    this.buf('tbell', this.fan, t, m - 24, 0.12 + 0.05 * n, 3, { release: 1.5 });
    this.fx.burst(this.fan.input, t, { noise: 'white', type: 'highpass', f: 5000, a: 0.08, d: 0.5 + 0.2 * n, g: 0.02 + 0.01 * n });
    if (n === 2) {
      [T + 12, T + 16, T + 19, T + 24].forEach((x, j) => this.buf('glass', this.fan, t + 0.12 + j * 0.06, Math.min(100, x), 0.16, 1.6, { release: 1.2 }));
      for (const x of [T - 24, T - 20, T - 17]) this.buf('choiroo', this.fan, t + 0.05, x, 0.22, 1.8, { release: 1 });
    }
  }

  newTower(): void {
    const t = this.now + 0.05;
    const k = this.majorKey();
    let T = 53;
    while (pcOf(T) !== k.tonicPc) T++;
    const d0 = k.degreeOf(T);
    for (let i = 0; i < 14; i++) this.buf('harp', this.fan, t + i * 0.05, k.deg(d0 + 7 + i), 0.22 + i * 0.008, 1.3, { release: 1 });
    const tt = t + 0.75;
    const call: [number, number, number][] = [[0, 0, 0.25], [4, 0.25, 0.5], [7, 0.75, 1.6]];
    for (const [d, at, len] of call) {
      this.fx.stack(HORNLEAD(0.8), this.fan, tt + at, k.deg(d0 + d), 0.75, len);
      this.buf('brass', this.fan, tt + at, k.deg(d0 + d), 0.45, len, { release: 0.4 });
    }
    const I = chord(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][k.tonicPc]);
    for (const m of chordTones(I, 57, 74).slice(0, 4)) {
      this.fx.stack({ ...STRINGS(0.9), attack: 0.3, release: 1.4 }, this.fan, tt + 0.75, m, 0.6, 1.6);
      this.buf('choir', this.fan, tt + 0.75, m, 0.3, 1.8, { release: 1 });
    }
    for (let i = 0; i < 6; i++) this.buf('glass', this.fan, tt + 0.8 + i * 0.07, k.deg(d0 + 14 + [0, 2, 4, 7, 9, 11][i]), 0.18, 1.6, { release: 1.2 });
    this.buf('timp', this.fan, tt + 0.75, bassNote(I, 41), 0.55, 2);
    this.buf('crash', this.fan, tt + 0.75, 62, 0.3, 3);
  }

  /** the colossus is healed (hymn duet): the choir rises through the chord, a bell, a shimmer of glass */
  heartHeal(t: number): void {
    const ch = this.fan;
    const c = this.chordAt(t + 0.01);
    this.core.duck(0.12, 1.2);
    // a soft warm swell under it (strings on the chord, opening)
    for (const m of chordTones(c, 53, 67).slice(0, 3)) this.fx.stack({ ...STRINGS(0.7), attack: 0.35, release: 0.9 }, ch, t, m, 0.42, 1.1);
    // the choir rises through the chord, one voice after the other
    const voices = chordTones(c, 60, 76).slice(0, 4);
    voices.forEach((m, i) => this.buf('choir', ch, t + i * 0.11, m, 0.2 + 0.025 * i, 1.35 - i * 0.08, { release: 0.9 }));
    // the bell rings the root; glass climbs above it
    this.buf('tbell', ch, t + 0.02, bassNote(c, 60), 0.24, 2.2, { release: 1.2 });
    chordTones(c, 81, 100).slice(0, 5).forEach((m, i) => this.buf('glass', ch, t + 0.28 + i * 0.075, m, 0.15 - i * 0.012, 1.1, { release: 0.9 }));
    this.fx.burst(ch.input, t + 0.2, { noise: 'white', type: 'highpass', f: 5000, f1: 9000, a: 0.25, d: 0.9, g: 0.022 });
  }

  heartHit(t: number, livesLeft: number): void {
    const s = 1 - clamp(Number.isFinite(livesLeft) ? livesLeft : 1, 0, 1);
    const ch = this.boom;
    this.core.duck(0.22 + 0.2 * s, 0.35);
    this.buf('kick', ch, t, 50, 0.6, 0.6, { lp: 1500 });
    this.fx.burst(ch.input, t, { noise: 'brown', type: 'lowpass', f: 300, d: 0.35, g: 0.35 });
    // the crystal heart cracks
    this.fx.burst(ch.input, t + 0.01, { noise: 'white', type: 'highpass', f: 4000, a: 0.0008, d: 0.09, g: 0.12 });
    this.buf('anvil', ch, t + 0.01, 89, 0.08 + 0.06 * s, 0.6, { release: 0.5 });
    this.buf('glass', ch, t + 0.02, 95, 0.1, 0.8, { release: 0.6 });
    const k = this.key();
    let r = 45;
    while (pcOf(r) !== k.tonicPc) r++;
    // a low, dissonant brass groan (worse when few lives are left)
    this.buf('brass', ch, t, r, 0.3 + 0.25 * s, 0.5, { release: 0.3, lp: 1800 });
    if (s > 0.5) this.buf('brass', ch, t, r + 1, 0.22 + 0.2 * s, 0.5, { release: 0.3, lp: 1800 });
  }

  bossDeath(t: number): void {
    const k = this.majorKey();
    let r = 29;
    while (pcOf(r) !== k.tonicPc) r++;
    this.core.duck(0.45, 2.5);
    this.buf('boom', this.boom, t, r, 1, 2.4);
    this.buf('taiko', this.boom, t, 29, 0.9, 2);
    this.buf('crash', this.boom, t, 58, 0.7, 3.5);
    this.fx.burst(this.boom.input, t, { noise: 'white', f: 1200, f1: 6000, q: 0.7, a: 0.005, d: 1.2, g: 0.14 });
    const I = chord(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][k.tonicPc]);
    for (const m of chordTones(I, 55, 72).slice(0, 4)) this.buf('choir', this.fan, t + 0.05, m, 0.4, 2.6, { release: 1.2 });
    for (const m of chordTones(I, 43, 62).slice(0, 4)) this.buf('brass', this.fan, t + 0.02, m, 0.5, 1.6, { release: 0.6 });
    const up = chordTones(I, 76, 100);
    up.forEach((m, i) => this.buf('glass', this.fan, t + 0.3 + i * 0.07, m, 0.22, 1.8, { release: 1.4 }));
  }

  // ───────────────────────────── ui ─────────────────────────────

  uiHover(): void {
    const t = this.now;
    if (t - this.lastHover < 0.045) return;
    this.lastHover = t;
    this.fx.tone(this.ui.input, t, { f: 2300, d: 0.03, g: 0.016, cat: 'ui' });
  }

  uiClick(): void {
    const t = this.now;
    this.buf('wood', this.ui, t, note('G5'), 0.28, 0.2);
    this.buf('tile', this.ui, t + 0.005, note('D6'), 0.12, 0.2);
  }

  uiBack(): void {
    const t = this.now;
    this.buf('wood', this.ui, t, note('D5'), 0.24, 0.2);
    this.buf('tile', this.ui, t + 0.005, note('A5'), 0.08, 0.2);
  }

  uiOpen(): void {
    const t = this.now;
    this.fx.burst(this.ui.input, t, { noise: 'pink', f: 500, f1: 2200, q: 0.8, a: 0.04, d: 0.12, g: 0.06 });
    const k = this.key();
    let m = 72;
    while (pcOf(m) !== k.tonicPc) m++;
    this.buf('harp', this.ui, t + 0.02, m, 0.22, 0.5, { release: 0.4 });
    this.buf('harp', this.ui, t + 0.07, m + 7, 0.18, 0.5, { release: 0.4 });
  }

  uiDeny(): void {
    const t = this.now;
    this.buf('wood', this.ui, t, note('E3'), 0.3, 0.2);
    this.fx.tone(this.ui.input, t + 0.01, { type: 'triangle', f: 196, d: 0.16, g: 0.03, lp: 900, a: 0.01 });
    this.fx.tone(this.ui.input, t + 0.01, { type: 'triangle', f: 207.65, d: 0.16, g: 0.028, lp: 900, a: 0.01 });
    this.buf('wood', this.ui, t + 0.1, note('D#3'), 0.24, 0.2);
  }

  achievement(): void {
    const t = this.now;
    [note('G5'), note('B5'), note('D6'), note('G6')].forEach((m, i) => this.buf('glass', this.big, t + i * 0.09, m, 0.32, 1.5, { release: 1.4 }));
    this.fx.burst(this.big.input, t + 0.1, { noise: 'white', type: 'highpass', f: 5000, a: 0.3, d: 0.8, g: 0.025 });
  }

  save(): void {
    const t = this.now;
    this.buf('celesta', this.ui, t, note('D6'), 0.25, 0.4);
    this.buf('celesta', this.ui, t + 0.11, note('A6'), 0.22, 0.6);
  }

  // ───────────────────────────── intro ─────────────────────────────

  /** TESSELLA's studio sting, verbatim (the Uchihadam Production audio signature). */
  studioSting(): void {
    const t = this.now + 0.05;
    const ctx = this.core.ctx;
    const out = this.big.input;
    // deep boom
    this.fx.tone(out, t, { f: 58, f1: 31, a: 0.01, d: 3.2, g: 0.45 });
    drum(this.core, out, t, 'low', 0.8);
    // warm dark-gold swell (A minor add9, low register, filter opening)
    const notes = [note('A1'), note('E2'), note('A2'), note('C3'), note('B3')];
    for (const m of notes) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      const f = 440 * Math.pow(2, (m - 69) / 12);
      osc1.frequency.value = f;
      osc2.frequency.value = f;
      osc1.detune.value = -7;
      osc2.detune.value = 7;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(140, t);
      lp.frequency.exponentialRampToValueAtTime(1300, t + 3.2);
      lp.frequency.exponentialRampToValueAtTime(300, t + 6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 2.4);
      g.gain.linearRampToValueAtTime(0.03, t + 4.2);
      g.gain.linearRampToValueAtTime(0, t + 6.2);
      osc1.connect(lp);
      osc2.connect(lp);
      lp.connect(g).connect(out);
      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 6.4);
      osc2.stop(t + 6.4);
      this.core.track('sting', osc1, [osc1, osc2, lp, g]);
    }
    // fire roar
    this.fx.burstT(out, t + 0.3, { noise: 'pink', type: 'lowpass', f: 500, a: 1.5, d: 4, g: 0.05 });
    // ember crackle
    for (let i = 0; i < 70; i++) {
      const tt = t + 0.4 + Math.pow(Math.random(), 1.3) * 5.2;
      this.fx.burstT(out, tt, { noise: 'white', type: 'highpass', f: rand(1500, 4500), q: 0.7, a: 0.0008, d: rand(0.002, 0.012), g: rand(0.02, 0.09), cat: 'crackle' });
    }
    // a faint metallic gleam as the gold catches light
    this.buf('glass', this.big, t + 1.6, note('E6'), 0.14, 3, { release: 2 });
    this.buf('glass', this.big, t + 1.75, note('A6'), 0.1, 3, { release: 2 });
  }

  /** FORTÍSSIMO logo: notes rush in from both sides, then the "ff" stamp lands on a huge chord. */
  titleReveal(): void {
    const t = this.now + 0.05;
    const ctx = this.core.ctx;
    const hit = t + 2.3;
    const F = new Scale(note('F4'), MODES.majorPent);
    // the rush: an accelerating swirl closing in on the middle register
    let tt = t;
    let gap = 0.19;
    let i = 0;
    while (tt < hit - 0.03 && i < 80) {
      const x = (tt - t) / (hit - t);
      const side = i % 2 ? 1 : -1;
      const spread = (1 - x) * 14;
      const centre = F.degreeOf(note('F5'));
      const m = F.deg(Math.round(centre + side * spread * 0.55 + rand(-1.5, 1.5)));
      const inst: BufInst = i % 3 === 0 ? 'harp' : i % 3 === 1 ? 'celesta' : 'glass';
      const ch = this.world[side < 0 ? 0 : 4];
      this.buf(inst, ch, tt, m, 0.12 + 0.2 * x, 0.6, { release: 0.4, cap: 64 });
      tt += gap;
      gap = Math.max(0.026, gap * 0.9);
      i++;
    }
    // reverse-cymbal swell + string crescendo + timpani roll
    {
      const src = this.core.noise('white', t);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(5000, t);
      hp.frequency.exponentialRampToValueAtTime(1800, hit);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, hit - 0.01);
      g.gain.linearRampToValueAtTime(0, hit + 0.01);
      src.connect(hp).connect(g).connect(this.boom.input);
      src.stop(hit + 0.05);
      this.core.track('sfx', src, [src, hp, g]);
    }
    for (const m of [note('C3'), note('F3'), note('G3'), note('Bb3'), note('C4')]) this.fx.stack({ ...STRINGS(0.7), attack: 2.1, release: 0.15 }, this.fan, t + 0.1, m, 0.55, hit - t - 0.1);
    for (let k = 0; k < 14; k++) this.buf('timp', this.boom, hit - 1.0 + k * (1 / 14), note('C3'), 0.08 + k * 0.03, 1);
    // ── the stamp: ff ──
    this.buf('rim', this.boom, hit, 58, 0.6, 0.2);
    this.buf('kick', this.boom, hit, 55, 0.9, 0.8);
    this.buf('boom', this.boom, hit, note('F1'), 0.95, 2.4);
    this.buf('taiko', this.boom, hit, 29, 0.9, 2);
    this.fx.tone(this.boom.input, hit, { f: 60, f1: 43.7, a: 0.004, d: 2.6, g: 0.4 });
    this.buf('crash', this.boom, hit, 60, 0.7, 3.5);
    this.buf('gong', this.boom, hit, 60, 0.3, 6);
    this.buf('timp', this.boom, hit, note('F2'), 0.8, 3);
    for (const m of [note('F2'), note('C3'), note('F3'), note('A3'), note('C4'), note('F4')]) this.buf('brass', this.fan, hit, m, 0.5, 2.6, { release: 1.4 });
    for (const m of [note('F3'), note('C4'), note('F4'), note('A4'), note('C5')]) this.fx.stack({ ...LOWBRASS(0.8), attack: 0.03, release: 2 }, this.fan, hit, m, 0.7, 2.6);
    for (const m of [note('F3'), note('A3'), note('C4'), note('F4'), note('A4'), note('C5'), note('F5')]) this.fx.stack({ ...STRINGS(1), attack: 0.04, release: 2.4 }, this.fan, hit, m, 0.7, 2.6);
    for (const m of [note('F3'), note('A3'), note('C4'), note('F4'), note('A4')]) this.buf('choir', this.fan, hit, m, 0.42, 2.8, { release: 1.6 });
    for (let k = 0; k < 6; k++) this.buf('glass', this.boom, hit + 0.15 + k * 0.08, pick([note('F6'), note('A6'), note('C7'), note('F7')]), 0.1, 2, { release: 1.6 });
    this.fx.stack({ ...CHOIR('ah'), attack: 0.3, release: 2 }, this.boom, hit + 0.05, note('C5'), 0.4, 2.6);
  }
}
