/**
 * Ambience: continuous beds + scheduled events per layer (TESSELLA's engine), with the places of
 * FORTÍSSIMO mapped to layer mixes by `setPlace`.
 */
import type { WorldId } from '../../sim/defs';
import type { Core } from './core';
import type { BufferBank } from './synth';
import { playBuf, waterDrop } from './synth';
import { mtof, } from './util';
import { note, Scale, MODES } from './theory';
import { chance, clamp, disconnectAll, pick, rand, report } from './util';

interface Bed {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  /** per-tick modulation */
  mod?: (now: number) => void;
}

export type AmbienceLayer =
  | 'wind' | 'birds' | 'stream' | 'leaves' | 'insects' | 'night' | 'chimes'
  | 'gusts' | 'sand' | 'cold' | 'lava' | 'crackle' | 'anvils' | 'void' | 'air';

export type Place = WorldId | 'menu' | 'none';

/** the layer mix of every place (multiplied by the level passed to setAmbience) */
const PLACES: Record<Place, Partial<Record<AmbienceLayer, number>>> = {
  meadow: { wind: 0.32, birds: 0.8, stream: 0.3, leaves: 0.28 },
  desert: { gusts: 0.55, sand: 0.25 },
  ice: { cold: 0.75, chimes: 0.3 },
  forge: { lava: 0.5, crackle: 0.45, anvils: 0.4 },
  citadel: { void: 0.75, wind: 0.12 },
  menu: { air: 0.9, night: 1 },
  none: {},
};

class Layer {
  target = 0;
  readonly gain: GainNode;
  private bed: Bed | null = null;
  private silentSince = 0;
  nextEvent = 0;

  constructor(
    readonly name: AmbienceLayer,
    private readonly core: Core,
    private readonly build: ((dest: AudioNode, t: number) => Bed) | null,
    readonly event: ((now: number, level: number) => number) | null,
  ) {
    this.gain = core.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(core.ambDry);
  }

  set(level: number, now: number): void {
    const v = clamp(level, 0, 1);
    if (Math.abs(v - this.target) < 0.005) return;
    this.target = v;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(v, now, 0.7);
    if (v > 0.001 && !this.bed && this.build) {
      try {
        this.bed = this.build(this.gain, now);
      } catch (e) {
        report(`ambience ${this.name}`, e);
      }
    }
    if (v > 0.001) this.silentSince = 0;
  }

  tick(now: number): void {
    if (this.target <= 0.001) {
      if (!this.silentSince) this.silentSince = now;
      if (this.bed && now - this.silentSince > 9) this.stopBed();
    }
    if (this.bed?.mod && this.target > 0.001) this.bed.mod(now);
    if (this.event && this.target > 0.02 && now >= this.nextEvent) {
      try {
        const wait = this.event(now + 0.05, this.target);
        this.nextEvent = now + Math.max(0.05, wait);
      } catch (e) {
        report(`ambience event ${this.name}`, e);
        this.nextEvent = now + 5;
      }
    }
  }

  private stopBed(): void {
    if (!this.bed) return;
    for (const s of this.bed.sources) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    disconnectAll(this.bed.nodes);
    this.bed = null;
  }
}

export class Ambience {
  private readonly layers = new Map<AmbienceLayer, Layer>();
  private readonly wetSend: GainNode;
  private chimeScale = new Scale(note('E6'), MODES.minorPent);

