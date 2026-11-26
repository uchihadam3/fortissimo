/**
 * Music director: players anchored to a song clock, lookahead scheduling, crossfades, intensity.
 *
 * A Player's bar b starts at exactly t0 + b · barDur (context time). Bars are composed a little
 * ahead of time (lookahead) from that anchor, so beat k always sounds at t0 + k · spb — the same
 * grid the game uses for towers. Themes expose their harmony as a pure function of the bar index
 * (`chordAt`) so tower notes can be chosen before the backing for that bar exists.
 */
import type { EnemyKind, SongId, WorldId } from '../../sim/defs';
import type { BandMix } from '../api';
import type { Core, ReverbMode } from './core';
import { PERC } from './dsp';
import { BufferBank, Channel, type BufInst, type BufNoteOpts, type ChannelOpts, oscStack, playBuf, type StackOpts } from './synth';
import type { Chord, Scale } from './theory';
import { clamp, report } from './util';

/** Internal cinematic tracks (not part of the public SongId list): `mood:<name>` or `mood:<name>@<world>`. */
export type CineId = `mood:${string}` | `cine:${string}`;
export type TrackId = SongId | CineId;

/** The band before the game reports one: everything present (a song never sounds thinner than intended). */
export const FULL_BAND: BandMix = {
  sections: { strings: 1, percussion: 1, bells: 1, brass: 1, voices: 1, low: 1 },
  harmony: 5,
  duets: [],
};

