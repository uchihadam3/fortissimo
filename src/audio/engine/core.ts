/**
 * Core audio graph of FORTÍSSIMO:
 *
 *   music voices ─▶ musicDry ─▶ duck ─▶ tone ─▶ hp(ff build) ─▶ muffle LP ─▶ muffle gain ─▶ musicVol ─┐
 *                └▶ musicWet ─▶ duckW ─────────▶ hpW ─▶ muffle LPW ─▶ muffle gainW ─▶ musicVolW ─▶ wetSum
 *   tower voices ─▶ towerBus ─▶ glue compressor ─▶ sfxDry ─▶ sfxVol ───────────────────────────────┤
 *   sfx voices   ─▶ sfxDry ─▶ sfxVol ─────────────────────────────────────────────────────────────┤
 *                └▶ sfxWet ─▶ sfxVolW ─▶ wetSum                                                    │
 *   ambience     ─▶ ambDry ─▶ ambVol ──────────────────────────────────────────────────────────────┤
 *                └▶ ambWet ─▶ ambVolW ─▶ wetSum                                                    │
 *   wetSum ─▶ [hall | cave | spire] convolvers ─▶ reverbOut ────────────────────────────────────────┤
 *                                                                                                  ▼
 *   master ─▶ hush ─▶ glue compressor ─▶ limiter ─▶ safety soft-clip (≤ −1.2 dBFS) ─▶ destination (+ tap)
 *
 * Volumes apply before the reverb so the sliders scale dry and wet together. The master glue and
 * limiter settings are TESSELLA's (the studio sting must sound identical); the soft clipper only
 * acts above −3 dBFS and guarantees no sample peak above −1.2 dBFS.
 */
import type { Volumes } from '../api';
import { makeImpulseData, makeNoiseData } from './dsp';
import type { Renderer } from './render';
import { clamp, disconnectAll, report } from './util';

export type ReverbMode = 'hall' | 'cave' | 'spire';

