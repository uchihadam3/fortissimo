/**
 * v7: the virada's marks in the world (docs/DESIGN-v7.md §1).
 *
 * A virada is a drum fill the player taps on 4–6 golden marks placed at world points around the
 * colossus. Each mark has an approach ring that closes exactly on its stroke; a dotted trail links
 * the marks in order and the next one pulses. The marks are world points (anchored to the colossus,
 * or to a boss for its call) projected to the screen every frame, so they follow the camera; they are
 * placed where the screen is free (clear of the HUD, of the edges and of each other) with a thumb's
 * reach of tap radius. A boss that calls (the singers, the legends) lights its own marks first, in red,
 * and the player answers them on the same rhythm (the parry).
 *
 * This is the drawing only: the battle judges the taps and tells each mark how it went.
 */
import * as THREE from 'three';
import type { JourneyView } from './journeyView';

export type MarkTone = 'gold' | 'boss';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Mark {
  t: number;
  /** a boss's call lights the mark at this time first (view time), or −1 */
  lit: number;
  /** world offset from the anchor */
  off: THREE.Vector3;
  el: HTMLElement;
  ring: HTMLElement;
  /** 0 waiting · 1 hit · 2 missed */
  state: 0 | 1 | 2;
  x: number;
  y: number;
  visible: boolean;
}

/** one set of marks (a virada, or a boss's call) */
export class MarkSet {
  readonly marks: Mark[] = [];
  readonly el: HTMLElement;
  private trail: SVGPolylineElement;
  private done = false;
  /** view time the marks show from (and fade after `until`) */
  readonly from: number;
  until = Infinity;
  private litShown = new Set<number>();

  constructor(
    private layer: HTMLElement,
    readonly tone: MarkTone,
    times: number[],
    private anchor: () => THREE.Vector3,
    placed: { off: THREE.Vector3; x: number; y: number }[],
    readonly lead: number,
    lit: number[] | null,
    readonly level: number,
  ) {
    this.el = document.createElement('div');
    this.el.className = `vset ${tone} lv${level}`;
    this.el.innerHTML = `<svg class="trail"><polyline points=""/></svg>`;
    this.trail = this.el.querySelector('polyline') as SVGPolylineElement;
    times.forEach((t, i) => {
      const m = document.createElement('div');
      m.className = 'vm';
      m.innerHTML = `<i class="core"></i><i class="ring"></i>`;
      this.el.appendChild(m);
      const p = placed[i];
      this.marks.push({ t, lit: lit ? lit[i] : -1, off: p.off, el: m, ring: m.querySelector('.ring') as HTMLElement, state: 0, x: p.x, y: p.y, visible: false });
    });
    this.from = Math.min(...times) - lead;
    layer.appendChild(this.el);
  }

  /** the tap radius on this screen (a thumb's reach) */
  static radius(): number {
    return Math.max(44, Math.min(window.innerWidth, window.innerHeight) * 0.065);
  }

  /** the next mark still to play (index), or −1 */
  next(): number {
    for (let i = 0; i < this.marks.length; i++) if (this.marks[i].state === 0) return i;
    return -1;
  }

  get over(): boolean {
    return this.done;
  }