/** sanitised copy of a band mix (garbage in -> a valid mix) */
export function cleanBand(m: unknown): BandMix {
  const o = (m && typeof m === 'object' ? m : {}) as Partial<BandMix>;
  const sec = (o.sections && typeof o.sections === 'object' ? o.sections : {}) as Partial<Record<string, unknown>>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(64, x)) : 0);
  const sections = { strings: n(sec.strings), percussion: n(sec.percussion), bells: n(sec.bells), brass: n(sec.brass), voices: n(sec.voices), low: n(sec.low) };
  const present = Object.values(sections).filter((v) => v > 0).length;
  const h = typeof o.harmony === 'number' && Number.isFinite(o.harmony) ? Math.round(o.harmony) : present - 1;
  const ids = ['march', 'groundwork', 'shimmer', 'fanfare', 'hymn', 'serenade', 'groove', 'thunder'];
  const duets = Array.isArray(o.duets) ? [...new Set(o.duets.filter((d): d is BandMix['duets'][number] => typeof d === 'string' && ids.includes(d)))] : [];
  return { sections, harmony: Math.max(0, Math.min(5, h)), duets };
}

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
  /** the band on the shell for this bar and the previous one */
  band: BandMix;
  bandPrev: BandMix;
  /** the player's groove (0…4: their run of on-beat taps) for this bar and the previous one */
  groove: number;
  groovePrev: number;
  /** the player's power (0…1, v4) when this bar is composed (1 = neutral) */
  power: number;
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
  /** The tower melody guide: the pitch of the song's tune at (bar, beat), or null (towers arpeggiate). */
  guide(_bar: number, _beat: number, _p: Player): number | null {
    return null;
  }
  /** The scale sounding at a bar (key lifts per movement); stingers and motifs follow it. */
  keyAt(_bar: number, _p: Player): Scale {
    return this.key;
  }
  /** The logs (intensity, movement, band) changed from `bar` on: drop cached decisions for bars >= bar. */
  invalidate(_bar: number): void {}
  /** release any extra nodes created in setup */
  dispose(): void {}
  /** the arrangement follows the band on the shell (battle songs): the backing's size follows it too */
  get followsBand(): boolean {
    return false;
  }
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
  private blog: { bar: number; mix: BandMix }[];
  private mlog: { bar: number; index: number; total: number }[] = [];
  private glog: { bar: number; level: number }[];
  /** the boss fights (v5): from `bar` on the music is that boss's (kind null = the song itself) */
  private slog: { bar: number; kind: EnemyKind | null; phase: number }[] = [{ bar: -1e9, kind: null, phase: 0 }];
  /** highest bar whose harmony has been handed out (to towers) before it was composed */
  private observed = -1;
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
    this.blog = [{ bar: -1e9, mix: director.band }];
    this.glog = [{ bar: -1e9, level: director.groove }];
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

  /** harmony at context time t; `lock` (a note is chosen from it) freezes that bar's harmony */
  chordAtTime(t: number, lock = false): Chord {
    const bar = this.barAt(t);
    if (bar < 0) return this.theme.chordAt(0, 0, this);
    if (lock && this.nextBar >= 0 && bar >= this.nextBar && bar > this.observed && bar - this.nextBar < 2) this.observed = bar;
    return this.theme.chordAt(bar, this.beatInBar(t), this);
  }

  /** the tower guide pitch at context time t (null = none) */
  guideAtTime(t: number): number | null {
    const bar = this.barAt(t);
    if (bar < 0) return null;
    return this.theme.guide(bar, this.beatInBar(t), this);
  }

  keyAtTime(t: number): Scale {
    return this.theme.keyAt(Math.max(0, this.barAt(t)), this);
  }

  /** first bar a change requested now can still affect (not composed, not handed out, in the future) */
  private firstFree(now: number): number {
    return Math.max(this.nextBar < 0 ? 0 : this.nextBar, Math.ceil((now + 0.02 - this.t0) / this.barDur - 1e-7), this.observed + 1);
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
    const firstFree = this.firstFree(now);
    const before = this.ilog.length;
    this.ilog = this.ilog.filter((e) => e.bar < firstFree);
    const removed = before !== this.ilog.length;
    let added = false;
    if (this.intensityAt(firstFree - 1) !== lv) {
      this.ilog.push({ bar: firstFree, level: lv });
      added = true;
    }
    if (removed || added) this.theme.invalidate(firstFree);
    return firstFree;
  }

  // ───────────────────────────── the band & movements ─────────────────────────────

  bandAt(bar: number): BandMix {
    let m = this.blog[0].mix;
    for (const e of this.blog) {
      if (e.bar <= bar) m = e.mix;
      else break;
    }
    return m;
  }

  /** the band changes from the next free bar line */
  setBand(mix: BandMix, now: number): number {
    const firstFree = this.firstFree(now);
    this.blog = this.blog.filter((e) => e.bar < firstFree);
    this.blog.push({ bar: firstFree, mix });
    if (this.blog.length > 64) this.blog.splice(1, this.blog.length - 64);
    this.theme.invalidate(firstFree);
    return firstFree;
  }

  grooveAt(bar: number): number {
    let lv = this.glog[0].level;
    for (const e of this.glog) {
      if (e.bar <= bar) lv = e.level;
      else break;
    }
    return lv;
  }

  /** the groove changes from the next free bar line */
  setGroove(level: number, now: number): number {
    const lv = clamp(Math.round(level), 0, 4);
    const firstFree = this.firstFree(now);
    this.glog = this.glog.filter((e) => e.bar < firstFree);
    if (this.grooveAt(firstFree - 1) !== lv) this.glog.push({ bar: firstFree, level: lv });
    if (this.glog.length > 64) this.glog.splice(1, this.glog.length - 64);
    this.theme.invalidate(firstFree);
    return firstFree;
  }

  // ───────────────────────────── boss fights (v5) ─────────────────────────────

  /** the boss whose music plays in `bar` (null: the song), the bar it began and the bar its phase began */
  bossAt(bar: number): { kind: EnemyKind; phase: number; from: number; phaseFrom: number } | null {
    let k = 0;
    for (let i = 0; i < this.slog.length; i++) if (this.slog[i].bar <= bar) k = i;
    const e = this.slog[k];
    if (!e.kind) return null;
    let from = k;
    while (from > 0 && this.slog[from - 1].kind === e.kind) from--;
    return { kind: e.kind, phase: e.phase, from: this.slog[from].bar, phaseFrom: e.bar };
  }

  /** a boss fight (or the song again: null) from the first free bar line at or after t; returns that bar */
  setBoss(kind: EnemyKind | null, t: number, now: number): number {
    const want = Math.ceil((t - this.t0) / this.barDur - 1e-6);
    const bar = Math.max(want, this.firstFree(now));
    this.slog = this.slog.filter((e) => e.bar < bar);
    const cur = this.slog[this.slog.length - 1];
    if ((cur.kind ?? null) !== kind) this.slog.push({ bar, kind, phase: kind ? 1 : 0 });
    if (this.slog.length > 64) this.slog.splice(1, this.slog.length - 64);
    this.theme.invalidate(bar);
    return bar;
  }

  /** the boss enters phase n from the first free bar line at or after t (no-op without a boss) */
  setBossPhase(phase: number, t: number, now: number): number | null {
    const want = Math.ceil((t - this.t0) / this.barDur - 1e-6);
    const bar = Math.max(want, this.firstFree(now));
    const cur = this.bossAt(bar);
    if (!cur || cur.phase === phase) return null;
    this.slog = this.slog.filter((e) => e.bar < bar);
    this.slog.push({ bar, kind: cur.kind, phase });
    this.theme.invalidate(bar);
    return bar;
  }

  /**
   * Movement `index` of `total` begins at the downbeat nearest to context time t - or, when that bar
   * is already composed (the call came late), at the next free bar line.
   */
  setMovement(index: number, total: number, t: number, now: number): number {
    const want = Math.round((t - this.t0) / this.barDur);
    const bar = Math.max(want, this.firstFree(now));
    this.mlog = this.mlog.filter((e) => e.bar < bar);
    this.mlog.push({ bar, index, total });
    this.theme.invalidate(bar);
    return bar;
  }

  private spot: { fromBar: number; to: number } | null = null;

  /** a soloist plays from t1 to t2 (joinMotif): moods hold their tonic under it (bars not composed yet) */
  spotlight(t1: number, t2: number): void {
    const fromBar = Math.max(this.firstFree(this.core.now), this.barAt(t1));
    this.spot = { fromBar, to: t2 };
    this.theme.invalidate(fromBar);
  }

  inSpotlight(bar: number): boolean {
    const s = this.spot;
    return !!s && bar >= s.fromBar && this.barStart(bar) < s.to - 0.05;
  }

  /** the latest movement that began at or before `bar` (null: none was announced) */
  movementAt(bar: number): { bar: number; index: number; total: number } | null {
    let m: { bar: number; index: number; total: number } | null = null;
    for (const e of this.mlog) {
      if (e.bar <= bar) m = e;
      else break;
    }
    return m;
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
    this.theme.invalidate(drop - 1);
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
      band: this.bandAt(bar),
      bandPrev: this.bandAt(bar - 1),
      groove: this.grooveAt(bar),
      power: this.director.power,
      groovePrev: this.grooveAt(bar - 1),
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
    const d = this.director;
    const perc = o?.cat === 'perc';
    // v7: the kit's level is metered (the virada's strokes follow it); this changes no sound
    if (this === d.current && (perc || KIT.has(inst))) d.meterKit(this, t, vel * c.input.gain.value);
    if (d.viradas.length || d.stem) {
      // v7: inside a virada the song's own drum kit steps back (nothing changes outside one)
      const k = d.drumGain(inst, t, perc);
      if (!(k > 0)) return;
      vel *= k;
    }
    // caps count notes from the moment they are scheduled (a whole bar ahead): they are per-bar budgets
    playBuf(this.core, this.bank, inst, c.input, t, midi, vel, dur, { cat: 'music', cap: 160, pitch: this.pitch, ...o });
  }

  /** a percussion one-shot (natural pitch at MIDI 60) */
  hit(inst: BufInst, ch: string, t: number, vel: number, midi = 60, o?: BufNoteOpts & { dur?: number }): void {
    this.buf(inst, ch, t, midi, vel, o?.dur ?? 4, { cat: 'perc', cap: 96, ...o });
  }

  rt(preset: StackOpts, ch: string, t: number, midi: number, vel: number, dur: number): void {
    const c = this.channels.get(this.prefix + ch);
    if (!c || t < this.core.now - 0.01 || !(vel > 0)) return;
    if (this.director.stem === 'drums') return;
    oscStack(this.core, c, t, midi, vel, dur, preset);
  }
}

