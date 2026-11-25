/**
 * Base classes for the compositions. A Song is a Form (deterministic harmony per bar) plus an
 * arrangement written bar by bar. Randomness is only used for ornaments and humanisation.
 */
import { chordIn, Form, human, lineNotes, type BarInfo, type Line, type MNote } from '../compose';
import { type BarCtx, Player, Theme } from '../music';
import type { BufInst, StackOpts } from '../synth';
import { bassNote, chordTones, type Chord, pcOf, type Scale, voiceLead } from '../theory';
import { clamp, rand, report } from '../util';

export type Inst = BufInst | StackOpts;

export interface ScriptLine {
  notes: MNote[];
  inst: Inst;
  ch: string;
  vel: number;
  release?: number;
  legato?: number;
  /** only play while the bar's intensity is ≤ this (battle phrases make room for towers) */
  maxI?: number;
}

/** velocity of a pattern character */
const PV: Record<string, number> = { X: 1, x: 0.72, o: 0.4, g: 0.25 };

export abstract class Song extends Theme {
  protected abstract readonly form: Form;
  protected vl: Record<string, number[] | null> = {};
  protected lines: Record<string, ScriptLine[]> = {};
  private secStart = -1;
  /** velocity multiplier per section (dynamics across the form) */
  protected readonly energy: Record<string, number> = {};
  protected vmul = 1;

  protected abstract arrange(b: BarCtx, f: BarInfo): void;
  /** called when a section starts (also when playback starts in its middle) */
  protected onSection(_b: BarCtx, _f: BarInfo): void {}

  compose(b: BarCtx): void {
    const f = this.form.at(b.bar);
    if (f.start !== this.secStart) {
      this.secStart = f.start;
      this.lines = {};
      this.vmul = this.energy[f.sec] ?? 1;
      try {
        this.onSection(b, f);
      } catch (e) {
        report('section', e);
      }
    }
    this.arrange(b, f);
    this.playLines(b, f);
  }

  chordAt(bar: number, beat: number, _p: Player): Chord {
    return chordIn(this.form.at(bar).chords, beat, this.beats);
  }

  // ───────────────────────────── timing ─────────────────────────────

  /** humanised time of a beat (never in the past) */
  protected T(b: BarCtx, beat: number, h = 0.006): number {
    return Math.max(b.p.core.now, b.t + beat * b.spb + (h > 0 ? human(h) : 0));
  }

  protected play(b: BarCtx, inst: Inst, ch: string, beat: number, midi: number, vel: number, durSec: number, release?: number, h = 0.006): void {
    const t = this.T(b, beat, h);
    const v = vel * this.vmul;
    if (typeof inst === 'string') b.p.buf(inst, ch, t, midi, v, durSec, release !== undefined ? { release } : undefined);
    else b.p.rt(inst, ch, t, midi, v, durSec);
  }

  protected notes(b: BarCtx, list: MNote[], inst: Inst, ch: string, velMul = 1, legato = 0.95, release?: number): void {
    for (const n of list) this.play(b, inst, ch, n.beat, n.midi, n.vel * velMul, n.dur * b.spb * legato, release);
  }

  protected playLines(b: BarCtx, f: BarInfo): void {
    const from = f.i * b.beats;
    const to = from + b.beats;
    for (const list of Object.values(this.lines)) {
      for (const line of list) {
        if (line.maxI !== undefined && (b.drop ? 3 : b.I) > line.maxI) continue;
        for (const n of line.notes) {
          if (n.beat >= from - 1e-6 && n.beat < to - 1e-6) this.play(b, line.inst, line.ch, n.beat - from, n.midi, n.vel * line.vel, n.dur * b.spb * (line.legato ?? 0.97), line.release);
        }
      }
    }
  }

  /** A composed line starting at section bar `startBar`. */
  protected line(scale: Scale, tonic: number, bars: Line, o: { shift?: number; vel?: number; startBar?: number } = {}): MNote[] {
    return lineNotes(scale, tonic, this.beats, bars, o);
  }

  // ───────────────────────────── harmony helpers ─────────────────────────────

  /** chord sounding at a beat of this bar */
  protected cAt(f: BarInfo, beat: number): Chord {
    return chordIn(f.chords, beat, this.beats);
  }

  /** chord spans of the bar: consecutive identical chords are merged */
  protected spans(f: BarInfo): { c: Chord; beat: number; len: number }[] {
    const k = f.chords.length;
    const sub = this.beats / k;
    const out: { c: Chord; beat: number; len: number }[] = [];
    f.chords.forEach((c, i) => {
      const last = out[out.length - 1];
      if (last && last.c.sym === c.sym) last.len += sub;
      else out.push({ c, beat: i * sub, len: sub });
    });
    return out;
  }

