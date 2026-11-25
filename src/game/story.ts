/**
 * The story, scene by scene (docs/STORY.md): the registry of every cinematic (the opening, a chapter
 * opening per land, an interlude after every journey, the memories of the Silence, the ending and the
 * Abyss epilogue), which ones the player has seen/unlocked, and the scripts of the chapters and
 * interludes. The engine and the great set pieces (opening, ending, epilogue) are in cutscenes.ts.
 *
 * Wordless: the only words on screen are chapter titles and place names.
 */
import * as THREE from 'three';
import type { App } from './app';
import type { TowerKind, WorldId } from '../sim/defs';
import { WORLDS } from '../sim/defs';
import type { Feature } from '../sim/journey';
import { audio } from './sound';
import { CAMPAIGN, LEVEL_BY_ID } from '../data/campaign';
import type { SaveData } from '../core/save';
import { LOOKS, type WorldLook } from '../view/styles';
import { SHARD_COLORS } from '../view/turtle';
import type { MusicianView } from '../view/musicians';
import {
  Actor, BAND_COLORS, BAND_ORDER, Cine, FULL_BAND, SEATS, VOICE_OF, WORLD_INDEX, ease, playCutscene, runScene, seatPos,
  type Anchor, type SetSpec,
} from './cutscenes';
import {
  AuroraMoth, BellTower, Campfire, CrystalPrison, Fall, Fireflies, FiveStars, GentleGolem, GoldenScarab, Gust, IceBlock, LavaBridge,
  LightThread, MarbleStairs, MirrorPond, NoteStream, RestGlyph, SandMound, StaffCrown, StoneCart, ThornCage, VillageSquare, Villager,
  giantAnvil, glowSprite, muteObelisk, shadowify, skyPath,
} from '../view/storyProps';
import { SCENE_NAMES, VOICE_NAMES, CHAPTER_NUMERALS } from '../ui/i18n';
import { WORLD_NAMES } from '../data/campaign';

const tmp = new THREE.Vector3();

// ───────────────────────────── the registry ─────────────────────────────

export type SceneKind = 'opening' | 'chapter' | 'interlude' | 'guardian' | 'memory' | 'ending' | 'epilogue';

export interface SceneDef {
  id: string;
  kind: SceneKind;
  world: WorldId;
  /** the journey it follows (interludes) */
  level?: string;
  play: (app: App) => Promise<unknown>;
}

const INTERLUDE_KIND: Record<string, SceneKind> = { m4: 'guardian', d4: 'guardian', i4: 'guardian', f4: 'guardian', mx: 'memory', dx: 'memory', ix: 'memory', fx: 'memory' };

/** every scene in story order */
export const SCENES: SceneDef[] = (() => {
  const list: SceneDef[] = [{ id: 'intro', kind: 'opening', world: 'meadow', play: (app) => playCutscene(app, 'intro') }];
  for (const w of WORLDS) {
    list.push({ id: `ch-${w}`, kind: 'chapter', world: w, play: (app) => CHAPTERS[w](app) });
    for (const l of CAMPAIGN.filter((e) => e.world === w)) {
      if (l.id === 'c4') list.push({ id: 'ending', kind: 'ending', world: w, level: 'c4', play: (app) => playCutscene(app, 'ending') });
      else if (l.id === 'cx') list.push({ id: 'epilogue', kind: 'epilogue', world: w, level: 'cx', play: (app) => playCutscene(app, 'epilogue') });
      else list.push({ id: l.id, kind: INTERLUDE_KIND[l.id] ?? 'interlude', world: w, level: l.id, play: (app) => INTERLUDES[l.id](app) });
    }
  }
  return list;
})();
export const SCENE_BY_ID = new Map(SCENES.map((s) => [s.id, s]));

/** the scene that follows a journey (c4 → the ending, cx → the epilogue) */
export function sceneAfter(levelId: string): SceneDef | undefined {
  return SCENES.find((s) => s.level === levelId);
}

/** the save flag remembering a scene was seen */
export function flagOf(s: SceneDef): string {
  if (s.kind === 'opening') return 'intro';
  if (s.kind === 'ending') return 'ending';
  if (s.kind === 'epilogue') return 'epilogue';
  if (s.kind === 'chapter') return `ch:${s.world}`;
  return `sc:${s.id}`;
}

export function seen(save: SaveData, s: SceneDef): boolean {
  return !!save.flags[flagOf(s)];
}

/** unlocked in the gallery: seen, or its journey won (older saves), or its land reached */
export function unlocked(save: SaveData, s: SceneDef): boolean {
  if (seen(save, s)) return true;
  const won = (id: string) => (save.levels[id]?.stars ?? 0) > 0;
  if (s.kind === 'opening') return Object.keys(save.levels).length > 0;
  if (s.kind === 'chapter') return CAMPAIGN.some((l) => l.world === s.world && won(l.id));
  return !!s.level && won(s.level);
}

/** a land seen for the first time: its chapter opening plays before its first journey */
export function chapterDue(save: SaveData, world: WorldId): boolean {
  if (save.flags[`ch:${world}`]) return false;
  return !CAMPAIGN.some((l) => l.world === world && (save.levels[l.id]?.stars ?? 0) > 0);
}

/** shards of the Heart already home: one per guardian defeated */
export function shardsOf(save: SaveData | null): number {
  if (!save) return 0;
  return ['m4', 'd4', 'i4', 'f4', 'c4'].filter((id) => (save.levels[id]?.stars ?? 0) > 0).length;
}

export function sceneTitle(s: SceneDef, lang: 'pt' | 'en'): string {
  if (s.kind === 'chapter') return WORLD_NAMES[s.world][lang];
  return SCENE_NAMES[s.id]?.[lang] ?? s.id;
}

/** play a scene by id (it ends on a black screen; the caller fades in what comes next) */
export async function playStory(app: App, id: string): Promise<void> {
  const s = SCENE_BY_ID.get(id);
  if (!s) return;
  audio.setIntensity(0);
  try {
    await s.play(app);
  } catch (e) {
    console.error('[story] scene failed', id, e);
    await app.screens.fadeTo(1, 300);
  }
}

/**
 * Developer routes: ?cine=<id> (intro, ending, epilogue, ch-desert, m1 … cx), ?cine=chapter&world=ice,
 * ?cine=interlude&id=m2, ?cine=gallery. Add &cinet=30 to start 30 s in.
 */
export async function devCine(app: App, p: URLSearchParams): Promise<void> {
  const what = p.get('cine') ?? 'intro';
  let id = what;
  if (what === 'chapter') id = `ch-${p.get('world') ?? 'meadow'}`;
  else if (what === 'interlude') id = p.get('id') ?? 'm1';
  await app.boot(true);
  if (what === 'gallery') {
    app.storyGallery();
    return;
  }
  if (what === 'tour') {
    // the second half of the epilogue on its own (for captures)
    await playCutscene(app, 'tour');
    return;
  }
  if (!SCENE_BY_ID.has(id)) id = 'intro';
  await playStory(app, id);
  (window as unknown as { __done?: boolean }).__done = true;
}

// ───────────────────────────── looks: times of day ─────────────────────────────

type Time = 'day' | 'gold' | 'dusk' | 'night';

function look(world: WorldId, time: Time = 'day'): WorldLook {
  const L = LOOKS[world];
  if (time === 'day') return L;
  if (time === 'gold') {
    return {
      ...L,
      sky: { ...L.sky, horizon: world === 'forge' ? L.sky.horizon : '#ffcf98', sunGlow: '#ffb060', sunDir: [L.sky.sunDir[0], 0.16, L.sky.sunDir[2]], cloudShade: '#c99a8a' },
      sun: '#ffcf90', sunIntensity: L.sunIntensity * 0.9, fog: world === 'forge' ? L.fog : '#e8c8a8', exposure: L.exposure * 1.02,
    };
  }
  if (time === 'dusk') {
    return {
      ...L,
      sky: { ...L.sky, top: '#28356e', horizon: '#ff9a6a', sunGlow: '#ff7a4a', sunDir: [L.sky.sunDir[0], 0.07, L.sky.sunDir[2]], cloud: '#ffc0a0', cloudShade: '#7a5a8a', stars: 0.25 },
      sun: '#ffa070', sunIntensity: L.sunIntensity * 0.62, hemiSky: '#c9a0c0', hemiIntensity: 0.8, fog: '#b88a98', exposure: L.exposure * 1.05,
    };
  }
  const NIGHT: Record<WorldId, { top: string; horizon: string; glow: string; fog: string }> = {
    meadow: { top: '#08112a', horizon: '#243663', glow: '#6a7ab0', fog: '#1b2442' },
    desert: { top: '#0b0d2a', horizon: '#3a2c58', glow: '#b07a6a', fog: '#2a2240' },
    ice: { top: '#040d24', horizon: '#173462', glow: '#6aa0d0', fog: '#1a2c4c' },
    forge: { top: '#0a0408', horizon: '#5a1a10', glow: '#ff5a1a', fog: '#3a160e' },
    citadel: { top: '#05040e', horizon: '#2a2450', glow: '#8a7ad0', fog: '#1c1838' },
  };
  const n = NIGHT[world];
  return {
    ...L,
    sky: { ...L.sky, top: n.top, horizon: n.horizon, sunGlow: n.glow, sunDir: [L.sky.sunDir[0], 0.3, L.sky.sunDir[2]], cloud: '#3a4670', cloudShade: '#141a30', stars: 1.3, cloudCover: 0.25, aurora: world === 'ice' ? 1.1 : L.sky.aurora },
    sun: '#a8baff', sunIntensity: 0.9, hemiSky: '#5a6aa8', hemiGround: '#1a1a2a', hemiIntensity: 0.5, fog: n.fog, exposure: L.exposure * 1.18,
  };
}

// ───────────────────────────── the story so far ─────────────────────────────

/** the band on the shell when a scene begins (before its own rescue) */
function bandAt(id: string): TowerKind[] {
  const joined: Record<string, number> = {
    'ch-meadow': 1, m1: 1, m2: 2, m3: 3, m4: 3, mx: 3,
    'ch-desert': 3, d1: 4, d2: 5, d3: 5, d4: 5, dx: 5,
    'ch-ice': 5, i1: 6, i2: 7, i3: 7, i4: 7, ix: 7,
    'ch-forge': 7, f1: 8, f2: 8, f3: 8, f4: 8, fx: 8,
    'ch-citadel': 8, c1: 8, c2: 8, c3: 8,
  };
  return BAND_ORDER.slice(0, joined[id] ?? 8);
}

function setFor(id: string, world: WorldId, extra: Partial<SetSpec> = {}): SetSpec {
  return { world, bpm: 96, bars: 70, band: bandAt(id), shards: WORLD_INDEX[world], life: 0.22, colorScale: 0.85, ...extra };
}

function placeOf(levelId: string, lang: 'pt' | 'en'): string {
  return LEVEL_BY_ID.get(levelId)?.def.name[lang] ?? '';
}

// ───────────────────────────── reusable beats ─────────────────────────────

/** The band plays toward a point: golden notes stream from the musicians to it. */
function serenade(c: Cine, t0: number, dur: number, kinds: TowerKind[] | 'all', target: Anchor, n = 26) {
  const stream = c.add(new NoteStream(target), null);
  c.view.scene.add(stream.group);
  c.at(t0, () => {
    c.play(kinds);
    const list = kinds === 'all' ? [...c.band.keys()] : kinds;
    for (let i = 0; i < n; i++) {
      const k = list[i % list.length];
      const a = c.band.get(k);
      if (!a) continue;
      const p = a.world(new THREE.Vector3()).add(tmp.set(0, 1.4, 0));
      stream.add(p, c.wt + (i / n) * dur * 0.8, 1.6 + Math.random() * 0.6, BAND_COLORS[k], 0.34, 2.5 + Math.random() * 3);
    }
  });
  return stream;
}

/** a musician's comic wake-up: a start, a pratfall, a dizzy wobble */
function startled(c: Cine, a: Actor, t0: number) {
  c.at(t0, () => ((a.view as MusicianView).pose = 'scared'));
  c.hop(a, t0, 0.5, 1.1);
  c.fall(a, t0 + 0.5, 0.6);
  c.during(t0 + 1.0, t0 + 2.0, (k) => (a.roll = Math.sin(k * Math.PI * 4) * 0.25 * (1 - k)));
}

/** a rescued musician plays its signature motif, then jumps onto its seat on the shell */
function joinBand(c: Cine, a: Actor, kind: TowerKind, t0: number, jump = 1.5, height = 7) {
  c.motif(t0, kind);
  c.at(t0, () => {
    (a.view as MusicianView).pose = 'play';
    a.pattern = 'x.x.xxx.';
    a.motes = { at: c.R(a, 0, 1.5, 0), color: BAND_COLORS[kind], every: 1 };
  });
  c.at(t0 + 1.9, () => {
    a.pattern = null;
    a.motes = null;
    (a.view as MusicianView).pose = 'jump';
  });
  c.arc(a, t0 + 2.0, jump, c.seatAnchor(kind), height, { seat: kind, spins: 1 });
  c.at(t0 + 2.0 + jump, () => {
    (a.view as MusicianView).pose = 'cheer';
    c.cue(t0 + 2.0 + jump, 'story:join');
    for (const k of c.band.keys()) if (k !== kind) c.hop(c.band.get(k)!, c.t + Math.random() * 0.2, 0.45, 0.5);
    c.mpose('cheer');
    c.view.turtle.cheer();
  });
}