interface ReverbUnit {
  mode: ReverbMode;
  send: GainNode;
  conv: ConvolverNode | null;
  connected: boolean;
  level: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

/** Soft-clip curve: identity up to 0.7 (−3.1 dBFS), then a tanh knee that never exceeds 0.868. */
function safetyCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= 0.7 ? a : 0.7 + 0.18 * Math.tanh((a - 0.7) / 0.18);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export class Core {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly hush: GainNode;
  readonly glue: DynamicsCompressorNode;
  readonly limiter: DynamicsCompressorNode;
  readonly safety: WaveShaperNode;
  readonly tap: AnalyserNode;

  readonly musicDry: GainNode;
  readonly musicWet: GainNode;
  /** cinematic stingers: join the music chain after the duck (still muffled, never ducked) */
  readonly stingDry: GainNode;
  readonly stingWet: GainNode;
  readonly sfxDry: GainNode;
  readonly sfxWet: GainNode;
  readonly ambDry: GainNode;
  readonly ambWet: GainNode;
  /** tower voices (dry) — glued by a gentle bus compressor so 2 or 30 towers sit at a similar level */
  readonly towerBus: GainNode;
  readonly towerComp: DynamicsCompressorNode;
  /** undoes the compressor's automatic make-up gain (quiet towers pass at unity) */
  private readonly towerMakeup: GainNode;

  private readonly musicDuck: GainNode;
  private readonly musicTone: BiquadFilterNode;
  private readonly musicDuckW: GainNode;
  private readonly musicHP: BiquadFilterNode;
  private readonly musicHPW: BiquadFilterNode;
  private readonly muffleLP: BiquadFilterNode;
  private readonly muffleLPW: BiquadFilterNode;
  private readonly muffleGain: GainNode;
  private readonly muffleGainW: GainNode;
  private readonly musicVol: GainNode;
  private readonly musicVolW: GainNode;
  private readonly sfxVol: GainNode;
  private readonly sfxVolW: GainNode;
  private readonly ambVol: GainNode;
  private readonly ambVolW: GainNode;
  private readonly wetSum: GainNode;
  private readonly reverbOut: GainNode;
  private readonly reverbs: Record<ReverbMode, ReverbUnit>;
  reverbMode: ReverbMode = 'hall';
  private muffleAmount = 0;

  /** Shared noise buffers. */
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;

  /** Active voice counters per category (for polyphony caps). */
  private readonly voices: Record<string, number> = {};
  /** total voices started (diagnostics) */
  started = 0;

  /** `renderer` = async synthesis (render worker); null = synchronous (offline analysis). */
  constructor(ctx: BaseAudioContext, private readonly renderer: Renderer | null = null) {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g(0.9);
    this.hush = g(1);
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.02;
    this.glue.release.value = 0.3;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.safety = ctx.createWaveShaper();
    this.safety.curve = safetyCurve();
    this.safety.oversample = 'none';
    this.tap = ctx.createAnalyser();
    this.tap.fftSize = 2048;
    this.master.connect(this.hush).connect(this.glue);
    this.glue.connect(this.limiter);
    this.limiter.connect(this.safety);
    this.safety.connect(ctx.destination);
    this.safety.connect(this.tap);

    this.musicDry = g();
    this.musicWet = g();
    this.stingDry = g();
    this.stingWet = g();
    this.musicDuck = g();
    this.musicDuckW = g();
    this.musicVol = g(0.8);
    this.musicVolW = g(0.8);
    this.sfxDry = g();
    this.sfxWet = g();
    this.sfxVol = g(0.9);
    this.sfxVolW = g(0.9);
    this.ambDry = g();
    this.ambWet = g();
    this.ambVol = g(0.8);
    this.ambVolW = g(0.8);
    this.wetSum = g();
    this.reverbOut = g(1);
    this.towerBus = g(1);
    this.towerComp = ctx.createDynamicsCompressor();
    this.towerComp.threshold.value = -12;
    this.towerComp.knee.value = 10;
    this.towerComp.ratio.value = 3;
    this.towerComp.attack.value = 0.006;
    this.towerComp.release.value = 0.25;
    // Web Audio compressors add make-up gain ≈ 0.6 · (full-range gain reduction): −12 dB / 3:1 → +4.8 dB
    this.towerMakeup = g(Math.pow(10, -4.8 / 20));

    this.musicTone = ctx.createBiquadFilter();
    this.musicTone.type = 'highshelf';
    this.musicTone.frequency.value = 3200;
    // a little air on the music (the synth voices are warm; this keeps them clear on small speakers)
    this.musicTone.gain.value = 2;
    const hp = () => {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 10;
      f.Q.value = 0.7;
      return f;
    };
    const lp = () => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 20000;
      f.Q.value = 0.6;
      return f;
    };
    this.musicHP = hp();
    this.musicHPW = hp();
    this.muffleLP = lp();
    this.muffleLPW = lp();
    this.muffleGain = g();
    this.muffleGainW = g();
    this.musicDry.connect(this.musicDuck).connect(this.musicTone).connect(this.musicHP).connect(this.muffleLP).connect(this.muffleGain).connect(this.musicVol).connect(this.master);
    this.musicWet.connect(this.musicDuckW).connect(this.musicHPW).connect(this.muffleLPW).connect(this.muffleGainW).connect(this.musicVolW).connect(this.wetSum);
    this.stingDry.connect(this.muffleLP);
    this.stingWet.connect(this.muffleLPW);
    this.towerBus.connect(this.towerComp).connect(this.towerMakeup).connect(this.sfxDry);
    this.sfxDry.connect(this.sfxVol).connect(this.master);
    this.sfxWet.connect(this.sfxVolW).connect(this.wetSum);
    this.ambDry.connect(this.ambVol).connect(this.master);
    this.ambWet.connect(this.ambVolW).connect(this.wetSum);
    this.reverbOut.connect(this.master);

    // small, fast noise beds (a few ms) — needed immediately by the intro sting
    this.white = this.makeNoise('white', 1.5);
    this.pink = this.makeNoise('pink', 2.5);
    this.brown = this.makeNoise('brown', 2.5);

    const unit = (mode: ReverbMode): ReverbUnit => ({ mode, send: g(0), conv: null, connected: false, level: 0, disconnectTimer: null });
    this.reverbs = { hall: unit('hall'), cave: unit('cave'), spire: unit('spire') };
    for (const r of Object.values(this.reverbs)) this.wetSum.connect(r.send);
    this.setReverbMode('hall', 0.01);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  // ───────────────────────────── volumes / duck / muffle ─────────────────────────────

  setVolumes(v: Volumes): void {
    const t = this.now;
    const set = (p: AudioParam, x: number) => p.setTargetAtTime(clamp(x, 0, 1.5), t, 0.05);
    const shape = (x: number) => Math.pow(clamp(Number.isFinite(x) ? x : 0, 0, 1), 1.6); // perceptual curve
    set(this.master.gain, 0.9 * shape(v.master));
    set(this.musicVol.gain, 0.8 * shape(v.music));
    set(this.musicVolW.gain, 0.8 * shape(v.music));
    set(this.sfxVol.gain, 0.9 * shape(v.sfx));
    set(this.sfxVolW.gain, 0.9 * shape(v.sfx));
    set(this.ambVol.gain, 0.8 * shape(v.ambience));
    set(this.ambVolW.gain, 0.8 * shape(v.ambience));
  }

  duck(amount: number, seconds: number): void {
    const t = this.now;
    const low = clamp(1 - (Number.isFinite(amount) ? amount : 0), 0.05, 1);
    const s = Number.isFinite(seconds) ? seconds : 0.5;
    for (const p of [this.musicDuck.gain, this.musicDuckW.gain]) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(low, t, 0.12);
      p.setTargetAtTime(1, t + Math.max(0.2, s), 0.6);
    }
  }

