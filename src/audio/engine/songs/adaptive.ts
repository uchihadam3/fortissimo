/**
 * Adaptive long-form songs (the battle songs of FORTÍSSIMO v2).
 *
 * A level lasts 4–9 minutes, in MOVEMENTS with BREATHERS between them. The music follows:
 *
 *   plan      — every movement picks a plan: a key (lift), a melody mode and its own order of battle
 *               sections (A / B / C / bridge…). Movement 0 is home, the last movement is the grand
 *               final plan, the middle ones bring the contrasting material.
 *   battle    — while creatures are on the field (intensity ≥ 1) the battle form of the plan plays;
 *               the towers carry the melody (the section's tune is their `guide`).
 *   break     — from the first calm bar (intensity 0) the song turns into a BREAKDOWN: a composed
 *               8-bar tune (the land's leitmotif, its answer, variations) that starts from its first
 *               bar, in the key of the movement — an 8-bar breather is exactly one tune. Every new
 *               breakdown takes the next tune of the rotation, so the breathers of a 9-minute level are
 *               all different. When the next wave comes, the battle resumes at the start of the next
 *               section.
 *
 * Everything is a pure function of the bar index and the player's logs (intensity, movements, band)
 * — decisions about a bar are made from logs that are final when anyone asks about that bar — so
 * towers can always pick their notes from the harmony of the exact moment they sound.
 */
import type { DuetId, Section } from '../../../sim/defs';
import type { BandMix } from '../../api';
import { chordIn, Form, lineNotes, type BarInfo, type Line, type MNote } from '../compose';
import type { BarCtx, Player } from '../music';
import { type Chord, Scale, transpose } from '../theory';
import { clamp } from '../util';
import { Song } from './base';

export interface SecDef {
  name: string;
  /** chord symbols in the HOME key (a plan transposes them) */
  bars: (string | string[])[];
  /** the section's tune in degrees of the plan's scale from its tonic: the towers' guide (battle) or the melody (breakdown) */
  tune?: Line;
  /** the tune's own mode (a minor song inside a Hijaz plan…); default: the plan's */
  mode?: readonly number[];
}

export interface PlanDef {
  /** semitones above the home key */
  shift: number;
  /** melody mode (scale steps) of this movement; default: the song's mode */
  mode?: readonly number[];
  /** battle sections, looped */
  order: string[];
  /** breakdown tunes, in rotation */
  breaks: string[];
}

export type FormMode = 'battle' | 'break';

export interface BState {
  bar: number;
  plan: number;
  movStart: number;
  /** the announced movement (−1: none yet) */
  movIndex: number;
  movTotal: number;
  mode: FormMode;
  /** position in the plan's battle form */
  pos: number;
  /** bar inside the current breakdown */
  brk: number;
  /** breakdowns started so far (the rotation index of the current one) */
  brkN: number;
  /** battle position to resume at after the breakdown */
  resume: number;
  /** consecutive calm bars up to this one */
  calm: number;
}

const INIT: BState = { bar: -1, plan: 0, movStart: 0, movIndex: -1, movTotal: 0, mode: 'battle', pos: -1, brk: 0, brkN: -1, resume: 0, calm: 1 };

/** presence of the band's sections in a bar (0 absent, 0.62 first bar after joining, 1 established) */
export interface Layers {
  strings: number;
  percussion: number;
  bells: number;
  brass: number;
  voices: number;
  low: number;
  /** 0…5 */
  h: number;
  duets: ReadonlySet<DuetId>;
  /** number of sections present */
  n: number;
}

const SECS: Section[] = ['strings', 'percussion', 'bells', 'brass', 'voices', 'low'];

export function layersOf(band: BandMix, prev: BandMix): Layers {
  const out: Layers = { strings: 0, percussion: 0, bells: 0, brass: 0, voices: 0, low: 0, h: clamp(band.harmony, 0, 5), duets: new Set(band.duets), n: 0 };
  for (const s of SECS) {
    const on = band.sections[s] > 0;
    const was = prev.sections[s] > 0;
    out[s] = on ? (was ? 1 : 0.62) : 0;
    if (on) out.n++;
  }
  return out;
}

export abstract class AdaptiveSong extends Song {
  protected abstract readonly sections: SecDef[];
  protected abstract readonly plans: PlanDef[];
  /** unused by adaptive songs (the plans make the form); kept for the Song contract */
  protected get form(): Form {
    return this.battleForm(0);
  }

