/**
 * Music director: players anchored to a song clock, lookahead scheduling, crossfades, intensity.
 *
 * A Player's bar b starts at exactly t0 + b · barDur (context time). Bars are composed a little
 * ahead of time (lookahead) from that anchor, so beat k always sounds at t0 + k · spb — the same
 * grid the game uses for towers. Themes expose their harmony as a pure function of the bar index
 * (`chordAt`) so tower notes can be chosen before the backing for that bar exists.
 */
import type { SongId } from '../../sim/defs';
import type { Core, ReverbMode } from './core';
import { BufferBank, Channel, type BufInst, type BufNoteOpts, type ChannelOpts, oscStack, playBuf, type StackOpts } from './synth';
import type { Chord, Scale } from './theory';
import { clamp, report } from './util';

/** Internal cinematic tracks (not part of the public SongId list). */
export type CineId = 'cine:dawn' | 'cine:festival' | 'cine:fall' | 'cine:alone' | 'cine:bloom';
export type TrackId = SongId | CineId;

export interface BarCtx {
  /** context time of the bar's downbeat */
  t: number;
  spb: number;
  beats: number;
  /** absolute bar index from the song's t0 */
  bar: number;
  p: Player;
  /** intensity of this bar (0..3) and of the previous bar */
  I: number;
  Iprev: number;
  /** 0 = normal, 1 = first ff drop bar, 2 = second drop bar */
  drop: number;
  /** this bar is the ff build-up (riser) bar */
  build: boolean;
}

export abstract class Theme {
  abstract readonly bpm: number;
  readonly beats: number = 4;
  readonly reverb: ReverbMode = 'hall';
  /** buffer instruments to pre-render [inst, lo, hi] */
  readonly warm: [BufInst, number, number][] = [];
  /** if set, the theme ends after this many bars */
  readonly length: number | undefined = undefined;
  /** overall loudness trim (linear) applied to every channel of the theme */
  readonly level: number = 1;
  /** tonal centre (stingers such as victory use it) */
  abstract readonly key: Scale;
  abstract setup(p: Player): void;
  abstract compose(b: BarCtx): void;
  /** Called when the last beat of a bar is about to be scheduled (fills that depend on what comes next). */
  tail(_b: BarCtx): void {}
  /** Harmony as a pure function of the bar index (and the player's intensity log). */
  abstract chordAt(bar: number, beat: number, p: Player): Chord;
  /** release any extra nodes created in setup */
  dispose(): void {}
}

interface FFWindow {
  build: number;
  drop: number;
}

export class Player {
  readonly out: GainNode;
  readonly wetOut: GainNode;
  readonly lp: BiquadFilterNode;
  readonly lpW: BiquadFilterNode;
  /** cents added to every voice of this player (tape-stop, pitch sag) */
  readonly pitch: ConstantSourceNode | null;
  readonly channels = new Map<string, Channel>();
  readonly spb: number;
  readonly barDur: number;
  /** context time of beat 0 */
  t0: number;
  stopped = false;
  private nextBar = -1;
  private nextTail = -1;
  private started = false;
  private finishedAt = Infinity;
  private ilog: { bar: number; level: number }[];
  private readonly ff: FFWindow[] = [];
  /** free-form state for cinematic themes (cue times etc.) */
  readonly state: Record<string, number> = {};

