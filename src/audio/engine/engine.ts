/**
 * The AudioAPI implementation. Everything set before unlock() (volumes, song, intensity, muffle,
 * ambience) is remembered and applied once the AudioContext runs. Without an audio device the
 * clock keeps running on performance.now() and every sound is a silent no-op.
 */
import { SONGS, type DuetId, type EnemyKind, type SongId, type TowerKind, type WorldId } from '../../sim/defs';
import type { AudioAPI, BandMix, CinematicCue, SongClock, Volumes } from '../api';
import { Ambience, type Place } from './ambience';
import { Cinema } from './cinema';
import { Clock } from './clock';
import { Core } from './core';
import { Director } from './music';
import { Renderer } from './render';
import { Sfx } from './sfx';
import { makeTheme } from './songs';
import { BufferBank } from './synth';
import { Towers } from './towers';
import { clamp, guard, report } from './util';

export const LOOKAHEAD = 0.18;
const TICK_MS = 25;

interface SongState {
  id: SongId;
  t0: number;
  spb: number;
  beatsPerBar: number;
}

const isSong = (s: unknown): s is SongId => typeof s === 'string' && Object.prototype.hasOwnProperty.call(SONGS, s);
const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);

class Engine {
  readonly clock = new Clock();
  core: Core | null = null;
  bank: BufferBank | null = null;
  director: Director | null = null;
  sfx: Sfx | null = null;
  towers: Towers | null = null;
  amb: Ambience | null = null;
  cine: Cinema | null = null;
  private renderer: Renderer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unlocking: Promise<void> | null = null;

  // remembered state
  volumes: Volumes = { master: 1, music: 0.8, sfx: 0.9, ambience: 0.8 };
  song: SongState | null = null;
  /** a song requested while the context cannot play yet (started when it runs) */
  pending: { id: SongId; t0: number; fade: number; intensity: number } | null = null;
  nextIntensity = 0;
  muffle = 0;
  ambience: { place: Place; level: number } = { place: 'none', level: 1 };

  get ctx(): AudioContext | null {
    return this.core ? (this.core.ctx as AudioContext) : null;
  }

  get ready(): boolean {
    return !!this.core && this.core.ctx.state === 'running';
  }

  get rendererUsesWorker(): boolean {
    return !!this.renderer?.usesWorker;
  }

  /** sounds can be scheduled right now */
  get live(): boolean {
    return !!this.core && this.clock.live;
  }

  /**
   * Fast: creates the context and the (light) graph synchronously, never waits on heavy work.
   * Instruments and impulse responses render asynchronously (worker); until a sound is ready a
   * light stand-in voice plays. ctx.resume() is never awaited for more than ~150 ms.
   */
  async unlock(): Promise<void> {
    if (this.core) {
      const c = this.core.ctx as AudioContext;
      if (c.state !== 'running' && c.state !== 'closed') await settle(c.resume(), 150);
      this.clock.update();
      return;
    }
    if (this.unlocking) return this.unlocking;
    this.unlocking = (async () => {
      try {
        if (typeof window === 'undefined') return;
        const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC({ latencyHint: 'interactive' });
        const resuming = ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
        const renderer = new Renderer();
        this.renderer = renderer;
        const core = new Core(ctx, renderer);
        this.core = core;
        const bank = new BufferBank(core, renderer);
        this.bank = bank;
        // intro-critical sounds first (studio sting gleam, title, first menu notes)
        bank.warm('glass', 84, 96, 0);
        bank.warm('boom', 28, 32, 1);
        bank.warm('crash', 60, 60, 1);
        bank.warm('harp', 48, 89, 1);
        bank.warm('celesta', 72, 96, 1);
        bank.warm('pizz', 29, 62, 1);
        this.director = new Director(core, bank, makeTheme);
        this.sfx = new Sfx(core, bank, this.director);
        this.towers = new Towers(core, bank, this.director);
        this.amb = new Ambience(core, bank);
        this.cine = new Cinema(core, bank, this.director);
        this.cine.onTrack = (id, t0, bpm) => {
          this.song = id ? { id, t0: this.clock.toApi(t0), spb: 60 / bpm, beatsPerBar: 4 } : null;
          this.pending = null;
        };
        core.setVolumes(this.volumes);
        core.setMuffle(this.muffle);
        this.amb.setPlace(this.ambience.place, this.ambience.level);
        this.clock.onRebase = (delta) => this.director?.rebase(delta);
        this.clock.attach(ctx);
        if (this.song && !this.pending) this.pending = { id: this.song.id, t0: this.song.t0, fade: 0.3, intensity: this.nextIntensity };
        this.timer = setInterval(() => this.tick(), TICK_MS);
        await settle(resuming, 150);
        this.clock.update();
        this.tick();
      } catch (e) {
        report('unlock', e);
      }
    })();
    return this.unlocking;
  }

