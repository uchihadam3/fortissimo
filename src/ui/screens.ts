/**
 * Menus and full-screen moments: gate, studio logo, title, main menu, journeys (save slots),
 * options, credits, world map, level card, results, pause, loading, toasts, dialogs.
 */
import studioLogo from '../assets/uchihadam-production.webp';
import { STRINGS, type StringKey } from './i18n';
import { LOGO_CSS, logoHTML } from './logo';
import { ICON, TOWER_ICON, enemyIcon } from './icons';
import { CAMPAIGN, LEVEL_BY_ID, WORLD_NAMES, type LevelEntry } from '../data/campaign';
import { WORLDS, type WorldId } from '../sim/defs';
import type { Settings } from '../core/settings';
import { listSlots, type SaveData } from '../core/save';
import { fbm2 } from '../core/noise';

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface UiSounds {
  hover(): void;
  click(): void;
  back(): void;
  studio(): void;
  title(): void;
  star(i: number): void;
  unlock(): void;
}

const WORLD_COL: Record<WorldId, [string, string]> = {
  meadow: ['#9ad66a', '#5ea040'],
  desert: ['#f2cf8e', '#c99650'],
  ice: ['#eef6ff', '#a9c6e6'],
  forge: ['#6a5054', '#3a2a2c'],
  citadel: ['#c9c2ea', '#7a6fb0'],
};

export function isLevelOpen(save: SaveData, l: LevelEntry): boolean {
  if (!l.requires.every((r) => (save.levels[r]?.stars ?? 0) > 0)) return false;
  if (l.stars) {
    const total = Object.values(save.levels).reduce((a, r) => a + (r.stars ?? 0), 0);
    if (total < l.stars) return false;
  }
  return true;
}

export function totalStars(save: SaveData): number {
  return Object.values(save.levels).reduce((a, r) => a + (r.stars ?? 0), 0);
}