  constructor(
    private readonly core: Core,
    private readonly bank: BufferBank,
  ) {
    this.wetSend = core.ctx.createGain();
    this.wetSend.gain.value = 1;
    this.wetSend.connect(core.ambWet);
    const L = (name: AmbienceLayer, build: ((d: AudioNode, t: number) => Bed) | null, ev: ((now: number, level: number) => number) | null) => {
      const layer = new Layer(name, core, build, ev);
      this.layers.set(name, layer);
    };
    L('wind', (d, t) => this.wind(d, t), null);
    L('stream', (d, t) => this.stream(d, t), (now, lv) => this.bubble(now, lv));
    L('leaves', (d, t) => this.leaves(d, t), null);
    L('insects', (d, t) => this.insects(d, t), null);
    L('birds', null, (now, lv) => this.bird(now, lv));
    L('night', null, (now, lv) => this.cricket(now, lv));
    L('chimes', null, (now, lv) => this.chime(now, lv));
    L('gusts', (d, t) => this.gusts(d, t), null);
    L('sand', (d, t) => this.sand(d, t), null);
    L('cold', (d, t) => this.cold(d, t), null);
    L('lava', (d, t) => this.lava(d, t), (now, lv) => this.bloop(now, lv));
    L('crackle', null, (now, lv) => this.crackle(now, lv));
    L('anvils', null, (now, lv) => this.anvil(now, lv));
    L('void', (d, t) => this.voidBed(d, t), null);
    L('air', (d, t) => this.air(d, t), null);
  }

  /** the ambience of a place (fades over ~2 s); `level` scales the whole mix */
  setPlace(place: Place, level = 1): void {
    const mix = PLACES[place] ?? {};
    const lv = Number.isFinite(level) ? Math.max(0, Math.min(1.5, level)) : 1;
    const levels: Partial<Record<AmbienceLayer, number>> = {};
    for (const [k, v] of Object.entries(mix) as [AmbienceLayer, number][]) levels[k] = v * lv;
    this.chimeScale = place === 'ice' ? new Scale(note('E6'), MODES.minorPent) : new Scale(note('D6'), MODES.majorPent);
    if (mix.chimes || mix.anvils) this.bank.warm(mix.chimes ? 'glass' : 'anvil', mix.chimes ? 84 : 64, mix.chimes ? 100 : 84, 6);
    this.setLevels(levels);
  }

  setLevels(levels: Partial<Record<AmbienceLayer, number>>): void {
    const now = this.core.now;
    for (const [name, layer] of this.layers) layer.set(levels[name] ?? 0, now);
  }

  tick(): void {
    const now = this.core.now;
    for (const l of this.layers.values()) l.tick(now);
  }

  private layerGain(name: AmbienceLayer): GainNode {
    return this.layers.get(name)!.gain;
  }

  // ───────────────────────────── beds ─────────────────────────────

  private filtered(dest: AudioNode, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f: number, q: number, gain: number, pan = 0): { src: AudioBufferSourceNode; flt: BiquadFilterNode; g: GainNode; p: StereoPannerNode } {
    const ctx = this.core.ctx;
    const src = this.core.noise(kind, t);
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(flt).connect(g).connect(p).connect(dest);
    return { src, flt, g, p };
  }

