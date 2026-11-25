/**
 * Signature motifs of the musicians (joinMotif), the duet flourishes and the plate chime.
 *
 *  - joinMotif(kind): when a rescued musician joins in a cutscene it plays its own ≈2-bar motif ON
 *    the music that is playing: on its next beat, in its key, every note checked against the chord
 *    of the moment (so it is consonant whatever mood is under it). The mood is asked to hold its
 *    tonic for the motif (a "spotlight") when it can.
 *  - duet(id, t, pan): the two partners' instruments play a short figure together (≤ 1 bar).
 *  - plateUnlock(t, pan): a bright little chime.
 *
 * The eight motifs, one per musician (degrees of the key; beats):
 *   harp    Lira — shy: the FORTÍSSIMO head, then a little arpeggio up to a sweet suspension
 *   drum    Bumbo — BOOM ba-da BOOM BOOM | a tom run down … BOOM (crash)
 *   bell    Dona Badalo — the old clock-tower chime (3 1 2 5 | 5 2 3 1) and a deep last toll
 *   shaker  Chocalho — a cheeky baião shake that ends in a marimba "ta-dá!"
 *   crystal Cristalina — a two-octave cascade of sparkles, up and down
 *   horn    Trompa — the heroic call: root, fifth… octave!
 *   choir   the Coralitos — three little voices enter one by one, then a tiny "A-men"
 *   bass    Grave — a swaggering walk that ends in a huge low BOOM
 */
import type { DuetId, TowerKind } from '../../sim/defs';
import type { Core } from './core';
import { Fx } from './fx';
import type { Director } from './music';
import { BufferBank, Channel, type BufInst, HORNLEAD, CHOIR, LOWBRASS, type StackOpts } from './synth';
import { bassNote, chord, chordTones, type Chord, MODES, nearestChordTone, note, pcOf, Scale } from './theory';
import { clamp, rand } from './util';

type Ev = { d: number; at: number; len: number; v?: number; inst?: BufInst | StackOpts; oct?: number };

const PANS = [-0.6, -0.3, 0, 0.3, 0.6];

export class Motifs {
  private readonly fx: Fx;
  private ch: { stage: Channel; wide: Channel; world: Channel[] } | null = null;
  private lastJoin = -1;

  constructor(
    private readonly core: Core,
    private readonly bank: BufferBank,
    private readonly director: Director,
  ) {
    this.fx = new Fx(core, bank);
  }

  /** the channels, made on first use (nothing to build at unlock) */
  private get chans(): { stage: Channel; wide: Channel; world: Channel[] } {
    if (!this.ch) {
      const core = this.core;
      this.ch = {
        // joinMotif: the music bus (it is part of the score)
        stage: new Channel(core, core.stingDry, core.stingWet, { wet: 0.32, gain: 0.62, vibratoCents: 5 }),
        wide: new Channel(core, core.stingDry, core.stingWet, { wet: 0.5, gain: 0.5, vibratoCents: 4, pan: 0.15 }),
        // duets & plates: the battle (sfx) bus, panned
        world: PANS.map((pan) => new Channel(core, core.sfxDry, core.sfxWet, { pan, wet: 0.28, gain: 0.5 })),
      };
    }
    return this.ch;
  }
  private get stage(): Channel {
    return this.chans.stage;
  }
  private get stageWide(): Channel {
    return this.chans.wide;
  }

  private at(pan: number): Channel {
    const p = clamp(Number.isFinite(pan) ? pan : 0, -1, 1);
    return this.chans.world[clamp(Math.round((p + 1) * 2), 0, 4)];
  }

  private key(t: number): Scale {
    return this.director.keyAt(t) ?? new Scale(note('F4'), MODES.major);
  }