/** a shard rises from a point, hangs there glowing, then flies home to its facet of the Heart */
function shardHome(c: Cine, world: WorldId, t0: number, from: Anchor, rise = 2.2, fly = 3.2) {
  const i = WORLD_INDEX[world];
  const color = SHARD_COLORS[i];
  const turtle = c.view.turtle;
  c.cue(t0, 'story:shard');
  const hang = () => from().add(tmp.set(0, 4, 0));
  const rising = c.shardFlight(t0, rise, color, from, hang, 1, 1.4);
  const flying = c.shardFlight(t0 + rise, fly, color, hang, () => turtle.facetWorld(i), 8, 1.3, () => {
    turtle.setShards(i + 1);
    turtle.flashFacet(i);
    const h = turtle.heartWorld(new THREE.Vector3());
    c.view.fx.flash(h, 3, color, 0.5);
    c.view.fx.burst(h, color, 60, 5, 0.2, 1.2);
    c.view.fx.ring(turtle.group.position.clone().setY(turtle.group.position.y + 0.4), 30, color, 1.4, 0.05);
    c.shake(0.4);
  });
  // where the shard is right now (for the camera to follow it)
  const at = () => (c.t < t0 + rise ? rising.group.position : c.t < t0 + rise + fly ? flying.group.position : turtle.heartWorld(new THREE.Vector3()));
  return { end: t0 + rise + fly, at };
}

/** the great Voice of the land rings, a thread of light links it to the Heart again, colour sweeps the land */
function voiceSings(c: Cine, world: WorldId, t0: number) {
  const lm = c.view.landmark;
  const i = WORLD_INDEX[world];
  c.cue(t0, 'story:voice');
  let k0 = -1;
  c.during(t0 - 0.6, t0 + 0.8, (k) => {
    if (k0 < 0) k0 = 0.75;
    lm.setCorrupt(k0 * (1 - ease.in(k)));
  });
  c.at(t0, () => {
    lm.sing();
    c.view.bloomWave(lm.group.position);
    c.view.fx.flash(lm.top(new THREE.Vector3()), 16, SHARD_COLORS[i], 0.9);
  });
  const th = new LightThread(SHARD_COLORS[i], 0.08, 1.6, 0.25);
  th.mat.uniforms.uGrow.value = 0;
  c.view.scene.add(th.mesh);
  c.add({ update: (_dt: number, t: number) => { th.set(lm.top(new THREE.Vector3()), c.view.turtle.heartWorld(new THREE.Vector3())); th.update(t); } }, null);
  c.during(t0 + 0.4, t0 + 2.6, (k) => (th.mat.uniforms.uGrow.value = ease.outCubic(k)));
  c.life(t0 + 0.3, 5, 1.1);
  c.colour(t0, 3, 1.4);
}

function cardChapter(app: App, c: Cine, world: WorldId, t0: number, t1: number) {
  const n = CHAPTER_NUMERALS[WORLD_INDEX[world]];
  c.chapter(t0, t1, `${app.screens.t('chapter')} ${n}`, WORLD_NAMES[world][app.screens.lang]);
}

/** ink-black guardian of a land standing by its Voice (corrupt) */
function corruptVoice(c: Cine, k = 1) {
  c.view.landmark.setCorrupt(k);
  c.view.landmark.setAwake(0);
}

// ───────────────────────────── chapter openings ─────────────────────────────