  /** 0 = open … 1 = fully muffled: low-pass from 20 kHz down to ~450 Hz plus a −5 dB dip. */
  setMuffle(amount: number): void {
    const a = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
    if (Math.abs(a - this.muffleAmount) < 1e-4) return;
    this.muffleAmount = a;
    const t = this.now;
    const f = 20000 * Math.pow(450 / 20000, Math.pow(a, 0.8));
    const gdb = -5 * a;
    for (const lp of [this.muffleLP, this.muffleLPW]) lp.frequency.setTargetAtTime(f, t, 0.12);
    for (const gg of [this.muffleGain, this.muffleGainW]) gg.gain.setTargetAtTime(Math.pow(10, gdb / 20), t, 0.12);
  }

  /** The ff build-up: the music thins out (high-pass sweep) and is "sucked" away just before the drop. */
  ffBuild(t: number, tDrop: number): void {
    const dur = Math.max(0.2, tDrop - t);
    for (const f of [this.musicHP, this.musicHPW]) {
      const p = f.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(10, t);
      p.exponentialRampToValueAtTime(140, t + dur * 0.55);
      p.exponentialRampToValueAtTime(650, tDrop - 0.01);
      p.setValueAtTime(10, tDrop);
    }
    for (const gg of [this.musicDuck.gain, this.musicDuckW.gain]) {
      gg.cancelScheduledValues(t);
      gg.setValueAtTime(1, t);
      gg.setValueAtTime(1, tDrop - Math.min(0.16, dur * 0.12));
      gg.linearRampToValueAtTime(0.35, tDrop - 0.01);
      gg.setValueAtTime(1, tDrop);
    }
  }

  /** Everything (music, sfx, ambience, reverb tails) fades to digital silence from t1 to t2, back at t3. */
  hushWindow(t1: number, t2: number, t3: number): void {
    const p = this.hush.gain;
    p.cancelScheduledValues(t1);
    p.setValueAtTime(1, t1);
    p.linearRampToValueAtTime(0, t2);
    p.setValueAtTime(0, t3 - 0.005);
    p.linearRampToValueAtTime(1, t3);
  }

