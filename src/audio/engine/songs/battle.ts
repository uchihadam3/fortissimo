/**
 * The battle songs — "the walking orchestra": the turtle takes one step per beat, so every battle
 * groove is a journey march whose deep drum on EVERY beat is its footstep (beat 1 strongest).
 * During the ff build-up bar the turtle rears up (no steps); the drop is its stomp.
 *
 * Every land is an adaptive long-form song (see ./adaptive.ts): movements choose a plan (key lift,
 * mode, section order), calm bars turn into composed breakdowns of the land's leitmotif, and the
 * band on the shell decides the arrangement:
 *   core        footsteps · the harmony bed · a soft root · the tune (breakdowns only)
 *   strings     the ostinato / arpeggio bed (guitar, oud, harp, harpsichord, spiccato)
 *   percussion  the groove (the kit of the land)
 *   bells       shimmer: glockenspiel / celesta / glass sparkle, the land's bells
 *   brass       swells and stabs
 *   voices      choir pads
 *   low         the bass line
 *   harmony     counter-melodies (h ≥ 2), doublings (h ≥ 4), the full glory (h = 5)
 *   duets       partners play together (march, groundwork, shimmer, fanfare, hymn, serenade, groove, thunder)
 * Intensity (0 calm … 3 climax) scales all of it. During waves the towers carry the melody — the
 * section's tune is their guide — so the backing keeps the mid/high register light.
 */
import type { MNote } from '../compose';
import type { BarInfo } from '../compose';
import type { BarCtx } from '../music';
import { LOWBRASS, SUB, type BufInst } from '../synth';
import { chordTones, type Chord, pcOf } from '../theory';
import { rand } from '../util';
import { AdaptiveSong, type Layers } from './adaptive';
import type { Inst } from './base';

/** natural pitch (MIDI) of the one-shot drums the steps use (their buffers play at MIDI 60) */
const NATURAL: Partial<Record<BufInst, number>> = { kick: 30.6, dum: 44.2 };

/** instruments and channels the shared layers (duets, glory) use */
export interface Kit {
  snare: BufInst;
  perc: string;
  shake: BufInst;
  clap: BufInst;
  glock: BufInst;
  glockCh: string;
  bell: BufInst;
  bellCh: string;
  brass: string;
  choir: string;
  bass: string;
  timp: string;
}

export interface TuneOpts {
  /** semitones added (octave placement) */
  shift?: number;
  legato?: number;
  release?: number;
  /** probability of a grace note (cut) on notes of ≥ 1 beat */
  grace?: number;
  /** grace from below instead of above */
  graceBelow?: boolean;
  /** only notes starting at beats in [from, to) of the bar */
  from?: number;
  to?: number;
  /** only the section bars listed (0-based) */
  bars?: number[];
  /** humanisation (s) */
  h?: number;
}

export abstract class Battle extends AdaptiveSong {
  protected abstract readonly kit: Kit;

  /** Lend this song's arrangement to another player (the credits medley); call setup(p) first. */
  guest(b: BarCtx, f: BarInfo): void {
    this.st = { ...this.st, mode: 'battle' };
    this.arrange(b, f);
  }

  /** fill played on the last beat when the next bar is louder */
  protected fill(_b: BarCtx): void {}

  tail(b: BarCtx): void {
    if (b.build || b.drop) return;
    const nextI = b.p.intensityAt(b.bar + 1);
    if (nextI > b.I && !b.p.isBuild(b.bar + 1) && !b.p.dropIndex(b.bar + 1)) {
      this.fill(b);
      if (b.I === 0 || nextI >= 3) this.waveBuild(b, nextI);
    }
  }

  /**
   * The build into a wave (the calm turns into battle, or the battle into its climax): timpani and
   * the snare roll up through the last two beats, the choir and brass swell into the downbeat.
   */
  protected waveBuild(b: BarCtx, nextI: number): void {
    const K = this.kit;
    const next = this.chordAt(b.bar + 1, 0, b.p);
    const big = nextI >= 3 ? 1.2 : 1;
    this.roll(b, 'timp', K.timp, 2, 4, 6, 0.08, 0.36 * big, this.tone(next, 40, 0));
    this.roll(b, K.snare, K.perc, 3, 4, 8, 0.08, 0.34 * big);
    this.play(b, { ...LOWBRASS(0.65), attack: 1.6 * b.spb, release: 0.2 }, K.brass, 2, this.tone(next, 50, 0), 0.4 * big, 2 * b.spb);
    this.play(b, { ...LOWBRASS(0.65), attack: 1.6 * b.spb, release: 0.2 }, K.brass, 2, this.tone(next, 50, 2), 0.32 * big, 2 * b.spb);
  }