export type ThemeFactory = (id: TrackId) => Theme | null;

/** the song's drum kit (what steps back in a virada): every unpitched one-shot, the toms, taiko, timpani */
const KIT: ReadonlySet<BufInst> = new Set<BufInst>([...PERC, 'tom', 'taiko', 'timp', 'tdrum']);
/** a note this close before the window's edge already belongs to it (humanised notes sit a few ms early) */
const EDGE = 0.03;

/** a virada's window (context time): the song's drums step back from `from` until `to` */
export interface ViradaWindow {
  from: number;
  to: number;
}

export class Director {
  private players: Player[] = [];
  current: Player | null = null;
  /** the land the story is in (battle songs, ambience, land cues): boss and story moods take its colours */
  world: WorldId | null = null;
  /** the band last reported by the game (new players start with it) */
  band: BandMix = FULL_BAND;
  /** the player's groove (0…4) last reported (new players start with it) */
  groove = 0;
  /** the player's power (0…1, v4): battle songs grow with it; 1 = neutral */
  power = 1;
  /** the most recently started track (its harmony and grid stay the reference after it stops) */
  last: Player | null = null;
  /** v7: the current virada's window (at most one; a new cue replaces it). Empty = the song plays as written. */
  viradas: ViradaWindow[] = [];
  /** the kit's energy per bar of the current track (Σ (velocity · channel gain)²), the last few bars */
  private kitBars = new Map<number, number>();
  private kitOf: Player | null = null;
  /** analysis only: render just the drum kit ('drums') or everything but it ('rest'); null in the game */
  stem: 'drums' | 'rest' | null = null;