  private chordAt(t: number, k: Scale): Chord {
    return this.director.chordAt(t) ?? chord(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][k.tonicPc]);
  }

  /** the grid of the music that is playing: next beat and the motif's beat length */
  private grid(): { t: number; spb: number } {
    const now = this.core.now;
    const p = this.director.ref;
    if (!p) return { t: now + 0.06, spb: 0.6 };
    let spb = p.spb;
    const k = Math.ceil((now + 0.05 - p.t0) / spb - 1e-6);
    const t = p.t0 + k * spb;
    while (spb > 0.78) spb /= 2;
    return { t: t < now + 0.03 ? t + p.spb : t, spb };
  }

  /** degree → MIDI in the key, near `around` (the instrument's register) */
  private deg(k: Scale, d: number, around: number): number {
    let T = around - 6;
    while (pcOf(T) !== k.tonicPc) T++;
    const d0 = k.degreeOf(T);
    return k.deg(d0 + Math.floor(d)) + (d - Math.floor(d) >= 0.25 ? 1 : 0);
  }

  /** strong-beat notes are moved to the nearest chord tone of the moment when they clash */
  private fit(m: number, t: number, k: Scale, strong: boolean): number {
    const c = this.chordAt(t, k);
    if (c.pcs.includes(pcOf(m))) return m;
    if (!strong) return k.has(m) ? m : nearestChordTone(c, m);
    return nearestChordTone(c, m);
  }

  private play(ch: Channel, inst: BufInst | StackOpts, t: number, m: number, vel: number, dur: number, release = 0.4): void {
    if (typeof inst === 'string') this.fx.buf(inst, ch, t, m, vel, dur, { release, cat: 'motif', cap: 64 });
    else this.fx.stack(inst, ch, t, m, vel, dur);
  }

  // ───────────────────────────── joinMotif ─────────────────────────────

  join(kind: TowerKind): void {
    const now = this.core.now;
    if (now - this.lastJoin < 0.4) return;
    this.lastJoin = now;
    const { t, spb } = this.grid();
    const k = this.key(t);
    this.director.current?.spotlight(t, t + 8 * spb + 0.5);
    this.core.duck(0.25, 8 * spb);
    const run = (evs: Ev[], inst: BufInst | StackOpts, around: number, ch = this.stage, vel = 0.5, release = 0.5) => {
      for (const e of evs) {
        const tt = t + e.at * spb;
        const strong = e.at % 1 === 0 && e.len >= 0.5;
        const m = this.fit(this.deg(k, e.d, around) + (e.oct ?? 0), tt, k, strong);
        this.play(ch, e.inst ?? inst, tt, m, vel * (e.v ?? 1), e.len * spb * 0.95, release);
      }
    };
    switch (kind) {
      case 'harp': {
        run([{ d: 0, at: 0, len: 1 }, { d: 4, at: 1, len: 1.5 }, { d: 3, at: 2.5, len: 0.5 }, { d: 2, at: 3, len: 1 }, { d: 0, at: 4, len: 0.5, v: 0.8 }, { d: 2, at: 4.5, len: 0.5, v: 0.85 }, { d: 4, at: 5, len: 0.5, v: 0.9 }, { d: 7, at: 5.5, len: 0.5 }, { d: 8, at: 6, len: 1, v: 1.05 }, { d: 7, at: 7, len: 1.5 }], 'harp', 66, this.stage, 0.5, 0.9);
        run([{ d: 7, at: 7, len: 1.5 }], 'celesta', 78, this.stageWide, 0.22, 1.2);
        break;
      }
      case 'drum': {
        const T = this.deg(k, 0, 40);
        const tk = (at: number, m: number, v: number, inst: BufInst = 'tom') => this.fx.buf(inst, this.stage, t + at * spb, m, v, 1.2, { cat: 'motif', cap: 64, release: 0.4 });
        tk(0, T - 7, 0.85, 'taiko');
        tk(1, T + 7, 0.5);
        tk(1.5, T + 7, 0.42);
        tk(2, T - 7, 0.75, 'taiko');
        tk(3, T - 7, 0.7, 'taiko');
        [12, 10, 7, 5, 3, 0].forEach((x, i) => tk(4 + i * 0.25, T + x, 0.4 + i * 0.05));
        tk(6, T - 7, 0.95, 'taiko');
        this.fx.buf('crash', this.stage, t + 6 * spb, 60, 0.42, 3, { cat: 'motif', cap: 64 });
        this.fx.buf('snare', this.stage, t + 5.75 * spb, 60, 0.3, 0.3, { cat: 'motif', cap: 64 });
        break;
      }
      case 'bell': {
        // the clock-tower chime, then a deep toll with a glint
        const chime: Ev[] = [{ d: 2, at: 0, len: 1 }, { d: 0, at: 1, len: 1 }, { d: 1, at: 2, len: 1 }, { d: -3, at: 3, len: 1.5 }, { d: -3, at: 4, len: 1 }, { d: 1, at: 5, len: 1 }, { d: 2, at: 6, len: 1 }, { d: 0, at: 7, len: 2.5 }];
        run(chime, 'tbell', 70, this.stage, 0.42, 1.4);
        run([{ d: 0, at: 7, len: 4, oct: -12 }], 'bell', 58, this.stageWide, 0.4, 2.5);
        run([{ d: 7, at: 7.05, len: 2 }, { d: 9, at: 7.25, len: 2 }], 'glass', 86, this.stageWide, 0.12, 1.5);
        break;
      }
      case 'shaker': {
        const pat = 'x.oxx.oxx.oxxxox';
        for (let i = 0; i < 16; i++) {
          const ch = pat[i];
          if (ch === '.') continue;
          this.fx.buf('shaker', this.stage, t + (i * 0.25) * spb, 60 + rand(-0.2, 0.2), ch === 'x' ? 0.5 : 0.3, 0.2, { cat: 'motif', cap: 64 });
        }
        for (const at of [4, 4.75, 5.5, 6]) this.fx.buf('shaker', this.stage, t + at * spb, 61, 0.5, 0.2, { cat: 'motif', cap: 64 });
        this.fx.buf('tamb', this.stage, t + 7 * spb, 60, 0.4, 0.4, { cat: 'motif', cap: 64 });
        run([{ d: 4, at: 6.5, len: 0.5 }, { d: 7, at: 7, len: 1.5 }], 'marimba', 72, this.stage, 0.5, 0.6);
        run([{ d: 2, at: 6.5, len: 0.5 }, { d: 4, at: 7, len: 1.5 }], 'marimba', 66, this.stage, 0.32, 0.6);
        break;
      }
      case 'crystal': {
        const up = [0, 2, 4, 7, 9, 11, 14];
        const evs: Ev[] = up.map((d, i) => ({ d, at: i * 0.25, len: 0.4, v: 0.7 + i * 0.05 }));
        evs.push({ d: 14, at: 1.75, len: 1.2, v: 1 });
        [11, 9, 7, 4, 2, 0].forEach((d, i) => evs.push({ d: d + 7, at: 4 + i * 0.25, len: 0.4, v: 0.85 - i * 0.05 }));
        evs.push({ d: 11, at: 6, len: 2, v: 0.9 });
        run(evs, 'zap', 74, this.stage, 0.32, 0.4);
        run([{ d: 14, at: 1.75, len: 2 }, { d: 11, at: 6, len: 2.5 }], 'glass', 86, this.stageWide, 0.18, 1.6);
        break;
      }
      case 'horn': {
        const call: Ev[] = [{ d: 0, at: 0, len: 1 }, { d: 4, at: 1, len: 1.5 }, { d: 3, at: 2.5, len: 0.5 }, { d: 2, at: 3, len: 1 }, { d: 4, at: 4, len: 1 }, { d: 7, at: 5, len: 3 }];
        run(call, HORNLEAD(0.85), 60, this.stage, 0.9);
        run(call, 'brass', 60, this.stage, 0.32, 0.4);
        run(call.map((e) => ({ ...e, oct: -12 })), 'brass', 60, this.stageWide, 0.24, 0.4);
        this.fx.buf('timp', this.stage, t + 5 * spb, bassNote(chord(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][k.tonicPc]), 40), 0.4, 2.5, { cat: 'motif', cap: 64 });
        break;
      }
      case 'choir': {
        // three little voices, one after the other, then a tiny "A-men" (IV → I)
        const v = (d: number, at: number, len: number, vel = 1) => ({ d, at, len, v: vel });
        run([v(7, 0, 4), v(4, 1, 3), v(2, 2, 2)], 'choiroo', 76, this.stage, 0.42, 1);
        run([v(7, 4, 2), v(5, 4, 2), v(3, 4, 2), v(7, 6, 2.5), v(4, 6, 2.5), v(2, 6, 2.5)], 'choir', 76, this.stage, 0.36, 1.2);
        run([v(7, 6, 2.5)], 'celesta', 84, this.stageWide, 0.14, 1);
        break;
      }
      case 'bass': {
        const walk: Ev[] = [{ d: 0, at: 0, len: 1.5 }, { d: 0, at: 1.5, len: 0.5, v: 0.7 }, { d: 4, at: 2, len: 1 }, { d: -3, at: 3, len: 1 }, { d: -2, at: 4, len: 0.5, v: 0.8 }, { d: -1, at: 4.5, len: 0.5, v: 0.85 }, { d: 0, at: 5, len: 1 }];
        run(walk, 'pizz', 40, this.stage, 0.85, 0.3);
        run(walk, LOWBRASS(0.4), 40, this.stageWide, 0.5);
        const T = this.deg(k, 0, 34);
        this.fx.buf('boom', this.stage, t + 6 * spb, T - 12 >= 24 ? T - 12 : T, 0.8, 2.2, { cat: 'motif', cap: 64 });
        this.fx.buf('taiko', this.stage, t + 6 * spb, 31, 0.5, 2, { cat: 'motif', cap: 64 });
        break;
      }
    }
  }

  // ───────────────────────────── duets ─────────────────────────────

  duet(id: DuetId, t: number, pan: number): void {
    const ch = this.at(pan);
    const k = this.key(t);
    const c = this.chordAt(t, k);
    const p = this.director.ref;
    const spb = p ? p.spb : 0.6;
    const tones = (lo: number, hi: number) => chordTones(c, lo, hi);
    const b = (inst: BufInst, at: number, m: number, v: number, d: number, rel = 0.4) => this.fx.buf(inst, ch, t + at, m, v, d, { release: rel, cat: 'duet', cap: 48 });
    switch (id) {
      case 'march': {
        tones(60, 84).slice(0, 5).forEach((m, i) => b('harp', i * spb * 0.25, m, 0.3 + i * 0.03, 0.8, 0.6));
        for (let i = 0; i < 6; i++) b('snare', i * spb * 0.125, 60, 0.12 + i * 0.04, 0.2);
        b('taiko', spb, bassNote(c, 33), 0.5, 1.6);
        break;
      }
      case 'groundwork': {
        const r = bassNote(c, 28);
        b('taiko', 0, bassNote(c, 33), 0.55, 1.6);
        b('tom', spb * 0.75, bassNote(c, 40), 0.36, 0.6);
        b('taiko', spb, bassNote(c, 33), 0.6, 1.6);
        b('boom', spb, r, 0.45, 1.8, 0.5);
        break;
      }
      case 'shimmer': {
        b('tbell', 0, tones(60, 74)[0] ?? 67, 0.3, 3, 1.2);
        tones(76, 98).slice(0, 7).forEach((m, i) => b(i % 2 ? 'glass' : 'zap', 0.05 + i * spb * 0.125, m, i % 2 ? 0.16 : 0.2, 0.6, 0.5));
        break;
      }
      case 'fanfare': {
        const root = bassNote(c, 55);
        let fifth = root + 1;
        while (!c.pcs.includes(pcOf(fifth)) || fifth - root < 6) fifth++;
        for (const [at, m, d] of [[0, root, 0.4], [spb * 0.5, root, 0.2], [spb * 0.75, fifth, 0.9]] as [number, number, number][]) {
          this.fx.stack(HORNLEAD(0.8), ch, t + at, m, 0.6, d * spb * 1.6);
          b('brass', at, m, 0.3, d * spb * 1.6);
        }
        for (let i = 0; i < 5; i++) b('snare', spb * 1.5 + i * spb * 0.125, 60, 0.14 + i * 0.05, 0.2);
        b('timp', spb * 2, bassNote(c, 40), 0.42, 2.5);
        break;
      }
      case 'hymn': {
        for (const m of tones(55, 70).slice(0, 4)) b('choiroo', 0.02, m, 0.22, spb * 3, 1);
        b('tbell', 0, tones(55, 67)[0] ?? 60, 0.32, 4, 1.5);
        b('tbell', 0.01, (tones(55, 67)[0] ?? 60) + 12, 0.16, 4, 1.5);
        break;
      }
      case 'serenade': {
        tones(57, 81).slice(0, 6).forEach((m, i) => b('harp', i * 0.045, m, 0.24 + 0.01 * i, 1.6, 1));
        for (const m of tones(60, 72).slice(0, 3)) this.fx.stack({ ...CHOIR('ah'), attack: 0.4, release: 1.4 }, ch, t + 0.05, m, 0.32, spb * 2.5);
        break;
      }
      case 'groove': {
        const pat = 'xoxxoxoxxoxo';
        for (let i = 0; i < pat.length; i++) b('shaker', (i * spb) / 4, 60.5, pat[i] === 'x' ? 0.42 : 0.22, 0.2);
        b('clap', spb, 60, 0.3, 0.3);
        b('clap', spb * 2.5, 60, 0.26, 0.3);
        b('tom', spb * 2.75, bassNote(c, 45), 0.32, 0.6);
        b('taiko', spb * 3, bassNote(c, 33), 0.46, 1.6);
        break;
      }
      case 'thunder': {
        tones(72, 98).slice(0, 6).forEach((m, i) => b('zap', i * 0.04, m, 0.22 + 0.02 * i, 0.5, 0.3));
        b('boom', 0.25, bassNote(c, 28), 0.55, 2, 0.5);
        this.fx.burst(ch.input, t + 0.25, { noise: 'brown', type: 'lowpass', f: 180, a: 0.05, d: 1.4, g: 0.3, cat: 'duet' });
        break;
      }
    }
  }

  // ───────────────────────────── plates ─────────────────────────────

  plateUnlock(t: number, pan: number): void {
    const ch = this.at(pan);
    const k = this.key(t);
    const c = this.chordAt(t, k);
    const up = chordTones(c, 76, 96);
    if (!up.length) return;
    up.slice(0, 3).forEach((m, i) => this.fx.buf(i === 2 ? 'glass' : 'celesta', ch, t + i * 0.075, m, 0.26 - i * 0.03, 1.2, { release: 1, cat: 'duet', cap: 48 }));
    this.fx.buf('glass', ch, t + 0.24, (up[3] ?? up[0] + 12) + (up[3] ? 0 : 0), 0.12, 1.6, { release: 1.4, cat: 'duet', cap: 48 });
    this.fx.burst(ch.input, t, { noise: 'white', type: 'highpass', f: 5000, f1: 9000, a: 0.08, d: 0.45, g: 0.025, cat: 'duet' });
  }
}