  /** true when this bar starts a new, louder layer (crash-worthy): a wave arriving, or a heavier one */
  protected rise(b: BarCtx): boolean {
    return !b.drop && b.I > b.Iprev && (b.I >= 2 || b.Iprev === 0);
  }

  /** the final plan of the song is playing (the grand last movement) */
  protected get finalPlan(): boolean {
    return this.st.plan === this.plans.length - 1 && this.plans.length > 1;
  }

  /**
   * The turtle's footsteps: a deep drum on every beat (beat 1 accented, 3 a little), layered
   * per world. Silent in the ff build bar (it rears up); huge in the drop bars (the stomp).
   */
  protected steps(b: BarCtx, vel: number, layers: { inst: BufInst; ch: string; midi?: number; v?: number }[]): void {
    if (b.build) return;
    const big = b.drop ? 1.3 : 1;
    // the drums of the steps are tuned to the movement's tonic (a timpanist would tune them)
    const tpc = this.k.tonicPc;
    const tuned = layers.map((L) => {
      const nat = NATURAL[L.inst];
      if (nat !== undefined) {
        // one-shot drums: transpose from their natural pitch to the nearest tonic (≤ ±6 semitones)
        let m = Math.round(nat) - 6;
        while (pcOf(m) !== tpc) m++;
        return 60 + (m - nat);
      }
      if (L.inst === 'taiko' || L.inst === 'tom') {
        const want = L.midi ?? 36;
        let m = Math.round(want) - 6;
        while (pcOf(m) !== tpc) m++;
        return m;
      }
      return L.midi ?? 60;
    });
    for (let beat = 0; beat < b.beats; beat++) {
      const acc = beat === 0 ? 1 : beat === 2 ? 0.88 : 0.78;
      layers.forEach((L, i) => b.p.hit(L.inst, L.ch, this.T(b, beat, 0.0015), Math.min(1.2, vel * acc * big * (L.v ?? 1)), tuned[i] + (beat === 0 ? 0 : -0.12), { dur: 1.1, release: 0.35 }));
    }
  }

  /** extra weight during the two ff drop bars: sub octaves pumping, a crash on the second bar */
  protected dropExtras(b: BarCtx, f: BarInfo, crash: { ch: string } | null, sub: string): void {
    if (!b.drop) return;
    if (b.drop === 2 && crash) b.p.hit('crash', crash.ch, this.T(b, 0, 0.001), 0.5);
    for (let k = 0; k < 8; k++) {
      const c = this.cAt(f, k * 0.5);
      this.play(b, SUB(), sub, k * 0.5, this.tone(c, 28, k % 2 ? 3 : 0), k % 2 ? 0.42 : 0.6, 0.42 * b.spb, undefined, 0.001);
    }
  }

  // ───────────────────────────── melody ─────────────────────────────

  /** the notes of the current section's tune that start in this bar (beats relative to the bar) */
  protected tuneNotes(f: BarInfo): MNote[] {
    const all = this.tuneOf(this.st.plan, f.sec);
    const from = f.i * this.beats;
    const out: MNote[] = [];
    for (const n of all) if (n.beat >= from - 1e-6 && n.beat < from + this.beats - 1e-6) out.push({ ...n, beat: n.beat - from });
    return out;
  }

  /** plays the section's tune for this bar (with optional grace notes — whistle cuts, ney turns) */
  protected tune(b: BarCtx, f: BarInfo, inst: Inst, ch: string, vel: number, o: TuneOpts = {}): void {
    if (o.bars && !o.bars.includes(f.i)) return;
    const k = this.k;
    for (const n of this.tuneNotes(f)) {
      if (o.from !== undefined && n.beat < o.from - 1e-6) continue;
      if (o.to !== undefined && n.beat >= o.to - 1e-6) continue;
      const m = n.midi + (o.shift ?? 0);
      const dur = n.dur * b.spb * (o.legato ?? 0.96);
      if (o.grace && n.dur >= 1 && Math.random() < o.grace) {
        const d = k.degreeOf(m);
        const g = o.graceBelow ? k.deg(d - 1) : k.deg(d + 1);
        const tg = this.T(b, n.beat, 0.002);
        if (typeof inst === 'string') b.p.buf(inst, ch, tg, g, n.vel * vel * this.vmul * 0.55, 0.05, { release: 0.04 });
        else b.p.rt({ ...inst, attack: 0.01 }, ch, tg, g, n.vel * vel * this.vmul * 0.6, 0.05);
        const tm = tg + 0.055;
        if (typeof inst === 'string') b.p.buf(inst, ch, tm, m, n.vel * vel * this.vmul, Math.max(0.05, dur - 0.055), o.release !== undefined ? { release: o.release } : undefined);
        else b.p.rt(inst, ch, tm, m, n.vel * vel * this.vmul, Math.max(0.05, dur - 0.055));
        continue;
      }
      this.play(b, inst, ch, n.beat, m, n.vel * vel, dur, o.release, o.h ?? 0.006);
    }
  }