const CHAPTERS: Record<WorldId, (app: App) => Promise<unknown>> = {
  // the meadow, grey at dawn; far away, the Bell wrapped in ink
  meadow: (app) => {
    audio.setAmbience('meadow', 0.5);
    return runScene(app, setFor('ch-meadow', 'meadow', { look: look('meadow', 'gold'), bars: 64, s0: 14, life: 0.16, colorScale: 0.4, seed: 11, features: [{ kind: 'meadow', from: 0, to: 80 }, { kind: 'hills', from: 40, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const blot = c.creature('bossBlot', 6, v.landmark.group.position.clone().add(tmp.set(5, 0, 5)), 0);
      c.add({ update: () => (blot.yaw = Math.atan2(v.turtle.group.position.x - blot.pos.x, v.turtle.group.position.z - blot.pos.z)) }, null);
      c.walk(0, 1);
      c.cue(0.2, 'land:meadow');
      c.mpose('conduct');
      c.play(['harp']);
      // 1. high over the grey meadow; the colossus carries a small circle of colour
      c.shot(0, 6, { pos: [c.T(-30, 26, 34), c.T(-22, 17, 24)], look: [c.T(0, 2, -14), c.T(0, 4, -8)], fov: 44 });
      cardChapter(app, c, 'meadow', 0.8, 5.4);
      // 2. long lens down the road: the Bell on its hill, coiled in ink
      c.shot(6, 10.5, { pos: [c.T(1.1, 7.3, -1.9), c.T(1.0, 7.5, -2.3)], look: c.add3(() => v.landmark.group.position, 0, 14, 0), fov: [12, 10] });
      c.at(8.4, () => {
        c.shake(0.1);
        v.fx.burst(blot.pos.clone().setY(blot.pos.y + 4), '#1d1a2b', 30, 5, 0.6, 1.2, false, 2);
      });
      // 3. the Maestro points at it; Lira nods, and they set off
      c.shot(10.5, 14.5, { pos: [c.R(c.maestro, -1.4, 1.3, -2.4), c.R(c.maestro, -1.2, 1.3, -2.1)], look: c.R(c.maestro, 0.2, 0.7, 0), fov: 32 });
      c.at(10.9, () => c.mpose('point'));
      c.hop(c.band.get('harp')!, 12.2, 0.35, 0.3);
      c.at(13, () => c.mpose('conduct'));
      c.end(14.5);
    });
  },
  // grey dunes trembling with heat; Chocalho buried to the neck shaking a soundless shaker
  desert: (app) => {
    audio.setAmbience('desert', 0.6);
    const lang = app.screens.lang;
    return runScene(app, setFor('ch-desert', 'desert', { bars: 70, s0: 16, seed: 23, life: 0.2, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'hills', from: 30, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(5.2, 0, 1.6);
      const sStop = c.sAt(9);
      const spot = c.roadPoint(sStop + 2.5, -9, 0);
      const sm = new SandMound('#e3c48c');
      sm.group.position.copy(spot);
      c.place(sm.group);
      const cho = c.musician('shaker', spot.clone().setY(spot.y - 0.9), { frozen: 0.55, pose: 'play', yaw: Math.atan2(v.turtle.group.position.x - spot.x, v.turtle.group.position.z - spot.z) });
      c.add({ update: () => {
        if (c.t < 9.6) {
          cho.spin = Math.sin(c.wt * 18) * 0.12;
          cho.holder.lookAt(v.turtle.group.position.x, cho.holder.position.y, v.turtle.group.position.z);
        }
      } }, null);
      c.cue(0.2, 'land:desert');
      c.grade(0, 0.01, { aberration: 0.9 });
      // 1. wide: grey dunes shimmering in the heat
      c.shot(0, 5.4, { pos: [c.T(-26, 7, -30), c.T(-20, 6, -24)], look: [c.T(0, 3, -4), c.T(0, 4, -2)], fov: 40, shake: 0.08 });
      cardChapter(app, c, 'desert', 0.6, 5.0);
      // 2. a head in the sand, shaking a shaker that makes no sound
      c.shot(5.4, 9.2, { pos: [c.R(() => spot, 2.4, 0.9, -2.6), c.R(() => spot, 1.9, 0.8, -2.1)], look: () => spot.clone().setY(spot.y + 0.5), fov: 32 });
      c.placeName(5.8, 8.8, placeOf('d1', lang));
      c.cue(5.4, 'story:frozen');
      c.grade(5.4, 1, { aberration: 0.2 });
      // 3. the band plays to it
      c.cue(9.2, 'story:wake');
      serenade(c, 9.4, 2.4, 'all', () => spot.clone().setY(spot.y + 0.6), 20);
      c.shot(9.2, 12, { pos: [c.Sh(1.5, 6.6, -5.2), c.Sh(0.8, 6.4, -5.6)], look: () => spot.clone().setY(spot.y + 0.4), fov: 38 });
      c.colourCircle(11.2, 2.5, () => spot, 0.5, 7, 1.15);
      // 4. out of the sand!
      c.at(11.8, () => {
        cho.holder.position.y = spot.y;
        (cho.view as MusicianView).setFrozen(0);
        v.fx.dust(spot.clone().setY(spot.y + 0.4), '#e8c890', 60);
        v.fx.burst(spot.clone().setY(spot.y + 1), '#ffe066', 40, 4, 0.2, 1);
        sm.group.scale.set(1.2, 0.4, 1.2);
        c.shake(0.3);
      });
      c.hop(cho, 11.8, 0.7, 2.2);
      c.shot(12, 14.4, { pos: [c.R(() => spot, 4.2, 1.6, -3.6), c.R(() => spot, 3.6, 1.8, -3.2)], look: () => spot.clone().setY(spot.y + 1.2), fov: 38 });
      joinBand(c, cho, 'shaker', 12.6, 1.4, 6);
      c.shot(14.4, 18.6, { pos: [c.T(-15, 6, -9), c.T(-14, 7, -6)], look: c.T(-3, 4.4, -2), fov: 40 });
      c.walk(17, 1, 1.4);
      c.end(18.6);
    });
  },
  // a snowy pass; Trompa frozen in a block of ice; the drum warms it, the ice cracks, he blows
  ice: (app) => {
    audio.setAmbience('ice', 0.6);
    const lang = app.screens.lang;
    return runScene(app, setFor('ch-ice', 'ice', { bars: 70, s0: 16, seed: 37, life: 0.25, features: [{ kind: 'hills', from: 0, to: 140 }, { kind: 'forest', from: 10, to: 60, side: 1 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const snow = c.add(new Fall(['#ffffff', '#d8ecff'], 700, 30, 24, 24, 2.2), null);
      v.scene.add(snow.points);
      snow.alpha = 0.9;
      c.add({ update: () => snow.points.position.copy(v.turtle.group.position) }, null);
      c.walk(0, 1);
      c.walk(5.0, 0, 1.6);
      const sStop = c.sAt(9);
      const spot = c.roadPoint(sStop + 3, -9.5, 0);
      const ice = c.add(new IceBlock(1.9, 2.4, 1.9));
      ice.group.position.copy(spot);
      ice.group.rotation.y = 0.3;
      const tro = c.musician('horn', spot.clone().setY(spot.y + 0.1), { frozen: 1, pose: 'play' });
      tro.holder.lookAt(v.turtle.group.position.x, tro.holder.position.y, v.turtle.group.position.z);
      c.cue(0.2, 'land:ice');
      c.shot(0, 5.2, { pos: [c.T(24, 14, -22), c.T(18, 10, -18)], look: [c.T(0, 4, -6), c.T(0, 4, -4)], fov: 42 });
      cardChapter(app, c, 'ice', 0.6, 4.8);
      // the frozen horn player
      c.cue(5.2, 'story:frozen');
      c.shot(5.2, 8.6, { pos: [c.R(() => spot, 3.2, 2.2, -2.4), c.R(() => spot, 2.6, 1.9, -2.0)], look: () => spot.clone().setY(spot.y + 1.2), fov: 34 });
      c.placeName(5.6, 8.4, placeOf('i1', lang));
      // Bumbo drums: the beats warm the ice
      c.cue(8.6, 'story:wake');
      const drum = c.band.get('drum')!;
      c.at(8.8, () => c.play(['drum']));
      c.shot(8.6, 11.2, { pos: [c.R(drum, 1.8, 1.0, -1.6), c.R(drum, 1.6, 1.1, -1.4)], look: c.R(drum, 0, 0.7, 0), fov: 34 });
      c.during(9, 13, (k) => {
        ice.heat = k;
        ice.crack = Math.max(0, (k - 0.3) / 0.7);
        if (Math.random() < 0.3) v.fx.burst(spot.clone().add(tmp.set(0, 2.3, 0)), '#ffffff', 3, 1.2, 0.5, 1.4, false, -1);
      });
      serenade(c, 9.2, 2.6, ['drum'], () => spot.clone().setY(spot.y + 1.2), 16);
      c.shot(11.2, 13.6, { pos: [c.R(() => spot, 2.8, 1.6, -3.2), c.R(() => spot, 2.4, 1.5, -2.8)], look: () => spot.clone().setY(spot.y + 1.2), fov: 34, shake: 0.1 });
      c.at(13.2, () => {
        c.debrisOf(ice.shatter(spot.clone()));
        v.fx.flash(spot.clone().setY(spot.y + 1.2), 3, '#cfefff', 0.4);
        c.shake(0.4);
      });
      c.during(13.2, 14.6, (k) => (tro.view as MusicianView).setFrozen(1 - k));
      c.colourCircle(13.2, 2, () => spot, 0.5, 6, 1.12);
      c.shiver(tro, 13.4, 14.6, 1);
      // the first blast: a puff of snow off every tree around
      c.shot(13.6, 16.4, { pos: [c.R(() => spot, 4.4, 1.6, -4.0), c.R(() => spot, 4, 1.8, -3.6)], look: () => spot.clone().setY(spot.y + 1.3), fov: 38 });
      c.at(14.8, () => {
        v.fx.ring(spot.clone().setY(spot.y + 1.2), 12, '#ffcf7a', 0.8, 0.1);
        v.fx.burst(spot.clone().setY(spot.y + 3), '#ffffff', 80, 9, 0.35, 1.4, false, 2);
        c.shake(0.3);
      });
      joinBand(c, tro, 'horn', 14.8, 1.4, 6);
      c.shot(16.4, 20, { pos: [c.T(-15, 6, -10), c.T(-13, 7, -7)], look: c.T(0, 4.6, -1), fov: 40 });
      c.walk(19, 1, 1.4);
      c.end(20);
    });
  },
  // fields of ash; Grave chained to a cart of stones; the chain snaps, he smashes the cart and grabs his bass
  forge: (app) => {
    audio.setAmbience('forge', 0.6);
    const lang = app.screens.lang;
    return runScene(app, setFor('ch-forge', 'forge', { bars: 70, s0: 16, seed: 53, life: 0.22, features: [{ kind: 'hills', from: 0, to: 140 }, { kind: 'ruins', from: 20, to: 60 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const ash = c.add(new Fall(['#8a8090', '#5a5260'], 600, 30, 24, 22, 1.2), null);
      v.scene.add(ash.points);
      ash.alpha = 0.8;
      c.add({ update: () => ash.points.position.copy(v.turtle.group.position) }, null);
      c.walk(0, 1);
      c.walk(5.0, 0, 1.6);
      const sStop = c.sAt(9);
      const spot = c.roadPoint(sStop + 2, -10, 0);
      const yaw = c.roadYaw(sStop);
      const cart = new StoneCart();
      cart.group.position.copy(spot);
      cart.group.rotation.y = yaw + Math.PI / 2;
      c.place(cart.group);
      const gravePos = cart.group.localToWorld(new THREE.Vector3(3.6, 0, 0));
      gravePos.y = v.land.heightAt(gravePos.x, gravePos.z);
      cart.chainTo(new THREE.Vector3(3.3, 0.5, 0));
      const grave = c.musician('bass', gravePos, { frozen: 0.5, pose: 'sleep', scale: 1.6 });
      // he leans forward, hauling the cart along
      const ahead = c.roadPoint(sStop + 14, -10, 0);
      grave.holder.lookAt(ahead.x, grave.holder.position.y, ahead.z);
      grave.tilt = 0.35;
      c.cue(0.2, 'land:forge');
      c.shot(0, 5.2, { pos: [c.T(-24, 10, -26), c.T(-18, 8, -21)], look: [c.T(0, 3, -6), c.T(0, 4, -4)], fov: 42 });
      cardChapter(app, c, 'forge', 0.6, 4.8);
      // the big one, chained, dragging a cart of stones
      c.cue(5.2, 'story:frozen');
      c.shot(5.2, 9, { pos: [c.R(() => gravePos, -2.8, 1.4, -3.6), c.R(() => gravePos, -2.3, 1.5, -3.0)], look: () => gravePos.clone().lerp(spot, 0.4).setY(gravePos.y + 1.2), fov: 38 });
      c.placeName(5.6, 8.6, placeOf('f1', lang));
      c.during(5.2, 9, () => (grave.hop = Math.abs(Math.sin(c.wt * 2.4)) * 0.05));
      // the band plays: the chain snaps
      c.cue(9, 'story:wake');
      serenade(c, 9.2, 2.4, 'all', () => gravePos.clone().setY(gravePos.y + 1.4), 24);
      c.shot(9, 11.6, { pos: [c.Sh(-2.2, 7.2, -5.6), c.Sh(-2.8, 7.0, -5.4)], look: () => gravePos.clone().setY(gravePos.y + 1), fov: 40 });
      c.colourCircle(10.8, 2, () => gravePos, 0.5, 7, 1.12);
      c.at(11.4, () => {
        c.debrisOf(cart.breakChain(gravePos.clone().setY(gravePos.y + 0.6)));
        (grave.view as MusicianView).setFrozen(0);
        grave.tilt = 0;
        (grave.view as MusicianView).pose = 'scared';
        v.fx.burst(gravePos.clone().setY(gravePos.y + 0.6), '#ffb070', 30, 4, 0.2, 0.8);
      });
      c.shot(11.6, 14.6, { pos: [c.R(() => gravePos, -5.2, 1.8, -2.4), c.R(() => gravePos, -5.8, 2.4, -1.4)], look: () => gravePos.clone().lerp(spot, 0.5).setY(gravePos.y + 1.4), fov: 42 });
      // …and smashes the cart to pieces
      c.face(grave, 12, 0.4, () => spot);
      c.hop(grave, 12.6, 0.6, 1.4);
      c.at(13.2, () => {
        c.debrisOf(cart.smash(spot.clone().setY(spot.y + 1)));
        v.fx.dust(spot.clone().setY(spot.y + 0.4), '#8a7a70', 60);
        c.shake(0.7);
      });
      joinBand(c, grave, 'bass', 14, 1.6, 5);
      // a heavy landing: the shell bounces everyone
      c.at(17.6, () => {
        c.shake(0.6);
        for (const k of c.band.keys()) if (k !== 'bass') c.hop(c.band.get(k)!, c.t, 0.5, 0.9);
      });
      c.shot(14.6, 20, { pos: [c.T(-15, 6.5, -9), c.T(-13, 7.5, -6)], look: c.T(0, 4.6, -1), fov: 40 });
      c.walk(19, 1, 1.4);
      c.end(20.2);
    });
  },
  // endless grey marble stairs; the Heart (4 of 5) points the way
  citadel: (app) => {
    audio.setAmbience('citadel', 0.6);
    return runScene(app, setFor('ch-citadel', 'citadel', { bars: 80, s0: 27, seed: 61, curviness: 0, life: 0.15, colorScale: 0.6, features: [{ kind: 'meadow', from: 0, to: 200 }] }), (c) => {
      const v = c.view;
      // endless stairs from the road up to the Needle, which stands on the top landing
      const s1 = 22;
      const L = 80 * 4 * 0.42;
      const steps = Math.ceil((L + 22 - s1) / 2.0) + 2;
      const stairs = new MarbleStairs(steps, 0.4, 2.0, 18);
      const base = c.roadPoint(s1, 0, 0);
      stairs.group.position.copy(base).setY(base.y - 0.05);
      stairs.group.rotation.y = c.roadYaw(s1);
      c.place(stairs.group);
      stairs.group.updateMatrixWorld(true);
      v.landmark.group.position.y = base.y + steps * 0.4 - 0.4;
      const inv = new THREE.Matrix4();
      // INTEGRATION: no JourneyView hook raises the ground, so this scene's own view gets a heightAt that
      // includes the set piece (the colossus' body and feet then walk on it).
      const orig = v.land.heightAt;
      v.land.heightAt = (x: number, z: number) => {
        inv.copy(stairs.group.matrixWorld).invert();
        const l = tmp.set(x, 0, z).applyMatrix4(inv);
        const h = stairs.localHeight(l.x, l.z);
        const g = orig(x, z);
        return h === null ? g : Math.max(g, base.y + h);
      };
      c.walk(0, 1);
      c.cue(0.2, 'land:citadel');
      // 1. the foot of the stairs, rising into the clouds
      c.shot(0, 5, { pos: [c.T(-10, 2.2, 12), c.T(-8, 3.2, 8)], look: [c.T(0, 16, -40), c.T(0, 20, -50)], fov: 46 });
      cardChapter(app, c, 'citadel', 0.6, 4.6);
      // 2. the Heart: four facets lit, one dark; a beam of light points the way up
      const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd36b').multiplyScalar(1.8), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), beamMat);
      v.scene.add(beam);
      c.add({ update: () => {
        const h = v.turtle.heartWorld(new THREE.Vector3());
        beam.position.copy(h);
        const target = v.landmark.top(new THREE.Vector3());
        beam.lookAt(target);
        beam.scale.set(1, 1, h.distanceTo(target));
      } }, null);
      c.during(6, 8, (k) => (beamMat.opacity = k * 0.5));
      c.at(6, () => [0, 1, 2, 3].forEach((i) => v.turtle.flashFacet(i)));
      c.shot(5, 9, { pos: [c.Sh(2.2, 7.4, 2.4), c.Sh(1.6, 7.6, 2.0)], look: c.Sh(0, 7.4, 0), fov: 30 });
      // 3. up the stairs, toward the Needle
      c.cue(9, 'story:dread');
      c.shot(9, 15, { pos: [c.T(6, 9, 14), c.T(4, 12, 20)], look: [c.T(0, 8, -20), () => v.landmark.top(new THREE.Vector3())], fov: [44, 40] });
      c.end(15);
    });
  },
};

// ───────────────────────────── interludes ─────────────────────────────

/** a camp at night beside the sleeping colossus, the band playing softly around the Heart */
function campSet(c: Cine, sleep = 1) {
  const v = c.view;
  v.turtle.sleep = sleep;
  v.turtle.lights = 0.8;
  const fire = c.add(new Campfire());
  fire.group.position.copy(c.roadPoint(c.s0 + 1, -8, 0));
  return fire;
}

const INTERLUDES: Record<string, (app: App) => Promise<unknown>> = {
  // ── Meadow ──
  // a grey village square: Bumbo, a statue in mid-beat; colour pours into him; he wakes with a start
  m1: (app) => {
    audio.setAmbience('meadow', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('m1', 'meadow', { bars: 70, s0: 14, seed: 17, features: [{ kind: 'meadow', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(3.6, 0, 1.8);
      const sStop = c.sAt(8);
      const sq = new VillageSquare(5);
      const spot = c.roadPoint(sStop + 1, -14, 0);
      sq.group.position.copy(spot);
      // the houses stand on the far side; the square opens toward the road
      sq.group.rotation.y = c.roadYaw(sStop) + Math.PI / 2;
      c.place(sq.group);
      const top = sq.group.localToWorld(sq.pedestalTop.clone());
      const bumbo = c.musician('drum', top, { frozen: 1, pose: 'play' });
      bumbo.holder.lookAt(v.turtle.group.position.x, top.y, v.turtle.group.position.z);
      c.cue(0.2, 'story:frozen');
      // 1. a grey square; the colossus arrives behind the statue
      c.shot(0, 4.6, { pos: [c.R(() => top, -5.6, 0.7, -2.2), c.R(() => top, -5.0, 0.95, -1.8)], look: [c.mix(() => top, () => v.turtle.group.position.clone().setY(top.y + 3), 0.55), c.mix(() => top, () => v.turtle.group.position.clone().setY(top.y + 2), 0.4)], fov: 44 });
      c.placeName(0.8, 4.2, placeOf('m2', lang));
      // 2. the statue, close: frozen in the middle of a beat
      c.shot(4.6, 7.4, { pos: [c.R(bumbo, 2.9, 1.1, -2.1), c.R(bumbo, 2.5, 1.0, -1.8)], look: c.R(bumbo, 0, 0.75, 0), fov: 32 });
      // 3. Lira plucks; golden notes fly to the statue
      c.cue(7.4, 'story:wake');
      const lira = c.band.get('harp')!;
      c.shot(7.4, 10.2, { pos: [c.R(lira, -1.5, 1.5, 1.6), c.R(lira, -1.3, 1.6, 1.3)], look: c.mix(c.R(lira, 0, 0.8, 0), () => top.clone().setY(top.y + 0.8), 0.35), fov: 38 });
      c.at(7.6, () => c.mpose('conduct'));
      serenade(c, 7.8, 2.2, ['harp'], () => top.clone().setY(top.y + 0.8), 18);
      // 4. colour runs down into the stone
      c.shot(10.2, 12.4, { pos: [c.R(bumbo, 2.6, 1.4, -2.3), c.R(bumbo, 2.2, 1.25, -1.9)], look: c.R(bumbo, 0, 0.75, 0), fov: 34 });
      c.during(10.3, 11.8, (k) => (bumbo.view as MusicianView).setFrozen(1 - ease.inOut(k)));
      c.colourCircle(10.4, 3, () => top, 0.5, 12, 1.15);
      c.at(10.4, () => v.fx.burst(top.clone().setY(top.y + 2.2), '#ffd36b', 40, 2, 0.16, 1.2, true, 2));
      // 5. he wakes with a start, topples off the pedestal…
      startled(c, bumbo, 11.9);
      // he tumbles off the front of the pedestal (toward us) and lands on the cobbles
      let offPed: THREE.Vector3 | null = null;
      c.during(12.3, 12.9, (k) => {
        offPed ??= new THREE.Vector3(1.8, 0, -1.2).applyQuaternion(v.turtle.group.quaternion);
        bumbo.holder.position.copy(top).addScaledVector(offPed, ease.out(k));
        bumbo.holder.position.y = top.y - k * k * 1.45;
      });
      c.at(12.0, () => audio.cinematic('story:comic'));
      c.shot(12.4, 15, { pos: [c.R(bumbo, 3.2, 1.2, -2.6), c.R(bumbo, 2.8, 1.1, -2.2)], look: c.R(bumbo, 0, 0.6, 0), fov: 38 });
      // 6. …then drums for joy and jumps onto the shell
      joinBand(c, bumbo, 'drum', 14.2, 1.6, 8);
      c.shot(15, 19.4, { pos: [c.T(-17, 6, -6), c.T(-15, 7, -3)], look: c.T(-4, 4.4, -1), fov: 42 });
      c.walk(18.4, 1, 1.4);
      c.end(19.6);
    });
  },
  // dusk, a belfry: Dona Badalo in a cage of ink thorns; drum and harp crumble it; far away, the Bell in the Blot's arms
  m2: (app) => {
    audio.setAmbience('meadow', 0.45);
    const lang = app.screens.lang;
    return runScene(app, setFor('m2', 'meadow', { look: look('meadow', 'dusk'), bars: 70, s0: 14, seed: 19, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'forest', from: 30, to: 90, side: 1 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const blot = c.creature('bossBlot', 6, v.landmark.group.position.clone().add(tmp.set(5, 0, 5)), 0);
      void blot;
      c.walk(0, 1);
      c.walk(3.4, 0, 1.8);
      const sStop = c.sAt(8);
      const towerAt = c.roadPoint(sStop + 2, -10.5, 0);
      const tower = new BellTower();
      tower.group.position.copy(towerAt);
      tower.group.rotation.y = c.roadYaw(sStop);
      c.place(tower.group);
      const hang = tower.group.localToWorld(tower.hang.clone()).add(tmp.set(0, -1.3, 0));
      const cage = c.add(new ThornCage(0.85, 1.9));
      cage.group.position.copy(hang);
      const owl = c.musician('bell', hang.clone().add(tmp.set(0, 0.05, 0)), { frozen: 0.45, pose: 'scared' });
      owl.holder.lookAt(v.turtle.group.position.x, owl.holder.position.y, v.turtle.group.position.z);
      c.shiver(owl, 0, 9, 0.5);
      c.cue(0.2, 'story:frozen');
      c.shot(0, 4.4, { pos: [c.R(() => towerAt, -9, 3, -8), c.R(() => towerAt, -7.5, 4, -6.5)], look: [() => hang.clone(), () => hang.clone().setY(hang.y - 1)], fov: 44 });
      c.placeName(0.8, 4.0, lang === 'pt' ? 'O Campanário' : 'The Belfry');
      c.shot(4.4, 7.2, { pos: [c.R(() => hang, 2.4, 0.4, -2.8), c.R(() => hang, 2, 0.5, -2.3)], look: () => hang.clone().setY(hang.y + 0.8), fov: 32 });
      // drum and harp together
      c.cue(7.2, 'story:wake');
      serenade(c, 7.4, 2.6, ['harp', 'drum'], () => hang.clone().setY(hang.y + 0.9), 24);
      c.shot(7.2, 10, { pos: [c.Sh(-0.2, 7.0, -5.2), c.Sh(-0.8, 6.8, -5.6)], look: () => hang.clone().setY(hang.y + 0.6), fov: 40 });
      c.during(9.6, 11.4, (k) => (cage.crumble = ease.inOut(k)));
      c.at(9.8, () => v.fx.burst(hang.clone().setY(hang.y + 1), '#2a1648', 50, 4, 0.3, 1.2, false, 2));
      c.during(10.2, 11.4, (k) => (owl.view as MusicianView).setFrozen(0.45 * (1 - k)));
      c.colourCircle(10, 3, () => hang, 0.5, 9, 1.12);
      c.shot(10, 12.6, { pos: [c.R(() => hang, 2.8, 0.2, -3.2), c.R(() => hang, 2.4, 0.4, -2.8)], look: () => hang.clone().setY(hang.y + 0.8), fov: 34 });
      // she rings a little bell and flutters down to the shell
      c.at(11.6, () => ((owl.view as MusicianView).pose = 'cheer'));
      joinBand(c, owl, 'bell', 12, 1.8, 4);
      c.shot(12.6, 15.8, { pos: [c.T(-14, 8, -9), c.T(-12, 8.5, -6)], look: [() => hang.clone().lerp(v.turtle.group.position.clone().setY(hang.y - 2), 0.4), c.T(0, 5, -1)], fov: 44 });
      // far away: the giant Bell in the arms of the Great Blot
      c.cue(15.8, 'story:threat');
      c.shot(15.8, 19.6, { pos: [c.T(1.2, 7.4, -1.9), c.T(1.1, 7.6, -2.3)], look: c.add3(() => v.landmark.group.position, 0, 13, 0), fov: [11, 9.5] });
      c.end(19.6);
    });
  },
  // night camp: the band plays softly around the Heart; five dark stars; on the hill, the Blot stirs
  m3: (app) => {
    audio.setAmbience('meadow', 0.4);
    return runScene(app, setFor('m3', 'meadow', { look: look('meadow', 'night'), bars: 64, s0: 30, seed: 21, life: 0.3, colorScale: 0.6, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'hills', from: 50, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const blot = c.creature('bossBlot', 7, v.landmark.group.position.clone().add(tmp.set(4, 0, 6)), 0);
      blot.yaw = Math.PI;
      const fire = campSet(c, 0.8);
      const stars = c.add(new FiveStars(SHARD_COLORS, 16));
      stars.set(0, true);
      const skyAt = () => v.turtle.group.localToWorld(new THREE.Vector3(-10, 120, -220));
      c.add({ update: () => { stars.group.position.copy(skyAt()); stars.group.quaternion.copy(app.engine.camera.quaternion); } }, null);
      const flies = new Fireflies(60, 16, 5, '#fff2a0');
      flies.points.position.copy(fire.group.position);
      v.scene.add(flies.points);
      c.add({ update: (_dt: number, t: number) => flies.update(t) }, null);
      c.cue(0.2, 'story:camp');
      c.mpose('idle');
      c.at(0.1, () => {
        c.play('all', true, true);
        for (const k of c.band.keys()) c.band.get(k)!.strength = 0.35;
      });
      // 1. the camp: the colossus asleep by the fire, the band playing softly
      c.shot(0, 5.2, { pos: [c.T(-16, 4, -12), c.T(-14, 4.6, -9)], look: [c.T(-4, 3.4, -2), c.T(-3, 4.4, 0)], fov: 40 });
      // 2. around the Heart, close and warm
      c.shot(5.2, 9, { pos: [c.Sh(2.6, 6.4, -3.6), c.Sh(-2.4, 6.6, -3.8)], look: c.Sh(0, 6.4, 0), fov: 34 });
      // 3. the Maestro looks up: five dark stars
      c.at(8.6, () => c.mpose('point'));
      c.shot(9, 13.2, { pos: [c.R(c.maestro, -0.6, 0.6, -1.8), c.R(c.maestro, -0.7, 0.4, -1.6)], look: [c.R(c.maestro, 0, 1.0, 0), () => skyAt()], fov: [32, 44], ease: ease.inOut });
      // 4. far away on the hill, the Blot stirs
      c.cue(13.2, 'story:threat');
      c.at(13.6, () => {
        blot.lift = 1.4;
        v.fx.burst(blot.pos.clone().setY(blot.pos.y + 6), '#1d1a2b', 40, 6, 0.8, 1.4, false, 2);
      });
      c.during(13.6, 15, (k) => (blot.lift = 1.4 * (1 - k)));
      c.shot(13.2, 16.6, { pos: [c.T(1.0, 7.1, -1.9), c.T(1.0, 7.2, -2.2)], look: c.add3(() => blot.pos, 0, 6, 0), fov: [13, 11] });
      c.end(16.6);
    });
  },
  // the Great Blot falls into a rain of petals; the first shard flies home; the Bell rings; colour floods the meadow
  m4: (app) => guardianScene(app, 'meadow', 'm4', {
    guardian: (c, spot) => {
      const blot = c.creature('bossBlot', 6, spot, 0);
      c.add({ update: () => (blot.yaw = Math.atan2(c.view.turtle.group.position.x - blot.pos.x, c.view.turtle.group.position.z - blot.pos.z)) }, null);
      const petals = c.add(new Fall(['#ff9ec7', '#fff2f8'], 900, 18, 26, 40, 2.4), null);
      c.view.scene.add(petals.points);
      petals.points.position.copy(spot);
      c.during(0.6, 2.6, (k) => {
        blot.view.group.scale.setScalar(6 * (1 - ease.in(k)));
        if (Math.random() < 0.5) c.view.fx.burst(spot.clone().setY(spot.y + 4 * (1 - k)), '#ff9ec7', 10, 4, 0.3, 1.2, false, 1.5);
      });
      c.at(2.6, () => (blot.visible = false));
      c.during(1, 3, (k) => (petals.alpha = k));
      c.during(12, 15, (k) => (petals.alpha = 1 - k));
    },
  }),
  // memory 1: a small masked figure, alone behind a hill, watches a firefly festival; nobody sees it
  mx: (app) => memoryScene(app, 'meadow', 'mx', (c) => {
    const v = c.view;
    const valley = c.roadPoint(c.s0 + 6, 0, 0);
    const hill = c.roadPoint(c.s0 - 10, -14, 0);
    const fest = festival(c, valley, '#ffcf7a');
    const kid = c.silence(0.38, hill);
    kid.pose = 'small';
    kid.lookAt(valley);
    c.cue(0.3, 'story:memory');
    c.shot(0, 5, { pos: [c.R(() => hill, -2.6, 1.9, 2.8), c.R(() => hill, -2.2, 1.7, 2.3)], look: () => valley.clone().setY(valley.y + 1.5), fov: 40 });
    c.shot(5, 9.4, { pos: [c.R(() => valley, 5, 1.6, 7), c.R(() => valley, 3.4, 1.4, 6)], look: () => valley.clone().setY(valley.y + 0.8), fov: 38 });
    c.shot(9.4, 13, { pos: [c.R(() => hill, 2.2, 1.2, -1.8), c.R(() => hill, 1.9, 1.1, -1.5)], look: () => hill.clone().setY(hill.y + 0.9), fov: 30 });
    c.during(9.4, 13, () => (kid.group.rotation.z = Math.sin(c.wt * 2.2) * 0.06));
    // a dancer glances toward the hill… and turns away: nobody sees it
    const glancer = fest.dancers[0];
    c.at(13.2, () => (glancer.dance = 0));
    c.during(13.2, 14.4, (k) => (glancer.group.rotation.y = Math.atan2(hill.x - glancer.group.position.x, hill.z - glancer.group.position.z) * ease.sine(Math.min(1, k * 2))));
    c.at(14.6, () => (glancer.dance = 1));
    c.shot(13, 15.6, { pos: () => glancer.group.position.clone().add(tmp.set(1.2, 0.8, 1.6)), look: () => glancer.group.position.clone().setY(glancer.group.position.y + 0.4), fov: 32 });
    c.shot(15.6, 20, { pos: [c.R(() => hill, -7, 4, 6), c.R(() => hill, -10, 7, 9)], look: () => hill.clone().lerp(valley, 0.4).setY(hill.y + 1), fov: 42 });
    c.end(20);
  }),

  // ── Dunes ──
  // the oasis: Cristalina trapped in a grey crystal; the music makes it ring until it cracks
  d1: (app) => {
    audio.setAmbience('desert', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('d1', 'desert', { bars: 70, s0: 18, seed: 27, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'lake', from: 20, to: 60, side: -1 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(3.6, 0, 1.8);
      const sStop = c.sAt(8);
      const spot = c.roadPoint(sStop + 2, -9.5, 0);
      const pr = c.add(new CrystalPrison());
      pr.group.position.copy(spot);
      const cri = c.musician('crystal', spot.clone().setY(spot.y + 0.1), { frozen: 0.6, pose: 'sleep' });
      cri.holder.lookAt(v.turtle.group.position.x, cri.holder.position.y, v.turtle.group.position.z);
      c.cue(0.2, 'story:frozen');
      c.shot(0, 4.6, { pos: [c.T(-24, 5, -18), c.T(-20, 5, -14)], look: [() => spot.clone().setY(spot.y + 1), () => spot.clone().setY(spot.y + 1.4)], fov: 40 });
      c.placeName(0.8, 4.2, placeOf('d2', lang));
      c.shot(4.6, 7.4, { pos: [c.R(() => spot, 2.6, 1.4, -2.8), c.R(() => spot, 2.1, 1.3, -2.3)], look: () => spot.clone().setY(spot.y + 1.1), fov: 32 });
      c.cue(7.4, 'story:wake');
      serenade(c, 7.6, 3, 'all', () => spot.clone().setY(spot.y + 1.2), 24);
      c.shot(7.4, 10, { pos: [c.Sh(-0.6, 7.0, -5.4), c.Sh(-1.2, 6.8, -5.6)], look: () => spot.clone().setY(spot.y + 1), fov: 40 });
      c.during(8.4, 12, (k) => {
        pr.shake = ease.in(k);
        pr.charge = k;
      });
      c.shot(10, 12.4, { pos: [c.R(() => spot, 2.8, 1.0, -3.0), c.R(() => spot, 2.3, 1.1, -2.6)], look: () => spot.clone().setY(spot.y + 1.2), fov: 34, shake: 0.15 });
      c.at(12.1, () => {
        c.debrisOf(pr.shatter(spot.clone()));
        v.fx.flash(spot.clone().setY(spot.y + 1.2), 4, '#d9b8ff', 0.4);
        v.fx.burst(spot.clone().setY(spot.y + 1.2), '#e2c8ff', 60, 6, 0.2, 1.2);
        c.shake(0.4);
      });
      c.during(12.1, 13.2, (k) => (cri.view as MusicianView).setFrozen(0.6 * (1 - k)));
      c.colourCircle(12.1, 2.6, () => spot, 0.5, 9, 1.12);
      // a twirl of joy
      c.during(12.6, 13.8, (k) => (cri.spin = ease.inOut(k) * Math.PI * 4));
      c.shot(12.4, 15, { pos: [c.R(() => spot, 3.8, 1.4, -3.2), c.R(() => spot, 3.4, 1.6, -2.8)], look: () => spot.clone().setY(spot.y + 1.0), fov: 38 });
      joinBand(c, cri, 'crystal', 13.8, 1.4, 6);
      c.shot(15, 19, { pos: [c.T(-15, 6, -9), c.T(-13, 7, -6)], look: c.T(-2, 4.6, -1), fov: 40 });
      c.walk(18, 1, 1.4);
      c.end(19);
    });
  },
  // night in the desert: mute obelisks rise from the sand around the camp; the band huddles
  d2: (app) => {
    audio.setAmbience('desert', 0.3);
    const lang = app.screens.lang;
    return runScene(app, setFor('d2', 'desert', { look: look('desert', 'night'), bars: 64, s0: 30, seed: 29, life: 0.3, colorScale: 0.55, features: [{ kind: 'meadow', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const fire = campSet(c, 0.9);
      c.cue(0.2, 'story:camp');
      c.at(0.1, () => {
        c.play('all');
        for (const k of c.band.keys()) c.band.get(k)!.strength = 0.35;
      });
      const centre = v.turtle.group.position.clone();
      const obs: THREE.Group[] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        const p = new THREE.Vector3(centre.x + Math.cos(a) * 19, 0, centre.z + Math.sin(a) * 19);
        p.y = v.land.heightAt(p.x, p.z);
        const o = muteObelisk(7 + (i % 3) * 1.6);
        o.position.copy(p).setY(p.y - 10);
        o.lookAt(centre.x, o.position.y, centre.z);
        c.place(o);
        obs.push(o);
        const t0 = 5 + i * 0.55;
        c.during(t0, t0 + 1.4, (k) => (o.position.y = p.y - 10 * (1 - ease.outCubic(k))));
        c.at(t0, () => {
          v.fx.dust(p.clone().setY(p.y + 0.5), '#c8a878', 40);
          c.shake(0.15);
        });
      }
      c.shot(0, 5, { pos: [c.T(-14, 3.6, -10), c.T(-12, 4.2, -8)], look: c.T(-3, 3.6, -1), fov: 40 });
      c.placeName(0.8, 4.4, placeOf('d3', lang));
      c.cue(5, 'story:threat');
      c.at(5.2, () => {
        c.play('all', false);
        c.pose('all', 'scared');
        c.mpose('sad');
        for (const k of c.band.keys()) c.shiver(c.band.get(k)!, 5.2, 13, 0.6);
      });
      c.during(5.2, 8, (k) => (fire.fire = 1 - k * 0.6));
      c.shot(5, 9, { pos: [c.Sh(3.2, 6.6, -4.2), c.Sh(2.6, 6.5, -3.8)], look: c.Sh(0, 6.0, 0), fov: 38 });
      c.shot(9, 14, { pos: [c.T(0, 16, 22), c.T(0, 34, 30)], look: c.T(0, 2, 0), fov: [46, 50], ease: ease.inOut });
      c.end(14);
    });
  },
  // the Scarab bursts out of the dunes with the shard glowing on its back, then dives under again
  d3: (app) => {
    audio.setAmbience('desert', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('d3', 'desert', { look: look('desert', 'gold'), bars: 70, s0: 20, seed: 31, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'hills', from: 20, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(2.6, 0, 1.2);
      const spot = c.roadPoint(c.sAt(6) + 26, 8, 0);
      const scarab = c.creature('bossScarab', 4.2, spot, 0);
      scarab.lift = -9;
      c.add({ update: () => (scarab.yaw = Math.atan2(v.turtle.group.position.x - spot.x, v.turtle.group.position.z - spot.z)) }, null);
      const shard = c.add(new (class { group = glowSprite(SHARD_COLORS[1], 4, 1); update() {} })());
      c.add({ update: () => shard.group.position.copy(scarab.view.group.position).add(tmp.set(0, 3.6 * 1.2, 0)) }, null);
      c.cue(0.2, 'story:wonder');
      c.shot(0, 4, { pos: [c.T(-9, 4, 8), c.T(-8, 4.5, 6)], look: c.T(0, 4, -20), fov: 42 });
      c.placeName(0.8, 3.6, placeOf('d4', lang));
      // the sand trembles
      c.cue(4, 'story:threat');
      c.during(4, 6, () => {
        c.shake(0.15);
        if (Math.random() < 0.4) v.fx.dust(spot.clone().add(tmp.set((Math.random() - 0.5) * 8, 0.3, (Math.random() - 0.5) * 8)), '#e8c890', 12);
      });
      c.at(5.2, () => c.pose('all', 'scared'));
      c.shot(4, 6, { pos: c.T(-1.4, 7.4, -2.6), look: () => spot.clone().setY(spot.y + 1), fov: 32, shake: 0.2 });
      // it bursts out
      c.during(6, 7.2, (k) => (scarab.lift = -9 + 9 * ease.outBack(k)));
      c.at(6, () => {
        v.fx.dust(spot.clone().setY(spot.y + 1), '#e8c890', 120);
        v.fx.burst(spot.clone().setY(spot.y + 3), '#e8c890', 60, 9, 0.5, 1.4, false, 6);
        c.shake(0.8);
      });
      c.shot(6, 9.6, { pos: [() => spot.clone().add(new THREE.Vector3(-14, 3, -12).applyAxisAngle(new THREE.Vector3(0, 1, 0), scarab.yaw)), () => spot.clone().add(new THREE.Vector3(-12, 2, -10).applyAxisAngle(new THREE.Vector3(0, 1, 0), scarab.yaw))], look: () => spot.clone().setY(spot.y + 4), fov: 44 });
      // and dives under again
      c.during(10, 11.4, (k) => (scarab.lift = -10 * ease.in(k)));
      c.at(10.2, () => {
        v.fx.dust(spot.clone().setY(spot.y + 1), '#e8c890', 100);
        c.shake(0.4);
      });
      c.shot(9.6, 13.6, { pos: [c.T(4, 6, 6), c.T(5, 6.4, 7)], look: () => spot.clone().setY(spot.y + 2), fov: 40 });
      c.end(13.6);
    });
  },
  // the Scarab, freed, walks off golden and calm; the second shard; the Dune Harp plays itself in the wind; the desert blooms
  d4: (app) => guardianScene(app, 'desert', 'd4', {
    guardian: (c, spot) => {
      const sc = c.creature('bossScarab', 4, spot, 0);
      c.add({ update: () => (sc.yaw = Math.atan2(c.view.turtle.group.position.x - spot.x, c.view.turtle.group.position.z - spot.z)) }, null);
      const gold = c.add(new GoldenScarab());
      gold.group.position.copy(spot);
      gold.group.visible = false;
      // freed, it turns to the colossus (to thank it) until it walks away
      c.add({ update: () => { if (!gold.walk) gold.faceTo(c.view.turtle.group.position.x, c.view.turtle.group.position.z); } }, null);
      c.at(2.2, () => {
        sc.visible = false;
        gold.group.visible = true;
        c.view.fx.flash(spot.clone().setY(spot.y + 2), 6, '#ffd36b', 0.6);
        c.view.fx.burst(spot.clone().setY(spot.y + 2), '#ffe9a8', 60, 6, 0.25, 1.2);
      });
      c.during(0.6, 2.2, (k) => (sc.view.group.scale.setScalar(4 * (1 - ease.in(k) * 0.7))));
      const away = c.roadPoint(c.s0 + 40, 40, 0);
      c.at(9, () => (gold.walk = 1));
      c.during(9, 20, (k) => {
        gold.group.position.lerpVectors(spot, away, k);
        gold.group.position.y = c.view.land.heightAt(gold.group.position.x, gold.group.position.z);
        gold.faceTo(away.x, away.z);
      });
    },
    extra: (c) => {
      const gust = c.add(new Gust(() => c.view.landmark.group.position.clone().setY(c.view.landmark.group.position.y + 6), new THREE.Vector3(1, 0, 0.3), 20, 120, '#ffe9b8'), null);
      c.view.scene.add(gust.mesh);
      c.during(10, 16, (k) => (gust.strength = Math.sin(Math.PI * k) * 0.8));
    },
  }),
  // memory 2: the figure tries to join a festival, clapping, but its hands make no sound; it walks away
  dx: (app) => memoryScene(app, 'desert', 'dx', (c) => {
    const valley = c.roadPoint(c.s0 + 4, 0, 0);
    const fest = festival(c, valley, '#ffb070');
    const kidAt = c.roadPoint(c.s0 - 6, -7, 0);
    const kid = c.silence(0.38, kidAt);
    kid.pose = 'small';
    kid.lookAt(valley);
    c.cue(0.3, 'story:memory');
    // the dancers clap: little golden sparks
    c.add({ update: () => {
      const b = Math.floor(c.wt / c.spb);
      if (b !== (fest as unknown as { _b?: number })._b) {
        (fest as unknown as { _b?: number })._b = b;
        if (b % 2 === 0) for (const d of fest.dancers.slice(0, 5)) if (Math.random() < 0.6) c.view.fx.burst(d.group.position.clone().setY(d.group.position.y + 0.9), '#ffd36b', 5, 1.4, 0.12, 0.5);
      }
    } }, null);
    c.shot(0, 4.6, { pos: [c.R(() => valley, 6, 2, 7), c.R(() => valley, 4.6, 1.8, 6)], look: () => valley.clone().setY(valley.y + 0.8), fov: 38 });
    // it comes closer and claps: nothing; again, harder: nothing
    const near = valley.clone().lerp(kidAt, 0.45);
    c.during(4.6, 7, (k) => kid.group.position.lerpVectors(kidAt, near, ease.sine(k)));
    c.shot(4.6, 8, { pos: [() => kidAt.clone().lerp(near, 0.5).add(tmp.set(2.4, 1.2, -2.6)), c.R(() => near, 2.0, 1.0, -2.2)], look: () => kid.group.position.clone().setY(kid.group.position.y + 0.8), fov: 34 });
    for (let i = 0; i < 4; i++) {
      c.at(8.4 + i * 0.6, () => {
        kid.pose = i % 2 ? 'small' : 'reach';
        c.view.fx.burst(kid.group.position.clone().setY(kid.group.position.y + 0.9), '#6a6478', 6, 0.8, 0.2, 0.6, false, 0.5);
      });
    }
    c.shot(8, 11.4, { pos: [c.R(() => near, 1.9, 0.9, -1.3), c.R(() => near, 1.6, 0.85, -1.1)], look: () => near.clone().setY(near.y + 0.8), fov: 30 });
    // the festival goes on; it lowers its hands and walks away into the dunes
    const away = c.roadPoint(c.s0 - 30, -30, 0);
    c.at(11.6, () => (kid.pose = 'small'));
    c.during(12.4, 19, (k) => {
      kid.group.position.lerpVectors(near, away, k);
      kid.group.position.y = c.view.land.heightAt(kid.group.position.x, kid.group.position.z);
      kid.lookAt(away);
    });
    c.shot(11.4, 19, { pos: [c.R(() => valley, -3, 2.6, -4), c.R(() => valley, -4, 3.4, -5)], look: () => kid.group.position.clone().setY(kid.group.position.y + 0.8), fov: 40 });
    c.end(19);
  }),

  // ── Peaks ──
  // the Coralitos frozen on a branch; Trompa's horn wakes them; they sing (off-key, then right)
  i1: (app) => {
    audio.setAmbience('ice', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('i1', 'ice', { bars: 70, s0: 16, seed: 39, features: [{ kind: 'forest', from: 0, to: 140, side: -1 }, { kind: 'hills', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(3.4, 0, 1.8);
      const sStop = c.sAt(8);
      const treeAt = c.roadPoint(sStop + 2, -10, 0);
      const tree = snowyBranch();
      tree.position.copy(treeAt);
      tree.lookAt(v.turtle.group.position.x, treeAt.y, v.turtle.group.position.z);
      c.place(tree);
      const perch = tree.localToWorld(new THREE.Vector3(0, 4.15, 1.1));
      const chicks = c.musician('choir', perch, { frozen: 1, pose: 'idle' });
      chicks.holder.lookAt(v.turtle.group.position.x, perch.y, v.turtle.group.position.z);
      const iceCap = new IceBlock(1.6, 1.3, 1.0, '#e6f6ff');
      iceCap.group.position.copy(perch).setY(perch.y - 0.05);
      iceCap.group.quaternion.copy(chicks.holder.quaternion);
      c.add(iceCap);
      c.cue(0.2, 'story:frozen');
      c.shot(0, 4.4, { pos: [c.R(() => treeAt, -8, 3, -7), c.R(() => treeAt, -6.6, 3.4, -5.6)], look: () => perch.clone(), fov: 42 });
      c.placeName(0.8, 4.0, placeOf('i2', lang));
      c.shot(4.4, 7.2, { pos: [c.R(() => perch, 1.8, 0.5, -2.2), c.R(() => perch, 1.5, 0.4, -1.8)], look: () => perch.clone().setY(perch.y + 0.6), fov: 32 });
      // Trompa blows a warm long note
      c.cue(7.2, 'story:wake');
      const horn = c.band.get('horn')!;
      c.at(7.4, () => c.play(['horn']));
      c.shot(7.2, 9.6, { pos: [c.R(horn, 1.8, 1.3, 1.6), c.R(horn, 1.5, 1.2, 1.3)], look: c.mix(c.R(horn, 0, 0.8, 0), () => perch, 0.3), fov: 38 });
      serenade(c, 7.6, 2, ['horn'], () => perch.clone().setY(perch.y + 0.6), 14);
      c.during(8.6, 10.6, (k) => {
        iceCap.crack = k;
        iceCap.heat = k * 0.4;
      });
      c.at(10.6, () => {
        c.debrisOf(iceCap.shatter(perch.clone().setY(perch.y - 0.1)));
        v.fx.burst(perch.clone().setY(perch.y + 0.4), '#ffffff', 50, 4, 0.3, 1.2, false, 3);
      });
      c.during(10.6, 11.6, (k) => (chicks.view as MusicianView).setFrozen(1 - k));
      c.colourCircle(10.6, 2.4, () => perch, 0.5, 7, 1.12);
      c.shot(9.6, 12.2, { pos: [c.R(() => perch, 2.2, 0.4, -2.4), c.R(() => perch, 1.9, 0.5, -2.1)], look: () => perch.clone().setY(perch.y + 0.6), fov: 34 });
      // the first song… is off-key! the Maestro winces; they try again
      c.at(12.2, () => {
        audio.cinematic('story:comic');
        (chicks.view as MusicianView).pose = 'play';
        chicks.roll = 0.3;
        v.fx.burst(perch.clone().setY(perch.y + 1.2), '#ff7aa8', 12, 2, 0.14, 0.6);
      });
      c.at(12.6, () => c.mpose('sad'));
      c.shot(12.2, 14.2, { pos: [c.R(c.maestro, -1.0, 0.9, -1.7), c.R(c.maestro, -0.9, 0.9, -1.5)], look: c.R(c.maestro, 0, 0.7, 0), fov: 30 });
      c.at(14.2, () => {
        chicks.roll = 0;
        c.mpose('conduct');
      });
      joinBand(c, chicks, 'choir', 14.4, 1.4, 5);
      c.shot(14.2, 18.6, { pos: [c.R(() => perch, 4.6, 1.2, -4.2), c.T(-12, 6, -6)], look: [() => perch.clone().setY(perch.y + 0.6), c.T(0, 5, -3)], fov: 40 });
      c.walk(17.6, 1, 1.4);
      c.end(18.6);
    });
  },
  // Mirror Lake: the Maestro sees his reflection… and behind him, the Silence; he turns: nothing
  i2: (app) => {
    audio.setAmbience('ice', 0.4);
    const lang = app.screens.lang;
    return runScene(app, setFor('i2', 'ice', { look: look('ice', 'dusk'), bars: 70, s0: 18, seed: 41, features: [{ kind: 'meadow', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(2.8, 0, 1.6);
      const sStop = c.sAt(7);
      // a frozen pond just beside the colossus' left
      const pondAt = c.roadPoint(sStop, -12.5, 0);
      let maxY = -1e9;
      for (let a = 0; a < 12; a++) for (const r of [0, 3, 6, 8]) maxY = Math.max(maxY, v.land.heightAt(pondAt.x + Math.cos(a) * r, pondAt.z + Math.sin(a) * r));
      const pond = new MirrorPond(8.5, 512);
      pond.group.position.set(pondAt.x, maxY + 0.05, pondAt.z);
      c.place(pond.group);
      c.onDispose(() => pond.dispose());
      c.add({ update: () => {} }, null);
      // the Silence exists only in the reflection, behind the Maestro
      const ghost = c.silence(7, new THREE.Vector3());
      ghost.pose = 'loom';
      // a wrapper only the mirror's render shows (whatever the Silence does with its own visibility)
      const ghostWrap = new THREE.Group();
      v.scene.add(ghostWrap);
      ghostWrap.add(ghost.group);
      ghostWrap.visible = false;
      pond.ghosts.push(ghostWrap);
      c.add({ update: () => {
        const back = v.turtle.group.localToWorld(new THREE.Vector3(1.5, 0, 3.5));
        ghost.group.position.set(back.x, maxY, back.z);
        ghost.lookAt(pond.group.position);
      } }, null);
      c.cue(0.2, 'story:wonder');
      c.shot(0, 4.4, { pos: [c.T(-24, 6, 2), c.T(-22, 5, -2)], look: [() => pond.group.position.clone(), c.T(-6, 2, -1)], fov: 40 });
      c.placeName(0.8, 4.0, placeOf('i3', lang));
      // the Maestro walks to the edge of the shell and peers down
      c.at(4.2, () => c.mpose('idle'));
      const edge = seatPos(-3.1, -0.4, 0.02);
      c.move(c.maestro, 4.4, 1.8, () => v.turtle.shell.localToWorld(edge.clone()), { local: true, hops: 3, hopH: 0.06 });
      c.turn(c.maestro, 4.4, 0.6, -Math.PI / 2);
      c.at(6.2, () => (c.maestro.tilt = 0.35));
      c.shot(4.4, 7, { pos: [c.Sh(-1.2, 6.8, -3.6), c.Sh(-1.6, 6.6, -3.2)], look: c.R(c.maestro, 0, 0.6, 0), fov: 36 });
      // in the ice: his face… and behind him, the mask
      c.cue(7.6, 'story:threat');
      const mirrorEye = () => pond.group.position.clone().add(tmp.set(0, 0.2, 0));
      // where the Maestro's reflection is (mirrored below the ice)
      const mirrored = () => {
        const m = c.maestro.world(new THREE.Vector3()).add(tmp.set(0, 1.0, 0));
        m.y = 2 * pond.group.position.y - m.y;
        return m;
      };
      c.shot(7, 10.4, { pos: [() => c.maestro.world(new THREE.Vector3()).lerp(mirrorEye(), 0.55).add(tmp.set(0, 0.6, 0)), () => c.maestro.world(new THREE.Vector3()).lerp(mirrorEye(), 0.6).add(tmp.set(0, 0.5, 0))], look: () => mirrored(), fov: [34, 28] });
      c.at(8.6, () => {
        c.maestro.tremble = 1;
        c.mpose('sad');
      });
      // he whirls round: nothing
      c.at(10.4, () => {
        c.maestro.tremble = 0;
        c.maestro.tilt = 0;
        c.maestro.holder.rotation.y = Math.PI / 2;
        c.shake(0.15);
      });
      c.shot(10.4, 12.6, { pos: [c.R(c.maestro, -1.4, 1.0, -0.8), c.R(c.maestro, -1.2, 1.0, -0.9)], look: c.R(c.maestro, 0.6, 1.4, 2), fov: 40 });
      c.at(11.2, () => (c.turtleLook = () => c.maestro.world(new THREE.Vector3())));
      // back to the ice: only him now
      c.at(12.6, () => (pond.ghosts.length = 0));
      c.at(12.6, () => (c.maestro.holder.rotation.y = -Math.PI / 2));
      c.shot(12.6, 15.2, { pos: [() => c.maestro.world(new THREE.Vector3()).lerp(mirrorEye(), 0.6).add(tmp.set(0, 0.5, 0))], look: () => mirrored(), fov: 30 });
      c.end(15.2);
    });
  },
  // the Moth Queen spreads grey dust over the aurora; the Organ goes dark
  i3: (app) => {
    audio.setAmbience('ice', 0.3);
    const lang = app.screens.lang;
    return runScene(app, setFor('i3', 'ice', { look: look('ice', 'night'), bars: 70, s0: 22, seed: 43, life: 0.3, colorScale: 0.6, features: [{ kind: 'hills', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      v.landmark.setCorrupt(0.6);
      v.landmark.setAwake(0.5);
      c.walk(0, 0.6);
      c.walk(4, 0, 1.4);
      c.sky(0, 0.01, { aurora: 1.6 });
      const from = c.roadPoint(c.s0 + 40, 60, 40), to = c.roadPoint(c.s0 + 30, -70, 30);
      const moth = c.creature('bossMoth', 9, from, Math.atan2(to.x - from.x, to.z - from.z));
      const dust = c.add(new Fall(['#9a96a8', '#d0ccd8'], 700, 40, 40, 40, 1.6), null);
      v.scene.add(dust.points);
      dust.alpha = 0;
      c.during(3, 12, (k) => {
        moth.pos.lerpVectors(from, to, ease.sine(k));
        moth.yaw = Math.atan2(to.x - from.x, to.z - from.z);
        dust.points.position.copy(moth.pos).setY(v.turtle.group.position.y - 4);
        if (Math.random() < 0.6) v.fx.burst(moth.pos.clone().add(tmp.set(0, -2, 0)), '#bdb8cc', 8, 2, 0.8, 2.2, false, 1.5);
      });
      c.during(4, 9, (k) => (dust.alpha = k * 0.8));
      c.cue(0.2, 'story:wonder');
      c.shot(0, 3.6, { pos: [c.T(-10, 3, 12), c.T(-9, 3.4, 11)], look: [c.T(0, 30, -40), c.T(0, 34, -40)], fov: 50 });
      c.placeName(0.8, 3.4, placeOf('i4', lang));
      c.cue(3.6, 'story:threat');
      c.shot(3.6, 8.4, { pos: [c.T(4, 2.4, 6), c.T(3, 3, 5)], look: [() => moth.pos.clone(), () => moth.pos.clone()], fov: [40, 46] });
      c.sky(5, 6, { aurora: 0, stars: 0.4 });
      c.during(5, 11, (k) => v.landmark.setAwake(0.5 * (1 - k)));
      c.at(5.4, () => {
        c.pose('all', 'scared');
        for (const k of c.band.keys()) c.shiver(c.band.get(k)!, 5.4, 13, 0.5);
      });
      c.shot(8.4, 13, { pos: [c.Sh(2.4, 6.4, -4.6), c.Sh(1.8, 6.6, -4.2)], look: [c.Sh(0, 7.4, -1), c.Sh(0, 14, -12)], fov: 42 });
      c.end(13);
    });
  },
  // the Moth Queen's wings take the aurora's colours; the third shard; the Crystal Organ sings, the aurora returns
  i4: (app) => guardianScene(app, 'ice', 'i4', {
    time: 'night',
    guardian: (c, spot) => {
      const grey = c.creature('bossMoth', 7, spot, 0);
      const moth = c.add(new AuroraMoth(11));
      moth.aurora = 0;
      moth.group.visible = false;
      const hover = spot.clone().setY(spot.y + 8);
      c.add({ update: () => {
        grey.pos.copy(spot);
        moth.group.position.copy(hover).add(tmp.set(0, Math.sin(c.wt * 1.5) * 0.6, 0));
        moth.faceTo(c.view.turtle.group.position.x, c.view.turtle.group.position.z);
      } }, null);
      c.at(1.4, () => {
        grey.visible = false;
        moth.group.visible = true;
      });
      c.during(1.4, 4, (k) => (moth.aurora = ease.inOut(k)));
      // she rises into the restored aurora and drifts away
      const hover0 = hover.clone();
      c.during(10, 20, (k) => hover.copy(hover0).add(tmp.set(0, ease.in(k) * 30, 0)).add(new THREE.Vector3(0, 0, -ease.in(k) * 40).applyQuaternion(c.view.turtle.group.quaternion)));
      c.sky(9, 4, { aurora: 1.4 });
    },
  }),
  // memory 3: alone on the ice, it gathers broken notes and swallows them; its mask cracks for the first time
  ix: (app) => memoryScene(app, 'ice', 'ix', (c) => {
    const at = c.roadPoint(c.s0, -4, 0);
    const kid = c.silence(0.42, at);
    kid.pose = 'small';
    c.cue(0.3, 'story:memory');
    const shards: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const p = at.clone().add(tmp.set(Math.cos(a) * (1.4 + (i % 3) * 0.6), 0.08, Math.sin(a) * (1.4 + (i % 3) * 0.6)));
      p.y = c.view.land.heightAt(p.x, p.z) + 0.08;
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: '#9a96a8', emissive: new THREE.Color('#5a5470'), emissiveIntensity: 0.6, roughness: 0.3 }));
      m.position.copy(p);
      m.rotation.set(i, i * 2, 0);
      c.place(m);
      shards.push(m);
    }
    const head = () => kid.group.position.clone().add(tmp.set(0, 0.42 * 2.8, 0));
    c.shot(0, 5, { pos: [c.R(() => at, -7, 3.4, -6), c.R(() => at, -5.6, 2.6, -4.8)], look: () => at.clone().setY(at.y + 0.6), fov: 40 });
    // it picks the pieces up one by one…
    shards.forEach((m, i) => {
      const t0 = 5 + i * 0.65;
      c.at(t0, () => {
        kid.pose = 'reach';
        kid.lookAt(m.position);
      });
      c.during(t0 + 0.2, t0 + 0.6, (k) => m.position.lerp(head(), k * 0.5));
      c.at(t0 + 0.6, () => {
        m.visible = false;
        kid.pose = 'small';
        c.view.fx.burst(head(), '#8a86a0', 6, 0.6, 0.12, 0.5);
      });
    });
    c.shot(5, 11, { pos: [c.R(() => at, 2.4, 1.0, -2.2), c.R(() => at, 2.0, 0.9, -1.8)], look: () => at.clone().setY(at.y + 0.7), fov: 34 });
    // …and the mask cracks for the first time
    c.at(11.6, () => {
      c.view.fx.flash(head(), 0.8, '#ffffff', 0.3);
      c.view.fx.burst(head(), '#ffffff', 20, 1.2, 0.08, 0.6);
      c.shake(0.2);
    });
    const crack = glowSprite('#ffffff', 0.5, 0);
    c.place(crack);
    c.during(11.6, 16, (k) => {
      crack.position.copy(head()).add(tmp.set(0.05, 0.05, 0.12));
      (crack.material as THREE.SpriteMaterial).opacity = (1 - k) * 0.9;
    });
    c.shot(11, 16, { pos: [c.R(() => head(), 0.9, 0.1, -1.2), c.R(() => head(), 0.75, 0.05, -1.0)], look: () => head(), fov: 28 });
    c.end(16);
  }),

  // ── Forge ──
  // a bridge over rivers of lava; the Golem's hammer blows shake the ground
  f1: (app) => {
    audio.setAmbience('forge', 0.6);
    const lang = app.screens.lang;
    return runScene(app, setFor('f1', 'forge', { bars: 70, s0: 21, seed: 57, curviness: 0.2, features: [{ kind: 'river', from: 26, to: 34 }, { kind: 'hills', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const sB = 30;
      const at = c.roadPoint(sB, 0, 0);
      const bankY = Math.max(c.roadPoint(sB - 13, 0, 0).y, c.roadPoint(sB + 13, 0, 0).y);
      const bridge = new LavaBridge(26, 12, 0);
      bridge.group.position.set(at.x, bankY, at.z);
      bridge.group.rotation.y = c.roadYaw(sB);
      c.place(bridge.group);
      bridge.group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(bridge.group.matrixWorld).invert();
      // INTEGRATION: no JourneyView hook raises the ground, so this scene's own view gets a heightAt that
      // includes the set piece (the colossus' body and feet then walk on it).
      const orig = v.land.heightAt;
      v.land.heightAt = (x: number, z: number) => {
        const l = tmp.set(x, 0, z).applyMatrix4(inv);
        const h = bridge.localHeight(l.x, l.z);
        return h === null ? orig(x, z) : Math.max(orig(x, z), bankY + h);
      };
      c.walk(0, 1);
      // far off, the Golem hammers on an anvil: each blow shakes the land
      const golemAt = c.roadPoint(c.s0 + 120, 40, 0);
      const golem = c.creature('bossGolem', 7, golemAt, 0);
      c.add({ update: () => (golem.yaw = Math.atan2(v.turtle.group.position.x - golemAt.x, v.turtle.group.position.z - golemAt.z)) }, null);
      c.cue(0.2, 'story:journey');
      c.placeName(0.8, 4.4, placeOf('f2', lang));
      for (let i = 0; i < 9; i++) {
        const t = 2 + i * 1.5;
        c.at(t, () => {
          c.shake(0.35);
          v.fx.flash(golemAt.clone().setY(golemAt.y + 14), 10, '#ffb070', 0.3);
          v.fx.burst(golemAt.clone().setY(golemAt.y + 12), '#ffb347', 30, 9, 0.6, 1.2, true, 4);
          for (const k of c.band.keys()) c.hop(c.band.get(k)!, c.t + Math.random() * 0.1, 0.3, 0.3);
          const lava = c.roadPoint(sB + (Math.random() - 0.5) * 10, (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 4), 0);
          v.fx.burst(lava.setY(bankY - 0.8), '#ff7a2a', 16, 5, 0.25, 0.9, true, 9);
        });
      }
      c.shot(0, 5, { pos: [c.R(() => at, -18, 2, 6), c.R(() => at, -17, 2.4, 3)], look: c.T(0, 3, -2), fov: 44 });
      c.shot(5, 9.6, { pos: [c.Sh(-2.6, 6.6, 3.4), c.Sh(-2.2, 6.8, 2.6)], look: () => golemAt.clone().setY(golemAt.y + 12), fov: 38 });
      c.shot(9.6, 15, { pos: [c.R(() => at, 14, 1, -14), c.R(() => at, 13, 1.4, -12)], look: c.T(0, 3, 0), fov: 44 });
      c.end(15);
    });
  },
  // the Anvil: the Forge Carillon silent; in the smoke, the Golem holding the shard
  f2: (app) => {
    audio.setAmbience('forge', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('f2', 'forge', { look: look('forge', 'dusk'), bars: 60, s0: 60 * 4 * 0.42 - 34, seed: 59, features: [{ kind: 'hills', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 0.6);
      c.walk(3, 0, 1.4);
      const lm = v.landmark.group.position;
      const anvilAt = c.roadPoint(c.s0 + 26, 12, 0);
      const anvil = giantAnvil(1.4);
      anvil.position.copy(anvilAt);
      c.place(anvil);
      const golemAt = c.roadPoint(c.s0 + 30, -6, 0);
      const golem = c.creature('bossGolem', 6, golemAt, 0);
      c.add({ update: () => (golem.yaw = Math.atan2(v.turtle.group.position.x - golemAt.x, v.turtle.group.position.z - golemAt.z)) }, null);
      const shard = glowSprite(SHARD_COLORS[3], 3, 1);
      c.place(shard);
      c.add({ update: () => shard.position.copy(golemAt).add(tmp.set(0, 6 * 0.95, 0)).addScaledVector(new THREE.Vector3(Math.sin(golem.yaw), 0, Math.cos(golem.yaw)), 1.6 * 6 * 0.25) }, null);
      c.fog(0, 0.01, '#3a1a12', 0.03);
      c.fog(3, 8, undefined, 0.012);
      c.cue(0.2, 'story:dread');
      c.shot(0, 5, { pos: [c.T(-8, 4, 6), c.T(-6, 4.6, 3)], look: [() => lm.clone().setY(lm.y + 12), () => lm.clone().setY(lm.y + 14)], fov: 40 });
      c.placeName(0.8, 4.4, placeOf('f3', lang));
      c.shot(5, 9.6, { pos: [c.R(() => anvilAt, -8, 3, -8), c.R(() => anvilAt, -7, 3.4, -6)], look: () => anvilAt.clone().setY(anvilAt.y + 5), fov: 40 });
      c.cue(9.6, 'story:threat');
      c.shot(9.6, 14, { pos: [c.T(1.0, 7.1, -1.9), c.T(0.9, 7.3, -2.3)], look: () => golemAt.clone().setY(golemAt.y + 6), fov: [22, 16] });
      c.end(14);
    });
  },
  // the Golem wakes; its plates of ink glow
  f3: (app) => {
    audio.setAmbience('forge', 0.6);
    const lang = app.screens.lang;
    return runScene(app, setFor('f3', 'forge', { look: look('forge', 'night'), bars: 60, s0: 60 * 4 * 0.42 - 30, seed: 61, features: [{ kind: 'hills', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      const golemAt = c.roadPoint(c.s0 + 24, 0, 0);
      const golem = c.creature('bossGolem', 7, golemAt, 0);
      golem.lift = -2.5;
      c.add({ update: () => (golem.yaw = Math.atan2(v.turtle.group.position.x - golemAt.x, v.turtle.group.position.z - golemAt.z)) }, null);
      const eyes = glowSprite('#ff5a1a', 6, 0);
      c.place(eyes);
      c.add({ update: () => eyes.position.copy(golem.view.group.position).add(tmp.set(0, 7 * 1.25, 0)) }, null);
      c.cue(0.2, 'story:dread');
      c.shot(0, 4.4, { pos: [c.T(-6, 3, 4), c.T(-5, 3.4, 2)], look: () => golemAt.clone().setY(golemAt.y + 4), fov: 40 });
      c.placeName(0.8, 4, placeOf('f4', lang));
      c.cue(4.4, 'story:threat');
      c.during(4.6, 6, (k) => ((eyes.material as THREE.SpriteMaterial).opacity = k));
      c.during(6, 8.4, (k) => {
        golem.lift = -2.5 + 2.5 * ease.outBack(k);
        c.shake(0.2);
      });
      c.at(8.4, () => {
        c.shake(0.9);
        v.fx.ring(golemAt.clone().setY(golemAt.y + 0.4), 26, '#ff7a2a', 1.2, 0.08);
        v.fx.dust(golemAt.clone().setY(golemAt.y + 0.5), '#5a4a42', 90);
        c.pose('all', 'scared');
      });
      c.shot(4.4, 8.4, { pos: [() => golemAt.clone().add(new THREE.Vector3(-5, 1.2, -9).applyAxisAngle(new THREE.Vector3(0, 1, 0), golem.yaw)), () => golemAt.clone().add(new THREE.Vector3(-4, 1.0, -7.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), golem.yaw))], look: () => golemAt.clone().setY(golemAt.y + 7), fov: 46 });
      c.shot(8.4, 12, { pos: [c.Sh(2.6, 6.2, -5), c.Sh(2.2, 6.4, -4.6)], look: c.mix(c.Sh(0, 6, -1), () => golemAt.clone().setY(golemAt.y + 8), 0.5), fov: 42, shake: 0.1 });
      c.end(12);
    });
  },
  // the plates fall: a gentle blacksmith; the fourth shard; the Carillon rings; a road of light to the Citadel
  f4: (app) => guardianScene(app, 'forge', 'f4', {
    guardian: (c, spot) => {
      const g = c.creature('bossGolem', 6, spot, 0);
      c.add({ update: () => (g.yaw = Math.atan2(c.view.turtle.group.position.x - spot.x, c.view.turtle.group.position.z - spot.z)) }, null);
      const smith = c.add(new GentleGolem());
      smith.group.position.copy(spot);
      smith.group.scale.setScalar(1.6);
      smith.group.visible = false;
      c.add({ update: () => smith.group.lookAt(c.view.turtle.group.position.x, smith.group.position.y, c.view.turtle.group.position.z) }, null);
      for (let i = 0; i < 6; i++) {
        c.at(0.4 + i * 0.3, () => {
          const plate = g.view.dropPlate();
          if (plate) {
            const wp = new THREE.Vector3();
            plate.getWorldPosition(wp);
            plate.removeFromParent();
            plate.scale.multiplyScalar(6);
            c.view.fx.drop(plate, wp);
          }
          c.shake(0.2);
        });
      }
      c.at(2.4, () => {
        g.visible = false;
        smith.group.visible = true;
        c.view.fx.flash(spot.clone().setY(spot.y + 5), 8, '#ffd27a', 0.5);
        c.view.fx.burst(spot.clone().setY(spot.y + 5), '#1d1a2b', 80, 7, 0.5, 1.2, false, 4);
      });
      c.at(9.6, () => (smith.pose = 'strike'));
      c.at(12, () => (smith.pose = 'wave'));
    },
    extra: (c) => {
      const lm = c.view.landmark;
      const from = lm.top(new THREE.Vector3());
      const to = c.roadPoint(c.s0 + 600, -80, 160);
      const path = skyPath(from, to, '#ffe9a8', 0.18);
      path.mat.uniforms.uGrow.value = 0;
      c.view.scene.add(path.mesh);
      c.add({ update: (_dt: number, t: number) => path.update(t) }, null);
      c.during(12.5, 16, (k) => (path.mat.uniforms.uGrow.value = ease.inOut(k)));
    },
  }),
  // memory 4: grown huge with swallowed sounds, the figure becomes the Silence; five staff lines break round its head
  fx: (app) => memoryScene(app, 'forge', 'fx', (c) => {
    const at = c.roadPoint(c.s0 + 10, 0, 0);
    const kid = c.silence(0.6, at);
    kid.pose = 'small';
    kid.lookAt(c.roadPoint(c.s0 - 20, 0, 0));
    let size = 0.6;
    c.add({ update: () => kid.group.scale.setScalar(size) }, null);
    c.cue(0.3, 'story:memory');
    const stream = c.add(new NoteStream(() => kid.group.position.clone().add(tmp.set(0, size * 2.2, 0))), null);
    c.view.scene.add(stream.group);
    c.at(1, () => {
      for (let i = 0; i < 120; i++) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 40;
        const p = at.clone().add(tmp.set(Math.cos(a) * r, 0, Math.sin(a) * r));
        p.y = c.view.land.heightAt(p.x, p.z) + Math.random() * 6;
        stream.add(p, c.wt + Math.random() * 9, 1.6 + Math.random(), i % 2 ? '#ffd36b' : '#ff9a5a', 0.5, 6);
      }
    });
    c.during(2, 11, (k) => (size = 0.6 + Math.pow(k, 2.2) * 24));
    c.during(2, 11, () => c.shake(0.08));
    const crown = c.add(new StaffCrown(1.4));
    c.add({ update: () => {
      crown.group.position.copy(kid.group.position).add(tmp.set(0, size * 3.1, 0));
      crown.group.scale.setScalar(size);
    } }, null);
    c.at(10.6, () => {
      kid.pose = 'loom';
      c.shake(0.8);
    });
    c.during(11, 13, (k) => (crown.snap = ease.out(k)));
    c.shot(0, 4, { pos: [c.R(() => at, -3, 1.4, 5), c.R(() => at, -2.6, 1.2, 4.4)], look: () => at.clone().setY(at.y + 1), fov: 36 });
    c.shot(4, 10, { pos: [c.R(() => at, -10, 3, 16), c.R(() => at, -24, 6, 36)], look: () => kid.group.position.clone().setY(at.y + size * 1.8), fov: 44 });
    c.shot(10, 16, { pos: [c.R(() => at, -24, 4, 40), c.R(() => at, -28, 3, 46)], look: () => kid.group.position.clone().setY(at.y + size * 2.6), fov: [44, 48] });
    c.end(16);
  }),

  // ── Citadel ──
  // Hollow Echoes: shadows of your own band copy the musicians, in silence
  c1: (app) => {
    audio.setAmbience('citadel', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('c1', 'citadel', { bars: 70, s0: 20, seed: 63, features: [{ kind: 'ruins', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      corruptVoice(c);
      c.walk(0, 1);
      c.walk(3, 0, 1.6);
      const sStop = c.sAt(7);
      const kinds = FULL_BAND;
      const shades: Actor[] = [];
      kinds.forEach((k, i) => {
        const side = i % 2 ? 1 : -1;
        const p = c.roadPoint(sStop + 4 + Math.floor(i / 2) * 4.2, side * 9, 0);
        const a = c.musician(k, p);
        shadowify(a.holder);
        a.holder.lookAt(v.turtle.group.position.x, p.y, v.turtle.group.position.z);
        shades.push(a);
      });
      c.cue(0.2, 'story:dread');
      c.shot(0, 4.6, { pos: [c.T(0, 9, 10), c.T(0, 8, 6)], look: c.T(0, 2, -16), fov: 44 });
      c.placeName(0.8, 4.2, placeOf('c2', lang));
      // the band plays a bar… the shadows copy every move, without a sound
      c.at(5, () => {
        c.play('all');
        shades.forEach((s) => {
          s.pattern = PATTERN_SILENT[(s.view as MusicianView).kind] ?? 'x...x...';
          (s.view as MusicianView).pose = 'play';
        });
      });
      c.shot(4.6, 8.4, { pos: [c.T(-6, 3, -10), c.T(-5, 3.2, -12)], look: c.T(0, 2.6, -16), fov: 40 });
      // they stop; the shadows stop. Bumbo waves… so does his shadow
      c.at(8.4, () => {
        c.play('all', false);
        shades.forEach((s) => {
          s.pattern = null;
          (s.view as MusicianView).pose = 'idle';
        });
      });
      const bumbo = c.band.get('drum')!;
      const shade = shades[1];
      c.at(9.6, () => ((bumbo.view as MusicianView).pose = 'wave'));
      c.at(10.0, () => ((shade.view as MusicianView).pose = 'wave'));
      c.shot(8.4, 11.6, { pos: [c.R(bumbo, 1.6, 1.0, -1.2), c.R(bumbo, 1.4, 1.0, -1.0)], look: c.mix(c.R(bumbo, 0, 0.8, 0), () => shade.world(new THREE.Vector3()), 0.6), fov: 34 });
      c.cue(11.6, 'story:threat');
      c.at(11.8, () => {
        (bumbo.view as MusicianView).pose = 'scared';
        c.shiver(bumbo, 11.8, 14, 0.8);
      });
      c.shot(11.6, 14.4, { pos: [c.R(shade, -1.6, 1.0, 2.4), c.R(shade, -1.3, 0.9, 2.0)], look: c.R(shade, 0, 0.7, 0), fov: 32 });
      c.end(14.4);
    });
  },
  // from the top of the Needle, the Silence's mask turns slowly toward the colossus
  c2: (app) => {
    audio.setAmbience('citadel', 0.5);
    const lang = app.screens.lang;
    return runScene(app, setFor('c2', 'citadel', { look: look('citadel', 'dusk'), bars: 60, s0: 60 * 4 * 0.42 - 40, seed: 67, features: [{ kind: 'ruins', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      c.walk(0, 0.8);
      c.walk(3, 0, 1.4);
      const lm = v.landmark.group;
      const top = lm.localToWorld(new THREE.Vector3(0, 33.4, 0));
      const sil = c.silence(1.6, top);
      sil.pose = 'loom';
      const away = lm.localToWorld(new THREE.Vector3(0, 33.4, -50));
      let k0 = 0;
      c.add({ update: () => sil.lookAt(away.clone().lerp(v.turtle.group.position, k0)) }, null);
      c.cue(0.2, 'story:dread');
      c.shot(0, 4.4, { pos: [c.T(-12, 2, 10), c.T(-11, 2.4, 8)], look: [() => lm.position.clone().setY(lm.position.y + 20), () => lm.position.clone().setY(lm.position.y + 30)], fov: 40 });
      c.placeName(0.8, 4, placeOf('c3', lang));
      c.cue(4.4, 'story:threat');
      c.during(5, 9.4, (k) => (k0 = ease.inOut(k)));
      c.shot(4.4, 10, { pos: [c.T(1.0, 7.2, -1.9), c.T(1.0, 7.3, -2.2)], look: c.R(() => top, 0, 1.6 * 2.5, 0), fov: [9, 6.5] });
      c.shot(10, 13, { pos: [c.R(c.maestro, -0.8, 0.9, -1.6), c.R(c.maestro, -0.7, 0.85, -1.4)], look: c.R(c.maestro, 0, 0.7, 0), fov: 30 });
      c.at(10.2, () => {
        c.mpose('sad');
        c.maestro.tremble = 0.6;
      });
      c.at(11.6, () => {
        c.maestro.tremble = 0;
        c.mpose('raise');
      });
      c.end(13);
    });
  },
  // the Silence comes down from the Needle: the final battle begins
  c3: (app) => {
    audio.setAmbience('citadel', 0.6);
    const lang = app.screens.lang;
    return runScene(app, setFor('c3', 'citadel', { look: look('citadel', 'night'), bars: 60, s0: 60 * 4 * 0.42 - 44, seed: 69, features: [{ kind: 'ruins', from: 0, to: 140 }] }), (c) => {
      const v = c.view;
      const lm = v.landmark.group;
      const from = lm.localToWorld(new THREE.Vector3(0, 33.4, 0));
      const land = c.roadPoint(c.s0 + 40, 0, 0);
      const sil = c.silence(4, from);
      sil.pose = 'loom';
      let scale = 4;
      c.add({ update: () => {
        sil.group.scale.setScalar(scale);
        sil.lookAt(v.turtle.group.position);
      } }, null);
      c.cue(0.2, 'story:dread');
      c.shot(0, 3.6, { pos: [c.T(-6, 2, 8), c.T(-5, 2.2, 6)], look: () => from.clone().setY(from.y + 6), fov: 36 });
      c.placeName(0.6, 3.4, placeOf('c4', lang));
      c.cue(3.6, 'story:threat');
      c.during(3.6, 9, (k) => {
        const e = ease.inOut(k);
        sil.group.position.lerpVectors(from, land, e);
        scale = 4 + e * 14;
        if (Math.random() < 0.5) v.fx.burst(sil.group.position.clone().add(tmp.set(0, scale * 1.2, 0)), '#1d1a2b', 8, 4, 1, 1.6, false, -0.4);
      });
      c.shot(3.6, 9, { pos: [c.T(-10, 3, 6), c.T(-14, 4, 10)], look: () => sil.group.position.clone().add(tmp.set(0, scale * 1.4, 0)), fov: [40, 50] });
      c.at(9, () => {
        c.shake(1);
        v.fx.ring(land.clone().setY(land.y + 0.3), 40, '#8f8aa8', 1.4, 0.06);
        v.fx.dust(land.clone().setY(land.y + 0.5), '#8a8694', 80);
      });
      // the band stands ready; the Maestro lifts his baton
      c.at(9.2, () => {
        c.play('all');
        c.mpose('raise');
        v.turtle.cheer();
      });
      c.shot(9, 13.4, { pos: [c.Sh(0.4, 6.4, -5.6), c.Sh(0.2, 6.1, -4.6)], look: c.Sh(0, 6.4, -1.2), fov: 36 });
      c.flash(13.1, '#ffffff', 0.7, 0.5);
      c.end(13.4);
    });
  },
};

const PATTERN_SILENT: Partial<Record<TowerKind, string>> = { drum: 'x...x.x.', harp: 'x.xxx.xx', bell: 'x.......', horn: 'x...x...' };

// ───────────────────────────── guardian scenes ─────────────────────────────

/**
 * After a land's guardian: it is freed, its shard flies home, the great Voice rings and colour floods the
 * land; at dusk the colossus sets off for the next land.
 */
function guardianScene(app: App, world: WorldId, id: string, o: { time?: Time; guardian: (c: Cine, spot: THREE.Vector3) => void; extra?: (c: Cine) => void }) {
  audio.setAmbience(world, 0.5);
  const bars = 60;
  const L = bars * 4 * 0.42;
  return runScene(app, setFor(id, world, { look: look(world, o.time ?? 'gold'), bars, s0: L - 30, seed: 71 + WORLD_INDEX[world], life: 0.25, colorScale: 0.7, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'hills', from: 20, to: 140 }] }), (c) => {
    const v = c.view;
    corruptVoice(c, 0.75);
    const spot = c.roadPoint(c.s0 + 15, 3, 0);
    o.guardian(c, spot);
    o.extra?.(c);
    c.mpose('conduct');
    c.play('all');
    c.cue(0.2, 'story:wake');
    const lm = v.landmark.group.position;
    // 1. the guardian, defeated, is freed
    // each land's ritual is filmed from its own side (they mirror one another)
    const X = WORLD_INDEX[world] % 2 ? -1 : 1;
    c.shot(0, 3.4, { pos: [c.T(-9 * X, 4, -6), c.T(-8 * X, 4.6, -7)], look: () => spot.clone().setY(spot.y + 3), fov: 42 });
    c.placeName(0.6, 3.2, VOICE_NAMES[world][app.screens.lang]);
    // 2. its shard rises and flies home to the Heart
    const home = shardHome(c, world, 3.4, () => spot.clone().setY(spot.y + 2), 2.2, 3.0);
    const tHome = home.end;
    c.shot(3.4, 5.6, { pos: [c.T(-5 * X, 3, -9), c.T(-4.6 * X, 3.6, -9.6)], look: () => spot.clone().setY(spot.y + 5), fov: 38 });
    // follow the shard over the colossus' head down into the Heart
    c.shot(5.6, tHome + 0.6, { pos: [c.T(-7 * X, 7.5, -11), c.Sh(-3.2 * X, 8.6, -3.4)], look: () => home.at().clone(), fov: [44, 32], ease: ease.inOut, lookEase: ease.linear });
    // 3. the Voice rings
    const tVoice = tHome + 0.8;
    voiceSings(c, world, tVoice);
    c.at(tVoice + 0.2, () => {
      c.pose('all', 'cheer');
      c.mpose('cheer');
      v.turtle.cheer();
    });
    c.shot(tVoice, tVoice + 4, { pos: [c.T(-8 * X, 3, 4), c.T(-10 * X, 6, 6)], look: [() => lm.clone().setY(lm.y + 10), () => lm.clone().setY(lm.y + 16)], fov: [44, 50] });
    // 4. colour floods the land
    c.shot(tVoice + 4, tVoice + 8.4, { pos: [c.T(-20 * X, 18, 22), c.T(-34 * X, 32, 40)], look: [c.T(0, 4, -10), c.T(0, 2, -24)], fov: 46, ease: ease.inOut });
    c.at(tVoice + 4.2, () => {
      c.play('all');
      c.mpose('conduct');
    });
    c.end(tVoice + 8.6);
  });
}

// ───────────────────────────── memories ─────────────────────────────

/** A memory of the Silence: a violet, music-box world with no colossus in it. */
function memoryScene(app: App, world: WorldId, id: string, script: (c: Cine) => void) {
  audio.setAmbience(world, 0.25);
  return runScene(app, { world, look: look(world, 'night'), bpm: 84, bars: 60, s0: 40, seed: 80 + WORLD_INDEX[world], life: 0.55, colorScale: 0, maestro: false, landmark: null, band: [], shards: 0, features: [{ kind: 'meadow', from: 0, to: 140 }, { kind: 'hills', from: 0, to: 140 }] }, (c) => {
    c.view.turtle.group.visible = false;
    c.memoryFrame(0, true);
    c.grade(0, 0.01, { saturation: 0.62, vignette: 0.85, grain: 0.085, tint: '#f0dcff', contrast: 0.94, warmth: 0.04 });
    c.bars(0, 11);
    void id;
    script(c);
  }, 1600);
}

/** a little festival of note-birds (dancers, lanterns, a fire and fireflies) */
function festival(c: Cine, at: THREE.Vector3, glowCol: string) {
  const fire = c.add(new Campfire());
  fire.group.position.copy(at);
  const dancers: Villager[] = [];
  const cols = ['#ff9a8a', '#8ad0ff', '#ffd36b', '#b98cff', '#9be07a', '#ffb3d9', '#ffcf7a', '#7ad7ff'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = new Villager(cols[i], cols[(i + 3) % 8], i + 2);
    const p = at.clone().add(tmp.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
    p.y = c.view.land.heightAt(p.x, p.z);
    d.group.position.copy(p);
    d.group.scale.setScalar(2.2);
    d.group.lookAt(at.x, p.y, at.z);
    c.add(d);
    dancers.push(d);
  }
  c.add({ update: () => {
    dancers.forEach((d, i) => {
      const a = (i / 8) * Math.PI * 2 + c.wt * 0.35;
      const p = at.clone().add(tmp.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
      d.group.position.set(p.x, c.view.land.heightAt(p.x, p.z), p.z);
    });
  } }, null);
  const flies = new Fireflies(80, 9, 4, '#fff2a0');
  flies.points.position.copy(at);
  c.place(flies.points);
  c.add({ update: (_dt: number, t: number) => flies.update(t) }, null);
  const lantern = glowSprite(glowCol, 14, 0.45);
  lantern.position.copy(at).setY(at.y + 2);
  c.place(lantern);
  return { fire, dancers };
}

/** a snowy tree with a long branch to perch on (the Coralitos) */
function snowyBranch(): THREE.Group {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#5b4637', roughness: 0.9 });
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 6, 8), bark);
  trunk.position.y = 3;
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 3.2, 6), bark);
  branch.rotation.x = Math.PI / 2;
  branch.position.set(0, 3.9, 1.3);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.2, 8), new THREE.MeshStandardMaterial({ color: '#2f6b5a', roughness: 0.9 }));
  crown.position.y = 7.4;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 8), snow);
  cap.position.y = 8.9;
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 2.8), snow);
  ledge.position.set(0, 4.02, 1.4);
  g.add(trunk, branch, crown, cap, ledge);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

void SEATS;
void GoldenScarab;
void RestGlyph;
void ([] as Feature[]);
