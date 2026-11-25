/**
 * Audio lab — a listening page for every song (at every intensity), tower voice, sound effect,
 * cinematic sequence and ambience; plus offline renders with level reports.
 * Open with:  npx vite --port 5174   →   http://localhost:5174/tools/audio-lab.html
 * Also driven by tools/audio-check.mjs and tools/audio-levels.mjs.
 */
import { audio } from './index';
import type { CinematicCue, SongId } from './api';
import { DUETS, SONGS, TOWERS, type DuetId, type EnemyKind, type Section, type TowerKind, type WorldId } from '../sim/defs';
import { audioDebug } from './engine/engine';
import { bandOf, defaultArmy, ENDING, ENDING2, harmonyCheck, INTRO, INTRO2, makeRig, measure, octaves, onsetTest, renderAmbience, renderCinema, renderCue, renderDeaths, renderDuets, renderJourney, renderMotifs, renderSfx, renderSong, renderStress, standardJourney, wavBase64 } from './engine/analysis';

const SONG_IDS = Object.keys(SONGS) as SongId[];
const KINDS: TowerKind[] = ['harp', 'drum', 'bell', 'shaker', 'crystal', 'horn', 'choir', 'bass'];
const PLACES: (WorldId | 'menu' | 'none')[] = ['meadow', 'desert', 'ice', 'forge', 'citadel', 'menu', 'none'];
const ENEMIES: EnemyKind[] = ['blot', 'blotling', 'scurry', 'shell', 'moth', 'shield', 'bubble', 'phantom', 'muffler', 'mender', 'scorpion', 'whirl', 'echo', 'wolf', 'ember', 'slug', 'mimic', 'knight', 'conductor', 'bossBlot', 'silence'];

// ───────────── meter (also used by the automated check) ─────────────
const meter = { peak: 0, sum: 0, n: 0, nan: 0 };
const uiMeter = { peak: 0 };
let buf: Float32Array<ArrayBuffer> | null = null;
setInterval(() => {
  const d = audioDebug();
  if (!d) return;
  if (!buf) buf = new Float32Array(d.tap.fftSize);
  d.tap.getFloatTimeDomainData(buf);
  for (let i = 0; i < buf.length; i += 2) {
    const v = buf[i];
    if (Number.isNaN(v)) meter.nan++;
    const a = Math.abs(v);
    if (a > meter.peak) meter.peak = a;
    if (a > uiMeter.peak) uiMeter.peak = a;
    meter.sum += v * v;
    meter.n++;
  }
}, 15);

// ───────────── live tower sequencer (fires towers on the song grid like the game) ─────────────
interface LiveTower {
  kind: TowerKind;
  level: number;
  pan: number;
  voice: number;
  until: number;
}
let army: LiveTower[] = [];
let nextStep = -1;
setInterval(() => {
  const c = audio.songClock();
  if (!c || !army.length) return;
  const sd = c.spb / 4;
  const now = audio.now();
  if (nextStep < 0) nextStep = Math.ceil((now + 0.1 - c.t0) / sd);
  while (c.t0 + nextStep * sd < now + 0.16) {
    const t = c.t0 + nextStep * sd;
    for (const tw of army) {
      if (t > tw.until) continue;
      const lv = TOWERS[tw.kind].levels[tw.level];
      if (lv.pattern[((nextStep % lv.pattern.length) + lv.pattern.length) % lv.pattern.length] !== 'x') continue;
      audio.towerShot(tw.kind, tw.level, t, tw.pan, tw.voice);
      if (lv.flight > 0) {
        const ti = t + lv.flight * sd;
        setTimeout(() => audio.impact(tw.kind, ti, tw.pan, 0.7), Math.max(0, (ti - audio.now() - 0.12) * 1000));
      }
    }
    if (army.length > 6 && nextStep % 6 === 0 && Math.random() < 0.5) {
      audio.enemyDeath(ENEMIES[Math.floor(Math.random() * 8)], t, Math.random() * 2 - 1);
      audio.coin(t + 0.3, 0, 5);
    }
    nextStep++;
  }
  army = army.filter((tw) => tw.until > now);
  if (!army.length) nextStep = -1;
}, 20);