export class Screens {
  readonly root: HTMLElement;
  private fade: HTMLElement;
  private toasts: HTMLElement;
  private skip = false;
  lang: 'pt' | 'en' = 'pt';
  sounds: UiSounds = { hover() {}, click() {}, back() {}, studio() {}, title() {}, star() {}, unlock() {} };

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = LOGO_CSS + GALLERY_CSS;
    document.head.appendChild(style);
    this.root = h(`<div id="screens"></div>`);
    parent.appendChild(this.root);
    this.fade = h(`<div id="fade"></div>`);
    parent.appendChild(this.fade);
    this.toasts = h(`<div id="toasts"></div>`);
    parent.appendChild(this.toasts);
  }

  t(k: StringKey, vars: Record<string, string | number> = {}): string {
    let s = STRINGS[this.lang][k] as string;
    for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  }

  private screen(cls: string, html: string): HTMLElement {
    const el = h(`<div class="screen on ${cls}">${html}</div>`);
    this.root.appendChild(el);
    return el;
  }

  clear() {
    this.root.innerHTML = '';
  }

  fadeTo(v: number, ms = 800, white = false): Promise<void> {
    this.fade.classList.toggle('white', white);
    this.fade.style.transition = `opacity ${ms}ms ease`;
    this.fade.style.opacity = String(v);
    return sleep(ms);
  }

  toast(text: string) {
    const el = h(`<div class="toast">${text}</div>`);
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  private btn(label: string, fn: () => void, cls = '', icon = ''): HTMLButtonElement {
    const b = h(`<button class="mbtn ${cls}">${icon ? `<span class="ico">${icon}</span>` : ''}<span>${label}</span></button>`) as HTMLButtonElement;
    b.addEventListener('pointerenter', () => this.sounds.hover());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sounds.click();
      fn();
    });
    return b;
  }

  confirm(text: string): Promise<boolean> {
    return new Promise((res) => {
      const el = this.screen('dim center dialog-screen', `<div class="dialog"><p>${text}</p><div class="row"></div></div>`);
      const row = el.querySelector('.row')!;
      row.append(
        this.btn(this.t('no'), () => {
          el.remove();
          res(false);
        }, 'ghost'),
        this.btn(this.t('yes'), () => {
          el.remove();
          res(true);
        }),
      );
    });
  }

  // ───────────────────────────── intro ─────────────────────────────

  /** Click-to-begin (browsers need a gesture to start audio). */
  gate(): Promise<void> {
    const el = this.screen('gate center', `<div class="seal"><span>${ICON.ff}</span></div><p>${this.t('tapToStart')}</p><small>${this.t('tapHint')}</small>`);
    return new Promise((res) => {
      const go = (e: Event) => {
        e.preventDefault();
        el.removeEventListener('pointerdown', go);
        window.removeEventListener('keydown', go);
        el.classList.add('out');
        setTimeout(() => el.remove(), 500);
        res();
      };
      el.addEventListener('pointerdown', go);
      window.addEventListener('keydown', go);
    });
  }

  private armSkip() {
    this.skip = false;
    const s = () => (this.skip = true);
    setTimeout(() => {
      window.addEventListener('keydown', s, { once: true });
      window.addEventListener('pointerdown', s, { once: true });
    }, 400);
  }

  private async wait(ms: number) {
    for (let t = 0; t < ms; t += 50) {
      if (this.skip) return;
      await sleep(50);
    }
  }

  /** Uchihadam Production: embers rising, the emblem fading in under a sweep of light. */
  async studio() {
    this.armSkip();
    const el = this.screen('studio center', `<canvas class="embers"></canvas><div class="logo-wrap"><img alt="Uchihadam Production" src="${studioLogo}"><div class="sweep"></div></div>`);
    (el.querySelector('.logo-wrap') as HTMLElement).style.setProperty('--logo', `url(${studioLogo})`);
    const cv = el.querySelector('canvas') as HTMLCanvasElement;
    const stop = embers(cv);
    await this.wait(500);
    this.sounds.studio();
    el.classList.add('play');
    await this.wait(6400);
    el.classList.add('out');
    await sleep(this.skip ? 200 : 700);
    stop();
    el.remove();
  }

  /** The FORTÍSSIMO logo reveal. */
  async title() {
    const el = this.screen('title center', `<canvas class="notes-bg"></canvas>${logoHTML(this.t('tagline'))}`);
    const logo = el.querySelector('.ff-logo') as HTMLElement;
    logo.classList.add('pre');
    const stop = notesRain(el.querySelector('canvas') as HTMLCanvasElement);
    await this.wait(400);
    this.sounds.title();
    logo.classList.remove('pre');
    logo.classList.add('reveal');
    await this.wait(5200);
    el.classList.add('out');
    await sleep(700);
    stop();
    el.remove();
  }

  // ───────────────────────────── main menu ─────────────────────────────

  menu(o: { canContinue: boolean; installable: boolean; onContinue: () => void; onNew: () => void; onLoad: () => void; onOptions: () => void; onStory?: () => void; onCredits: () => void; onInstall: () => void; version: string }) {
    this.clear();
    const el = this.screen('menu', `<div class="menu-left">${logoHTML(this.t('tagline'), 'small')}<div class="menu-items"></div></div><div class="foot"><b>Uchihadam Production</b> · FORTÍSSIMO · v${o.version}</div>`);
    const box = el.querySelector('.menu-items')!;
    if (o.canContinue) box.append(this.btn(this.t('continue'), o.onContinue, 'primary', ICON.play));
    box.append(this.btn(this.t('newGame'), o.onNew, o.canContinue ? '' : 'primary'));
    box.append(this.btn(this.t('load'), o.onLoad));
    if (o.onStory) box.append(this.btn(this.t('story'), o.onStory));
    box.append(this.btn(this.t('options'), o.onOptions));
    box.append(this.btn(this.t('credits'), o.onCredits));
    if (o.installable) box.append(this.btn(this.t('install'), o.onInstall, 'ghost'));
  }

  // ───────────────────────────── journeys (save slots) ─────────────────────────────

  slots(mode: 'new' | 'load', on: { pick: (slot: number) => void; del: (slot: number) => void; exp: (slot: number) => void; imp: () => void; back: () => void }) {
    this.clear();
    const el = this.screen('slots dim center', `<div class="panel"><h2>${mode === 'new' ? this.t('newGame') : this.t('load')}</h2><div class="slot-list"></div><div class="row"></div></div>`);
    const list = el.querySelector('.slot-list')!;
    for (const s of listSlots()) {
      const d = s.data;
      const card = h(`<div class="slot ${d ? '' : 'empty'}"><div class="num">${s.slot + 1}</div><div class="info"></div><div class="acts"></div></div>`);
      const info = card.querySelector('.info') as HTMLElement;
      if (d) {
        const mins = Math.floor(d.playTime / 60);
        const lvl = LEVEL_BY_ID.get(d.current);
        info.innerHTML = `<b>${lvl ? lvl.def.name[this.lang] : ''}</b><span><i>${ICON.star}</i>${s.stars} · ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}</span>`;
      } else info.innerHTML = `<b>${this.t('empty')}</b>`;
      card.addEventListener('click', async () => {
        this.sounds.click();
        if (mode === 'load' && !d) return;
        if (mode === 'new' && d && !(await this.confirm(this.t('confirmOverwrite')))) return;
        on.pick(s.slot);
      });
      const acts = card.querySelector('.acts') as HTMLElement;
      if (d) {
        const ex = h(`<button class="mini" title="${this.t('exportSave')}">⇪</button>`);
        ex.addEventListener('click', (e) => {
          e.stopPropagation();
          on.exp(s.slot);
        });
        const del = h(`<button class="mini red" title="${this.t('delete')}">✕</button>`);
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (await this.confirm(this.t('confirmDelete'))) {
            on.del(s.slot);
            this.slots(mode, on);
          }
        });
        acts.append(ex, del);
      }
      list.appendChild(card);
    }
    const row = el.querySelector('.row')!;
    row.append(this.btn(this.t('back'), on.back, 'ghost'), this.btn(this.t('importSave'), on.imp, 'ghost'));
  }

  /** export / import dialog */
  saveCode(code: string | null, onImport: (code: string) => boolean, onFile: () => void) {
    const el = this.screen('dim center dialog-screen', `<div class="dialog wide"><h3>${code ? this.t('exportSave') : this.t('importSave')}</h3><p class="help">${code ? '' : this.t('paste')}</p><textarea spellcheck="false"></textarea><div class="row"></div></div>`);
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    const row = el.querySelector('.row')!;
    if (code) {
      ta.value = code;
      ta.readOnly = true;
      row.append(this.btn(this.t('close'), () => el.remove(), 'ghost'), this.btn(this.t('copy'), () => {
        navigator.clipboard?.writeText(code).then(() => this.toast(this.t('copied')), () => {});
        ta.select();
      }));
      row.append(this.btn(this.t('file'), onFile, 'ghost'));
    } else {
      row.append(this.btn(this.t('close'), () => el.remove(), 'ghost'));
      const file = h(`<label class="mbtn ghost"><span>${this.t('file')}</span><input type="file" accept=".json,application/json" hidden></label>`);
      file.querySelector('input')!.addEventListener('change', async (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (!f) return;
        const txt = await f.text();
        if (onImport(txt)) el.remove();
      });
      row.append(file, this.btn(this.t('importSave'), () => {
        if (onImport(ta.value)) el.remove();
      }));
    }
  }

  // ───────────────────────────── options ─────────────────────────────

  options(s: Settings, onChange: (s: Settings) => void, onBack: () => void, overlay = false) {
    if (!overlay) this.clear();
    const el = this.screen('options dim center', `<div class="panel"><h2>${this.t('options')}</h2><div class="opts"></div><div class="row"></div></div>`);
    const box = el.querySelector('.opts')!;
    const slider = (k: 'master' | 'music' | 'sfx' | 'ambience', label: string) => {
      const r = h(`<label class="opt"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${s[k]}"></label>`);
      r.querySelector('input')!.addEventListener('input', (e) => {
        s[k] = Number((e.target as HTMLInputElement).value);
        onChange(s);
      });
      box.appendChild(r);
    };
    const choice = <T extends string | boolean>(label: string, vals: [T, string][], get: () => T, set: (v: T) => void) => {
      const r = h(`<div class="opt"><span>${label}</span><div class="seg"></div></div>`);
      const seg = r.querySelector('.seg')!;
      for (const [v, name] of vals) {
        const b = h(`<button class="${get() === v ? 'on' : ''}">${name}</button>`);
        b.addEventListener('click', () => {
          set(v);
          onChange(s);
          seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          this.sounds.click();
        });
        seg.appendChild(b);
      }
      box.appendChild(r);
    };
    slider('master', this.t('master'));
    slider('music', this.t('music'));
    slider('sfx', this.t('sfx'));
    slider('ambience', this.t('ambience'));
    choice(this.t('quality'), [['low', this.t('low')], ['medium', this.t('medium')], ['high', this.t('high')]], () => s.quality, (v) => (s.quality = v));
    choice(this.t('language'), [['pt', 'Português'], ['en', 'English']], () => s.lang, (v) => (s.lang = v));
    choice(this.t('shake'), [[true, this.t('on')], [false, this.t('off')]], () => s.shake, (v) => (s.shake = v));
    choice(this.t('fps'), [[true, this.t('on')], [false, this.t('off')]], () => s.showFps, (v) => (s.showFps = v));
    el.querySelector('.row')!.append(this.btn(this.t('back'), () => {
      el.remove();
      onBack();
    }, 'ghost'));
  }

  // ───────────────────────────── credits ─────────────────────────────

  credits(onBack: () => void, ending = false): Promise<void> {
    this.clear();
    const pt = this.lang === 'pt';
    const lines: [string, string][] = [
      [pt ? 'Uma produção' : 'A production of', 'Uchihadam Production'],
      [pt ? 'Direção e design' : 'Direction & design', 'Uchihadam Production'],
      [pt ? 'Mundo, personagens e animação' : 'World, characters & animation', pt ? 'gerados em tempo real, sem imagens' : 'generated in real time, no images'],
      [pt ? 'Música e sons' : 'Music & sound', pt ? '100% sintetizados ao vivo — a sua defesa toca a trilha' : '100% synthesised live — your defense plays the score'],
      [pt ? 'O colosso' : 'The colossus', pt ? 'uma tartaruga gentil e muito paciente' : 'a gentle, very patient turtle'],
      [pt ? 'O Maestro' : 'The Maestro', pt ? 'a última nota do mundo' : "the world's last note"],
      [pt ? 'A banda' : 'The band', pt ? 'Lira · Bumbo · Dona Badalo · Chocalho · Cristalina · Trompa · os Coralitos · Grave' : 'Lira · Bumbo · Granny Clang · Rattle · Cristalina · Trompa · the Chorlets · Grave'],
      [pt ? 'O Silêncio' : 'The Silence', pt ? 'que também faz parte da música' : 'who is part of the music too'],
      [pt ? 'Feito com' : 'Made with', 'three.js · Web Audio · TypeScript'],
    ];
    const el = this.screen('credits', `<div class="roll">${logoHTML(this.t('tagline'), 'small')}${lines.map(([a, b]) => `<div class="cl"><span>${a}</span><b>${b}</b></div>`).join('')}${ending ? `<div class="cl end"><b>${this.t('thanks')}</b></div>` : ''}<div class="cl"><img src="${studioLogo}" alt="Uchihadam Production"></div></div>`);
    const back = this.btn(this.t('back'), () => {
      el.remove();
      onBack();
    }, 'ghost corner');
    el.appendChild(back);
    return new Promise((res) => {
      const roll = el.querySelector('.roll') as HTMLElement;
      roll.addEventListener('animationend', () => res(), { once: true });
      back.addEventListener('click', () => res());
    });
  }

  // ───────────────────────────── the story gallery ─────────────────────────────

  /** Every scene of the story in order, by chapter; the ones not reached yet are veiled. */
  storyGallery(entries: { id: string; kind: string; world: WorldId; title: string; open: boolean }[], play: (id: string) => void, back: () => void) {
    this.clear();
    const el = this.screen('story-gallery', `<div class="sg-panel"><h2>${this.t('story')}</h2><div class="sg-list"></div><div class="row"></div></div>`);
    const list = el.querySelector('.sg-list')!;
    const numerals = ['I', 'II', 'III', 'IV', 'V'];
    const sections: { label: string; world: WorldId; items: typeof entries }[] = [
      { label: this.t('prologue'), world: 'meadow', items: entries.filter((e) => e.kind === 'opening') },
      ...WORLDS.map((w, i) => ({ label: `${this.t('chapter')} ${numerals[i]} · ${WORLD_NAMES[w][this.lang]}`, world: w, items: entries.filter((e) => e.world === w && e.kind !== 'opening' && e.kind !== 'ending' && e.kind !== 'epilogue') })),
      { label: this.t('epilogue'), world: 'citadel', items: entries.filter((e) => e.kind === 'ending' || e.kind === 'epilogue') },
    ];
    for (const sec of sections) {
      const [c1, c2] = WORLD_COL[sec.world];
      const row = h(`<section class="sg-sec" style="--c1:${c1};--c2:${c2}"><h3>${sec.label}</h3><div class="sg-cards"></div></section>`);
      const cards = row.querySelector('.sg-cards')!;
      sec.items.forEach((e) => {
        const glyph = e.kind === 'chapter' ? `<em>${numerals[WORLDS.indexOf(e.world)]}</em>` : SCENE_GLYPH[e.kind] ?? SCENE_GLYPH.interlude;
        const card = h(`<button class="sg-card ${e.kind} ${e.open ? '' : 'locked'}"><span class="g">${e.open ? glyph : '?'}</span><b>${e.open ? e.title : '· · ·'}</b></button>`);
        if (e.open) {
          card.addEventListener('pointerenter', () => this.sounds.hover());
          card.addEventListener('click', () => {
            this.sounds.click();
            play(e.id);
          });
        }
        cards.appendChild(card);
      });
      list.appendChild(row);
    }
    el.querySelector('.row')!.append(this.btn(this.t('back'), () => {
      this.sounds.back();
      back();
    }, 'ghost'));
  }

  // ───────────────────────────── world map ─────────────────────────────

  map(save: SaveData, on: { play: (id: string, mode: 'normal' | 'virtuoso') => void; endless: (w: WorldId) => void; back: () => void; options: () => void }) {
    this.clear();
    const el = this.screen('map', `<div class="map-wrap"><svg class="world" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet"></svg></div>
      <div class="map-top"><button class="round-btn back">${ICON.close}</button><div class="stat stars"><i>${ICON.star}</i><b>${totalStars(save)}</b></div><button class="round-btn opt">${ICON.gear}</button></div>`);
    el.querySelector('.back')!.addEventListener('click', () => {
      this.sounds.back();
      on.back();
    });
    el.querySelector('.opt')!.addEventListener('click', () => {
      this.sounds.click();
      on.options();
    });
    const svg = el.querySelector('svg') as SVGSVGElement;
    let body = `<defs>
      <radialGradient id="sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#3f8fb8"/><stop offset="1" stop-color="#173a5e"/></radialGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6"/></filter>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0.8" stdDeviation="0.8" flood-color="#000" flood-opacity=".45"/></filter>
    </defs>
    <rect x="-40" y="-40" width="240" height="170" fill="url(#sea)"/>`;
    // waves pattern
    for (let i = 0; i < 60; i++) {
      const x = (i * 37) % 170 - 5, y = (i * 53) % 95;
      body += `<path d="M${x} ${y} q1.5 -1 3 0 q1.5 1 3 0" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width=".35"/>`;
    }
    // one island per land, around its journeys
    let labels = '';
    for (const w of WORLDS) {
      const pts = CAMPAIGN.filter((l) => l.world === w).map((l) => l.map);
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) + 6;
      let d = '';
      const N = 48;
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        // stretch toward the journeys so every node sits on land
        let rr = r * (0.78 + fbm2(Math.cos(a) * 1.3 + cx * 0.1, Math.sin(a) * 1.3 + cy * 0.1, 3) * 0.3);
        for (const p of pts) {
          const pa = Math.atan2(p[1] - cy, p[0] - cx), pd = Math.hypot(p[0] - cx, p[1] - cy);
          const da = Math.abs(Math.atan2(Math.sin(a - pa), Math.cos(a - pa)));
          if (da < 0.5) rr = Math.max(rr, pd + 6 - da * 8);
        }
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.92;
        d += `${k ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      const [c1, c2] = WORLD_COL[w];
      body += `<path d="${d}Z" fill="${c2}" transform="translate(0 1.2)" opacity=".8"/><path d="${d}Z" fill="${c1}" stroke="${c2}" stroke-width=".5" filter="url(#shadow)"/>`;
      body += worldDecor(w, cx, cy, r);
      const ly = w === 'meadow' || w === 'desert' ? cy + r * 0.62 + 4 : cy - r * 0.62 - 1.5;
      labels += `<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" class="wname" text-anchor="middle">${WORLD_NAMES[w][this.lang]}</text>`;
    }
    // roads between journeys
    for (const l of CAMPAIGN) {
      for (const r of l.requires) {
        const a = LEVEL_BY_ID.get(r)!;
        const open = isLevelOpen(save, l);
        const extra = l.kind === 'extra' || l.kind === 'secret';
        body += `<line x1="${a.map[0]}" y1="${a.map[1]}" x2="${l.map[0]}" y2="${l.map[1]}" stroke="${extra ? '#c9a8ff' : '#ffe9a8'}" stroke-width="${extra ? 0.6 : 0.9}" stroke-dasharray="${extra ? '0.6 1.2' : '1.6 1.1'}" stroke-linecap="round" opacity="${open ? 0.95 : 0.35}"/>`;
      }
    }
    // nodes
    const current = save.current;
    for (const l of CAMPAIGN) {
      const open = isLevelOpen(save, l);
      const rec = save.levels[l.id];
      const big = l.kind === 'boss' || l.kind === 'secret';
      const r = big ? 3.2 : 2.5;
      const fill = !open ? '#6b6680' : l.kind === 'extra' ? '#8a5ad6' : l.kind === 'secret' ? '#2a1d4a' : l.kind === 'boss' ? '#d64a4a' : '#e9b949';
      const stars = rec?.stars ?? 0;
      let starsSvg = '';
      for (let i = 0; i < 3; i++) starsSvg += `<path transform="translate(${l.map[0] - 2.4 + i * 2.4} ${l.map[1] + r + 1.8}) scale(.034)" d="M32 4 L40 23 L60 24 L44 37 L50 57 L32 46 L14 57 L20 37 L4 24 L24 23 Z" fill="${i < stars ? '#ffd36b' : 'rgba(255,255,255,.25)'}" stroke="#6a4310" stroke-width="3"/>`;
      body += `<g class="node ${open ? 'open' : 'locked'} ${l.id === current && open ? 'current' : ''}" data-id="${l.id}" filter="url(#shadow)">
        <circle cx="${l.map[0]}" cy="${l.map[1]}" r="${r + 0.8}" fill="#2a1d14" opacity=".55"/>
        <circle cx="${l.map[0]}" cy="${l.map[1]}" r="${r}" fill="${fill}" stroke="#fff7e6" stroke-width=".45"/>
        ${open ? `<text x="${l.map[0]}" y="${l.map[1] + 1.1}" text-anchor="middle" class="nlabel">${l.kind === 'boss' ? '☠' : l.kind === 'secret' ? '∞' : l.kind === 'extra' ? '✦' : l.id.slice(1)}</text>` : `<path transform="translate(${l.map[0] - 1.3} ${l.map[1] - 1.4}) scale(.042)" d="M14 28 H50 V56 H14 Z M22 28 V20 A10 10 0 0 1 42 20 V28" fill="none" stroke="#fff7e6" stroke-width="6"/>`}
        ${open ? starsSvg : ''}
        ${rec?.crown ? `<path transform="translate(${l.map[0] - 1.6} ${l.map[1] - r - 3.2}) scale(.05)" d="M8 48 L12 18 L24 32 L32 12 L40 32 L52 18 L56 48 Z" fill="#ffd36b" stroke="#6a4310" stroke-width="4"/>` : ''}
      </g>`;
    }
    body += labels;
    // the colossus marks where you are
    const cur = LEVEL_BY_ID.get(current) ?? CAMPAIGN[0];
    body += `<g class="me" transform="translate(${cur.map[0] - 3.5} ${cur.map[1] - 10}) scale(.11)">${ICON.turtle.replace(/<\/?svg[^>]*>/g, '')}</g>`;
    svg.innerHTML = body;
    svg.querySelectorAll('.node.open').forEach((n) => {
      n.addEventListener('click', () => {
        this.sounds.click();
        const id = (n as HTMLElement).dataset.id!;
        this.levelCard(save, LEVEL_BY_ID.get(id)!, on);
      });
      n.addEventListener('pointerenter', () => this.sounds.hover());
    });
    svg.querySelectorAll('.node.locked').forEach((n) => {
      n.addEventListener('click', () => {
        const l = LEVEL_BY_ID.get((n as HTMLElement).dataset.id!)!;
        this.sounds.back();
        if (l.stars) this.toast(`${ICON.star.replace('<svg', '<svg class="ti"')} ${this.t('needStars', { n: l.stars })}`);
      });
    });
  }

  levelCard(save: SaveData, l: LevelEntry, on: { play: (id: string, mode: 'normal' | 'virtuoso') => void; endless: (w: WorldId) => void }) {
    const rec = save.levels[l.id];
    const beat = (rec?.stars ?? 0) > 0;
    const enemies = [...new Set(l.def.waves.flatMap((w) => w.groups.map((g) => g.kind)))].slice(0, 6);
    if (l.def.boss) enemies.unshift(l.def.boss.kind);
    const el = this.screen('dim center card-screen', `<div class="lcard ${l.world}">
      <div class="lc-head"><small>${WORLD_NAMES[l.world][this.lang]}</small><h2>${l.def.name[this.lang]}</h2>
        <div class="lc-stars">${[0, 1, 2].map((i) => `<i class="${i < (rec?.stars ?? 0) ? 'got' : ''}">${ICON.star}</i>`).join('')}${rec?.crown ? `<i class="crown">${ICON.crown}</i>` : ''}</div></div>
      <div class="lc-row towers">${l.def.towers.map((k) => `<i class="${l.def.newTower === k ? 'new' : ''}">${TOWER_ICON[k]}</i>`).join('')}</div>
      <div class="lc-row enemies">${enemies.map((k) => `<i>${enemyIcon(k)}</i>`).join('')}</div>
      <div class="row"></div></div>`);
    const row = el.querySelector('.row')!;
    row.append(this.btn(this.t('back'), () => el.remove(), 'ghost'));
    if (beat) row.append(this.btn(this.t('virtuoso'), () => {
      el.remove();
      on.play(l.id, 'virtuoso');
    }, 'purple', ICON.crown));
    row.append(this.btn(this.t('play'), () => {
      el.remove();
      on.play(l.id, 'normal');
    }, 'primary', ICON.play));
    if (l.kind === 'boss' && beat) {
      const best = save.levels[`bis-${l.world}`]?.best ?? 0;
      row.append(this.btn(`${this.t('endless')}${best ? ` · ${best}` : ''}`, () => {
        el.remove();
        on.endless(l.world);
      }, 'ghost', ICON.infinity));
    }
    el.addEventListener('click', (e) => {
      if (e.target === el) el.remove();
    });
  }

  // ───────────────────────────── in game ─────────────────────────────

  loading(on: boolean) {
    let el = this.root.querySelector('.loading') as HTMLElement | null;
    if (on && !el) el = this.screen('loading center', `<div class="walker">${ICON.turtle}</div><p>${this.t('loading')}</p>`);
    else if (!on && el) el.remove();
  }

  pause(on: { resume: () => void; restart: () => void; options: () => void; map: () => void }) {
    const el = this.screen('pause dim center', `<div class="panel narrow"><h2>${ICON.pause}</h2><div class="col"></div></div>`);
    const col = el.querySelector('.col')!;
    const close = (fn: () => void) => () => {
      el.remove();
      fn();
    };
    col.append(
      this.btn(this.t('resume'), close(on.resume), 'primary', ICON.play),
      this.btn(this.t('restart'), close(on.restart), '', ICON.restart),
      this.btn(this.t('options'), close(on.options), '', ICON.gear),
      this.btn(this.t('toMap'), close(on.map), 'ghost', ICON.map),
    );
    return el;
  }

  async results(o: { victory: boolean; stars: number; kills: number; collected: number; time: number; crown: boolean; endless?: number; next?: () => void; retry: () => void; map: () => void; scene?: () => void; sceneNew?: boolean }) {
    const el = this.screen('results dim center', `<div class="res">
      <div class="title ${o.victory ? '' : 'lose'}">${o.endless !== undefined ? `${this.t('endless')} · ${o.endless}` : o.victory ? this.t('victory') : this.t('defeat')}</div>
      ${o.victory || o.endless !== undefined ? `<div class="stars"><i>${ICON.star}</i><i class="mid">${ICON.star}</i><i>${ICON.star}</i></div>` : ''}
      ${o.crown ? `<i class="crown">${ICON.crown}</i>` : ''}
      <div class="row stats"><span><i>${ICON.wave}</i>${o.kills}</span><span><i>${ICON.coin}</i>${o.collected}</span><span>⏱ ${Math.floor(o.time / 60)}:${String(Math.floor(o.time % 60)).padStart(2, '0')}</span></div>
      <div class="row btns"></div></div>`);
    const row = el.querySelector('.btns')!;
    row.append(this.btn(this.t('toMap'), () => {
      el.remove();
      o.map();
    }, 'ghost', ICON.map));
    row.append(this.btn(this.t('retry'), () => {
      el.remove();
      o.retry();
    }, o.victory ? 'ghost' : 'primary', ICON.restart));
    if (o.next) row.append(this.btn(this.t('next'), () => {
      el.remove();
      o.next!();
    }, 'primary', ICON.next));
    // the story: a new scene waits on the way out (a glowing film strip); an old one can be watched again
    if (o.scene) row.append(this.btn(this.t('watchScene'), () => {
      el.remove();
      o.scene!();
    }, 'ghost', FILM_ICON));
    if (o.sceneNew) el.querySelector('.res')!.insertAdjacentHTML('beforeend', `<div class="story-hint"><i>${FILM_ICON}</i>${this.t('newScene')}</div>`);
    if (o.victory) {
      const stars = [...el.querySelectorAll('.stars i')];
      for (let i = 0; i < 3; i++) {
        await sleep(450);
        stars[i].classList.add('show');
        if (i < o.stars) {
          stars[i].classList.add('got');
          this.sounds.star(i);
        }
      }
    }
  }

  install(mode: 'prompt' | 'ios' | 'elsewhere' | 'unsupported', url: string) {
    const key = mode === 'ios' ? 'installIos' : mode === 'elsewhere' ? 'installElsewhere' : 'installUnsupported';
    const el = this.screen('dim center dialog-screen', `<div class="dialog wide"><h3>${this.t('install')}</h3><p class="help">${this.t(key)}</p><p class="url">${mode === 'ios' ? '' : url}</p><p class="help small">${this.t('installWhy')}</p><div class="row"></div></div>`);
    const row = el.querySelector('.row')!;
    row.append(this.btn(this.t('close'), () => el.remove(), 'ghost'));
    if (mode === 'elsewhere') row.append(this.btn(this.t('openSite'), () => window.open(url, '_blank', 'noopener')));
  }
}