  /** a second voice a diatonic third (or sixth) below the tune: only on the longer notes */
  protected tuneHarmony(b: BarCtx, f: BarInfo, inst: Inst, ch: string, vel: number, below = 2, shift = 0, minDur = 1): void {
    const k = this.k;
    for (const n of this.tuneNotes(f)) {
      if (n.dur < minDur) continue;
      const c = this.cAt(f, n.beat);
      let m = k.deg(k.degreeOf(n.midi) - below);
      // keep it a chord tone (consonant with the harmony)
      const tones = chordTones(c, m - 3, m + 2);
      if (tones.length && !c.pcs.includes(pcOf(m))) m = tones.reduce((a, x) => (Math.abs(x - m) < Math.abs(a - m) ? x : a));
      this.play(b, inst, ch, n.beat, m + shift, n.vel * vel, n.dur * b.spb * 0.95);
    }
  }

  private readonly cnt = new Map<string, number>();
  /**
   * A counter-melody of guide tones (the 3rd or 7th of each chord, moving by the smallest step) in
   * long notes — lush, and out of the towers' rhythmic way. `every` = beats per note.
   */
  protected counter(b: BarCtx, f: BarInfo, inst: Inst, ch: string, lo: number, hi: number, vel: number, every = 4): void {
    for (let beat = 0; beat < b.beats; beat += every) {
      const c = this.cAt(f, beat);
      const want = [c.pcs[1], c.pcs[3] ?? c.pcs[2], c.pcs[0]];
      const prev = this.cnt.get(ch) ?? Math.round((lo + hi) / 2);
      let best = prev;
      let cost = Infinity;
      for (let m = lo; m <= hi; m++) {
        const pi = want.indexOf(pcOf(m));
        if (pi < 0) continue;
        const cc = Math.abs(m - prev) + pi * 1.5 + (m === prev ? 0.5 : 0);
        if (cc < cost) {
          cost = cc;
          best = m;
        }
      }
      this.cnt.set(ch, best);
      this.play(b, inst, ch, beat, best, vel, every * b.spb * 0.98);
    }
  }

  /**
   * Every movement brings its own counter-melody voice (the table is per land: [instrument,
   * channel, low, high] per plan; the final plan usually doubles it).
   */
  protected counters(b: BarCtx, f: BarInfo, table: [Inst, string, number, number][][], vel: number, every: number): void {
    const row = table[Math.min(this.st.plan, table.length - 1)] ?? table[0];
    row.forEach(([inst, ch, lo, hi], i) => this.counter(b, f, inst, ch, lo, hi, vel * (i === 0 ? 1 : 0.8), every));
  }

  // ───────────────────────────── shared band layers ─────────────────────────────