  // ───────────────────────────── reverb ─────────────────────────────

  setReverbMode(mode: ReverbMode, fade = 3): void {
    this.reverbMode = mode;
    const t = this.now;
    for (const r of Object.values(this.reverbs)) {
      const target = r.mode === mode ? 1 : 0;
      if (target > 0) this.ensureReverb(r);
      r.level = target;
      r.send.gain.cancelScheduledValues(t);
      r.send.gain.setTargetAtTime(target * 0.9, t, Math.max(0.01, fade / 3));
      if (r.disconnectTimer !== null) {
        clearTimeout(r.disconnectTimer);
        r.disconnectTimer = null;
      }
      if (target === 0 && r.connected && typeof setTimeout === 'function') {
        // disconnect the idle convolver once its send has faded and its tail is gone (saves CPU)
        r.disconnectTimer = setTimeout(() => {
          r.disconnectTimer = null;
          if (r.level === 0 && r.connected && r.conv) {
            try {
              r.send.disconnect(r.conv);
            } catch {
              /* ignore */
            }
            r.connected = false;
          }
        }, (fade + 7) * 1000);
      }
    }
  }

  private ensureReverb(r: ReverbUnit): void {
    try {
      if (!r.conv) {
        const conv = this.ctx.createConvolver();
        conv.normalize = true;
        conv.connect(this.reverbOut);
        r.conv = conv;
        const sr = this.ctx.sampleRate;
        const apply = ([L, R]: [Float32Array, Float32Array]) => {
          const buf = this.ctx.createBuffer(2, L.length, sr);
          buf.getChannelData(0).set(L);
          buf.getChannelData(1).set(R);
          conv.buffer = buf; // until now the convolver is silent (dry signal only)
        };
        if (this.renderer) this.renderer.impulse(r.mode, sr, r.mode === this.reverbMode ? 0 : 3).then(apply).catch((e) => report('impulse', e));
        else apply(makeImpulseData(r.mode, sr));
      }
      if (!r.connected) {
        r.send.connect(r.conv);
        r.connected = true;
      }
    } catch (e) {
      report('reverb', e);
    }
  }

  private makeNoise(kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, n, sr);
    buf.getChannelData(0).set(makeNoiseData(kind, n, sr));
    return buf;
  }

  /** A looping noise source (caller must stop it). */
  noise(kind: 'white' | 'pink' | 'brown', t: number, offset = Math.random()): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = kind === 'white' ? this.white : kind === 'pink' ? this.pink : this.brown;
    src.loop = true;
    src.start(t, offset * (src.buffer.duration - 0.1));
    return src;
  }

  // ───────────────────────────── voices ─────────────────────────────

  /** Offline renders that schedule everything up-front must disable polyphony caps. */
  capsEnabled = true;

  voiceCount(cat: string): number {
    return this.capsEnabled ? (this.voices[cat] ?? 0) : 0;
  }

  /** Raw counters (diagnostics, independent of capsEnabled). */
  voiceTable(): Record<string, number> {
    return { ...this.voices };
  }

  /** Registers a voice: when `ender` ends, all `nodes` are disconnected and the counter drops. */
  track(cat: string, ender: AudioScheduledSourceNode, nodes: (AudioNode | null | undefined)[]): void {
    this.voices[cat] = (this.voices[cat] ?? 0) + 1;
    this.started++;
    ender.onended = () => {
      this.voices[cat] = Math.max(0, (this.voices[cat] ?? 1) - 1);
      disconnectAll(nodes);
      ender.onended = null;
    };
  }

  dispose(): void {
    try {
      const c = this.ctx as AudioContext;
      if (typeof c.close === 'function') void c.close();
    } catch {
      /* ignore */
    }
  }
}
