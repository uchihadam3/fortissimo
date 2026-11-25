/** Battle HUD: lives, notes (coins), waves, the FORTÍSSIMO button, wave calls, radial menus, cards. */
import { ENEMIES, TOWERS, type EnemyKind, type TowerKind } from '../sim/defs';
import { ICON, TOWER_ICON, enemyIcon } from './icons';

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

  // ───────── journey ─────────

  /** progress 0..1 and wave markers (position 0..1, kinds, done) */
  setJourney(frac: number, marks: { at: number; kind: EnemyKind; done: boolean }[]) {
    const j = this.root.querySelector('#journey') as HTMLElement;
    (j.querySelector('.fill') as HTMLElement).style.width = `${(frac * 100).toFixed(2)}%`;
    (j.querySelector('.me') as HTMLElement).style.left = `${(frac * 100).toFixed(2)}%`;
    const key = marks.map((m) => `${m.at.toFixed(3)}${m.kind}${m.done ? 1 : 0}`).join('|');
    const mk = j.querySelector('.marks') as HTMLElement;
    if (mk.dataset.k !== key) {
      mk.dataset.k = key;
      mk.innerHTML = marks.map((m) => `<i class="${m.done ? 'done' : ''}" style="left:${(m.at * 100).toFixed(2)}%">${enemyIcon(m.kind)}</i>`).join('');
    }
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
      const b = h(`<button class="rb ${o.affordable ? '' : 'poor'} ${o.isNew ? 'new' : ''}" data-k="${o.kind}">${TOWER_ICON[o.kind]}<span class="price"><i>${ICON.coin}</i>${o.cost}</span></button>`) as HTMLButtonElement;
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
    const up = h(`<button class="rb ${upCost === null ? 'max' : 'up'} ${upCost !== null && !affordable ? 'poor' : ''}">${upCost === null ? ICON.crown : ICON.up}${upCost !== null ? `<span class="price"><i>${ICON.coin}</i>${upCost}</span>` : ''}</button>`) as HTMLButtonElement;
    up.style.left = '0px';
    up.style.top = '-88px';
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      if (upCost !== null) onUp();
    });
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

  hand(p: { x: number; y: number } | null) {
    this.handEl.classList.toggle('on', !!p);
    if (p) {
      this.handEl.style.left = `${p.x}px`;
      this.handEl.style.top = `${p.y}px`;
    }
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
      if (d.flying) traits.push(ICON.wing);
      if (d.speed >= 1.6) traits.push(ICON.speed);
      if (d.armor >= 0.4) traits.push(ICON.armor);
      if (d.shield) traits.push(ICON.shieldI);
      if (d.split) traits.push(ICON.split);
      if (d.camo) traits.push(ICON.eyeOff);
      if (d.mute) traits.push(ICON.mute);
      if (d.heal) traits.push(ICON.healI);
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