  /** what partners play together while a duet is formed (the land's kit supplies the instruments) */
  protected duets(b: BarCtx, f: BarInfo, L: Layers, I: number): void {
    const K = this.kit;
    const d = L.duets;
    if (!d.size) return;
    const calm = I === 0;
    if (d.has('march') && !calm && !b.build) {
      // a rudimental snare under the harp: flams on the beat, a roll into beat 3
      this.drum(b, K.snare, K.perc, 'x.o.x.oox.o.xooo', 0.3);
    }
    if (d.has('groundwork') && !b.build) {
      // the bass line locks with the drum: an octave bounce on every footstep's off-beat
      for (const beat of [0.5, 1.5, 2.5, 3.5]) {
        const c = this.cAt(f, beat);
        this.play(b, SUB(), K.bass, beat, this.tone(c, 28, beat === 1.5 || beat === 3.5 ? 3 : 0), calm ? 0.2 : 0.3, 0.32 * b.spb, undefined, 0.001);
      }
    }
    if (d.has('shimmer')) {
      // bells and crystal interlock: a 16th-note cascade over the last two beats, every other bar
      if (f.i % 2 === 1) {
        const tones = chordTones(this.cAt(f, 2), 84, 98);
        for (let k = 0; k < 8 && tones.length; k++) b.p.buf(K.glock, K.glockCh, this.T(b, 2 + k * 0.25, 0.002), tones[(k * 2 + (k % 2 ? 3 : 0)) % tones.length], (calm ? 0.12 : 0.16) * (1 - k * 0.05), 0.6);
      }
    }
    if (d.has('fanfare') && !calm && (f.i === 0 || f.i === 4)) {
      // a horn call answered by the drums (a snare ruff on beat 4)
      for (let k = 0; k < 5; k++) b.p.hit(K.snare, K.perc, this.T(b, 3 + k * 0.125, 0.001), 0.18 + k * 0.06);
    }
    if (d.has('hymn')) {
      // the bell tolls each phrase while the choir holds the chord under it
      if (f.i % 2 === 0) {
        const c = this.cAt(f, 0);
        b.p.buf(K.bell, K.bellCh, this.T(b, 0, 0.001), this.tone(c, 55, 0), calm ? 0.16 : 0.2, 4, { release: 1.5 });
      }
      this.chords(b, f, 'hymn', 'choiroo', K.choir, 52, 64, 3, calm ? 0.14 : 0.12, 0.6);
    }
    if (d.has('serenade') && calm) {
      // the choir hums the tune an octave below (harp + choir)
      this.tune(b, f, 'choiroo', K.choir, 0.16, { shift: -12, legato: 1.0 });
    }
    if (d.has('groove') && !calm && !b.build) {
      this.drum(b, K.shake, K.perc, 'oxoxxoxooxoxxoxo', 0.32);
      this.drum(b, K.clap, K.perc, '....x.......x..o', 0.26);
    }
    if (d.has('thunder') && f.i % 4 === 0 && !b.build) {
      // a low rumble and a glint on every phrase
      b.p.buf('timp', K.timp, this.T(b, 0, 0.001), this.tone(this.cAt(f, 0), 40, 0), calm ? 0.22 : 0.3, 3);
      const hi = chordTones(this.cAt(f, 0), 88, 100);
      if (hi.length) b.p.buf(K.glock, K.glockCh, this.T(b, 0.02, 0.001), hi[hi.length - 1], 0.12, 1.5);
    }
  }

  /**
   * The full band in glory, and everything that grows with it. Every battle song calls this once per
   * bar: harmony >= 3 brings choir swells into the phrases, >= 4 brass swells and a stab on every
   * phrase, 5 the full glory (harp sweeps, timpani rolls into sections, a choir 'ah' over every bar);
   * the player's groove adds its energy layers on top (see grooveLayers).
   */
  protected glory(b: BarCtx, f: BarInfo, L: Layers, I: number, harpCh: string | null): void {
    this.tutti(b, f, L, I);
    this.grooveLayers(b, f, I);
    if (L.h < 5) return;
    if (f.last && !b.drop && !b.build) {
      this.roll(b, 'timp', this.kit.timp, 2, 4, 6, 0.08, I >= 2 ? 0.42 : 0.3, this.tone(f.next, 40, 0));
      if (harpCh) {
        const c = this.cAt(f, 3);
        const tones = chordTones(c, 55, 86);
        for (let k = 0; k < 12 && tones.length; k++) this.play(b, 'harp', harpCh, 2.5 + k * 0.125, tones[k % tones.length], 0.16 + 0.01 * k, 0.8 * b.spb, undefined, 0.002);
      }
    }
  }