  private wind(d: AudioNode, t: number): Bed {
    const a = this.filtered(d, t, 'pink', 'bandpass', 420, 0.6, 0.55, -0.5);
    const b = this.filtered(d, t, 'pink', 'bandpass', 560, 0.6, 0.5, 0.5);
    const w = this.filtered(d, t, 'white', 'bandpass', 1900, 7, 0.05, 0.2);
    let next = 0;
    return {
      nodes: [a.src, a.flt, a.g, a.p, b.src, b.flt, b.g, b.p, w.src, w.flt, w.g, w.p],
      sources: [a.src, b.src, w.src],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(0.8, 2.2);
        const gust = rand(0.35, 1);
        a.flt.frequency.setTargetAtTime(rand(260, 820), now, 1.2);
        b.flt.frequency.setTargetAtTime(rand(300, 900), now, 1.4);
        a.g.gain.setTargetAtTime(0.25 + 0.5 * gust, now, 1.1);
        b.g.gain.setTargetAtTime(0.25 + 0.45 * rand(0.3, 1), now, 1.3);
        w.flt.frequency.setTargetAtTime(rand(1300, 2600), now, 1.5);
        w.g.gain.setTargetAtTime(gust > 0.8 ? 0.06 : 0.015, now, 0.9);
      },
    };
  }

  private stream(d: AudioNode, t: number): Bed {
    const a = this.filtered(d, t, 'white', 'bandpass', 2100, 0.8, 0.22, -0.2);
    const b = this.filtered(d, t, 'white', 'bandpass', 900, 2.2, 0.25, 0.2);
    return {
      nodes: [a.src, a.flt, a.g, a.p, b.src, b.flt, b.g, b.p],
      sources: [a.src, b.src],
      mod: (now) => {
        b.flt.frequency.setTargetAtTime(rand(600, 1500), now, 0.05);
        a.g.gain.setTargetAtTime(rand(0.15, 0.28), now, 0.08);
      },
    };
  }

  private leaves(d: AudioNode, t: number): Bed {
    const a = this.filtered(d, t, 'pink', 'highpass', 1800, 0.5, 0.0, -0.3);
    const b = this.filtered(d, t, 'white', 'bandpass', 4200, 0.6, 0.0, 0.3);
    let next = 0;
    return {
      nodes: [a.src, a.flt, a.g, a.p, b.src, b.flt, b.g, b.p],
      sources: [a.src, b.src],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(0.4, 2.5);
        const lv = chance(0.35) ? rand(0.3, 0.6) : rand(0.04, 0.15);
        a.g.gain.setTargetAtTime(lv * 0.6, now, rand(0.2, 0.8));
        b.g.gain.setTargetAtTime(lv * 0.25, now, rand(0.2, 0.8));
      },
    };
  }

  private insects(d: AudioNode, t: number): Bed {
    const ctx = this.core.ctx;
    const n = this.filtered(d, t, 'white', 'bandpass', 5200, 9, 0.0, 0.25);
    const am = ctx.createOscillator();
    am.type = 'square';
    am.frequency.value = 42;
    const amg = ctx.createGain();
    amg.gain.value = 0.08;
    am.connect(amg).connect(n.g.gain);
    am.start(t);
    let next = 0;
    return {
      nodes: [n.src, n.flt, n.g, n.p, am, amg],
      sources: [n.src, am],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(3, 7);
        amg.gain.setTargetAtTime(rand(0.05, 0.12), now, 1.5);
        n.flt.frequency.setTargetAtTime(rand(4600, 6200), now, 2);
        am.frequency.setTargetAtTime(rand(35, 55), now, 1);
      },
    };
  }

  // ───────────────────────────── events ─────────────────────────────

  private out(name: AmbienceLayer, pan: number, wet: number): { dest: GainNode; nodes: AudioNode[] } {
    const ctx = this.core.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(p).connect(this.layerGain(name));
    const w = ctx.createGain();
    w.gain.value = wet;
    p.connect(w).connect(this.wetSend);
    return { dest: g, nodes: [p, g, w] };
  }

  /** schedules an FM-ish chirp (frequency path) into dest */
  private chirp(dest: AudioNode, t: number, path: [number, number][], dur: number, gain: number, cleanup: AudioNode[] | null): OscillatorNode {
    const ctx = this.core.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(path[0][1], t);
    for (const [frac, f] of path.slice(1)) o.frequency.linearRampToValueAtTime(f, t + frac * dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2));
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.core.track('amb', o, [o, g, ...(cleanup ?? [])]);
    return o;
  }

  private bird(now: number, lv: number): number {
    if (this.core.voiceCount('amb') > 40) return 1;
    const { dest, nodes } = this.out('birds', rand(-0.9, 0.9), 0.35);
    const dist = rand(0.25, 1);
    const g = 0.09 * dist;
    const species = pick(['warbler', 'whistle', 'chirp', 'dove', 'trill'] as const);
    let t = now;
    let last: OscillatorNode | null = null;
    const base = rand(0.85, 1.2);
    switch (species) {
      case 'warbler': {
        const n = Math.floor(rand(5, 11));
        for (let i = 0; i < n; i++) {
          const f = rand(2800, 4800) * base;
          last = this.chirp(dest, t, [[0, f], [0.5, f * rand(1.1, 1.35)], [1, f * rand(0.8, 1)]], rand(0.04, 0.08), g, null);
          t += rand(0.06, 0.11);
        }
        break;
      }
      case 'whistle': {
        const f = rand(1800, 2600) * base;
        last = this.chirp(dest, t, [[0, f], [1, f * 1.3]], 0.35, g * 1.1, null);
        last = this.chirp(dest, t + 0.45, [[0, f * 1.25], [1, f * 0.95]], 0.4, g, null);
        break;
      }
      case 'chirp': {
        const n = Math.floor(rand(1, 4));
        for (let i = 0; i < n; i++) {
          const f = rand(3200, 5200) * base;
          last = this.chirp(dest, t, [[0, f * 0.8], [0.3, f * 1.2], [1, f]], rand(0.05, 0.09), g, null);
          t += rand(0.12, 0.25);
        }
        break;
      }
      case 'dove': {
        const f = rand(480, 620);
        const pattern = [0.3, 0.25, 0.6];
        for (const d of pattern) {
          last = this.chirp(dest, t, [[0, f * 0.95], [0.3, f], [1, f * 0.9]], d, g * 1.4, null);
          t += d + 0.12;
        }
        break;
      }
      case 'trill': {
        const f = rand(3000, 4200) * base;
        for (let i = 0; i < 14; i++) {
          last = this.chirp(dest, t, [[0, f], [1, f * 0.92]], 0.025, g * 0.8, null);
          t += 0.035;
        }
        break;
      }
    }
    if (last) {
      const prev = last.onended;
      last.onended = (e) => {
        if (prev) (prev as (ev: Event) => void)(e);
        disconnectAll(nodes);
      };
    } else disconnectAll(nodes);
    return rand(1.5, 5.5) / Math.max(0.2, lv);
  }

  private cricket(now: number, lv: number): number {
    const { dest, nodes } = this.out('night', rand(-0.9, 0.9), 0.15);
    const f = rand(4100, 4700);
    let t = now;
    let last: OscillatorNode | null = null;
    const groups = Math.floor(rand(2, 5));
    for (let gI = 0; gI < groups; gI++) {
      for (let p = 0; p < 3; p++) {
        last = this.chirp(dest, t, [[0, f], [1, f * 0.98]], 0.018, 0.036, null);
        t += 0.04;
      }
      t += rand(0.25, 0.45);
    }
    if (last) {
      const prev = last.onended;
      last.onended = (e) => {
        if (prev) (prev as (ev: Event) => void)(e);
        disconnectAll(nodes);
      };
    }
    return rand(0.3, 1.2) / Math.max(0.3, lv);
  }

  private chime(now: number, lv: number): number {
    const dest = this.layerGain('chimes');
    const n = Math.floor(rand(3, 8));
    let t = now;
    for (let i = 0; i < n; i++) {
      const m = this.chimeScale.deg(Math.floor(rand(-3, 6)));
      playBuf(this.core, this.bank, 'glass', dest, t, m, rand(0.05, 0.12), 2.5, { cat: 'amb', cap: 30, release: 2 });
      t += rand(0.06, 0.35);
    }
    return rand(4, 12) / Math.max(0.25, lv);
  }

  private bubble(now: number, lv: number): number {
    const { dest, nodes } = this.out('stream', rand(-0.5, 0.5), 0.1);
    waterDrop(this.core, dest, now, rand(500, 1100), rand(0.25, 0.6));
    window.setTimeout(() => disconnectAll(nodes), 800);
    return rand(0.15, 0.8) / Math.max(0.3, lv);
  }
  // ───────────────────────────── FORTÍSSIMO places ─────────────────────────────

  /** gusty desert wind: deep swells and a whistling edge */
  private gusts(d: AudioNode, t: number): Bed {
    const a = this.filtered(d, t, 'pink', 'bandpass', 320, 0.6, 0.5, -0.4);
    const b = this.filtered(d, t, 'pink', 'bandpass', 520, 0.7, 0.4, 0.4);
    const w = this.filtered(d, t, 'white', 'bandpass', 2400, 6, 0.0, 0.1);
    let next = 0;
    return {
      nodes: [a.src, a.flt, a.g, a.p, b.src, b.flt, b.g, b.p, w.src, w.flt, w.g, w.p],
      sources: [a.src, b.src, w.src],
      mod: (now) => {
        if (now < next) return;
        const gust = Math.random() < 0.3 ? rand(0.8, 1.25) : rand(0.15, 0.55);
        next = now + (gust > 0.8 ? rand(1.6, 3) : rand(0.7, 1.8));
        a.flt.frequency.setTargetAtTime(220 + 600 * gust, now, 0.6);
        b.flt.frequency.setTargetAtTime(300 + 700 * gust * rand(0.7, 1.1), now, 0.7);
        a.g.gain.setTargetAtTime(0.15 + 0.6 * gust, now, gust > 0.8 ? 0.5 : 0.9);
        b.g.gain.setTargetAtTime(0.12 + 0.45 * gust, now, 0.8);
        w.flt.frequency.setTargetAtTime(1700 + 1800 * gust, now, 0.8);
        w.g.gain.setTargetAtTime(gust > 0.8 ? 0.05 : 0.008, now, 0.6);
        a.p.pan.setTargetAtTime(rand(-0.6, 0.6), now, 1.5);
      },
    };
  }

  /** sand hiss that rises with the gusts */
  private sand(d: AudioNode, t: number): Bed {
    const s = this.filtered(d, t, 'white', 'highpass', 3600, 0.5, 0.05, -0.2);
    const s2 = this.filtered(d, t, 'white', 'bandpass', 6500, 0.6, 0.03, 0.3);
    let next = 0;
    return {
      nodes: [s.src, s.flt, s.g, s.p, s2.src, s2.flt, s2.g, s2.p],
      sources: [s.src, s2.src],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(0.5, 1.6);
        const lv = Math.random() < 0.3 ? rand(0.12, 0.2) : rand(0.03, 0.08);
        s.g.gain.setTargetAtTime(lv, now, 0.5);
        s2.g.gain.setTargetAtTime(lv * 0.6, now, 0.4);
        s.p.pan.setTargetAtTime(rand(-0.7, 0.7), now, 1);
      },
    };
  }

  /** thin, cold wind with a high whistle */
  private cold(d: AudioNode, t: number): Bed {
    const a = this.filtered(d, t, 'pink', 'bandpass', 900, 0.9, 0.35, -0.45);
    const b = this.filtered(d, t, 'pink', 'bandpass', 1400, 1.0, 0.25, 0.45);
    const w = this.filtered(d, t, 'white', 'bandpass', 2800, 11, 0.03, 0.15);
    let next = 0;
    return {
      nodes: [a.src, a.flt, a.g, a.p, b.src, b.flt, b.g, b.p, w.src, w.flt, w.g, w.p],
      sources: [a.src, b.src, w.src],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(1.2, 3);
        const gust = rand(0.3, 1);
        a.flt.frequency.setTargetAtTime(rand(650, 1300), now, 1.4);
        b.flt.frequency.setTargetAtTime(rand(1000, 1900), now, 1.6);
        a.g.gain.setTargetAtTime(0.15 + 0.3 * gust, now, 1.2);
        b.g.gain.setTargetAtTime(0.1 + 0.22 * rand(0.3, 1), now, 1.4);
        w.flt.frequency.setTargetAtTime(rand(2200, 3600), now, 2);
        w.g.gain.setTargetAtTime(rand(0.005, 0.04), now, 1.5);
      },
    };
  }

  /** lava: a deep rumble that breathes */
  private lava(d: AudioNode, t: number): Bed {
    const r = this.filtered(d, t, 'brown', 'lowpass', 90, 0.7, 0.75, 0);
    const m = this.filtered(d, t, 'pink', 'lowpass', 320, 0.6, 0.12, 0.15);
    let next = 0;
    return {
      nodes: [r.src, r.flt, r.g, r.p, m.src, m.flt, m.g, m.p],
      sources: [r.src, m.src],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(1.5, 4);
        r.g.gain.setTargetAtTime(rand(0.5, 0.9), now, 1.2);
        r.flt.frequency.setTargetAtTime(rand(70, 120), now, 1.5);
        m.g.gain.setTargetAtTime(rand(0.06, 0.18), now, 1);
      },
    };
  }

  private bloop(now: number, lv: number): number {
    const { dest, nodes } = this.out('lava', rand(-0.6, 0.6), 0.3);
    const ctx = this.core.ctx;
    const o = ctx.createOscillator();
    const f = rand(55, 110);
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(f * rand(1.6, 2.4), now + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(rand(0.08, 0.18), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.25);
    o.connect(g).connect(dest);
    o.start(now);
    o.stop(now + 0.3);
    this.core.track('amb', o, [o, g]);
    const prev = o.onended;
    o.onended = (e) => {
      if (prev) (prev as (ev: Event) => void)(e);
      disconnectAll(nodes);
    };
    return rand(0.4, 2.2) / Math.max(0.3, lv);
  }

  /** fire/lava crackle: clusters of tiny clicks */
  private crackle(now: number, lv: number): number {
    const dest = this.layerGain('crackle');
    const ctx = this.core.ctx;
    const n = Math.floor(rand(1, 6));
    for (let i = 0; i < n; i++) {
      if (this.core.voiceCount('amb') > 50) break;
      const tt = now + rand(0, 0.25);
      const src = this.core.noise('white', tt);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = rand(1200, 4200);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(rand(0.03, 0.09), tt + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.0005, tt + rand(0.004, 0.02));
      src.connect(hp).connect(g).connect(dest);
      src.stop(tt + 0.05);
      this.core.track('amb', src, [src, hp, g]);
    }
    return rand(0.08, 0.5) / Math.max(0.3, lv);
  }

  /** distant anvils, sometimes answered */
  private anvil(now: number, lv: number): number {
    const { dest, nodes } = this.out('anvils', rand(-0.8, 0.8), 0.9);
    const m = 64 + Math.floor(rand(0, 18));
    const reps = Math.random() < 0.35 ? 2 : 1;
    for (let k = 0; k < reps; k++) playBuf(this.core, this.bank, 'anvil', dest, now + k * rand(0.28, 0.42), m + (k ? -0.2 : 0), rand(0.05, 0.1) * (k ? 0.7 : 1), 1.2, { cat: 'amb', cap: 40, lp: 2600 });
    if (typeof setTimeout === 'function') setTimeout(() => disconnectAll(nodes), 4000);
    return rand(2.2, 6) / Math.max(0.25, lv);
  }

  /** the hollow hum of the void: slow-beating low sines and a hollow breath */
  private voidBed(d: AudioNode, t: number): Bed {
    const ctx = this.core.ctx;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(d);
    nodes.push(sum);
    for (const [m, det, g] of [[33, 0, 0.035], [33, 7, 0.03], [40, 0, 0.018], [45, -5, 0.012]] as [number, number, number][]) {
      const o = ctx.createOscillator();
      o.frequency.value = mtof(m);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(sum);
      o.start(t);
      nodes.push(o, og);
      sources.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(sum.gain);
    lfo.start(t);
    nodes.push(lfo, lg);
    sources.push(lfo);
    const air = this.filtered(d, t, 'pink', 'bandpass', 210, 2.5, 0.08, 0);
    nodes.push(air.src, air.flt, air.g, air.p);
    sources.push(air.src);
    let next = 0;
    return {
      nodes,
      sources,
      mod: (now) => {
        if (now < next) return;
        next = now + rand(3, 7);
        air.flt.frequency.setTargetAtTime(rand(160, 300), now, 2);
        air.g.gain.setTargetAtTime(rand(0.04, 0.11), now, 2);
      },
    };
  }

  /** soft night air */
  private air(d: AudioNode, t: number): Bed {
    const a = this.filtered(d, t, 'pink', 'lowpass', 900, 0.5, 0.18, -0.2);
    const b = this.filtered(d, t, 'pink', 'bandpass', 420, 0.6, 0.12, 0.3);
    let next = 0;
    return {
      nodes: [a.src, a.flt, a.g, a.p, b.src, b.flt, b.g, b.p],
      sources: [a.src, b.src],
      mod: (now) => {
        if (now < next) return;
        next = now + rand(2, 5);
        a.g.gain.setTargetAtTime(rand(0.08, 0.22), now, 1.6);
        b.flt.frequency.setTargetAtTime(rand(300, 650), now, 2);
      },
    };
  }
}
