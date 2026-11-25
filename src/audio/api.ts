/**
 * Audio contract between FORTÍSSIMO and its audio engine (src/audio/engine/*).
 * The game ONLY talks to audio through this interface (import { audio } from '../audio').
 *
 * Everything is synthesised with the Web Audio API — no audio files — so the game stays a single
 * offline HTML file.
 *
 * ── Time ─────────────────────────────────────────────────────────────────────────────────────────
 * All gameplay is quantised to the music. Towers fire on 16th-note steps of the current song and
 * their shots ARE notes of the song. The game reads the song clock with `songClock()` and schedules
 * every battle sound at an exact AudioContext time `t` (seconds), computed as
 *     t = clock.t0 + beat * clock.spb
 * usually 80–200 ms in the future (lookahead), so sounds land sample-accurately on the grid.
 * When there is no audio device, `now()` and `songClock()` fall back to performance.now() so the
 * game keeps a steady clock (and every sound call is a silent no-op).
 */
import type { EnemyKind, SongId, TowerKind, WorldId } from '../sim/defs';

export type { SongId };

export interface Volumes {
  master: number; // 0..1
  music: number;
  sfx: number;
  ambience: number;
}

/** Beat b (0 = first downbeat of the song) sounds at context time t0 + b * spb. */
export interface SongClock {
  song: SongId;
  t0: number;
  spb: number;
  beatsPerBar: number;
}

/** One-shot cinematic moments, called by the cutscene scripts at the listed points. */
export type CinematicCue =
  // intro cutscene (≈80 s): times are seconds from the start of the cutscene
  | 'intro:dawn'      //  0 s  Harmonia wakes: celesta/harp glimmers, strings swell into…
  | 'intro:festival'  //  8 s  …the main theme, joyful, the whole world dancing to it
  | 'intro:approach'  // 24 s  the Silence approaches: the music decays (filter closes, parts drop out, pitch sags), low drone
  | 'intro:shatter'   // 36 s  the Heart is torn: huge crash, then everything cuts to silence
  | 'intro:grey'      // 38 s  grey, silent world: only cold wind; a broken music-box fragment that stops mid-phrase
  | 'intro:hope'      // 54 s  the Maestro's baton glows: one pure sustained note, soft heartbeat, rising strings
  | 'intro:title'     // 70 s  title card FORTÍSSIMO: huge orchestral chord + choir, rings ~7 s
  // world restored (boss defeated, ≈12 s)
  | 'world:restored'  // a shard of the Heart flies home: rising glissando + warm triumphant chord
  // ending cutscene (≈95 s)
  | 'ending:fall'     //  0 s  the Silence collapses: enormous descending crash, then a soft low drone
  | 'ending:alone'    //  6 s  it is small and alone: tender, sad solo (piano/celesta), sparse
  | 'ending:rest'     // 26 s  the Maestro conducts a rest: everything hushes; a full bar of silence; then one soft note, answered
  | 'ending:bloom'    // 36 s  the world blooms: main theme in full glory (orchestra + choir), warm and triumphant
  | 'ending:bow'      // 74 s  final cadence and big last chord, shimmering tail (then the game plays 'credits')
  // map
  | 'map:unlock'      // a new level node lights up
  | 'map:world';      // a new world is revealed

export interface AudioAPI {
  /** Must be called from a user gesture (click/keydown). Safe to call more than once. */
  unlock(): Promise<void>;
  readonly ready: boolean;
  setVolumes(v: Volumes): void;
  /** Pause everything (tab hidden) and resume. */
  suspend(): void;
  resume(): void;

  // ── clock ─────────────────────────────────────────────
  /** AudioContext time now (seconds); performance.now()/1000 fallback without audio. */
  now(): number;
  /** Estimated seconds between a sound's scheduled time and when it is heard (output latency). */
  latency(): number;
  /** Clock of the song that is playing (or about to start); null if no song. */
  songClock(): SongClock | null;

