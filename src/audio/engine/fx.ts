/**
 * Sound-effect primitives shared by sfx, towers and cinema. `burst`, `tone` and `buf` are
 * TESSELLA's helpers, unchanged (the studio sting is built from them and must sound identical).
 */
import type { Core } from './core';
import { BufferBank, Channel, type BufInst, type ChannelOpts, oscStack, playBuf, type StackOpts } from './synth';

export interface BurstOpts {
  noise?: 'white' | 'pink' | 'brown';
  type?: BiquadFilterType;
  f: number;
  q?: number;
  a?: number;
  d: number;
  g: number;
  f1?: number;
  cat?: string;
}

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f1?: number;
  a?: number;
  d: number;
  g: number;
  lp?: number;
  cat?: string;
}

export class Fx {
  constructor(
    readonly core: Core,
    readonly bank: BufferBank,
  ) {}

  get now(): number {
    return this.core.now;
  }

  channel(dry: AudioNode, wet: AudioNode, o: ChannelOpts): Channel {
    return new Channel(this.core, dry, wet, o);
  }

  /** filtered noise burst (the envelope starts from silence, so the onset never spikes) */
  burst(dest: AudioNode, t: number, o: BurstOpts): void {
    this.noiseBurst(dest, t, o, true);
  }

  /** TESSELLA's burst, verbatim (gain left at its default until t) — only the studio sting uses it */
  burstT(dest: AudioNode, t: number, o: BurstOpts): void {
    this.noiseBurst(dest, t, o, false);
  }

  private noiseBurst(dest: AudioNode, t: number, o: BurstOpts, silentStart: boolean): void {
    const ctx = this.core.ctx;
    const cat = o.cat ?? 'sfx';
    if (this.core.voiceCount(cat) > 60) return;
    const src = this.core.noise(o.noise ?? 'white', t);
    const flt = ctx.createBiquadFilter();
    flt.type = o.type ?? 'bandpass';
    flt.frequency.setValueAtTime(o.f, t);
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(o.f1, t + (o.a ?? 0.005) + o.d);
    flt.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    if (silentStart) g.gain.value = 0;
    const a = o.a ?? 0.003;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.g, t + a);
    g.gain.exponentialRampToValueAtTime(0.0005, t + a + o.d);
    src.connect(flt).connect(g).connect(dest);
    src.stop(t + a + o.d + 0.05);
    this.core.track(cat, src, [src, flt, g]);
  }

  /** a simple enveloped oscillator */
  tone(dest: AudioNode, t: number, o: ToneOpts): void {
    const ctx = this.core.ctx;
    const cat = o.cat ?? 'sfx';
    if (this.core.voiceCount(cat) > 60) return;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.a ?? 0.005) + o.d);
    const g = ctx.createGain();
    const a = o.a ?? 0.004;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.g, t + a);
    g.gain.exponentialRampToValueAtTime(0.0005, t + a + o.d);
    let lp: BiquadFilterNode | null = null;
    if (o.lp) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      osc.connect(lp).connect(g);
    } else osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + a + o.d + 0.05);
    this.core.track(cat, osc, [osc, g, lp]);
  }

  /** a buffer-instrument note into a channel */
  buf(inst: BufInst, dest: Channel, t: number, midi: number, vel: number, dur: number, extra: { release?: number; lp?: number; cat?: string; cap?: number; bend?: number; bendTime?: number } = {}): void {
    playBuf(this.core, this.bank, inst, dest.input, t, midi, vel, dur, { cat: extra.cat ?? 'sfxbuf', cap: extra.cap ?? 48, release: extra.release, lp: extra.lp, bend: extra.bend, bendTime: extra.bendTime });
  }

  /** a real-time instrument note into a channel */
  stack(preset: StackOpts, ch: Channel, t: number, midi: number, vel: number, dur: number): void {
    oscStack(this.core, ch, t, midi, vel, dur, preset);
  }

  /** oscillator whose pitch glides (sirens, risers, falling gestures) */
  glide(dest: AudioNode, t: number, o: { type?: OscillatorType; f0: number; f1: number; dur: number; g: number; a?: number; lp0?: number; lp1?: number; q?: number; cat?: string; detune?: number; curve?: 'exp' | 'lin' }): void {
    const ctx = this.core.ctx;
    const cat = o.cat ?? 'sfx';
    if (this.core.voiceCount(cat) > 60) return;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sawtooth';
    osc.detune.value = o.detune ?? 0;
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q ?? 0.7;
    lp.frequency.setValueAtTime(o.lp0 ?? 2000, t);
    lp.frequency.exponentialRampToValueAtTime(o.lp1 ?? o.lp0 ?? 2000, t + o.dur);
    const g = ctx.createGain();
    const a = o.a ?? 0.05;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.g, t + a);
    g.gain.setValueAtTime(o.g, t + Math.max(a, o.dur * 0.7));
    g.gain.linearRampToValueAtTime(0, t + o.dur);
    osc.connect(lp).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    this.core.track(cat, osc, [osc, lp, g]);
  }
}