  private byName: Map<string, SecDef> | null = null;
  private readonly forms = new Map<string, Form>();
  private readonly states = new Map<number, BState>();
  private readonly infos = new Map<string, BarInfo>();
  private readonly tunes = new Map<string, MNote[]>();
  private readonly scales = new Map<string, Scale>();
  private lastSec = '';
  /** the state and scale of the bar being composed */
  protected st: BState = INIT;
  protected sc: Scale | null = null;

  // ───────────────────────────── plans ─────────────────────────────

  /** movement → plan: 0 home · the middle movements in order · the last one the final plan */
  planFor(index: number, total: number): number {
    const n = this.plans.length;
    if (n <= 1 || index <= 0 || total <= 1) return 0;
    if (index >= total - 1) return n - 1;
    if (n <= 2) return 0;
    return 1 + ((index - 1) % (n - 2));
  }

  /** without announced movements (endless journeys) the song still travels: a new plan every 3 breakdowns */
  protected autoPlan(brkN: number): number {
    const n = this.plans.length;
    if (n <= 1) return 0;
    return Math.floor(Math.max(0, brkN) / 3) % n;
  }

  private sec(name: string): SecDef {
    if (!this.byName) this.byName = new Map(this.sections.map((s) => [s.name, s]));
    const s = this.byName.get(name);
    if (!s) throw new Error(`no section ${name}`);
    return s;
  }

  protected battleForm(plan: number): Form {
    const key = `b${plan}`;
    let f = this.forms.get(key);
    if (!f) {
      const P = this.plans[plan];
      f = new Form(P.order.map((n) => this.sec(n)), [], P.order);
      this.forms.set(key, f);
    }
    return f;
  }

  protected breakForm(plan: number, brkN: number): Form {
    const P = this.plans[plan];
    const L = P.breaks.length;
    const off = ((brkN % L) + L) % L;
    const key = `k${plan}:${off}`;
    let f = this.forms.get(key);
    if (!f) {
      const order = [...P.breaks.slice(off), ...P.breaks.slice(0, off)];
      f = new Form(order.map((n) => this.sec(n)), [], order);
      this.forms.set(key, f);
    }
    return f;
  }

  /** semitones added to every plan (a song that takes its key from the land, like the boss); read once */
  protected baseShift(): number {
    return 0;
  }
  private base: number | null = null;
  protected get shift0(): number {
    if (this.base === null) this.base = this.baseShift();
    return this.base;
  }

  /** the scale of a plan (and of a section of it, when the section has its own mode) */
  scaleOfPlan(plan: number, sec?: string): Scale {
    const sd = sec ? this.sec(sec) : null;
    const key = sd?.mode ? `${plan}:${sec}` : `${plan}`;
    let s = this.scales.get(key);
    if (!s) {
      const P = this.plans[plan];
      s = new Scale(this.key.tonic + P.shift + this.shift0, sd?.mode ?? P.mode ?? this.key.steps);
      this.scales.set(key, s);
    }
    return s;
  }

  // ───────────────────────────── the state machine ─────────────────────────────

  invalidate(bar: number): void {
    for (const k of this.states.keys()) if (k >= bar) this.states.delete(k);
  }

  state(bar: number, p: Player): BState {
    if (bar < 0) return INIT;
    const hit = this.states.get(bar);
    if (hit) return hit;
    let k = bar - 1;
    while (k >= 0 && !this.states.has(k)) k--;
    let s = k >= 0 ? this.states.get(k)! : INIT;
    for (let b = k + 1; b <= bar; b++) {
      s = this.step(s, b, p);
      this.states.set(b, s);
    }
    if (this.states.size > 1500) for (const key of this.states.keys()) if (key < bar - 600) this.states.delete(key);
    return s;
  }

  private sectionEnd(plan: number, pos: number): number {
    if (pos < 0) return -1;
    const f = this.battleForm(plan).at(pos);
    return f.start + f.n - 1;
  }