  tick(): void {
    const core = this.core;
    if (!core) return;
    try {
      if (!this.clock.live) return;
      if (this.pending) this.startPending();
      this.director?.tick(LOOKAHEAD);
      this.cine?.tick();
      this.amb?.tick();
      this.bank?.pump(4);
    } catch (e) {
      report('tick', e);
    }
  }

  private startPending(): void {
    const p = this.pending;
    if (!p || !this.director) return;
    this.pending = null;
    if (p.id === 'ending') {
      this.cine?.startEnding();
      return;
    }
    this.director.play(p.id, this.clock.toCtx(p.t0), p.fade, p.intensity);
    this.sfx?.key();
  }

  clockOf(): SongClock | null {
    const s = this.song;
    return s ? { song: s.id, t0: s.t0, spb: s.spb, beatsPerBar: s.beatsPerBar } : null;
  }

  playSong(id: SongId, opts?: { fade?: number; at?: number; restart?: boolean }): SongClock {
    const now = this.clock.now();
    if (!isSong(id)) return this.clockOf() ?? { song: 'menu', t0: now, spb: 60 / SONGS.menu.bpm, beatsPerBar: 4 };
    if (this.song && this.song.id === id && !opts?.restart) return this.clockOf()!;
    const info = SONGS[id];
    const fade = clamp(num(opts?.fade, 1.2), 0, 20);
    const t0 = opts && typeof opts.at === 'number' && Number.isFinite(opts.at) ? opts.at : now + 0.15;
    const intensity = this.nextIntensity;
    this.nextIntensity = 0;
    this.song = { id, t0, spb: 60 / info.bpm, beatsPerBar: info.beatsPerBar };
    this.cine?.reset(Math.max(0.3, fade));
    if (this.live && this.director) {
      this.pending = null;
      if (id === 'ending') {
        this.director.stop(fade);
        this.cine?.startEnding();
      } else {
        this.director.play(id, this.clock.toCtx(t0), fade, intensity);
        this.sfx?.key();
      }
    } else this.pending = { id, t0, fade, intensity };
    return this.clockOf()!;
  }

  stopMusic(fade: number): void {
    this.song = null;
    this.pending = null;
    this.cine?.reset(Math.max(0.3, num(fade, 1)));
    this.director?.stop(clamp(num(fade, 1), 0, 20));
  }

  setIntensity(level: number): void {
    const lv = clamp(Math.round(num(level, 0)), 0, 3);
    const p = this.director?.current;
    if (this.song && p && p.id === this.song.id && this.live) p.setIntensity(lv, this.core!.now);
    else if (this.pending) this.pending.intensity = lv;
    else if (this.song && p && p.id === this.song.id) p.setIntensity(lv, this.core!.now);
    else this.nextIntensity = lv;
  }

  /** API time → context time (sound calls), or null when nothing can sound */
  at(t: number): number | null {
    if (!this.live) return null;
    const now = this.clock.now();
    const tt = num(t, now);
    return this.clock.toCtx(tt);
  }
}