  /** the layers a big band adds to the battle (none in breakdowns, the calm or a small band) */
  private tutti(b: BarCtx, f: BarInfo, L: Layers, I: number): void {
    if (this.isBreak || I === 0 || b.build || L.h < 3) return;
    const K = this.kit;
    const phraseEnd = f.i % 4 === 3;
    const phraseStart = f.i % 4 === 0;
    // choir swells: an 'ah' chord rising into the next phrase (every bar at harmony 5)
    if (phraseEnd || L.h >= 5) {
      const v = (phraseEnd ? 0.16 : 0.11) * (L.h >= 5 ? 1.2 : 1);
      this.chords(b, f, 'tutti-ch', 'choir', K.choir, 60, 76, 3, v, 0.4);
    }
    if (L.h >= 4) {
      // brass: a swell across the phrase's last bar, a stab on the downbeat it lands on
      if (phraseEnd && !b.drop) this.chords(b, f, 'tutti-sw', { ...LOWBRASS(0.6), attack: 3.2 * b.spb, release: 0.5 }, K.brass, 50, 67, 3, 0.4, 0.15);
      if (phraseStart) this.stabs(b, f, 'tutti-st', 'brass', K.brass, 52, 69, 3, [0], 0.48, 0.9);
    }
    if (L.h >= 5 && phraseStart && !b.drop) b.p.hit('crash', K.perc, this.T(b, 0, 0.001), I >= 2 ? 0.26 : 0.2);
    // the full band sings the hook: the choir hums the towers' tune with them
    if (L.h >= 5) this.tune(b, f, 'choiroo', K.choir, 0.15, { legato: 1.0, release: 0.5 });
  }

  /**
   * The player's groove (0..4, their run of on-beat baton taps), on bar lines: 1 claps on the
   * backbeat and running shakers, 2 choir shouts, 3 brass hits, 4 everything, with drum fills
   * into every second bar, a tambourine and the crash on every phrase.
   */
  private grooveLayers(b: BarCtx, f: BarInfo, I: number): void {
    const g = b.groove;
    if (!g || b.build) return;
    const K = this.kit;
    const soft = this.isBreak || I === 0 ? 0.6 : 1;
    const fresh = b.groovePrev < g ? 0.9 : 1;
    const v = 1.5 * soft * fresh;
    this.drum(b, K.clap, K.perc, '....x.......x...', 0.34 * v);
    this.drum(b, K.shake, K.perc, g >= 4 ? 'xoxoxoxoxoxoxoxo' : 'x.o.x.o.x.o.x.o.', 0.3 * v);
    if (g >= 2) {
      // "Hey!": the choir shouts a chord on the downbeat of every other bar, and on the and-of-4
      const at = f.i % 2 === 0 ? [0] : [3.5];
      for (const beat of at) {
        const tones = chordTones(this.cAt(f, beat), 62, 74).slice(0, 3);
        tones.forEach((m, k) => b.p.buf('choirx', K.choir, this.T(b, beat, 0.002), m, (0.3 - k * 0.03) * v, 0.32 * b.spb, { release: 0.12 }));
      }
    }
    if (g >= 3) {
      // brass hits on the syncopations
      this.stabs(b, f, 'groove-br', 'brass', K.brass, 55, 70, 3, f.i % 2 === 0 ? [0, 1.5] : [2.5, 3.5], 0.36 * v, 0.3);
    }
    if (g >= 4) {
      // the hook in the horns, an octave under the towers' tune (battle only: the towers carry it)
      if (!this.isBreak && I >= 1) this.tune(b, f, 'brass', K.brass, 0.34 * soft, { shift: -12, legato: 0.9 });
      b.p.buf('timp', K.timp, this.T(b, 0, 0.001), this.tone(this.cAt(f, 0), 40, 0), 0.36 * v, 2);
      this.drum(b, 'tamb', K.perc, '..x...x...x...x.', 0.3 * v);
      if (f.i % 4 === 0 && !b.drop) b.p.hit('crash', K.perc, this.T(b, 0, 0.001), 0.3 * v);
      if (f.i % 2 === 1 && !b.drop) {
        // a fill: snare sixteenths, then the toms tumbling down into the next bar
        this.roll(b, K.snare, K.perc, 3, 3.5, 4, 0.22 * v, 0.34 * v);
        [52, 48, 45].forEach((m, k) => b.p.hit('tom', K.perc, this.T(b, 3.5 + k * (0.5 / 3), 0.002), (0.4 + k * 0.06) * v, m));
      }
    }
  }

  /** the root of the chord at a beat, nearest to `around` */
  protected rootNear(c: Chord, around: number): number {
    let m = around - 6;
    while (pcOf(m) !== c.root) m++;
    return m;
  }

  /** a small random choice that stays the same within a bar (so doubled parts agree) */
  protected barRand(b: BarCtx, salt = 0): number {
    const x = Math.sin((b.bar + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /** humanised velocity */
  protected hv(v: number): number {
    return v * rand(0.93, 1.05);
  }
}