  private step(prev: BState, b: number, p: Player): BState {
    const I = p.intensityAt(b);
    const calm = I === 0 && !p.dropIndex(b) && !p.isBuild(b);
    const mv = p.movementAt(b);
    const s: BState = { ...prev, bar: b };
    let plan = prev.plan;
    if (mv) {
      plan = clamp(this.planFor(mv.index, mv.total), 0, this.plans.length - 1);
      s.movIndex = mv.index;
      s.movTotal = mv.total;
    }
    let changed = plan !== prev.plan;
    if (changed) {
      s.plan = plan;
      s.movStart = b;
      s.pos = -1;
      s.resume = 0;
    }
    if (calm) {
      s.calm = prev.calm + 1;
      if (prev.mode === 'break' && !changed) {
        s.mode = 'break';
        s.brk = prev.brk + 1;
      } else {
        // the first calm bar already begins the breakdown: an 8-bar breather is one whole tune, and a
        // short gap between waves is the tune's head — the leitmotif's call — before the battle resumes.
        // (In auto mode a breakdown may also carry the song to its next plan.)
        s.mode = 'break';
        s.brk = 0;
        s.brkN = prev.brkN + 1;
        if (!mv && !changed) {
          const ap = this.autoPlan(s.brkN);
          if (ap !== prev.plan) {
            s.plan = ap;
            s.movStart = b;
            s.pos = -1;
            changed = true;
          }
        }
        s.resume = changed || prev.pos < 0 ? 0 : this.sectionEnd(s.plan, prev.pos) + 1;
      }
    } else {
      s.calm = 0;
      s.mode = 'battle';
      if (prev.mode === 'break' && !changed) s.pos = prev.resume;
      else s.pos = changed ? 0 : prev.pos + 1;
    }
    return s;
  }

  /** the bar's section info (chords in the movement's key) */
  info(s: BState): BarInfo {
    const P = this.plans[s.plan];
    const key = s.mode === 'battle' ? `b${s.plan}:${s.pos}` : `k${s.plan}:${s.brkN % P.breaks.length}:${s.brk}`;
    let f = this.infos.get(key);
    if (f) return f;
    const raw = s.mode === 'battle' ? this.battleForm(s.plan).at(Math.max(0, s.pos)) : this.breakForm(s.plan, s.brkN).at(s.brk);
    const tr = (c: Chord) => transpose(c, P.shift + this.shift0);
    f = { ...raw, chords: raw.chords.map(tr), chord: tr(raw.chord), next: tr(raw.next) };
    if (this.infos.size > 2000) this.infos.clear();
    this.infos.set(key, f);
    return f;
  }

  chordAt(bar: number, beat: number, p: Player): Chord {
    const f = this.info(this.state(Math.max(0, bar), p));
    return chordIn(f.chords, beat, this.beats);
  }

  keyAt(bar: number, p: Player): Scale {
    const s = this.state(Math.max(0, bar), p);
    return this.scaleOfPlan(s.plan, this.info(s).sec);
  }

  /** the notes of a section's tune in a plan's key (beats from the section start) */
  protected tuneOf(plan: number, sec: string): MNote[] {
    const key = `${plan}:${sec}`;
    let t = this.tunes.get(key);
    if (!t) {
      const line = this.sec(sec).tune;
      const k = this.scaleOfPlan(plan, sec);
      t = line ? lineNotes(k, k.tonic, this.beats, line) : [];
      this.tunes.set(key, t);
    }
    return t;
  }

  guide(bar: number, beat: number, p: Player): number | null {
    const s = this.state(Math.max(0, bar), p);
    const f = this.info(s);
    const notes = this.tuneOf(s.plan, f.sec);
    if (!notes.length) return null;
    const at = f.i * this.beats + beat + 1e-6;
    let best: MNote | null = null;
    for (const n of notes) {
      if (n.beat <= at) best = n;
      else break;
    }
    return best ? best.midi : notes[0].midi;
  }

  // ───────────────────────────── composing ─────────────────────────────

  compose(b: BarCtx): void {
    const s = this.state(b.bar, b.p);
    const f = this.info(s);
    this.st = s;
    this.sc = this.scaleOfPlan(s.plan, f.sec);
    const sk = `${s.mode}:${s.plan}:${f.start}:${s.mode === 'break' ? s.brkN : 0}`;
    if (sk !== this.lastSec) {
      this.lastSec = sk;
      this.lines = {};
      this.vmul = (this.energy[f.sec] ?? 1) * (s.mode === 'break' ? this.breakGain : 1);
      try {
        this.onSection(b, f);
      } catch {
        /* a broken section must not stop the song */
      }
    }
    this.arrange(b, f);
    this.playLines(b, f);
  }

  /** the scale of the bar being composed */
  protected get k(): Scale {
    return this.sc ?? this.key;
  }

  /** velocity trim of the breakdowns (they carry the music alone: no towers play in them) */
  protected readonly breakGain: number = 1.12;

  /** a band that ignores the shell (cinematic statements of the land's song: the full orchestra) */
  fixedBand: BandMix | null = null;

  /** the band's layers in this bar */
  protected L(b: BarCtx): Layers {
    return this.fixedBand ? layersOf(this.fixedBand, this.fixedBand) : layersOf(b.band, b.bandPrev);
  }

  /** this bar is a breakdown */
  protected get isBreak(): boolean {
    return this.st.mode === 'break';
  }
}