const lab = {
  audio,
  debug: audioDebug,
  offline: { renderSong, renderCinema, renderStress, onsetTest, renderAmbience, renderSfx, renderJourney, standardJourney, renderCue, renderMotifs, renderDuets, renderDeaths, harmonyCheck, octaves, bandOf, measure, wavBase64, defaultArmy, makeRig, INTRO, ENDING, INTRO2, ENDING2 },
  reset() {
    meter.peak = 0;
    meter.sum = 0;
    meter.n = 0;
    meter.nan = 0;
  },
  read() {
    return { peak: meter.peak, rms: Math.sqrt(meter.sum / Math.max(1, meter.n)), nan: meter.nan, voices: audioDebug()?.voices() ?? {} };
  },
  /** fire towers on their patterns for `bars` bars (like the game) */
  towers(list: { kind: TowerKind; level: number; pan?: number; voice?: number }[], bars = 4) {
    const c = audio.songClock();
    const dur = (c ? c.spb * 4 : 2.4) * bars;
    const until = audio.now() + dur;
    for (const [i, t] of list.entries()) army.push({ kind: t.kind, level: t.level, pan: t.pan ?? 0, voice: t.voice ?? i + 1, until });
  },
  stopTowers() {
    army = [];
    nextStep = -1;
  },
};
(window as unknown as { __lab: typeof lab }).__lab = lab;

// ───────────── UI ─────────────
const root = document.getElementById('lab')!;
const h = (tag: string, attrs: Record<string, string> = {}, text = ''): HTMLElement => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
};
const section = (title: string, note = ''): HTMLElement => {
  const s = h('section');
  s.append(h('h2', {}, title));
  if (note) s.append(h('p', { class: 'note' }, note));
  root.append(s);
  return s;
};
const button = (parent: HTMLElement, label: string, fn: () => void, id?: string): HTMLButtonElement => {
  const b = h('button', id ? { id } : {}, label) as HTMLButtonElement;
  b.addEventListener('click', () => {
    void audio.unlock();
    fn();
  });
  parent.append(b);
  return b;
};
const slider = (parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, fn: (v: number) => void): void => {
  const wrap = h('label', { class: 'slider' });
  const span = h('span', {}, `${label}: ${value}`);
  const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  inp.addEventListener('input', () => {
    span.textContent = `${label}: ${inp.value}`;
    fn(Number(inp.value));
  });
  wrap.append(span, inp);
  parent.append(wrap);
};
const row = (parent: HTMLElement, label: string): HTMLElement => {
  const r = h('div', { class: 'row' });
  r.append(h('span', { class: 'lbl' }, label));
  parent.append(r);
  return r;
};

const top = section('Start');
button(top, '▶ Unlock audio', () => undefined, 'unlock');
const status = h('span', { class: 'status' }, 'locked');
top.append(status);
setInterval(() => {
  const r = lab.read();
  const c = audio.songClock();
  const beat = c ? ((audio.now() - c.t0) / c.spb).toFixed(1) : '-';
  const v = Object.entries(r.voices).filter(([, n]) => n).map(([k, n]) => `${k}:${n}`).join(' ');
  status.textContent = `${audio.ready ? 'running' : 'locked'} · ${c ? `${c.song} beat ${beat}` : 'no song'} · peak ${uiMeter.peak.toFixed(3)} · latency ${(audio.latency() * 1000).toFixed(0)} ms · ${v}`;
  uiMeter.peak = 0;
}, 300);

const vol = { master: 1, music: 0.8, sfx: 0.9, ambience: 0.8 };
const vs = section('Volumes, muffle, duck');
for (const k of Object.keys(vol) as (keyof typeof vol)[]) slider(vs, k, 0, 1, 0.01, vol[k], (v) => {
  vol[k] = v;
  audio.setVolumes(vol);
});
slider(vs, 'muffle', 0, 1, 0.01, 0, (v) => audio.setMuffle(v));
button(vs, 'duck 0.6 / 2 s', () => audio.duck(0.6, 2));
button(vs, 'suspend', () => audio.suspend());
button(vs, 'resume', () => audio.resume());

const ms = section('Songs', 'Battle songs: pick a song, then its intensity (changes at the next bar line). The kick on every beat is the turtle walking.');
const songRow = row(ms, 'play');
for (const id of SONG_IDS) button(songRow, id, () => audio.playSong(id));
button(songRow, '■ stop', () => audio.stopMusic(1));
const intRow = row(ms, 'intensity');
for (const lv of [0, 1, 2, 3] as const) button(intRow, `I${lv}`, () => audio.setIntensity(lv));
button(intRow, 'ff unleash (next bar)', () => {
  const c = audio.songClock();
  if (!c) return;
  const bar = c.spb * 4;
  const k = Math.ceil((audio.now() + 0.1 - c.t0) / bar);
  audio.ffUnleash(c.t0 + k * bar, c.t0 + (k + 1) * bar);
});
button(intRow, 'ff ready', () => audio.ffReady());

const tw = section('Towers', 'Fires towers on their real patterns for 4 bars on the current song clock (start a song first).');
for (const kind of KINDS) {
  const r = row(tw, kind);
  for (const lv of [0, 1, 2]) button(r, `L${lv}`, () => lab.towers([{ kind, level: lv, voice: Math.floor(Math.random() * 9) }]));
  button(r, '×3', () => lab.towers([0, 1, 2].map((i) => ({ kind, level: 1, voice: i, pan: i - 1 }))));
}
const ar = row(tw, 'army');
button(ar, '24 towers (8 bars)', () => lab.towers(defaultArmy(24), 8));
button(ar, '40 towers (8 bars)', () => lab.towers(defaultArmy(40), 8));
button(ar, 'stop towers', () => lab.stopTowers());

