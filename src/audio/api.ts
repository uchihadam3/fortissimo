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
import type { DuetId, EnemyKind, Section, SongId, TowerKind, WorldId } from '../sim/defs';

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

/**
 * Cinematic cues. EVERY cue that is not marked as a stinger is a MOOD: it starts on the next beat of
 * the music that is playing and SUSTAINS — looping and evolving — until the next cue, stopMusic()
 * or playSong(). Cutscenes can therefore be re-timed freely (the times below are only the original
 * timings). Stingers sound at once: intro:shatter (then silence until the next cue), intro:title
 * (the chord, then a soft afterglow mood), ending:fall (the crash, then the drone mood),
 * ending:rest (a bar of true silence, a note answered, then a hushed mood), ending:bow (the bloom
 * cadences at its next bar line, then a shimmering tail that sustains until the credits),
 * world:restored and map:*.
 * story:* moods take the colours of the land the story is in (the last land:* cue, the ambience
 * place or the last land song). joinMotif() plays on top of any mood, which steps back for it.
 */
export type CinematicCue =
  // intro cutscene (originally ≈80 s; now any length): times are seconds from the start of the cutscene
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
  | 'map:world'       // a new world is revealed
  // ── v2 story moods (docs/STORY.md). A mood starts on the next beat and SUSTAINS (loops/evolves)
  //    until the next cue, stopMusic() or playSong(), so cinematics can be re-timed freely. ──
  | 'story:wonder'    // gentle, magical: establishing shots, discoveries
  | 'story:frozen'    // eerie stillness: a musician turned to grey stone / trapped
  | 'story:wake'      // warm release: colour flows back, the musician wakes (then usually joinMotif)
  | 'story:join'      // happy little march: the band welcomes a new member
  | 'story:threat'    // dark: a guardian or the Silence is glimpsed
  | 'story:shard'     // magic rising: a shard of the Heart flies home
  | 'story:voice'     // a land's great Voice rings: the land's theme in full glory
  | 'story:camp'      // night camp: cosy, the band playing softly around the Heart
  | 'story:memory'    // a memory of the Silence: a broken music box, sad and strange
  | 'story:journey'   // moving on: light travelling theme
  | 'story:dread'     // the Citadel: ominous, cold
  | 'story:hush'      // near silence: wind only
  | 'story:comic'     // a funny beat (a stumble, a surprise): pizzicato, a little slide whistle
  // a land's chapter opening: the land's leitmotif, establishing
  | 'land:meadow'
  | 'land:desert'
  | 'land:ice'
  | 'land:forge'
  | 'land:citadel';

