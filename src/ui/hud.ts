/** Battle HUD: lives, notes (coins), waves, the FORTÍSSIMO button, wave calls, radial menus, cards. */
import { ENEMIES, TOWERS, type EnemyKind, type TowerKind } from '../sim/defs';
import { ICON, TOWER_ICON, enemyIcon } from './icons';
import './harmony.css';
import './rhythm.css';

/** the Maestro's baton (the rhythm button) */
const BATON = `<svg viewBox="0 0 64 64" fill="none"><path d="M17 47 L49 13" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/><path d="M12 52 l7-7" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><path d="M48 4l2.2 5.2 5.3 2.2-5.3 2.2L48 19l-2.2-5.2-5.3-2.2 5.3-2.2z" fill="#ffe9a8"/></svg>`;
const SEG = 276.5 / 4 - 9;

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export interface BuildOption {
  kind: TowerKind;
  cost: number;
  affordable: boolean;
  isNew: boolean;
  /** colours of the duets it would form with the chosen plate's neighbours (sparkles) */
  duets?: string[];
}

export class Hud {
  readonly root: HTMLElement;
  private lives: HTMLElement;
  private coins: HTMLElement;
  private wave: HTMLElement;
  private pips: HTMLElement;
  private ff: HTMLButtonElement;
  private ffRing: SVGCircleElement;
  private calls: HTMLButtonElement[] = [];
  private radial: HTMLElement;
  private floats: HTMLElement;
  private vignette: HTMLElement;
  private bannerEl: HTMLElement;
  private handEl: HTMLElement;
  private countEl: HTMLElement;
  private harmonyEl: HTMLElement;
  private lastHarmony = -1;
  private lastCoins = -1;
  private lastLives = -1;
  radialOpen = false;
  onPause: () => void = () => {};
  onFF: () => void = () => {};
  onCall: (gate: number) => void = () => {};
  onHoverTower: (k: TowerKind | null) => void = () => {};
  onGo: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = h(`<div id="hud">
      <div class="hud-tl">
        <div class="stat lives"><i>${ICON.heart}</i><b>20</b></div>
        <div class="stat coins"><i>${ICON.coin}</i><b>0</b></div>
        <div class="stat wave"><i>${ICON.wave}</i><div class="wave-pips"></div></div>
        <div class="stat harmony"><div class="lights"><span></span><span></span><span></span><span></span><span></span></div></div>
      </div>
      <div class="hud-tr"><button class="round-btn pause" aria-label="pause">${ICON.pause}</button></div>
      <div id="floats"></div>
      <div id="vignette"></div>
      <div id="radial"></div>
      <div id="banner"><div class="big"></div><div class="icons"></div></div>
      <div id="countin"></div>
      <button id="ff-btn" aria-label="fortissimo"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,247,230,.12)"/><circle class="fill" cx="50" cy="50" r="44" stroke="#ffd36b" stroke-dasharray="276.5" stroke-dashoffset="276.5" transform="rotate(-90 50 50)" stroke-linecap="round"/></svg><div class="glyph">${ICON.ff}</div></button>
      <div id="hand">${ICON.hand}</div>
      <div id="journey"><div class="track"><div class="fill"></div></div><div class="marks"></div><i class="me">${ICON.turtle}</i><i class="goal">${ICON.bell}</i></div>
      <div id="arrows"></div>
      <button id="go" aria-label="go"><span class="ico">${ICON.play}</span></button>
      <div id="groove-glow"></div>
      <div id="baton-wrap">
        <div id="call"><div class="track">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<b style="left:${(i + 0.5) * 12.5}%" class="${i % 2 ? 'off' : ''}"></b>`).join('')}</div><div class="notes"></div><i class="head"></i></div>
        <div class="approach"></div><div class="approach off"></div><div class="tell"></div><div class="tell-n"></div>
        <button id="baton" aria-label="baton"><svg class="groove" viewBox="0 0 100 100">${[0, 1, 2, 3].map((i) => `<circle class="seg" cx="50" cy="50" r="45" stroke-dasharray="${SEG.toFixed(1)} 400" transform="rotate(${-90 + 4.5 + i * 90} 50 50)"/>`).join('')}<circle class="prog" cx="50" cy="50" r="37" stroke-dasharray="232.5" stroke-dashoffset="232.5" transform="rotate(-90 50 50)"/></svg><div class="glyph">${BATON}</div></button>
        <div class="sparks"></div>
        <div id="power"><div class="bar"><div class="fill"></div><i style="bottom:20%"></i><i style="bottom:45%"></i><i style="bottom:70%"></i><i style="bottom:90%"></i></div><div class="side"><b class="mult">×1.00</b><b class="combo">0</b><div class="cresc"></div></div></div>
      </div>
      <div id="rhythm-sum"></div>
      <div id="boss-bar"><div class="head"><i class="ico"></i><span class="name"></span></div><div class="track"><div class="fill"></div><div class="notches"></div></div></div>
      <div id="boss-card"><i class="ico"></i><div class="name"></div></div>
    </div>`);
    parent.appendChild(this.root);
    const $ = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.lives = $('.stat.lives');
    this.coins = $('.stat.coins');
    this.wave = $('.stat.wave');
    this.pips = $('.wave-pips');
    this.ff = $('#ff-btn') as HTMLButtonElement;
    this.ffRing = this.root.querySelector('#ff-btn .fill') as SVGCircleElement;
    this.radial = $('#radial');
    this.floats = $('#floats');
    this.vignette = $('#vignette');
    this.bannerEl = $('#banner');
    this.handEl = $('#hand');
    this.countEl = $('#countin');
    this.harmonyEl = $('.stat.harmony');
    this.batonEl = $('#baton') as HTMLButtonElement;
    this.batonWrap = $('#baton-wrap');
    this.approach = [...this.root.querySelectorAll('#baton-wrap .approach')] as HTMLElement[];
    this.sparks = $('#baton-wrap .sparks');
    this.callEl = $('#call');
    this.grooveGlow = $('#groove-glow');
    this.powerEl = $('#power');
    // the baton answers on pointerdown (timing matters), with the event's own time stamp
    this.batonEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onBaton(e.timeStamp);
    });
    $('.pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPause();
    });
    this.ff.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onFF();
    });
    $('#go').addEventListener('click', (e) => {
      e.stopPropagation();
      this.onGo();
    });
    // clicks on HUD elements must not reach the 3D canvas
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.stopPropagation();
    });
  }

  show(on: boolean) {
    this.root.classList.toggle('on', on);
    if (!on) this.closeRadial();
  }

  setLives(n: number) {
    if (n === this.lastLives) return;
    if (this.lastLives >= 0 && n < this.lastLives) {
      this.lives.classList.remove('hurt');
      void this.lives.offsetWidth;
      this.lives.classList.add('hurt');
    }
    this.lastLives = n;
    (this.lives.querySelector('b') as HTMLElement).textContent = String(n);
  }

  setCoins(n: number) {
    if (n === this.lastCoins) return;
    if (this.lastCoins >= 0 && n > this.lastCoins) {
      this.coins.classList.remove('bump');
      void this.coins.offsetWidth;
      this.coins.classList.add('bump');
    }
    this.lastCoins = n;
    (this.coins.querySelector('b') as HTMLElement).textContent = String(n);
  }

  denyCoins() {
    this.coins.classList.remove('deny');
    void this.coins.offsetWidth;
    this.coins.classList.add('deny');
  }

  /** waves: done count, current (index being played or -1), total (Infinity → counter) */
  setWave(done: number, current: number, total: number) {
    const key = `${done}:${current}:${total}`;
    if (this.pips.dataset.k === key) return;
    this.pips.dataset.k = key;
    if (!isFinite(total)) {
      this.pips.innerHTML = `<b style="font-size:20px">${done}</b>`;
      return;
    }
    let s = '';
    for (let i = 0; i < total; i++) s += `<span class="${i < done ? 'done' : i === current ? 'now' : ''}"></span>`;
    this.pips.innerHTML = s;
  }

  coinsAnchor(): { x: number; y: number } {
    const r = this.coins.querySelector('i')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  setFF(charge: number, ready: boolean, live: boolean, enabled: boolean) {
    this.ff.style.display = enabled ? '' : 'none';
    this.ffRing.style.strokeDashoffset = String(276.5 * (1 - Math.min(1, charge)));
    this.ff.classList.toggle('ready', ready);
    this.ff.classList.toggle('live', live);
  }

  // ───────── the band ─────────

  /** harmony 0…5 as five little lights; they glow for a moment when it rises */
  setHarmony(h: number) {
    if (h === this.lastHarmony) return;
    const rose = this.lastHarmony >= 0 && h > this.lastHarmony;
    this.lastHarmony = h;
    [...this.harmonyEl.querySelectorAll('.lights span')].forEach((s, i) => s.classList.toggle('on', i < h));
    this.harmonyEl.classList.toggle('full', h >= 5);
    if (rose) {
      this.harmonyEl.classList.remove('rise');
      void this.harmonyEl.offsetWidth;
      this.harmonyEl.classList.add('rise');
    }
  }

  /** a duet just formed: the harmony pill flashes in the duet's colour */
  duetFlash(color: string) {
    this.harmonyEl.style.setProperty('--duet', color);
    this.harmonyEl.classList.remove('duet');
    void this.harmonyEl.offsetWidth;
    this.harmonyEl.classList.add('duet');
  }

  /** the colossus healed (hymn): the heart beats green */
  healed() {
    this.lives.classList.remove('healed');
    void this.lives.offsetWidth;
    this.lives.classList.add('healed');
  }

  // ───────── journey ─────────

  /**
   * progress 0..1, markers (elites, guardians: position 0..1, kind, done) and the movements of the
   * journey (where each breather begins and where its movement starts, 0..1)
   */
  setJourney(frac: number, marks: { at: number; kind: EnemyKind; done: boolean; elite?: boolean }[], moves: { rest: number; at: number; done: boolean }[] = []) {
    const j = this.root.querySelector('#journey') as HTMLElement;
    (j.querySelector('.fill') as HTMLElement).style.width = `${(frac * 100).toFixed(2)}%`;
    (j.querySelector('.me') as HTMLElement).style.left = `${(frac * 100).toFixed(2)}%`;
    const key = marks.map((m) => `${m.at.toFixed(3)}${m.kind}${m.done ? 1 : 0}`).join('|') + '/' + moves.map((m) => `${m.at.toFixed(3)}${m.done ? 1 : 0}`).join('|');
    const mk = j.querySelector('.marks') as HTMLElement;
    if (mk.dataset.k !== key) {
      mk.dataset.k = key;
      const pct = (v: number) => (v * 100).toFixed(2);
      // breathers: a soft gold stretch with a little plate where it begins; movements: a bar line
      const mv = moves
        .map((m) => `<b class="rest ${m.done ? 'done' : ''}" style="left:${pct(m.rest)}%;width:${pct(Math.max(0.004, m.at - m.rest))}%"></b><b class="plate ${m.done ? 'done' : ''}" style="left:${pct(m.rest)}%"></b><b class="bar ${m.done ? 'done' : ''}" style="left:${pct(m.at)}%"></b>`)
        .join('');
      mk.innerHTML = mv + marks.map((m) => `<i class="${m.done ? 'done' : ''} ${m.elite ? 'elite' : ''}" style="left:${pct(m.at)}%">${enemyIcon(m.kind)}</i>`).join('');
    }
  }

  /** a movement begins: its numeral, and the creatures it brings */
  movement(index: number, icons: EnemyKind[]) {
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][index] ?? String(index + 1);
    this.banner(roman, icons.slice(0, 4));
  }

  setGoal(svg: string) {
    (this.root.querySelector('#journey .goal') as HTMLElement).innerHTML = svg;
  }

  /** big ▶ to set off */
  showGo(on: boolean) {
    (this.root.querySelector('#go') as HTMLElement).classList.toggle('on', on);
  }

  /** arrows at the screen edge pointing to where creatures are coming from */
  setArrows(list: { x: number; y: number; angle: number; kinds: EnemyKind[]; urgent: boolean }[]) {
    const box = this.root.querySelector('#arrows') as HTMLElement;
    while (box.children.length < list.length) box.appendChild(h(`<div class="arrow"><div class="tip"></div><div class="kinds"></div></div>`));
    [...box.children].forEach((el, i) => {
      const a = list[i];
      const e = el as HTMLElement;
      if (!a) {
        e.style.display = 'none';
        return;
      }
      e.style.display = '';
      e.style.left = `${a.x}px`;
      e.style.top = `${a.y}px`;
      (e.querySelector('.tip') as HTMLElement).style.transform = `rotate(${a.angle}rad)`;
      e.classList.toggle('urgent', a.urgent);
      const k = a.kinds.join(',');
      const ks = e.querySelector('.kinds') as HTMLElement;
      if (ks.dataset.k !== k) {
        ks.dataset.k = k;
        ks.innerHTML = a.kinds.slice(0, 3).map((x) => `<i>${enemyIcon(x)}</i>`).join('');
      }
    });
  }

  // ───────── wave calls ─────────

  setCall(gate: number, state: 'first' | 'early' | 'hidden', x: number, y: number, frac: number, preview: { kind: EnemyKind; count: number }[], bonus: number) {
    let b = this.calls[gate];
    if (!b) {
      b = h(`<button class="wave-call"><svg class="timer" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" stroke-dasharray="289" stroke-dashoffset="0" transform="rotate(-90 50 50)"/></svg><div class="ico">${ICON.next}</div><div class="preview"></div><div class="bonus"></div></button>`) as HTMLButtonElement;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onCall(gate);
      });
      this.root.appendChild(b);
      this.calls[gate] = b;
    }
    if (state === 'hidden') {
      b.style.display = 'none';
      return;
    }
    b.style.display = '';
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.classList.toggle('first', state === 'first');
    (b.querySelector('.ico') as HTMLElement).innerHTML = state === 'first' ? ICON.play : ICON.next;
    const c = b.querySelector('.timer circle') as SVGCircleElement;
    c.style.display = state === 'early' ? '' : 'none';
    c.style.strokeDashoffset = String(289 * (1 - frac));
    const key = preview.map((p) => `${p.kind}${p.count}`).join(',');
    const pv = b.querySelector('.preview') as HTMLElement;
    if (pv.dataset.k !== key) {
      pv.dataset.k = key;
      pv.innerHTML = preview.map((p) => `<span><i>${enemyIcon(p.kind)}</i>${p.count > 1 ? p.count : ''}</span>`).join('');
      pv.style.display = preview.length ? '' : 'none';
    }
    const bo = b.querySelector('.bonus') as HTMLElement;
    bo.innerHTML = bonus > 0 ? `<i>${ICON.coin}</i>+${bonus}` : '';
  }

  hideCalls() {
    for (const b of this.calls) if (b) b.style.display = 'none';
  }

  // ───────── radial menus ─────────

  openBuild(x: number, y: number, options: BuildOption[], onPick: (k: TowerKind) => void) {
    this.radial.innerHTML = '<div class="ring-bg"></div>';
    const n = options.length;
    const R = n <= 1 ? 0 : n <= 4 ? 82 : 96;
    options.forEach((o, i) => {
      const a = n === 1 ? -Math.PI / 2 : -Math.PI / 2 + (i / n) * Math.PI * 2;
      const duet = o.duets?.length ? `<span class="duet-spark" style="--duet:${o.duets[0]}"></span>` : '';
      const b = h(`<button class="rb ${o.affordable ? '' : 'poor'} ${o.isNew ? 'new' : ''} ${o.duets?.length ? 'duet' : ''}" data-k="${o.kind}">${duet}${TOWER_ICON[o.kind]}<span class="price"><i>${ICON.coin}</i>${o.cost}</span></button>`) as HTMLButtonElement;
      if (o.duets?.length) b.style.setProperty('--duet', o.duets[0]);
      b.style.left = `${Math.cos(a) * R}px`;
      b.style.top = `${Math.sin(a) * R}px`;
      b.style.transitionDelay = `${i * 0.03}s`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(o.kind);
      });
      b.addEventListener('pointerenter', () => this.onHoverTower(o.kind));
      b.addEventListener('pointerleave', () => this.onHoverTower(null));
      this.radial.appendChild(b);
    });
    this.place(x, y);
    this.radialOpen = true;
    requestAnimationFrame(() => this.radial.classList.add('open'));
  }

  openTower(x: number, y: number, level: number, upCost: number | null, affordable: boolean, sellValue: number, onUp: () => void, onSell: () => void) {
    this.radial.innerHTML = '<div class="ring-bg"></div>';
    // (a musician at its top level has nothing to grow into: only its crown, not a button)
    const up = upCost === null
      ? h(`<div class="rb-crown">${ICON.crown}</div>`)
      : (h(`<button class="rb up ${!affordable ? 'poor' : ''}">${ICON.up}<span class="price"><i>${ICON.coin}</i>${upCost}</span></button>`) as HTMLButtonElement);
    up.style.left = '0px';
    up.style.top = '-88px';
    if (upCost !== null) {
      up.addEventListener('click', (e) => {
        e.stopPropagation();
        onUp();
      });
    }
    const sell = h(`<button class="rb sell">${ICON.sell}<span class="price"><i>${ICON.coin}</i>+${sellValue}</span></button>`) as HTMLButtonElement;
    sell.style.left = '0px';
    sell.style.top = '88px';
    sell.addEventListener('click', (e) => {
      e.stopPropagation();
      onSell();
    });
    const pips = h(`<div class="pips">${[0, 1, 2].map((i) => `<span class="${i <= level ? 'on' : ''}"></span>`).join('')}</div>`);
    pips.style.left = '0px';
    pips.style.top = '-140px';
    this.radial.append(up, sell, pips);
    this.place(x, y);
    this.radialOpen = true;
    requestAnimationFrame(() => this.radial.classList.add('open'));
  }

  place(x: number, y: number) {
    // keep the menu on screen
    const m = 110;
    const cx = Math.max(m, Math.min(window.innerWidth - m, x));
    const cy = Math.max(m + 20, Math.min(window.innerHeight - m, y));
    this.radial.style.transform = `translate(${cx}px, ${cy}px)`;
  }

  closeRadial() {
    this.radial.classList.remove('open');
    this.radial.innerHTML = '';
    this.radialOpen = false;
    this.onHoverTower(null);
  }

  // ───────── feedback ─────────

  /** notes fly from a screen point to the coin counter */
  flyCoins(x: number, y: number, n: number) {
    const target = this.coinsAnchor();
    for (let i = 0; i < n; i++) {
      const el = h(`<div class="float-coin">${ICON.coin}</div>`);
      const jx = (Math.random() - 0.5) * 40, jy = (Math.random() - 0.5) * 30;
      el.style.left = `${x + jx}px`;
      el.style.top = `${y + jy}px`;
      this.floats.appendChild(el);
      setTimeout(() => {
        el.style.transform = `translate(${target.x - x - jx}px, ${target.y - y - jy}px) scale(.7)`;
        el.style.opacity = '0.2';
      }, 30 + i * 60);
      setTimeout(() => el.remove(), 900 + i * 60);
    }
  }

  floatNum(x: number, y: number, html: string) {
    const el = h(`<div class="float-num">${html}</div>`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.floats.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  hurt() {
    this.vignette.classList.add('on');
    setTimeout(() => this.vignette.classList.remove('on'), 120);
  }

  banner(big: string, icons: EnemyKind[] = []) {
    (this.bannerEl.querySelector('.big') as HTMLElement).innerHTML = big;
    (this.bannerEl.querySelector('.icons') as HTMLElement).innerHTML = icons.map((k) => `<i>${enemyIcon(k)}</i>`).join('');
    this.bannerEl.classList.add('on');
    clearTimeout((this.bannerEl as unknown as { _t: number })._t);
    (this.bannerEl as unknown as { _t: number })._t = window.setTimeout(() => this.bannerEl.classList.remove('on'), 1800);
  }

  /** the glove at p; `press` (0…1, 1 = finger down) makes it tap in time instead of its own loop */
  hand(p: { x: number; y: number } | null, press?: number) {
    this.handEl.classList.toggle('on', !!p);
    this.handEl.classList.toggle('sync', press !== undefined);
    if (p) {
      this.handEl.style.left = `${p.x}px`;
      this.handEl.style.top = `${p.y}px`;
      if (press !== undefined) this.handEl.style.transform = `translate(${(1 - press) * 16}px, ${(1 - press) * 24}px) scale(${1 - press * 0.12})`;
      else this.handEl.style.transform = '';
    }
  }

  // ───────── the baton (v3: the player conducts) ─────────

  private batonEl!: HTMLButtonElement;
  private batonWrap!: HTMLElement;
  private approach: HTMLElement[] = [];
  private sparks!: HTMLElement;
  private callEl!: HTMLElement;
  private grooveGlow!: HTMLElement;
  private lastGroove = -1;
  private lastProg = -1;
  private callKey = '';
  /** a baton tap (pointerdown or key), with the event's time stamp (performance.now() clock) */
  onBaton: (timeStamp: number) => void = () => {};

  /** where the baton is on screen (the glove taps there) */
  batonCenter(): { x: number; y: number } | null {
    const r = this.batonEl.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }

  /**
   * The beat as heard: rings close in on the baton and meet it on every beat (gold on the
   * downbeat); at high groove a smaller ring marks the eighths too. `beatPos` in beats of the song;
   * `tension` (0…1) as a wave draws near: the rings burn hotter.
   */
  setBeat(beatPos: number, beatsPerBar: number, eighths: boolean, groove: number, tension = 0) {
    this.batonWrap.classList.toggle('tense', tension > 0.01);
    const u = beatPos - Math.floor(beatPos);
    const beatInBar = ((Math.floor(beatPos) % beatsPerBar) + beatsPerBar) % beatsPerBar;
    const next = (beatInBar + 1) % beatsPerBar;
    const [a, b] = this.approach;
    a.style.transform = `scale(${(1 + 0.7 * (1 - u)).toFixed(3)})`;
    a.style.opacity = (0.15 + 0.85 * u).toFixed(3);
    a.classList.toggle('down', next === 0);
    // the perfect window: the closing ring turns gold right on the beat
    this.batonWrap.classList.toggle('now', u > 0.9 || u < 0.07);
    if (eighths) {
      const v = (u + 0.5) % 1;
      b.style.display = '';
      b.style.transform = `scale(${(1 + 0.5 * (1 - v)).toFixed(3)})`;
      b.style.opacity = (0.5 * v).toFixed(3);
    } else b.style.display = 'none';
    // the baton breathes with the beat (brighter with the groove)
    const flash = Math.exp(-u * 7) * (0.5 + 0.12 * groove + 0.4 * tension);
    this.batonWrap.style.setProperty('--flash', flash.toFixed(3));
    this.grooveGlow.style.setProperty('--flash', (Math.exp(-u * 4) * (beatInBar === 0 ? 1 : 0.6)).toFixed(3));
  }

  /** groove 0…4 (lit segments), progress toward the next level 0…1 */
  setGroove(level: number, progress: number) {
    const p = Math.round(progress * 40) / 40;
    if (level === this.lastGroove && p === this.lastProg) return;
    const rose = this.lastGroove >= 0 && level > this.lastGroove;
    const fell = this.lastGroove >= 0 && level < this.lastGroove;
    this.lastGroove = level;
    this.lastProg = p;
    [...this.batonEl.querySelectorAll('.seg')].forEach((c, i) => c.classList.toggle('on', i < level));
    (this.batonEl.querySelector('.prog') as SVGCircleElement).style.strokeDashoffset = String(232.5 * (1 - (level >= 4 ? 1 : p)));
    for (let g = 0; g <= 4; g++) this.batonWrap.classList.toggle(`g${g}`, g === level);
    this.grooveGlow.classList.toggle('on', level >= 4);
    if (rose) this.retrigger(this.batonWrap, level >= 4 ? 'peak' : 'rise');
    if (fell) this.retrigger(this.batonWrap, 'fall');
    if (rose && level >= 4) this.retrigger(this.grooveGlow, 'burst');
  }

  /** a judged tap: sparks (gold for perfect, white for good), a little shake for a miss */
  batonHit(q: 'perfect' | 'good' | 'miss', groove: number) {
    this.retrigger(this.batonWrap, `hit-${q}`);
    if (q === 'miss') return;
    const n = q === 'perfect' ? 10 + groove * 2 : 6;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = (q === 'perfect' ? 62 : 46) + Math.random() * 26 + groove * 6;
      el.className = q;
      el.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      el.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      this.sparks.appendChild(el);
      setTimeout(() => el.remove(), 650);
    }
    if (q === 'perfect') {
      const st = document.createElement('b');
      st.innerHTML = ICON.star;
      this.sparks.appendChild(st);
      setTimeout(() => st.remove(), 700);
    }
  }

  /**
   * The Maestro's call over the baton: a little bar of eight eighths with the call's four notes.
   * states per note: 0 waiting, 1 the Maestro plays it, 2 to echo, 3 echoed right, 4 wrong; head =
   * where the bar is (0…1, −1 hidden). Null hides it.
   */
  setMaestro(c: { pattern: number[]; states: number[]; head: number; echo: boolean } | null) {
    if (!c) {
      this.callEl.classList.remove('on');
      this.callKey = '';
      return;
    }
    this.callEl.classList.add('on');
    this.callEl.classList.toggle('echo', c.echo);
    const key = c.pattern.join(',') + '/' + c.states.join('');
    if (key !== this.callKey) {
      this.callKey = key;
      const notes = this.callEl.querySelector('.notes') as HTMLElement;
      notes.innerHTML = c.pattern.map((p, i) => `<i class="s${c.states[i]}" style="left:${(p + 0.5) * 12.5}%"></i>`).join('');
    }
    const head = this.callEl.querySelector('.head') as HTMLElement;
    head.style.display = c.head < 0 ? 'none' : '';
    head.style.left = `${(Math.max(0, Math.min(1, c.head)) * 100).toFixed(2)}%`;
  }

  // ───────── the power meter (v4) ─────────

  private powerEl!: HTMLElement;
  private lastPowerKey = '';
  private lastCombo = 0;

  /**
   * The power meter beside the baton: a bar in colour bands (the groove thresholds marked), the
   * band's multiplier, the combo (pops on every hit) and the crescendo stars of the journey.
   */
  setPower(power: number, combo: number, mult: number, crescendo: number, movements: number) {
    const key = `${Math.round(power)}:${combo}:${mult.toFixed(2)}:${crescendo}:${movements}`;
    if (key === this.lastPowerKey) return;
    this.lastPowerKey = key;
    const el = this.powerEl;
    (el.querySelector('.fill') as HTMLElement).style.height = `${Math.max(0, Math.min(100, power)).toFixed(1)}%`;
    (el.querySelector('.mult') as HTMLElement).textContent = `×${mult.toFixed(2)}`;
    const c = el.querySelector('.combo') as HTMLElement;
    c.textContent = String(combo);
    c.classList.toggle('zero', combo === 0);
    if (combo > this.lastCombo) this.retrigger(c, 'pop');
    this.lastCombo = combo;
    for (let g = 0; g <= 4; g++) el.classList.toggle(`g${g}`, g === [20, 45, 70, 90].filter((t) => power >= t).length);
    const cr = el.querySelector('.cresc') as HTMLElement;
    if (cr.dataset.k !== `${crescendo}/${movements}`) {
      cr.dataset.k = `${crescendo}/${movements}`;
      cr.innerHTML = Array.from({ length: movements }, (_, i) => `<i class="${i < crescendo ? 'on' : ''}">${ICON.star}</i>`).join('');
    }
  }

  /** a miss: the meter flashes red and shakes */
  powerMiss() {
    this.retrigger(this.powerEl, 'miss');
  }

  /** a crescendo star is earned: it pops on the meter */
  crescendo(stars: number, movements: number) {
    const cr = this.powerEl.querySelector('.cresc') as HTMLElement;
    cr.dataset.k = '';
    this.lastPowerKey = '';
    const star = cr.children[stars - 1] as HTMLElement | undefined;
    void movements;
    if (star) this.retrigger(star, 'pop');
    this.retrigger(this.powerEl, 'cresc');
  }

  /** the verdict of a tap where the finger was: ✦ perfect (gold), ✓ good (white), ✕ miss (red) */
  judgeAt(x: number, y: number, q: 'perfect' | 'good' | 'miss', combo: number) {
    const el = h(`<div class="judge ${q}">${q === 'perfect' ? ICON.star : q === 'good' ? ICON.check : ICON.close}${q !== 'miss' && combo >= 5 ? `<b>${combo}</b>` : ''}</div>`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.floats.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  /** the end of a journey: how well it was played (accuracy %, longest combo, crescendo stars) */
  rhythmSummary(accuracy: number, judged: number, best: number, crescendo: number, movements: number) {
    const el = this.root.querySelector('#rhythm-sum') as HTMLElement;
    if (!judged) return;
    const stars = Array.from({ length: movements }, (_, i) => `<i class="${i < crescendo ? 'on' : ''}">${ICON.star}</i>`).join('');
    el.innerHTML = `<div class="acc"><span class="ico">${BATON}</span><b>${Math.round(accuracy * 100)}%</b></div><div class="best"><span class="ico">${ICON.star}</span><b>${best}</b></div><div class="cresc">${stars}</div>`;
    el.classList.toggle('great', accuracy >= 0.85);
    requestAnimationFrame(() => el.classList.add('on'));
  }

  // ───────── the duel (v5) ─────────

  private bossKey = '';
  private tellOn = false;

  /** the boss bar at the top: its name, its health, the notches where its phases turn */
  setBoss(b: { name: string; kind: EnemyKind; hp: number; notches: number[]; phase: number; cls: 'mini' | 'guardian' | 'legend' } | null) {
    const el = this.root.querySelector('#boss-bar') as HTMLElement;
    if (!b) {
      el.classList.remove('on');
      this.bossKey = '';
      return;
    }
    el.classList.add('on');
    const key = `${b.kind}:${b.name}:${b.notches.join(',')}:${b.cls}`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      (el.querySelector('.name') as HTMLElement).textContent = b.name;
      (el.querySelector('.ico') as HTMLElement).innerHTML = enemyIcon(b.kind);
      (el.querySelector('.notches') as HTMLElement).innerHTML = b.notches.map((n) => `<b style="left:${(n * 100).toFixed(1)}%"></b>`).join('');
      el.classList.remove('mini', 'guardian', 'legend');
      el.classList.add(b.cls);
    }
    (el.querySelector('.fill') as HTMLElement).style.width = `${(Math.max(0, Math.min(1, b.hp)) * 100).toFixed(1)}%`;
    el.dataset.phase = String(b.phase);
  }

  /** a boss enters: its name card (a proper name) */
  bossCard(name: string, kind: EnemyKind, cls: 'mini' | 'guardian' | 'legend') {
    const el = this.root.querySelector('#boss-card') as HTMLElement;
    (el.querySelector('.ico') as HTMLElement).innerHTML = enemyIcon(kind);
    (el.querySelector('.name') as HTMLElement).textContent = name;
    el.classList.remove('mini', 'guardian', 'legend');
    el.classList.add(cls);
    this.retrigger(el, 'on');
    clearTimeout((el as unknown as { _t: number })._t);
    (el as unknown as { _t: number })._t = window.setTimeout(() => el.classList.remove('on'), 2600);
  }

  /** a boss turns to a new phase: the bar flares */
  bossPhase(phase: number) {
    const el = this.root.querySelector('#boss-bar') as HTMLElement;
    el.dataset.phase = String(phase);
    this.retrigger(el, 'phase');
  }

  /**
   * The next blow: a red ring closing on the baton that meets it on the blow's beat (`k`: bars left,
   * 0…1; < 0 hides it) and a red pip for each blow still to come.
   */
  setTell(k: number, count: number) {
    const ring = this.batonWrap.querySelector('.tell') as HTMLElement;
    const n = this.batonWrap.querySelector('.tell-n') as HTMLElement;
    const on = k >= 0;
    if (on !== this.tellOn) {
      this.tellOn = on;
      this.batonWrap.classList.toggle('duel', on);
    }
    if (!on) return;
    ring.style.transform = `scale(${(1 + 0.7 * Math.min(1, k)).toFixed(3)})`;
    ring.style.opacity = (0.35 + 0.65 * (1 - Math.min(1, k))).toFixed(3);
    this.batonWrap.classList.toggle('strike', k < 0.08);
    if (n.dataset.n !== String(count)) {
      n.dataset.n = String(count);
      n.innerHTML = Array.from({ length: Math.min(8, count) }, () => '<i></i>').join('');
    }
  }

  /** the call was echoed right (or not) */
  maestroResult(ok: boolean) {
    this.retrigger(this.callEl, ok ? 'win' : 'lose');
  }

  /** the whole screen kicks on a perfect tap at high groove, or a solo (a short golden pulse) */
  kick(strength: number) {
    this.grooveGlow.style.setProperty('--kick', strength.toFixed(2));
    this.retrigger(this.grooveGlow, 'kick');
  }

  private retrigger(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  countIn(beat: number) {
    if (beat < 0) {
      this.countEl.innerHTML = '';
      return;
    }
    if (!this.countEl.children.length) this.countEl.innerHTML = '<span></span><span></span><span></span><span></span>';
    [...this.countEl.children].forEach((c, i) => c.classList.toggle('on', i <= beat));
  }

  /** A wordless card: a portrait and trait icons. Resolves when tapped. */
  card(kind: { enemy?: EnemyKind; tower?: TowerKind }): Promise<void> {
    let portrait = '';
    let traits: string[] = [];
    if (kind.enemy) {
      const d = ENEMIES[kind.enemy];
      portrait = enemyIcon(kind.enemy);
      // what makes it special first (the card shows four at most)
      if (d.mimic) traits.push(ICON.mimic);
      if (d.deflect) traits.push(ICON.deflect);
      if (d.echo) traits.push(ICON.echo);
      if (d.burrow) traits.push(ICON.burrow);
      if (d.disable) traits.push(ICON.disable);
      if (d.aura) traits.push(ICON.aura);
      if (d.split) traits.push(ICON.split);
      if (d.camo) traits.push(ICON.eyeOff);
      if (d.mute) traits.push(ICON.mute);
      if (d.heal) traits.push(ICON.healI);
      if (d.shield) traits.push(ICON.shieldI);
      if (d.pack) traits.push(ICON.pack);
      if (d.steady) traits.push(ICON.steady);
      if (d.flying) traits.push(ICON.wing);
      if (d.armor >= 0.4) traits.push(ICON.armor);
      if (d.speed >= 3) traits.push(ICON.speed);
      traits = traits.slice(0, 4);
    } else if (kind.tower) {
      const d = TOWERS[kind.tower];
      portrait = TOWER_ICON[kind.tower];
      if (d.hitsAir && d.hitsGround) traits.push(ICON.wing);
      if (!d.hitsAir && d.hitsGround) traits.push(ICON.noAir);
      if (d.levels[0].area && kind.tower === 'drum') traits.push(ICON.split);
      if (d.levels[0].slow) traits.push(ICON.speed);
      if (d.detects) traits.push(ICON.eyeOff);
      if (d.levels[0].buff) traits.push(ICON.boost);
      if (d.levels[0].income) traits.push(ICON.income);
      if (d.levels[0].chain) traits.push(ICON.sword);
      traits = traits.slice(0, 3);
    }
    const el = h(`<div class="card"><div class="sparkle"></div><div class="portrait">${portrait}</div><div class="traits">${traits.map((t) => `<i>${t}</i>`).join('')}</div><div class="ok">${ICON.check}</div></div>`);
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    return new Promise((res) => {
      const done = (e: Event) => {
        e.stopPropagation();
        el.classList.remove('on');
        setTimeout(() => el.remove(), 300);
        window.removeEventListener('keydown', key);
        res();
      };
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') done(e);
      };
      el.addEventListener('click', done);
      window.addEventListener('keydown', key);
    });
  }

  dispose() {
    this.root.remove();
  }
}