const bt = section('Battle events');
const t = () => audio.now() + 0.05;
const er = row(bt, 'enemies');
for (const e of ENEMIES) button(er, e, () => audio.enemyDeath(e, t(), Math.random() * 2 - 1));
const ev = row(bt, 'events');
button(ev, 'impact drum', () => audio.impact('drum', t(), 0, 1));
button(ev, 'impact harp', () => audio.impact('harp', t(), 0.5, 1));
button(ev, 'impact bass', () => audio.impact('bass', t(), 0, 1));
button(ev, 'impact crystal', () => audio.impact('crystal', t(), -0.5, 1));
button(ev, 'deflect', () => audio.deflect(t(), 0.3));
button(ev, 'coin ×1', () => audio.coin(t(), 0, 1));
button(ev, 'coin ×30', () => audio.coin(t(), 0, 30));
button(ev, 'heart hit', () => audio.heartHit(t(), 0.8));
button(ev, 'heart hit (low)', () => audio.heartHit(t(), 0.1));
button(ev, 'heart heal (hymn)', () => audio.heartHeal(t()));
button(ev, 'build', () => audio.build(t(), -0.4));
button(ev, 'upgrade 1', () => audio.upgrade(t(), 0, 1));
button(ev, 'upgrade 2', () => audio.upgrade(t(), 0, 2));
button(ev, 'sell', () => audio.sell(t(), 0.4));
button(ev, 'muted', () => audio.towerMuted(t(), 0, true));
button(ev, 'unmuted', () => audio.towerMuted(t(), 0, false));
button(ev, 'switch', () => audio.switchFlip(t(), 0));
const nextBar = () => {
  const c = audio.songClock();
  if (!c) return t();
  const bar = c.spb * 4;
  return c.t0 + Math.ceil((audio.now() + 0.1 - c.t0) / bar) * bar;
};
button(ev, 'journey start (wave −1)', () => audio.waveStart(nextBar(), -1, 0));
button(ev, 'wave 1/6 (next bar)', () => audio.waveStart(nextBar(), 0, 6));
button(ev, 'wave 6/6', () => audio.waveStart(nextBar(), 5, 6));
button(ev, 'boss appears', () => audio.bossAppear(nextBar()));
button(ev, 'count-in', () => {
  const c = audio.songClock();
  const b0 = nextBar();
  for (let k = 0; k < 4; k++) audio.countIn(b0 + k * (c?.spb ?? 0.6), k);
});
const res = row(bt, 'results');
button(res, 'arrive → victory', () => {
  audio.cinematic('world:restored');
  setTimeout(() => audio.victory(), 250);
});
button(res, 'victory', () => audio.victory());
button(res, 'defeat', () => audio.defeat());
button(res, 'stars', () => [0, 1, 2].forEach((i) => setTimeout(() => audio.star(i), i * 700)));
button(res, 'new tower', () => audio.newTower());

const ci = section('Title & cinema', 'The full sequences call every cue at its listed second.');
const tr = row(ci, 'title');
button(tr, 'studio sting', () => audio.studioSting());
button(tr, 'title reveal', () => audio.titleReveal());
const timers: number[] = [];
const runSeq = (seq: [number, CinematicCue][]) => {
  timers.forEach(clearTimeout);
  timers.length = 0;
  for (const [s, cue] of seq) timers.push(window.setTimeout(() => audio.cinematic(cue), s * 1000));
};
const seqRow = row(ci, 'sequences');
button(seqRow, 'INTRO (80 s)', () => runSeq(INTRO));
button(seqRow, 'ENDING (95 s)', () => runSeq(ENDING));
button(seqRow, 'INTRO v2 (100 s)', () => runSeq(INTRO2));
button(seqRow, 'ENDING v2 (120 s)', () => runSeq(ENDING2));
button(seqRow, "playSong('ending') (self-timed)", () => audio.playSong('ending'));
button(seqRow, 'stop', () => {
  timers.forEach(clearTimeout);
  audio.stopMusic(0.5);
});
const cueRow = row(ci, 'cues');
for (const [, cue] of [...INTRO, ...ENDING]) button(cueRow, cue, () => audio.cinematic(cue));
for (const cue of ['world:restored', 'map:unlock', 'map:world'] as CinematicCue[]) button(cueRow, cue, () => audio.cinematic(cue));
const landRow = row(ci, 'story in');
const STORY: CinematicCue[] = ['story:wonder', 'story:frozen', 'story:wake', 'story:join', 'story:threat', 'story:shard', 'story:voice', 'story:camp', 'story:memory', 'story:journey', 'story:dread', 'story:hush', 'story:comic'];
for (const w of ['meadow', 'desert', 'ice', 'forge', 'citadel'] as WorldId[]) button(landRow, `land:${w}`, () => audio.cinematic(`land:${w}` as CinematicCue));
const storyRow = row(ci, 'moods');
for (const cue of STORY) button(storyRow, cue.slice(6), () => audio.cinematic(cue));
const motifRow = row(ci, 'joinMotif');
for (const k of KINDS) button(motifRow, k, () => audio.joinMotif(k));