  // ── music ─────────────────────────────────────────────
  /**
   * Start a song. Battle songs start on a downbeat a little in the future (≈0.15 s, or `at`).
   * Returns its clock. Asking for the song that is already playing returns the current clock
   * without restarting it (unless `restart`). The previous song crossfades out over `fade` seconds.
   */
  playSong(song: SongId, opts?: { fade?: number; at?: number; restart?: boolean }): SongClock;
  stopMusic(fade?: number): void;
  /**
   * Battle intensity: 0 calm (before/between waves) · 1 wave · 2 heavy wave · 3 climax (boss on the
   * field / last wave). Takes effect at the next bar line.
   */
  setIntensity(level: 0 | 1 | 2 | 3): void;
  /** 0 = normal … 1 = fully muffled (pause menu / dialogs): low-pass + a little quieter. */
  setMuffle(amount: number): void;
  /** Duck music briefly (e.g. under a stinger). */
  duck(amount: number, seconds: number): void;

  // ── battle (t = exact context time; pan = -1 left … 1 right) ──
  /**
   * A tower plays its note/hit. The engine chooses the pitch from the song's harmony at time t.
   * `voice` is a small stable integer per tower (its id) so several towers of one kind spread
   * over chord tones / registers instead of doubling. level = 0..2.
   *   harp: plucked note (arpeggio over the chord)   drum: deep war drum hit
   *   bell: bell toll on a chord tone (slows)          shaker: shaker/hi-hat tick (economy)
   *   crystal: bright synth zap arpeggio               horn: brass blast (root/fifth)
   *   choir: sustained choir chord for one bar          bass: huge sub-bass drop on the root
   */
  towerShot(kind: TowerKind, level: number, t: number, pan: number, voice: number): void;
  /** The projectile lands (drum boom, harp tick, bass thud, crystal crackle; horn/bell may ignore). */
  impact(kind: TowerKind, t: number, pan: number, strength: number): void;
  /** An enemy is defeated (a little pop + a released note on the chord; bosses: big). */
  enemyDeath(kind: EnemyKind, t: number, pan: number): void;
  /** Armour/shield deflects part of a hit (metallic). */
  deflect(t: number, pan: number): void;
  /** Coins collected (tiny sparkle; `amount` scales it). */
  coin(t: number, pan: number, amount: number): void;
  /** An enemy reached the Heart. `livesLeft` 0..1. */
  heartHit(t: number, livesLeft: number): void;
  build(t: number, pan: number): void;
  upgrade(t: number, pan: number, level: number): void;
  sell(t: number, pan: number): void;
  /** A tower is silenced by a muffler (and when it recovers: muted=false). */
  towerMuted(t: number, pan: number, muted: boolean): void;
  /** A route switch flips. */
  switchFlip(t: number, pan: number): void;
  /** Wave `index` (0-based) of `total` begins (a horn call on the downbeat). */
  waveStart(t: number, index: number, total: number): void;
  /** Big entrance sting for a boss. */
  bossAppear(t: number): void;
  /** Resume count-in tick after a pause (beat 0..3 of the bar). */
  countIn(t: number, beat: number): void;
  /** FORTÍSSIMO power: charge meter just filled (ready). */
  ffReady(): void;
  /** FORTÍSSIMO power: one-bar build-up starting at t (riser), then the drop exactly at tDrop. */
  ffUnleash(t: number, tDrop: number): void;
  victory(): void;
  defeat(): void;
  /** Star i (0..2) appears on the results card. */
  star(i: number): void;
  /** A new tower is unlocked (reward fanfare). */
  newTower(): void;

  // ── title & cinema ────────────────────────────────────
  /** Deep warm swell + ember crackle for the Uchihadam Production logo (~6 s). Same as TESSELLA. */
  studioSting(): void;
  /** FORTÍSSIMO logo reveal: notes rush in, the "ff" stamp lands on a huge chord (~5 s). */
  titleReveal(): void;
  cinematic(cue: CinematicCue): void;

  // ── ui ────────────────────────────────────────────────
  uiHover(): void;
  uiClick(): void;
  uiBack(): void;
  /** radial menu opens */
  uiOpen(): void;
  /** can't afford / not allowed */
  uiDeny(): void;
  achievement(): void;
  save(): void;

  // ── ambience ──────────────────────────────────────────
  /** Background ambience of a place (fades over ~2 s): wind/birds (meadow), desert wind, icy wind,
   *  lava rumble and crackle (forge), hollow void hum (citadel), soft night air (menu). */
  setAmbience(place: WorldId | 'menu' | 'none', level?: number): void;
}