  constructor(
    readonly core: Core,
    readonly bank: BufferBank,
    private readonly factory: ThemeFactory,
  ) {}

  get currentId(): TrackId | null {
    return this.current?.id ?? null;
  }

  /** Start a track whose beat 0 is at context time t0; the previous one fades over `fade`. */
  play(id: TrackId, t0: number, fade: number, intensity = 0, fadeFrom?: number): Player | null {
    const f = Math.max(0.02, fade);
    if (this.current) this.current.stop(f, fadeFrom !== undefined && fadeFrom > this.core.now ? fadeFrom : undefined);
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
    this.applySize();
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

  /** harmony sounding at context time t (`lock`: a note will be chosen from it) */
  chordAt(t: number, lock = false): Chord | null {
    const p = this.ref;
    if (!p) return null;
    return p.chordAtTime(t, lock);
  }

  /** the tower melody guide at context time t */
  guideAt(t: number): number | null {
    const p = this.ref;
    return p ? p.guideAtTime(t) : null;
  }

  /** the scale sounding at context time t */
  keyAt(t: number): Scale | null {
    const p = this.ref;
    return p ? p.keyAtTime(t) : null;
  }

  /** the backing's size: the band's harmony for battle songs, the full size for everything else */
  applySize(): void {
    const p = this.current;
    const battle = !!p && p.theme.followsBand;
    this.core.setBandSize(battle ? this.band.harmony : 5);
    this.core.setPower(battle ? this.power : 1, p ? p.barDur / 3 : 0.8);
  }

  /** the player's power 0…1: the mix follows smoothly (~1 bar), the arrangement from the next bar composed */
  setPower(power: number): void {
    const v = clamp(Number.isFinite(power) ? power : 1, 0, 1);
    if (Math.abs(v - this.power) < 0.004) return;
    const falling = v < this.power;
    this.power = v;
    const p = this.current;
    // growth swells in over about a bar; a loss is felt at once (half a beat or so)
    if (p && p.theme.followsBand) this.core.setPower(v, falling ? p.barDur / 8 : p.barDur / 3);
  }

  setBand(mix: BandMix): void {
    this.band = mix;
    this.applySize();
    const p = this.current;
    if (p && !p.stopped) p.setBand(mix, this.core.now);
  }

  /** the player's groove changes from the next free bar line; returns when (context time), or null */
  /** a boss fight's music from the next bar line ≥ t (battle songs only); returns its start time */
  bossTheme(kind: EnemyKind | null, t: number): number | null {
    const p = this.current;
    if (!p || p.stopped || !p.theme.followsBand) return null;
    return p.barStart(p.setBoss(kind, t, this.core.now));
  }

  bossPhase(phase: number, t: number): number | null {
    const p = this.current;
    if (!p || p.stopped || !p.theme.followsBand) return null;
    const bar = p.setBossPhase(phase, t, this.core.now);
    return bar === null ? null : p.barStart(bar);
  }

  setGroove(level: number): number | null {
    this.groove = clamp(Math.round(Number.isFinite(level) ? level : 0), 0, 4);
    const p = this.current;
    if (!p || p.stopped) return null;
    return p.barStart(p.setGroove(this.groove, this.core.now));
  }

  movement(index: number, total: number, t: number): void {
    const p = this.current;
    if (p && !p.stopped) p.setMovement(index, total, t, this.core.now);
  }

  /**
   * A virada: from `from` until `to` (context times on the grid) the song's own drum kit steps back
   * (tacet: the bass and the harmony keep the time); its crash on the downbeat `to` is left out too
   * (the virada's own crash replaces it). Bars are composed just ahead of time, so this applies to
   * every bar not composed yet: call it at least a bar ahead. A new virada replaces the previous one.
   */
  setVirada(from: number, to: number): void {
    if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) return;
    this.viradas = [{ from, to }];
  }