/** What the band on the shell sounds like (see BandState in sim/defs.ts). */
export interface BandMix {
  /** towers playing per section (0 = the section is absent) */
  sections: Record<Section, number>;
  /** 0…5: distinct sections − 1 */
  harmony: number;
  /** duets currently formed */
  duets: DuetId[];
}

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
   * field / last wave). Takes effect at the next bar line. Once the field has been calm for a whole
   * bar, a battle song turns into a composed breakdown (the land's leitmotif and its variations,
   * a different one each time); the next wave resumes the battle at the start of a section.
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
   *   harp: plucked note (the lead sings the tune)    drum: bright battle snare-tom on the chord root
   *   bell: bell toll with a celesta strike (slows)    shaker: shaker + tambourine (economy)
   *   crystal: bright synth zap arpeggio               horn: brass blast (the lead horn sings the tune)
   *   choir: sung choir chord ('ah') for one bar        bass: sub drop + a bright slap bass (heard on phones)
   * Every kind is balanced to sit within ~3 dB of the harp over the backing, also on a phone speaker
   * (tools/audio-balance.mjs); the backing steps back a little under a busy band.
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
  /**
   * The hymn duet heals the colossus (+1 life): a warm, rising, hopeful chime at t — the choir
   * ('ah') rising through the chord with a bell and a shimmer of glass, ≈1.5 s, in the harmony of t.
   */
  heartHeal(t: number): void;
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

  // ── the band (v2) ─────────────────────────────────────
  /**
   * The band on the shell changed. Each section present adds its layer to the battle arrangement
   * (percussion → groove, strings → ostinato, bells → shimmer, brass → swells, voices → choir,
   * low → bass line) and harmony makes it fuller (h ≥ 2 counter-melodies, h ≥ 4 doublings,
   * h = 5 the full glory). Duets change how partners play (towers and backing). Changes land on the
   * next free bar line; a section that joins fades in over its first bar. Call it right after
   * playSong() and whenever the band changes (built, sold, muted/disabled towers). Until the game
   * reports a band, songs play with the full band. Garbage is sanitised.
   */
  setBand(mix: BandMix): void;
  /** A duet just formed between two towers: a short flourish of the pair at time t (on the grid). */
  duet(id: DuetId, t: number, pan: number): void;
  /**
   * Movement `index` (0-based) of `total` of a long journey begins at t (a downbeat). Movement 0
   * plays the song's home plan, the last one its grand final plan (a key lift), the middle ones the
   * contrasting material (other sections, keys and modes). The change lands on the bar of t when
   * that bar is not composed yet (call ≥ ~0.3 s ahead, e.g. when the breather before the movement
   * begins — the breakdown then modulates into the new key); called later, at the next bar line.
   * Without announced movements, long songs still travel (a new plan every few breakdowns).
   */
  movement(index: number, total: number, t: number): void;
  /** A new plate of the shell lights up: a bright little chime at t. */
  plateUnlock(t: number, pan: number): void;
  // ── rhythm play (v3): the player conducts ─────────────
  /**
   * The player taps the baton: a tight percussive hit in the land's palette at t (the land's drum
   * tuned to the chord root, a click and a pitched voice climbing the chord with a run of taps).
   * perfect = brighter, with a sparkle and a jingle · good = normal · miss = a soft muted thud.
   * Play it at the beat time the tap was judged against (on the grid), not the raw tap time.
   */
  beatTap(t: number, quality: 'perfect' | 'good' | 'miss', pan: number): void;
  /**
   * Groove 0…4 from the player's run of on-beat taps; changes at the next bar line. Battle songs add
   * energy layers: 1 claps on the backbeat and running shakers · 2 the choir's "Hey!" · 3 brass hits
   * · 4 everything, drum fills, tambourine, crashes and the tune in the horns. Reaching 4 plays a
   * riser into that bar line and a drop on it. Reset it (0) when the run breaks or a song starts.
   */
  setGroove(level: number): void;
  /**
   * A musician's solo: one bar of virtuoso flourish for that instrument from t (snapped to the 16th
   * grid; call it for a downbeat): harp glissando and cascade, drum fill into a crash, bell
   * carillon, shaker samba break, crystal cascade, horn fanfare, choir swell, bass slap riff. The
   * backing steps back for the bar. level 0–2 = the tower's level (more notes, louder).
   */
  solo(kind: TowerKind, level: number, t: number, pan: number, voice: number): void;
  /**
   * The Maestro's call in a breather: note i (0–3) of a 4-note pattern at t — four distinct pitches
   * (the tonic triad and its octave in the key of the moment), so i always means the same note.
   * callNote(0, …) starts a new pattern. echoNote is the player's answer on note i (ok = false: a
   * little off and muted).
   */
  callNote(i: number, t: number): void;
  echoNote(i: number, t: number, ok: boolean): void;
  /** The player's echo of the call: all four right (a short fanfare) or not (a gentle sigh). Plays on the next eighth. */
  echoResult(success: boolean): void;
  // ── rhythm play (v4): everything is on the beat ─────────────
  /**
   * The player taps a coin/note pickup. Judged like the baton: on the beat it rings a pitched note
   * that climbs the chord/scale with `run` (consecutive on-beat collects, 0…), so collecting in
   * rhythm plays a little melody; perfect adds a sparkle. miss = a dull, muted clink (no melody).
   * Play at the judged grid time t.
   */
  pickupTap(t: number, quality: 'perfect' | 'good' | 'miss', pan: number, run: number): void;
  /**
   * The player taps a creature on the beat: the colossus strikes it (a heavy, satisfying hit in the
   * land's palette: timpani/taiko + land colour; perfect = bigger, with a crack). miss = a thin swish.
   */
  strike(t: number, quality: 'perfect' | 'good' | 'miss', pan: number): void;
  /**
   * The player's rhythm power 0…1 (the "how well you are playing" meter), updated often (smooth it).
   * The music grows grander with it CONTINUOUSLY over the whole level, on top of groove/band:
   * fuller voicings, octave doublings, wider stereo, brighter; near 1 a glorious "everything sings"
   * state. When it falls (misses), the music audibly thins/dims. Not used in cinematics.
   */
  setPower(p: number): void;
  /** A clear "you broke the run" sound when a miss costs power (a short downward sting). */
  powerDrop(t: number): void;
  // ── bosses (v5): every boss fight is a duel on the beat ─────────────
  /**
   * A boss fight starts: the battle music turns into that boss's fight music from the next bar
   * line ≥ t (null: back to the level's song). Mini-bosses (end of every main level): a fierce
   * variant of the land's theme with the creature's own motif and its own rhythm signature.
   * Guardians (bossBlot, bossScarab, bossMoth, bossGolem, silence): a full theme each, per land.
   * Legends (wyrm, djinn, aurora, phoenix, abyssKing): unique, epic, unforgettable themes.
   * Implementation notes: the fight plays INSIDE the level's song — same tempo, same clock, same
   * bar grid (songClock() does not change), so the duel stays on the beat; the towers' notes follow
   * the boss's harmony and its tune. A riser leads into the fight's first bar (call it ≥ 1 bar
   * ahead for the full riser); bossTheme(null) plays a victory flourish on the bar where the song
   * resumes. Battle songs only (no-op in cinematics). Kinds without a theme are ignored.
   */
  bossTheme(kind: EnemyKind | null, t: number): void;
  /**
   * The boss enters phase n (1, 2, 3…; mini-bosses have 2, guardians and legends 3) from the next bar
   * line ≥ t: the music escalates (key lift, double-time drums, choir, brass), with a phase hit.
   */
  bossPhase(phase: number, t: number): void;
  /**
   * The boss winds up an attack on the beat: one count-in hit at t (called for each warning beat;
   * `last` = the beat the blow lands — the player must tap it to parry).
   */
  bossTell(t: number, pan: number, last: boolean): void;
  /** The player parried the blow on the beat (perfect: the blow is reflected — a triumphant clang). */
  parry(t: number, quality: 'perfect' | 'good', pan: number): void;
  /** The blow landed (not parried): a heavy impact on the colossus. */
  bossBlow(t: number, pan: number, strength: number): void;
  // ── viradas (v7): the player plays the fill, on marks in the world ─────────────
  /**
   * A virada (drum fill) is coming: n marks will be tapped from `start` to `end` (song seconds, both
   * on the grid; usually the last bar of a phrase). From `start` until `end` the song's own drums
   * step back (kick/snare/hats ducked or tacet, NOT the rest of the song) so the player's hits are
   * the fill; at `end` the song comes back with a crash on the downbeat. `level` 0…2 = how big the
   * virada is (chained viradas grow). Call it ≥ 1 bar before `start`.
   */
  viradaCue(start: number, end: number, n: number, level: number): void;
  /**
   * The player hit mark i (0…n−1) of the virada at the judged grid time t: one stroke of the fill
   * (toms/taiko descending + the land's colour, tuned to the chord; perfect brighter), at the level
   * of the song's drums, never louder. miss = no stroke (a silent gap, maybe a faint muted tick).
   */
  viradaHit(i: number, n: number, t: number, quality: 'perfect' | 'good' | 'miss', pan: number): void;
  /**
   * The virada ended at t (the downbeat after it). hits = marks hit, n = marks. All hit: a big
   * crash + a sparkling chord swell with the band for one bar ("VIRADA!"); some: just the crash;
   * none: the song simply resumes.
   */
  viradaEnd(t: number, hits: number, n: number, perfect: boolean): void;
  /**
   * Cinematics: a rescued musician plays its signature motif (≈2 bars) on top of any mood, from the
   * mood's next beat, in its key (the mood holds its tonic under it).
   */
  joinMotif(kind: TowerKind): void;

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