/** Waits for a promise at most `ms` milliseconds; never throws. */
function settle(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

const E = new Engine();

const api: AudioAPI = {
  get ready() {
    try {
      return E.ready;
    } catch {
      return false;
    }
  },
  unlock: () => E.unlock().catch((e) => report('unlock', e)),
  setVolumes: guard('setVolumes', (v: Volumes) => {
    if (!v || typeof v !== 'object') return;
    E.volumes = { master: num(v.master, 1), music: num(v.music, 0.8), sfx: num(v.sfx, 0.9), ambience: num(v.ambience, 0.8) };
    E.core?.setVolumes(E.volumes);
  }),
  suspend: guard('suspend', () => {
    const c = E.ctx;
    E.clock.userSuspended = true;
    E.clock.update();
    if (c && c.state === 'running') void c.suspend().catch(() => undefined);
  }),
  resume: guard('resume', () => {
    const c = E.ctx;
    E.clock.userSuspended = false;
    if (c && c.state !== 'running' && c.state !== 'closed') void c.resume().then(() => E.clock.update(), () => undefined);
  }),

  now: guard('now', () => E.clock.now(), 0),
  latency: guard(
    'latency',
    () => {
      const c = E.ctx;
      if (!c || !E.live) return 0;
      // output + base latency, plus the master compressors' look-ahead (2 × 6 ms)
      const l = num(c.baseLatency, 0) + num((c as AudioContext & { outputLatency?: number }).outputLatency, 0);
      return (l > 0 ? clamp(l, 0.002, 0.5) : 0.03) + 0.012;
    },
    0,
  ),
  songClock: guard('songClock', () => E.clockOf(), null),

  playSong: (song: SongId, opts?: { fade?: number; at?: number; restart?: boolean }): SongClock => {
    try {
      return E.playSong(song, opts);
    } catch (e) {
      report('playSong', e);
      const now = E.clock.now();
      const id = isSong(song) ? song : 'menu';
      return E.clockOf() ?? { song: id, t0: now + 0.15, spb: 60 / SONGS[id].bpm, beatsPerBar: 4 };
    }
  },
  stopMusic: guard('stopMusic', (fade?: number) => E.stopMusic(num(fade, 1))),
  setIntensity: guard('setIntensity', (level: 0 | 1 | 2 | 3) => E.setIntensity(level)),
  setMuffle: guard('setMuffle', (amount: number) => {
    E.muffle = clamp(num(amount, 0), 0, 1);
    E.core?.setMuffle(E.muffle);
  }),
  duck: guard('duck', (amount: number, seconds: number) => E.core?.duck(num(amount, 0.5), num(seconds, 0.5))),

  towerShot: guard('towerShot', (kind: TowerKind, level: number, t: number, pan: number, voice: number) => {
    const tc = E.at(t);
    if (tc !== null) E.towers?.shot(kind, level, tc, num(pan, 0), num(voice, 0));
  }),
  impact: guard('impact', (kind: TowerKind, t: number, pan: number, strength: number) => {
    const tc = E.at(t);
    if (tc !== null) E.towers?.impact(kind, tc, num(pan, 0), num(strength, 0.6));
  }),
  enemyDeath: guard('enemyDeath', (kind: EnemyKind, t: number, pan: number) => {
    const tc = E.at(t);
    if (tc !== null) E.towers?.enemyDeath(kind, tc, num(pan, 0), (tt) => E.sfx?.bossDeath(tt));
  }),
  deflect: guard('deflect', (t: number, pan: number) => {
    const tc = E.at(t);
    if (tc !== null) E.towers?.deflect(tc, num(pan, 0));
  }),
  coin: guard('coin', (t: number, pan: number, amount: number) => {
    const tc = E.at(t);
    if (tc !== null) E.towers?.coin(tc, num(pan, 0), num(amount, 1));
  }),
  heartHit: guard('heartHit', (t: number, livesLeft: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.heartHit(tc, num(livesLeft, 1));
  }),
  build: guard('build', (t: number, pan: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.build(tc, num(pan, 0));
  }),
  upgrade: guard('upgrade', (t: number, pan: number, level: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.upgrade(tc, num(pan, 0), num(level, 1));
  }),
  sell: guard('sell', (t: number, pan: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.sell(tc, num(pan, 0));
  }),
  towerMuted: guard('towerMuted', (t: number, pan: number, muted: boolean) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.towerMuted(tc, num(pan, 0), !!muted);
  }),
  switchFlip: guard('switchFlip', (t: number, pan: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.switchFlip(tc, num(pan, 0));
  }),
  waveStart: guard('waveStart', (t: number, index: number, total: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.waveStart(tc, num(index, 0), num(total, 1));
  }),
  bossAppear: guard('bossAppear', (t: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.bossAppear(tc);
  }),
  countIn: guard('countIn', (t: number, beat: number) => {
    const tc = E.at(t);
    if (tc !== null) E.sfx?.countIn(tc, num(beat, 0));
  }),
  ffReady: guard('ffReady', () => {
    if (E.live) E.sfx?.ffReady();
  }),
  ffUnleash: guard('ffUnleash', (t: number, tDrop: number) => {
    const tc = E.at(t);
    const td = E.at(tDrop);
    if (tc !== null && td !== null) E.sfx?.ffUnleash(tc, td);
  }),
  victory: guard('victory', () => {
    if (!E.live) {
      E.song = null;
      E.pending = null;
      return;
    }
    E.sfx?.key();
    E.stopMusic(0.8);
    E.cine?.yieldToVictory();
    E.sfx?.victory();
  }),
  defeat: guard('defeat', () => {
    E.song = null;
    E.pending = null;
    if (!E.live || !E.core) return;
    E.sfx?.key();
    const p = E.director?.current;
    if (p) {
      p.tapeStop(E.core.now + 0.02, 1.3);
      E.director?.stop(1.4);
    }
    E.sfx?.defeat();
  }),
  star: guard('star', (i: number) => {
    if (E.live) E.sfx?.star(num(i, 0));
  }),
  newTower: guard('newTower', () => {
    if (E.live) E.sfx?.newTower();
  }),

  // v2 band API: no-ops until the audio pass implements them
  setBand: guard('setBand', (_mix: BandMix) => {}),
  duet: guard('duet', (_id: DuetId, _t: number, _pan: number) => {}),
  movement: guard('movement', (_index: number, _total: number, _t: number) => {}),
  plateUnlock: guard('plateUnlock', (_t: number, _pan: number) => {}),
  joinMotif: guard('joinMotif', (_kind: TowerKind) => {}),

  studioSting: guard('studioSting', () => {
    if (E.core) E.sfx?.studioSting();
  }),
  titleReveal: guard('titleReveal', () => {
    if (E.core) E.sfx?.titleReveal();
  }),
  cinematic: guard('cinematic', (cue: CinematicCue) => {
    if (E.core && E.cine) E.cine.cue(cue);
  }),

  uiHover: guard('uiHover', () => E.sfx?.uiHover()),
  uiClick: guard('uiClick', () => E.sfx?.uiClick()),
  uiBack: guard('uiBack', () => E.sfx?.uiBack()),
  uiOpen: guard('uiOpen', () => E.sfx?.uiOpen()),
  uiDeny: guard('uiDeny', () => E.sfx?.uiDeny()),
  achievement: guard('achievement', () => E.sfx?.achievement()),
  save: guard('save', () => E.sfx?.save()),

  setAmbience: guard('setAmbience', (place: WorldId | 'menu' | 'none', level?: number) => {
    const p: Place = place === 'meadow' || place === 'desert' || place === 'ice' || place === 'forge' || place === 'citadel' || place === 'menu' ? place : 'none';
    E.ambience = { place: p, level: clamp(num(level, 1), 0, 1.5) };
    E.amb?.setPlace(p, E.ambience.level);
  }),
};

export const engineApi: AudioAPI = api;

/** Debug access for the lab page and automated checks (not part of the game API). */
export function audioDebug(): {
  ctx: AudioContext;
  tap: AnalyserNode;
  worker: boolean;
  voices: () => Record<string, number>;
  started: () => number;
  players: () => number;
  towerLog: (on: boolean) => { kind: string; t: number }[] | null;
  clock: Clock;
} | null {
  if (!E.core) return null;
  const core = E.core;
  return {
    ctx: core.ctx as AudioContext,
    worker: E.rendererUsesWorker,
    tap: core.tap,
    voices: () => core.voiceTable(),
    started: () => core.started,
    players: () => E.director?.activePlayers ?? 0,
    towerLog: (on: boolean) => {
      if (!E.towers) return null;
      if (on && !E.towers.debugLog) E.towers.debugLog = [];
      if (!on) {
        const l = E.towers.debugLog;
        E.towers.debugLog = null;
        return l;
      }
      return E.towers.debugLog;
    },
    clock: E.clock,
  };
}