// ───────────── the band (v2) ─────────────
const bd = section('The band, movements, duets', 'setBand changes the arrangement at the next bar line; a movement brings a new plan (key, sections); intensity 0 for a bar turns the song into a breakdown.');
const BANDS: Record<string, Partial<Record<Section, number>>> = {
  'harp only': { strings: 1 },
  '+ drum': { strings: 1, percussion: 1 },
  '+ bells': { strings: 1, percussion: 1, bells: 1 },
  '+ horn': { strings: 1, percussion: 1, bells: 1, brass: 1 },
  '+ choir': { strings: 1, percussion: 1, bells: 1, brass: 1, voices: 1 },
  'full band': { strings: 2, percussion: 2, bells: 2, brass: 1, voices: 1, low: 1 },
};
let duetsOn: DuetId[] = [];
let lastBand: Partial<Record<Section, number>> = BANDS['full band'];
const sendBand = () => audio.setBand(bandOf(lastBand, duetsOn));
const bandRow = row(bd, 'band');
for (const [name, secs] of Object.entries(BANDS)) button(bandRow, name, () => {
  lastBand = secs;
  sendBand();
});
const duetRow = row(bd, 'duets');
for (const d of DUETS) button(duetRow, d.id, () => {
  duetsOn = duetsOn.includes(d.id) ? duetsOn.filter((x) => x !== d.id) : [...duetsOn, d.id];
  sendBand();
  if (duetsOn.includes(d.id)) audio.duet(d.id, nextBar(), 0);
});
button(duetRow, 'no duets', () => {
  duetsOn = [];
  sendBand();
});
const movRow = row(bd, 'movement');
for (let i = 0; i < 5; i++) button(movRow, `m${i + 1}/5`, () => audio.movement(i, 5, nextBar()));
button(movRow, 'plate unlock', () => audio.plateUnlock(audio.now() + 0.05, 0.3));

const ui = section('UI');
const uiRow = row(ui, 'ui');
button(uiRow, 'hover', () => audio.uiHover());
button(uiRow, 'click', () => audio.uiClick());
button(uiRow, 'back', () => audio.uiBack());
button(uiRow, 'open', () => audio.uiOpen());
button(uiRow, 'deny', () => audio.uiDeny());
button(uiRow, 'achievement', () => audio.achievement());
button(uiRow, 'save', () => audio.save());

const am = section('Ambience');
const amRow = row(am, 'place');
for (const p of PLACES) button(amRow, p, () => audio.setAmbience(p));

const off = section('Offline render', 'Renders faster than real time (OfflineAudioContext) and reports levels; "wav" downloads the render.');
const sel = h('select') as HTMLSelectElement;
for (const id of SONG_IDS) sel.append(h('option', { value: id }, id));
const isel = h('select') as HTMLSelectElement;
for (const lv of ['0', '1', '2', '3']) isel.append(h('option', { value: lv }, `I${lv}`));
const out = h('pre', { class: 'out' });
off.append(sel, isel);
const download = (b64: string, name: string) => {
  const a = document.createElement('a');
  a.href = `data:audio/wav;base64,${b64}`;
  a.download = name;
  a.click();
};
button(off, 'render 30 s', async () => {
  out.textContent = 'rendering…';
  const r = await renderSong(sel.value as SongId, Number(isel.value), 30, false);
  out.textContent = JSON.stringify(r.stats, null, 1);
});
button(off, 'render 30 s + wav', async () => {
  out.textContent = 'rendering…';
  const r = await renderSong(sel.value as SongId, Number(isel.value), 30, true);
  out.textContent = JSON.stringify(r.stats, null, 1);
  if (r.wav) download(r.wav, `${sel.value}-I${isel.value}.wav`);
});
button(off, 'stress (24 towers, 30 s) + wav', async () => {
  out.textContent = 'rendering…';
  const r = await renderStress(sel.value as SongId, 30, defaultArmy(24), true);
  const { wav, ...rest } = r;
  out.textContent = JSON.stringify(rest, null, 1);
  if (wav) download(wav, `${sel.value}-stress.wav`);
});
off.append(out);