  /** a note of the current track's kit at t with level `amp` (bars are composed a little ahead) */
  meterKit(p: Player, t: number, amp: number): void {
    if (p !== this.kitOf) {
      this.kitOf = p;
      this.kitBars.clear();
    }
    const bar = p.barAt(t);
    this.kitBars.set(bar, (this.kitBars.get(bar) ?? 0) + amp * amp);
    if (this.kitBars.size > 8) {
      const oldest = Math.min(...this.kitBars.keys());
      this.kitBars.delete(oldest);
    }
  }

  /**
   * The kit's energy per bar over the (up to) 3 composed bars before the bar of t, or null when the
   * current track has none composed yet. Silent bars count (a breather's quiet kit is quiet).
   */
  kitEnergy(t: number): number | null {
    const p = this.current;
    if (!p || p !== this.kitOf) return null;
    const b = p.barAt(t);
    let sum = 0;
    let n = 0;
    for (let k = b - 3; k < b; k++) {
      if (k < 0 || k >= p.composedUntil) continue;
      sum += this.kitBars.get(k) ?? 0;
      n++;
    }
    return n ? sum / n : null;
  }

  /** the drums return at t (the virada ended there, or was cancelled) */
  endVirada(t: number): void {
    const w = this.viradas[0];
    if (!w) return;
    if (t <= w.from) this.viradas = [];
    else if (t < w.to) w.to = t;
  }

  /**
   * The level (linear) a note of `inst` at context time t plays at: 1 outside a virada. The kit is
   * every note a song plays as percussion (`perc`: Player.hit, its drum patterns and rolls) and the
   * drum instruments wherever they are played.
   */
  drumGain(inst: BufInst, t: number, perc = false): number {
    const kit = perc || KIT.has(inst);
    if (this.stem && (this.stem === 'drums') !== kit) return 0;
    if (!kit) return 1;
    for (const w of this.viradas) {
      if (t >= w.from - EDGE && t < w.to - EDGE) return 0;
      if ((inst === 'crash' || inst === 'gong') && t >= w.to - EDGE && t < w.to + 0.06) return 0;
    }
    return 1;
  }

  get activePlayers(): number {
    return this.players.length;
  }
}