  /** every frame: where the marks are, their rings, the trail */
  update(vt: number, project: (w: THREE.Vector3) => { x: number; y: number; behind: boolean }, onLit?: (i: number) => void) {
    if (this.done) return;
    const show = vt >= this.from - 0.05;
    this.el.classList.toggle('on', show && vt < this.until);
    if (vt >= this.until + 0.6) {
      this.dispose();
      return;
    }
    if (!show) return;
    const a = this.anchor();
    const pts: string[] = [];
    const nx = this.next();
    const w = new THREE.Vector3();
    this.marks.forEach((m, i) => {
      const s = project(w.copy(a).add(m.off));
      m.visible = !s.behind;
      m.x = s.x;
      m.y = s.y;
      m.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      m.el.style.display = m.visible ? '' : 'none';
      pts.push(`${s.x.toFixed(1)},${s.y.toFixed(1)}`);
      // a boss's call: the mark lights when the boss plays it
      if (m.lit >= 0 && vt >= m.lit - 0.02 && !this.litShown.has(i)) {
        this.litShown.add(i);
        this.retrigger(m.el, 'lit');
        onLit?.(i);
      }
      if (m.state !== 0) return;
      const k = (m.t - vt) / this.lead;
      const ringOn = k <= 1 && k > -0.25;
      m.ring.style.opacity = ringOn ? (0.35 + 0.65 * Math.min(1, (1 - k) * 2)).toFixed(3) : '0';
      m.ring.style.transform = `scale(${(1 + 2.1 * Math.max(0, Math.min(1, k))).toFixed(3)})`;
      m.el.classList.toggle('next', i === nx);
      m.el.classList.toggle('now', Math.abs(m.t - vt) < 0.07);
      m.el.classList.toggle('wait', m.lit >= 0 && vt < m.lit);
    });
    this.trail.setAttribute('points', pts.join(' '));
  }

  /** the mark under a screen point (within the tap radius), nearest first; −1 */
  at(x: number, y: number, r = MarkSet.radius()): number[] {
    const out: { i: number; d: number }[] = [];
    this.marks.forEach((m, i) => {
      if (m.state !== 0 || !m.visible) return;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= r) out.push({ i, d });
    });
    return out.sort((a, b) => a.d - b.d).map((o) => o.i);
  }

  hit(i: number, perfect: boolean) {
    const m = this.marks[i];
    if (!m || m.state !== 0) return;
    m.state = 1;
    m.el.classList.remove('next', 'now');
    m.el.classList.add('hit', perfect ? 'perfect' : 'good');
    const sp = document.createElement('div');
    sp.className = 'vsparks';
    for (let k = 0; k < (perfect ? 12 : 8); k++) {
      const s = document.createElement('i');
      const ang = (k / (perfect ? 12 : 8)) * Math.PI * 2;
      const d = (perfect ? 70 : 52) + (k % 3) * 10;
      s.style.setProperty('--dx', `${(Math.cos(ang) * d).toFixed(1)}px`);
      s.style.setProperty('--dy', `${(Math.sin(ang) * d).toFixed(1)}px`);
      sp.appendChild(s);
    }
    m.el.appendChild(sp);
  }

  miss(i: number) {
    const m = this.marks[i];
    if (!m || m.state !== 0) return;
    m.state = 2;
    m.el.classList.remove('next', 'now');
    m.el.classList.add('miss');
  }

  /** all of it played: the set flares (full) and fades */
  finish(vt: number, full: boolean) {
    this.until = Math.min(this.until, vt + 0.05);
    if (full) this.el.classList.add('full');
  }

  /**
   * Is the layout still good (every mark still to play on screen, clear of the HUD)? The camera can
   * swing (a cinematic ends, the player turns it): then the set is placed again.
   */
  bad(avoid: Rect[]): boolean {
    const W = window.innerWidth, H = window.innerHeight;
    const r = MarkSet.radius() * 0.75;
    for (const m of this.marks) {
      if (m.state !== 0) continue;
      if (!m.visible || m.x < r || m.y < r || m.x > W - r || m.y > H - r) return true;
      for (const a of avoid) {
        const cx = Math.max(a.left, Math.min(m.x, a.right)), cy = Math.max(a.top, Math.min(m.y, a.bottom));
        if (Math.hypot(cx - m.x, cy - m.y) < r) return true;
      }
    }
    return false;
  }

  /** new world offsets for the marks (a new layout) */
  move(offs: THREE.Vector3[]) {
    this.marks.forEach((m, i) => offs[i] && m.off.copy(offs[i]));
  }

  /** the world point of mark i now */
  world(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.anchor()).add(this.marks[i].off);
  }

  /** screen positions of the marks (for checks) */
  rects(): Rect[] {
    const r = MarkSet.radius();
    return this.marks.filter((m) => m.visible).map((m) => ({ left: m.x - r, top: m.y - r, right: m.x + r, bottom: m.y + r }));
  }

  private retrigger(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    this.el.remove();
    void this.layer;
  }
}