const FILM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M7 5v4M12 5v4M17 5v4M7 15v4M12 15v4M17 15v4"/><path d="M10.5 10.6v2.8l2.6-1.4z" fill="currentColor"/></svg>`;

const SCENE_GLYPH: Record<string, string> = {
  opening: `<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.4L21 9l-5 4.4L17.6 20 12 16.6 6.4 20 8 13.4 3 9l6.4-.6z" fill="currentColor"/></svg>`,
  interlude: `<svg viewBox="0 0 24 24"><ellipse cx="8" cy="17" rx="4" ry="3" transform="rotate(-20 8 17)" fill="currentColor"/><path d="M11.5 16V4c3 2 6 3 6 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  guardian: `<svg viewBox="0 0 24 24"><path d="M12 2l5 7-5 13-5-13z" fill="currentColor"/><path d="M7 9h10" stroke="#00000044" stroke-width="1.4"/></svg>`,
  memory: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="7.5" ry="9" fill="currentColor"/><circle cx="9.3" cy="10" r="1.4" fill="#1b1630"/><circle cx="14.7" cy="10" r="1.4" fill="#1b1630"/><path d="M10 15.2l4 2.4M14 15.2l-4 2.4" stroke="#1b1630" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  ending: `<svg viewBox="0 0 24 24"><path d="M3 18l2-11 4.5 5L12 4l2.5 8L19 7l2 11z" fill="currentColor"/></svg>`,
  epilogue: `<svg viewBox="0 0 24 24"><path d="M8 4.5l6 5-5 3 5 3-3 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// INTEGRATION: styles of the story gallery and the results' "new scene" hint (could live in ui.css)
const GALLERY_CSS = `
.story-gallery { background: radial-gradient(ellipse at 50% 20%, rgba(34,24,61,.82), rgba(7,5,13,.94)); overflow: hidden; }
.story-gallery .sg-panel { position: absolute; inset: calc(16px + var(--safe-t, 0px)) calc(16px + var(--safe-r, 0px)) calc(16px + var(--safe-b, 0px)) calc(16px + var(--safe-l, 0px)); display: flex; flex-direction: column; align-items: center; }
.story-gallery h2 { font-family: var(--deco, Georgia, serif); color: var(--gold, #ffd36b); font-size: clamp(26px, 4vw, 40px); margin: 4px 0 10px; letter-spacing: .08em; text-shadow: 0 3px 0 #6a4310, 0 0 24px rgba(255,211,107,.4); }
.story-gallery .sg-list { flex: 1; width: min(1100px, 100%); overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 4px 6px 12px; scrollbar-width: thin; }
.story-gallery .sg-sec h3 { margin: 0 0 6px; font-family: var(--serif, Georgia, serif); font-weight: 700; font-size: 15px; letter-spacing: .12em; color: var(--c1); text-transform: uppercase; text-shadow: 0 2px 6px rgba(0,0,0,.6); }
.story-gallery .sg-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.story-gallery .sg-card { position: relative; height: 84px; border: 0; border-radius: 14px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px;
  background: linear-gradient(160deg, var(--c2), #1a1330 120%); color: #fff7e6; box-shadow: inset 0 0 0 2px rgba(255,247,230,.16), 0 6px 16px rgba(0,0,0,.4); transition: transform .15s, box-shadow .15s; font-family: var(--round, sans-serif); }
.story-gallery .sg-card:hover { transform: translateY(-2px) scale(1.03); box-shadow: inset 0 0 0 2px var(--c1), 0 10px 22px rgba(0,0,0,.5); }
.story-gallery .sg-card .g { width: 28px; height: 28px; color: var(--c1); filter: drop-shadow(0 0 8px rgba(255,255,255,.25)); display: flex; align-items: center; justify-content: center; }
.story-gallery .sg-card .g svg { width: 100%; height: 100%; }
.story-gallery .sg-card .g em { font-style: normal; font-family: var(--serif, Georgia, serif); font-weight: 700; font-size: 24px; letter-spacing: .04em; }
.story-gallery .sg-card b { font-size: 13px; font-weight: 800; line-height: 1.15; text-align: center; }
.story-gallery .sg-card.chapter { background: linear-gradient(160deg, var(--c1), var(--c2) 70%); color: #2a1d14; }
.story-gallery .sg-card.chapter .g { color: #2a1d14; }
.story-gallery .sg-card.memory { background: linear-gradient(160deg, #4a3470, #1a1330); }
.story-gallery .sg-card.memory .g { color: #e6d9ff; }
.story-gallery .sg-card.ending, .story-gallery .sg-card.opening { background: linear-gradient(160deg, #6a4ab0, #20163a); }
.story-gallery .sg-card.ending .g, .story-gallery .sg-card.opening .g { color: var(--gold, #ffd36b); }
.story-gallery .sg-card.locked { cursor: default; filter: grayscale(1) brightness(.55); }
.story-gallery .sg-card.locked:hover { transform: none; box-shadow: inset 0 0 0 2px rgba(255,247,230,.16); }
.story-gallery .sg-card.locked .g { font-family: var(--deco, Georgia, serif); font-size: 26px; color: rgba(255,247,230,.6); }
.story-gallery .row { display: flex; justify-content: center; padding-top: 8px; }
.res .story-hint { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold, #ffd36b); text-shadow: 0 0 14px rgba(255,211,107,.6); animation: storyhint 1.6s ease-in-out infinite; }
.res .story-hint i { width: 22px; height: 22px; display: inline-block; }
@keyframes storyhint { 50% { opacity: .55; } }
@media (max-width: 640px) { .story-gallery .sg-cards { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); } .story-gallery .sg-card { height: 74px; } }
`;

function worldDecor(w: WorldId, cx: number, cy: number, r: number): string {
  let s = '';
  const rnd = (i: number) => (Math.sin(i * 12.9898 + cx * 78.233) * 43758.5453) % 1;
  for (let i = 0; i < 9; i++) {
    const a = Math.abs(rnd(i)) * Math.PI * 2, d = r * (0.35 + Math.abs(rnd(i + 30)) * 0.5);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
    if (w === 'meadow') s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect x="-.2" y="0" width=".4" height="1.2" fill="#7a5236"/><circle cy="-.3" r="1.2" fill="#4f9d3b"/><circle cx=".6" cy="-.6" r=".8" fill="#68b648"/></g>`;
    else if (w === 'desert') s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path d="M-2 1 Q0 -1.4 2 1 Z" fill="#e0b070"/><rect x="-.25" y="-1.6" width=".5" height="2.4" rx=".25" fill="#5d9b4a"/></g>`;
    else if (w === 'ice') s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path d="M-1.8 1 L0 -2.2 L1.8 1 Z" fill="#c4d6ec"/><path d="M-.7 -.6 L0 -2.2 L.7 -.6 Z" fill="#fff"/></g>`;
    else if (w === 'forge') s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path d="M-2 1 L-.6 -1.8 L.6 -1.8 L2 1 Z" fill="#2a2224"/><circle cy="-2.2" r=".6" fill="#ff7a2a"/></g>`;
    else s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect x="-.5" y="-2" width="1" height="3" fill="#a8a0cc"/><path d="M-.8 -2 L0 -3 L.8 -2 Z" fill="#ffd36b"/></g>`;
  }
  return s;
}

/** Rising embers for the studio logo. */
function embers(cv: HTMLCanvasElement): () => void {
  const g = cv.getContext('2d')!;
  let run = true;
  const P: { x: number; y: number; vx: number; vy: number; l: number; s: number }[] = [];
  const resize = () => {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
  };
  resize();
  const loop = () => {
    if (!run) return;
    requestAnimationFrame(loop);
    g.clearRect(0, 0, cv.width, cv.height);
    if (P.length < 140) P.push({ x: cv.width * (0.3 + Math.random() * 0.4), y: cv.height * (0.6 + Math.random() * 0.4), vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random() * 1.6, l: 1, s: 1 + Math.random() * 2.2 });
    for (const p of P) {
      p.x += p.vx + Math.sin(p.y * 0.02) * 0.3;
      p.y += p.vy;
      p.l -= 0.006;
      const a = Math.max(0, p.l);
      g.fillStyle = `rgba(255,${120 + Math.floor(a * 100)},40,${a * 0.85})`;
      g.beginPath();
      g.arc(p.x, p.y, p.s * a, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].l <= 0) P.splice(i, 1);
  };
  loop();
  return () => (run = false);
}

/** Golden notes drifting toward the centre behind the title. */
function notesRain(cv: HTMLCanvasElement): () => void {
  const g = cv.getContext('2d')!;
  let run = true;
  cv.width = window.innerWidth;
  cv.height = window.innerHeight;
  const N: { x: number; y: number; a: number; s: number; v: number; r: number }[] = [];
  for (let i = 0; i < 46; i++) N.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, a: Math.random() * 6.28, s: 0.6 + Math.random() * 1.2, v: 0.3 + Math.random(), r: Math.random() * 6.28 });
  const glyphs = ['♪', '♫', '♩', '♬'];
  const loop = () => {
    if (!run) return;
    requestAnimationFrame(loop);
    g.clearRect(0, 0, cv.width, cv.height);
    for (const n of N) {
      n.y -= n.v * 0.6;
      n.x += Math.sin(n.a += 0.01) * 0.4;
      n.r += 0.01;
      if (n.y < -30) {
        n.y = cv.height + 30;
        n.x = Math.random() * cv.width;
      }
      g.save();
      g.translate(n.x, n.y);
      g.rotate(Math.sin(n.r) * 0.3);
      g.font = `${Math.floor(18 * n.s)}px Georgia, serif`;
      g.fillStyle = `rgba(255, 220, 140, ${0.15 + n.s * 0.2})`;
      g.fillText(glyphs[Math.floor(n.a * 10) % 4], 0, 0);
      g.restore();
    }
  };
  loop();
  return () => (run = false);
}