  constructor(
    readonly core: Core,
    readonly bank: BufferBank,
    readonly theme: Theme,
    readonly director: Director,
    readonly id: TrackId,
    t0: number,
    intensity: number,
  ) {
    const ctx = core.ctx;
    this.out = ctx.createGain();
    this.wetOut = ctx.createGain();
    this.out.gain.value = 0;
    this.wetOut.gain.value = 0;
    const lp = () => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 20000;
      f.Q.value = 0.7;
      return f;
    };
    this.lp = lp();
    this.lpW = lp();
    this.out.connect(this.lp).connect(core.musicDry);
    this.wetOut.connect(this.lpW).connect(core.musicWet);
    let pitch: ConstantSourceNode | null = null;
    try {
      pitch = ctx.createConstantSource();
      pitch.offset.value = 0;
      pitch.start();
    } catch {
      pitch = null;
    }
    this.pitch = pitch;
    this.spb = 60 / theme.bpm;
    this.barDur = this.spb * theme.beats;
    this.t0 = t0;
    this.ilog = [{ bar: -1e9, level: clamp(Math.round(intensity), 0, 3) }];
  }

  /** channel-name namespace (a medley lends the player to several songs' arrangement code) */
  prefix = '';
  /** extra gain applied to channels created from now on (a medley's guest songs keep their own level) */
  levelScale = 1;

  ch(name: string, o: ChannelOpts = {}): Channel {
    const key = this.prefix + name;
    let c = this.channels.get(key);
    if (!c) {
      c = new Channel(this.core, this.out, this.wetOut, { ...o, gain: (o.gain ?? 1) * this.theme.level * this.levelScale });
      c.pitch = this.pitch;
      this.channels.set(key, c);
    }
    return c;
  }

  start(): void {
    for (const [inst, lo, hi] of this.theme.warm) this.bank.warm(inst, lo, hi, 2);
    try {
      this.theme.setup(this);
    } catch (e) {
      report('theme setup', e);
    }
    // the song starts at full level exactly on its first downbeat (the old one fades out)
    const now = this.core.now;
    const at = Math.max(now + 0.005, this.t0 - 0.02);
    for (const g of [this.out.gain, this.wetOut.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(1, at + 0.015);
    }
    this.started = true;
  }

  // ───────────────────────────── grid ─────────────────────────────

  barStart(bar: number): number {
    return this.t0 + bar * this.barDur;
  }

  /** bar index containing context time t (may be negative before t0) */
  barAt(t: number): number {
    return Math.floor((t - this.t0) / this.barDur + 1e-7);
  }

  /** beat inside its bar (0 ≤ beat < beats) at context time t */
  beatInBar(t: number): number {
    const b = (t - this.t0) / this.spb;
    const r = b - Math.floor(b / this.theme.beats + 1e-9) * this.theme.beats;
    return clamp(r < 1e-6 ? 0 : r, 0, this.theme.beats - 1e-6);
  }

  chordAtTime(t: number): Chord {
    const bar = this.barAt(t);
    if (bar < 0) return this.theme.chordAt(0, 0, this);
    return this.theme.chordAt(bar, this.beatInBar(t), this);
  }

  // ───────────────────────────── intensity & ff ─────────────────────────────

  intensityAt(bar: number): number {
    let lv = this.ilog[0].level;
    for (const e of this.ilog) {
      if (e.bar <= bar) lv = e.level;
      else break;
    }
    return lv;
  }

  /** The change applies from the first bar that is not composed yet and starts in the future. */
  setIntensity(level: number, now: number): number {
    const lv = clamp(Math.round(level), 0, 3);
    const firstFree = Math.max(this.nextBar < 0 ? 0 : this.nextBar, Math.ceil((now + 0.02 - this.t0) / this.barDur - 1e-7));
    this.ilog = this.ilog.filter((e) => e.bar < firstFree);
    if (this.intensityAt(firstFree - 1) !== lv) this.ilog.push({ bar: firstFree, level: lv });
    return firstFree;
  }

  /** the bar from which the latest intensity applies (for themes that switch harmony) */
  intensityLog(): readonly { bar: number; level: number }[] {
    return this.ilog;
  }

  addFF(tDrop: number): void {
    const drop = Math.round((tDrop - this.t0) / this.barDur);
    if (this.ff.some((w) => w.drop === drop)) return;
    this.ff.push({ build: drop - 1, drop });
    if (this.ff.length > 8) this.ff.shift();
  }

  dropIndex(bar: number): number {
    for (const w of this.ff) {
      if (bar === w.drop) return 1;
      if (bar === w.drop + 1) return 2;
    }
    return 0;
  }

  isBuild(bar: number): boolean {
    return this.ff.some((w) => w.build === bar);
  }

  private ctxFor(bar: number): BarCtx {
    return {
      t: this.barStart(bar),
      spb: this.spb,
      beats: this.theme.beats,
      bar,
      p: this,
      I: this.intensityAt(bar),
      Iprev: this.intensityAt(bar - 1),
      drop: this.dropIndex(bar),
      build: this.isBuild(bar),
    };
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  /** Fade out. `at` = when the fade starts (defaults to now). */
  stop(fade: number, at?: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.core.now;
    const t = Math.max(now, at ?? now);
    const f = Math.max(0.02, fade);
    for (const g of [this.out.gain, this.wetOut.gain]) {
      try {
        g.cancelScheduledValues(t);
        if (at === undefined) g.setTargetAtTime(0, t, f / 4);
        else {
          g.setValueAtTime(1, t);
          g.linearRampToValueAtTime(0, t + f);
        }
      } catch (e) {
        report('stop', e);
      }
    }
    this.finishedAt = t + f + 8;
  }

  /** Hard cut (cinematic): silent within ~25 ms of `t`. */
  cut(t: number): void {
    if (!this.stopped) this.stop(0.02, t);
  }

  /** true when the player can be disposed */
  done(now: number): boolean {
    return this.stopped && now > this.finishedAt;
  }

  dispose(): void {
    try {
      this.theme.dispose();
    } catch (e) {
      report('theme dispose', e);
    }
    for (const c of this.channels.values()) c.dispose();
    this.channels.clear();
    try {
      this.pitch?.stop();
    } catch {
      /* ignore */
    }
    for (const n of [this.out, this.wetOut, this.lp, this.lpW, this.pitch]) {
      try {
        n?.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  schedule(until: number): void {
    if (!this.started || this.stopped) return;
    const now = this.core.now;
    const bd = this.barDur;
    if (this.nextBar < 0) {
      // start with the bar whose downbeat is still (nearly) ahead
      this.nextBar = Math.max(0, Math.ceil((now - 0.06 - this.t0) / bd - 1e-7));
      this.nextTail = this.nextBar;
    }
    if (this.barStart(this.nextBar) < now - bd) {
      // the tab slept: skip missed bars instead of bursting them
      this.nextBar = Math.max(0, Math.ceil((now - this.t0) / bd - 1e-7));
      this.nextTail = this.nextBar;
    }
    let guard = 0;
    while (this.barStart(this.nextBar) < until && guard++ < 4) {
      if (this.theme.length !== undefined && this.nextBar >= this.theme.length) {
        this.stop(4, this.barStart(this.nextBar));
        this.director.onThemeEnded(this);
        return;
      }
      try {
        this.theme.compose(this.ctxFor(this.nextBar));
      } catch (e) {
        report('compose', e);
      }
      this.nextBar++;
    }
    guard = 0;
    while (this.nextTail < this.nextBar && this.barStart(this.nextTail) + (this.theme.beats - 1) * this.spb < until && guard++ < 4) {
      try {
        this.theme.tail(this.ctxFor(this.nextTail));
      } catch (e) {
        report('tail', e);
      }
      this.nextTail++;
    }
  }

  /** Index of the next bar that will be composed. */
  get composedUntil(): number {
    return this.nextBar;
  }

  // ───────────────────────────── cinematic automation ─────────────────────────────

  /** The music decays: the filter closes and the pitch sags (wow) from t over `dur` seconds. */
  decay(t: number, dur: number, toHz = 260, sagCents = -140): void {
    for (const f of [this.lp, this.lpW]) {
      f.frequency.cancelScheduledValues(t);
      f.frequency.setValueAtTime(20000, t);
      f.frequency.exponentialRampToValueAtTime(5000, t + dur * 0.35);
      f.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    }
    if (this.pitch) {
      const n = 64;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1);
        // sagging, with a growing tape-like wobble
        curve[i] = sagCents * Math.pow(x, 1.6) + 18 * x * Math.sin(x * dur * 2 * Math.PI * 0.55);
      }
      try {
        this.pitch.offset.cancelScheduledValues(t);
        this.pitch.offset.setValueCurveAtTime(curve, t, dur);
      } catch (e) {
        report('decay', e);
      }
    }
  }

  /** Tape stop: pitch falls to nothing while the filter closes and the level dies. */
  tapeStop(t: number, dur: number): void {
    const n = 48;
    const cents = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = Math.max(0.05, Math.pow(1 - i / (n - 1), 1.3));
      cents[i] = 1200 * Math.log2(r);
    }
    try {
      if (this.pitch) {
        this.pitch.offset.cancelScheduledValues(t);
        this.pitch.offset.setValueCurveAtTime(cents, t, dur);
      }
      for (const f of [this.lp, this.lpW]) {
        f.frequency.cancelScheduledValues(t);
        f.frequency.setValueAtTime(f.frequency.value, t);
        f.frequency.exponentialRampToValueAtTime(180, t + dur);
      }
    } catch (e) {
      report('tapeStop', e);
    }
    this.stop(dur * 1.05, t);
  }

  // ───────────────────────────── convenience players ─────────────────────────────

  buf(inst: BufInst, ch: string, t: number, midi: number, vel: number, dur: number, o?: BufNoteOpts): void {
    const c = this.channels.get(this.prefix + ch);
    if (!c || t < this.core.now - 0.01 || !(vel > 0)) return;
    playBuf(this.core, this.bank, inst, c.input, t, midi, vel, dur, { cat: 'music', cap: 96, pitch: this.pitch, ...o });
  }

  /** a percussion one-shot (natural pitch at MIDI 60) */
  hit(inst: BufInst, ch: string, t: number, vel: number, midi = 60, o?: BufNoteOpts): void {
    this.buf(inst, ch, t, midi, vel, 4, { cat: 'perc', cap: 48, ...o });
  }

  rt(preset: StackOpts, ch: string, t: number, midi: number, vel: number, dur: number): void {
    const c = this.channels.get(this.prefix + ch);
    if (!c || t < this.core.now - 0.01 || !(vel > 0)) return;
    oscStack(this.core, c, t, midi, vel, dur, preset);
  }
}

export type ThemeFactory = (id: TrackId) => Theme | null;

export class Director {
  private players: Player[] = [];
  current: Player | null = null;
  /** the most recently started track (its harmony and grid stay the reference after it stops) */
  last: Player | null = null;

  constructor(
    readonly core: Core,
    readonly bank: BufferBank,
    private readonly factory: ThemeFactory,
  ) {}

  get currentId(): TrackId | null {
    return this.current?.id ?? null;
  }

  /** Start a track whose beat 0 is at context time t0; the previous one fades over `fade`. */
  play(id: TrackId, t0: number, fade: number, intensity = 0): Player | null {
    const f = Math.max(0.02, fade);
    if (this.current) this.current.stop(f);
    this.current = null;
    let theme: Theme | null = null;
    try {
      theme = this.factory(id);
    } catch (e) {
      report('theme', e);
    }
    if (!theme) return null;
    const p = new Player(this.core, this.bank, theme, this, id, t0, intensity);
    this.players.push(p);
    this.current = p;
    this.last = p;
    this.core.setReverbMode(theme.reverb, Math.max(0.5, f));
    p.start();
    return p;
  }

  stop(fade: number): void {
    this.current?.stop(Math.max(0.02, fade));
    this.current = null;
  }

  /** every player (also fading ones) — cinematic cuts */
  stopAll(fade: number, at?: number): void {
    for (const p of this.players) p.stop(fade, at);
    this.current = null;
  }

  onThemeEnded(p: Player): void {
    if (p === this.current) this.current = null;
  }

  tick(lookahead: number): void {
    const now = this.core.now;
    for (const p of this.players) p.schedule(now + lookahead);
    const keep: Player[] = [];
    for (const p of this.players) {
      if (p.done(now)) p.dispose();
      else keep.push(p);
    }
    this.players = keep;
  }

  /** the API clock was re-anchored: keep every grid where it was in API time */
  rebase(delta: number): void {
    for (const p of this.players) p.t0 -= delta;
    if (this.last && !this.players.includes(this.last)) this.last.t0 -= delta;
  }

  /** the track whose grid and harmony tower notes follow (the current one, else the last one) */
  get ref(): Player | null {
    return this.current ?? this.last;
  }

  /** harmony sounding at context time t */
  chordAt(t: number): Chord | null {
    const p = this.ref;
    if (!p) return null;
    return p.chordAtTime(t);
  }

  get activePlayers(): number {
    return this.players.length;
  }
}
