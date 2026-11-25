/**
 * The game's audio clock ("API time").
 *
 *  - Before unlock, or when the AudioContext cannot run (no audio device), API time follows
 *    performance.now()/1000.
 *  - Once the context runs, API time = ctx.currentTime + offset. The offset is chosen at the
 *    switch so API time is CONTINUOUS (a SongClock handed out before unlock stays valid).
 *  - While the game deliberately suspends audio (tab hidden), API time freezes with the context,
 *    so the beat grid resumes exactly where it stopped.
 */
export type ClockMode = 'perf' | 'ctx';

const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class Clock {
  private ctx: BaseAudioContext | null = null;
  mode: ClockMode = 'perf';
  /** API = perf + offP while in perf mode */
  private offP = 0;
  /** API = ctx.currentTime + offC while in ctx mode */
  offC = 0;
  /** set by suspend()/resume() of the public API */
  userSuspended = false;
  private everRan = false;
  /** called when offC changes after the first sync (delta = new offset − old offset) */
  onRebase: ((delta: number) => void) | null = null;

  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.update();
  }

  /** Offline renders: API time IS context time. */
  static fixed(ctx: BaseAudioContext): Clock {
    const c = new Clock();
    c.ctx = ctx;
    c.mode = 'ctx';
    c.offC = 0;
    c.everRan = true;
    c.fixedMode = true;
    return c;
  }
  private fixedMode = false;

  private raw(): number {
    return this.mode === 'ctx' && this.ctx ? this.ctx.currentTime + this.offC : perfNow() + this.offP;
  }

  update(): void {
    if (this.fixedMode) return;
    const c = this.ctx;
    const running = !!c && c.state === 'running';
    const want: ClockMode = c && (running || (this.userSuspended && this.everRan)) ? 'ctx' : 'perf';
    if (want === this.mode) return;
    const t = this.raw();
    if (want === 'ctx' && c) {
      const old = this.offC;
      const first = !this.everRan;
      this.offC = t - c.currentTime;
      this.everRan = true;
      this.mode = 'ctx';
      if (!first && this.onRebase && Math.abs(this.offC - old) > 1e-6) this.onRebase(this.offC - old);
    } else {
      this.offP = t - perfNow();
      this.mode = 'perf';
    }
  }

  now(): number {
    this.update();
    return this.raw();
  }

  /** true when sounds can be scheduled (context running, API ↔ ctx mapping valid) */
  get live(): boolean {
    this.update();
    return this.mode === 'ctx' && !!this.ctx && this.ctx.state === 'running';
  }

  toCtx(tApi: number): number {
    return tApi - this.offC;
  }

  toApi(tCtx: number): number {
    return tCtx + this.offC;
  }
}