  /** Voice-led sustained chords for the bar. */
  protected chords(b: BarCtx, f: BarInfo, key: string, inst: Inst, ch: string, lo: number, hi: number, n: number, vel: number, overlap = 0.3, spread = 0.03): void {
    for (const s of this.spans(f)) {
      const v = voiceLead(this.vl[key] ?? null, s.c, lo, hi, n);
      this.vl[key] = v;
      for (const m of v) this.play(b, inst, ch, s.beat + rand(0, spread), m, vel * rand(0.92, 1.04), s.len * b.spb + overlap);
    }
  }

  /** Short chord stabs (brass / strings) at the given beats, voice-led. */
  protected stabs(b: BarCtx, f: BarInfo, key: string, inst: Inst, ch: string, lo: number, hi: number, n: number, beats: number[], vel: number, lenBeats = 0.5): void {
    for (const beat of beats) {
      const c = this.cAt(f, beat);
      const v = voiceLead(this.vl[key] ?? null, c, lo, hi, n);
      this.vl[key] = v;
      for (const m of v) this.play(b, inst, ch, beat, m, vel, lenBeats * b.spb, undefined, 0.004);
    }
  }

  /** root of the chord at a beat in [lo, lo+11] */
  protected root(f: BarInfo, beat: number, lo: number): number {
    return bassNote(this.cAt(f, beat), lo);
  }

  /** chord tone nearest above `m` (fifth etc.) — interval 0 root, 1 third, 2 fifth, 3 octave */
  protected tone(c: Chord, lo: number, which: number): number {
    const r = bassNote(c, lo);
    if (which === 0) return r;
    if (which === 3) return r + 12;
    const want = c.pcs[Math.min(which, c.pcs.length - 1)];
    for (let m = r + 1; m < r + 13; m++) if (pcOf(m) === want) return m;
    return r + 7;
  }

  /**
   * A drum pattern over the bar: one character per step ('X' accent, 'x' normal, 'o' ghost,
   * 'g' faint, anything else = rest). Length 8 → eighths, 16 → sixteenths, etc.
   */
  protected drum(b: BarCtx, inst: BufInst, ch: string, pattern: string, vel: number, midi = 60, h = 0.003, swing = 0): void {
    const L = pattern.length;
    const step = b.beats / L;
    for (let i = 0; i < L; i++) {
      const v = PV[pattern[i]];
      if (!v) continue;
      const sw = i % 2 === 1 ? swing * step : 0;
      const t = this.T(b, i * step + sw, h);
      b.p.hit(inst, ch, t, vel * v * this.vmul * rand(0.94, 1.04), midi + rand(-0.08, 0.08));
    }
  }

  /** A bass line: [beat, interval (0 root, 1 3rd, 2 5th, 3 octave), length in beats, velocity]. */
  protected bassline(b: BarCtx, f: BarInfo, inst: Inst, ch: string, pat: [number, number, number, number][], lo: number, release?: number): void {
    for (const [beat, which, len, vel] of pat) {
      const c = this.cAt(f, beat);
      this.play(b, inst, ch, beat, this.tone(c, lo, which), vel, len * b.spb, release, 0.003);
    }
  }

  /** Arpeggiated ostinato over the chord: `steps` notes per bar following `order` over chord tones. */
  protected ostinato(b: BarCtx, f: BarInfo, inst: Inst, ch: string, lo: number, hi: number, order: number[], vel: number, lenBeats: number, accents: number[] = [], skip = 0): void {
    const L = order.length;
    const step = b.beats / L;
    for (let i = 0; i < L; i++) {
      if (order[i] < 0) continue;
      if (skip > 0 && Math.random() < skip) continue;
      const beat = i * step;
      const tones = chordTones(this.cAt(f, beat), lo, hi);
      if (!tones.length) continue;
      const m = tones[order[i] % tones.length];
      const acc = accents.includes(i) ? 1 : 0.78;
      this.play(b, inst, ch, beat, m, vel * acc * rand(0.92, 1.05), lenBeats * b.spb, undefined, 0.003);
    }
  }

  /** a snare/tom roll from `from` to `to` beats, crescendo */
  protected roll(b: BarCtx, inst: BufInst, ch: string, from: number, to: number, rate: number, v0: number, v1: number, midi = 60): void {
    const n = Math.max(1, Math.round((to - from) * rate));
    for (let i = 0; i < n; i++) {
      const x = i / Math.max(1, n - 1);
      b.p.hit(inst, ch, this.T(b, from + (i * (to - from)) / n, 0.002), (v0 + (v1 - v0) * x) * this.vmul, midi + x * 0.5);
    }
  }

  /** intensity of the bar, with the ff drop forcing the climax */
  protected Ieff(b: BarCtx): number {
    return b.drop ? 3 : clamp(b.I, 0, 3);
  }
}