/**
 * Where the marks of a set go on screen: along a sweep that fills the free screen (a gentle wave
 * across a wide screen, a zigzag down a tall one), each nudged until it is clear of the HUD, of the
 * edges and of the marks before it.
 */
export function placeMarks(n: number, avoid: Rect[], opts: { seed: number; around?: { x: number; y: number } }): { x: number; y: number }[] {
  const W = window.innerWidth, H = window.innerHeight;
  const R = MarkSet.radius();
  const anchors: { x: number; y: number }[] = [];
  const flip = opts.seed % 2 === 1;
  if (opts.around) {
    // a boss's call: an arc around the boss on screen, toward the middle of the screen
    const c = opts.around;
    const toMid = Math.atan2(H * 0.5 - c.y, W * 0.5 - c.x);
    const rad = Math.max(2.6 * R, Math.min(W, H) * 0.2);
    for (let i = 0; i < n; i++) {
      const a = toMid + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2.2) * (flip ? -1 : 1);
      anchors.push({ x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad });
    }
  } else if (W >= H * 1.05) {
    const ph = (opts.seed % 5) * 0.7;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const x = (flip ? 1 - u : u) * 0.66 + 0.17;
      anchors.push({ x: x * W, y: H * (0.47 + 0.13 * Math.sin(ph + u * Math.PI * 1.6)) });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const side = (i % 2 === 0) !== flip ? 0.27 : 0.73;
      anchors.push({ x: side * W, y: H * (0.3 + 0.4 * u) });
    }
  }
  const pad = R + 6;
  const clear = (x: number, y: number, chosen: { x: number; y: number }[]) => {
    if (x < pad || y < pad || x > W - pad || y > H - pad) return false;
    for (const r of avoid) {
      const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
      if (Math.hypot(cx - x, cy - y) < pad) return false;
    }
    for (const c of chosen) if (Math.hypot(c.x - x, c.y - y) < 2 * R + 10) return false;
    return true;
  };
  const out: { x: number; y: number }[] = [];
  for (const a of anchors) {
    let best: { x: number; y: number } | null = null;
    search: for (let rr = 0; rr <= Math.max(W, H) * 0.5; rr += 14) {
      const steps = rr === 0 ? 1 : Math.max(8, Math.round((rr * Math.PI * 2) / 28));
      for (let s = 0; s < steps; s++) {
        const ang = (s / steps) * Math.PI * 2 + rr * 0.13;
        const x = a.x + Math.cos(ang) * rr, y = a.y + Math.sin(ang) * rr;
        if (clear(x, y, out)) {
          best = { x, y };
          break search;
        }
      }
    }
    out.push(best ?? { x: Math.max(pad, Math.min(W - pad, a.x)), y: Math.max(pad, Math.min(H - pad, a.y)) });
  }
  return out;
}

/** the world points under screen points, at about the depth of `anchor` (ground or air around it) */
export function worldAt(view: JourneyView, pts: { x: number; y: number }[], anchor: THREE.Vector3, depth = 0.92): THREE.Vector3[] {
  const cam = view.engine.camera;
  // the camera as the screen was last drawn (what `view.screen` projects with: mid-frame its
  // position may already have moved on)
  const camWorld = new THREE.Matrix4().copy(cam.matrixWorldInverse).invert();
  const eye = new THREE.Vector3().setFromMatrixPosition(camWorld);
  const D = eye.distanceTo(anchor) * depth;
  const toAnchor = anchor.clone().sub(eye).normalize();
  return pts.map((p) => {
    const ndc = new THREE.Vector3((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1, 0.5);
    const dir = ndc.applyMatrix4(cam.projectionMatrixInverse).applyMatrix4(camWorld).sub(eye).normalize();
    // the same screen point, moved along its ray to the anchor's depth
    const along = D / Math.max(0.2, dir.dot(toAnchor));
    const w = eye.clone().addScaledVector(dir, Math.min(along, D * 2.5));
    // never under the ground (it rises onto it: a little higher on screen, at the same depth)
    w.y = Math.max(w.y, view.land.heightAt(w.x, w.z) + 0.4);
    return w;
  });
}
