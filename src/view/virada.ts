/**
 * v7: the virada's marks, as real things in the world (docs/DESIGN-v7.md §1).
 *
 * A virada is a slow drum fill the player plays on golden pads lying on the ground around the
 * colossus: one at a time, one every two beats. Each pad rises out of the ground a stroke ahead
 * (two beats) with a flat ring around it on the ground that closes exactly on its stroke; tapped on
 * the beat it is struck like a drum (it pulses down, flashes and sinks away); missed, it dims and
 * sinks. The pads are fixed world points (picked on the ground where the screen is free when each
 * one rises), so they stay in their place in the landscape as the camera moves.
 *
 * A boss that calls (the singers, the legends) lights its own marks first, in red, floating in the
 * air around it, and the player answers them on the same rhythm (the parry).
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
  /** its world point (null: not placed yet: it is placed when it rises) */
  pos: THREE.Vector3 | null;
  /** world radius of its pad */
  r: number;
  group: THREE.Group | null;
  pad: THREE.Mesh | null;
  ring: THREE.Mesh | null;
  beam: THREE.Mesh | null;
  mats: THREE.MeshBasicMaterial[];
  /** 0 waiting · 1 hit · 2 missed */
  state: 0 | 1 | 2;
  /** view time it was played (hit or missed) */
  doneAt: number;
  perfect: boolean;
  x: number;
  y: number;
  visible: boolean;
}

/** screen radius (px) a pad is drawn with, and the tap radius (a thumb's reach) */
const PAD_PX = 40;

const TONES: Record<MarkTone, { pad: string; ring: string; beam: string }> = {
  gold: { pad: '#ffd36b', ring: '#ffbf3a', beam: '#ffe3a0' },
  boss: { pad: '#ff5a8a', ring: '#ffd0e0', beam: '#ff8fb0' },
};

let padTex: Record<MarkTone, THREE.Texture> | null = null;
let geo: { pad: THREE.CircleGeometry; ring: THREE.RingGeometry; beam: THREE.CylinderGeometry } | null = null;

/** a drum pad seen from above: a glowing disc with a rim, a bright skin and a note on it */
function drawPad(tone: MarkTone): THREE.Texture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const col = TONES[tone].pad;
  const halo = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2);
  halo.addColorStop(0, col);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  // a dark edge (it reads on bright sand and snow), the rim and the skin
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  g.fillStyle = tone === 'gold' ? '#7a4a12' : '#6a1030';
  g.fill();
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.37, 0, Math.PI * 2);
  g.fillStyle = col;
  g.fill();
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.29, 0, Math.PI * 2);
  const skin = g.createRadialGradient(S * 0.45, S * 0.42, 2, S / 2, S / 2, S * 0.29);
  skin.addColorStop(0, '#ffffff');
  skin.addColorStop(1, TONES[tone].ring);
  g.fillStyle = skin;
  g.fill();
  // a note (a head, a stem and a flag), no text
  g.fillStyle = col;
  g.save();
  g.translate(S * 0.45, S * 0.6);
  g.rotate(-0.4);
  g.beginPath();
  g.ellipse(0, 0, S * 0.085, S * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillRect(S * 0.515, S * 0.3, S * 0.035, S * 0.3);
  g.beginPath();
  g.moveTo(S * 0.55, S * 0.3);
  g.quadraticCurveTo(S * 0.66, S * 0.36, S * 0.63, S * 0.47);
  g.quadraticCurveTo(S * 0.62, S * 0.4, S * 0.55, S * 0.39);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shared() {
  if (!padTex) padTex = { gold: drawPad('gold'), boss: drawPad('boss') };
  if (!geo) {
    geo = {
      pad: new THREE.CircleGeometry(1, 40),
      ring: new THREE.RingGeometry(0.84, 1, 56),
      beam: new THREE.CylinderGeometry(0.55, 0.85, 1, 20, 1, true),
    };
    geo.beam.translate(0, 0.5, 0);
  }
  return { tex: padTex, geo };
}

function mat(color: string, opts: { map?: THREE.Texture; add?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: opts.map ? '#ffffff' : color,
    map: opts.map ?? null,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
}

/** world units per screen pixel at a world point */
export function worldPerPx(cam: THREE.PerspectiveCamera, p: THREE.Vector3): number {
  const d = cam.position.distanceTo(p);
  return (2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, window.innerHeight);
}

/** one set of marks (a virada, or a boss's call) */
export class MarkSet {
  readonly marks: Mark[] = [];
  private done = false;
  /** view time the first mark shows from (and the set fades after `until`) */
  readonly from: number;
  until = Infinity;
  private litShown = new Set<number>();

  constructor(
    private scene: THREE.Object3D,
    readonly tone: MarkTone,
    times: number[],
    /** where mark i goes (asked when it rises), given the mark before it */
    private place: (i: number, prev: { pos: THREE.Vector3; x: number; y: number } | null) => THREE.Vector3 | null,
    /** how long before its stroke a mark rises (its ring closes over it) */
    readonly lead: number,
    lit: number[] | null,
    readonly level: number,
    /** pads lying on the ground (the virada) or floating discs facing the camera (a boss's call) */
    private flat = true,
  ) {
    times.forEach((t, i) => {
      this.marks.push({ t, lit: lit ? lit[i] : -1, pos: null, r: 1, group: null, pad: null, ring: null, beam: null, mats: [], state: 0, doneAt: 0, perfect: false, x: -9999, y: -9999, visible: false });
    });
    this.from = Math.min(...times.map((t, i) => this.riseAt(i, t)));
  }

  /** when mark i rises */
  private riseAt(i: number, t = this.marks[i]?.t ?? 0): number {
    const m = this.marks[i];
    const lit = m ? m.lit : -1;
    return lit >= 0 ? Math.min(lit, t - this.lead) : t - this.lead;
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

  /** build mark i at its world point */
  private build(m: Mark, pos: THREE.Vector3, cam: THREE.PerspectiveCamera) {
    const { tex, geo } = shared();
    const tone = TONES[this.tone];
    m.pos = pos.clone();
    // sized on screen when it rises: a pad of about PAD_PX, a little wider when it lies flat
    m.r = PAD_PX * worldPerPx(cam, pos) * (this.flat ? 1.25 : 1);
    const g = new THREE.Group();
    g.position.copy(pos);
    const padMat = mat(tone.pad, { map: tex[this.tone] });
    const ringMat = mat(tone.ring);
    // drawn over the ground it lies on (the terrain's bumps never cut into it)
    padMat.depthTest = false;
    ringMat.depthTest = false;
    const beamMat = mat(tone.beam, { add: true });
    const pad = new THREE.Mesh(geo.pad, padMat);
    const ring = new THREE.Mesh(geo.ring, ringMat);
    const beam = new THREE.Mesh(geo.beam, beamMat);
    pad.scale.setScalar(m.r);
    beam.scale.set(m.r * 0.5, m.r * 2.4, m.r * 0.5);
    if (this.flat) {
      pad.rotation.x = -Math.PI / 2;
      ring.rotation.x = -Math.PI / 2;
      pad.position.y = 0.06;
      ring.position.y = 0.05;
    }
    pad.renderOrder = 3;
    ring.renderOrder = 4;
    beam.renderOrder = 2;
    g.add(beam, pad, ring);
    if (!this.flat) beam.visible = false;
    this.scene.add(g);
    m.group = g;
    m.pad = pad;
    m.ring = ring;
    m.beam = beam;
    m.mats = [padMat, ringMat, beamMat];
  }

  /** every frame: marks rise, their rings close, played ones sink away */
  update(vt: number, project: (w: THREE.Vector3) => { x: number; y: number; behind: boolean }, cam: THREE.PerspectiveCamera, onLit?: (i: number) => void) {
    if (this.done) return;
    if (vt >= this.until + 0.7) {
      this.dispose();
      return;
    }
    const nx = this.next();
    const fadeAll = vt > this.until ? Math.max(0, 1 - (vt - this.until) / 0.7) : 1;
    this.marks.forEach((m, i) => {
      const rise = this.riseAt(i);
      if (vt < rise - 0.02) return;
      if (!m.group) {
        if (m.state !== 0) return;
        const prev = i > 0 && this.marks[i - 1].pos ? { pos: this.marks[i - 1].pos!, x: this.marks[i - 1].x, y: this.marks[i - 1].y } : null;
        const p = this.place(i, prev);
        if (!p) return;
        this.build(m, p, cam);
      }
      const g = m.group!;
      const s = project(m.pos!);
      m.visible = !s.behind && s.x > -40 && s.y > -40 && s.x < window.innerWidth + 40 && s.y < window.innerHeight + 40;
      m.x = s.x;
      m.y = s.y;
      if (!this.flat) g.quaternion.copy(cam.quaternion);
      // a boss's call: the mark lights when the boss plays it
      if (m.lit >= 0 && vt >= m.lit - 0.02 && !this.litShown.has(i)) {
        this.litShown.add(i);
        onLit?.(i);
      }
      const [padMat, ringMat, beamMat] = m.mats;
      const pad = m.pad!, ring = m.ring!, beam = m.beam!;
      if (m.state === 0) {
        // rising: it grows out of the ground over a fifth of a second
        const born = Math.min(1, (vt - rise) / 0.2);
        const waiting = m.lit >= 0 && vt < m.lit;
        const k = (m.t - vt) / this.lead;
        const ringOn = k <= 1 && k > -0.3;
        const now = Math.abs(m.t - vt) < 0.08;
        const isNext = i === nx;
        const pulse = isNext ? 1 + 0.07 * Math.sin(vt * 14) : 1;
        pad.scale.setScalar(m.r * (0.4 + 0.6 * born) * pulse * (now ? 1.12 : 1));
        padMat.opacity = born * (waiting ? 0.55 : isNext ? 1 : 0.6) * fadeAll;
        ring.visible = ringOn;
        ring.scale.setScalar(m.r * (1 + 2.4 * Math.max(0, Math.min(1, k))));
        ringMat.opacity = ringOn ? (0.6 + 0.4 * Math.min(1, (1 - k) * 1.6)) * fadeAll * born : 0;
        if (now) ringMat.color.set('#ffffff');
        else ringMat.color.set(TONES[this.tone].ring);
        beamMat.opacity = born * (isNext ? 0.14 + 0.16 * (1 - Math.max(0, Math.min(1, k))) : 0.05) * fadeAll;
        g.position.y = m.pos!.y;
      } else {
        // played: struck like a drum (it pulses down, flashes, sinks away) or missed (dims and sinks)
        const a = Math.max(0, Math.min(1, (vt - m.doneAt) / (m.state === 1 ? 0.5 : 0.45)));
        ring.visible = m.state === 1 && a < 0.5;
        if (m.state === 1) {
          const punch = a < 0.15 ? 1 - (a / 0.15) * 0.25 : 0.75 + (a - 0.15) * 0.9;
          pad.scale.setScalar(m.r * punch * (m.perfect ? 1.15 : 1));
          padMat.opacity = (1 - a) * fadeAll;
          ring.scale.setScalar(m.r * (1 + a * (m.perfect ? 4 : 3)));
          ringMat.color.set('#ffffff');
          ringMat.opacity = (1 - a * 2) * 0.9 * fadeAll;
          beam.scale.y = m.r * 2.4 * (1 + a * 2);
          beamMat.opacity = (1 - a) * (m.perfect ? 0.6 : 0.45) * fadeAll;
          g.position.y = m.pos!.y - a * m.r * 0.6;
        } else {
          padMat.color.set('#8a8a8a');
          padMat.opacity = 0.5 * (1 - a) * fadeAll;
          beamMat.opacity = 0;
          g.position.y = m.pos!.y - a * m.r * 0.8;
        }
        if (a >= 1) g.visible = false;
      }
    });
  }

  /** the marks under a screen point (within the tap radius), nearest first */
  at(x: number, y: number, r = MarkSet.radius()): number[] {
    const out: { i: number; d: number }[] = [];
    this.marks.forEach((m, i) => {
      if (m.state !== 0 || !m.visible || !m.group) return;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= r) out.push({ i, d });
    });
    return out.sort((a, b) => a.d - b.d).map((o) => o.i);
  }

  hit(i: number, perfect: boolean, vt = 0) {
    const m = this.marks[i];
    if (!m || m.state !== 0) return;
    m.state = 1;
    m.perfect = perfect;
    m.doneAt = vt;
  }

  miss(i: number, vt = 0) {
    const m = this.marks[i];
    if (!m || m.state !== 0) return;
    m.state = 2;
    m.doneAt = vt;
  }

  /** all of it played: the set fades */
  finish(vt: number, _full: boolean) {
    this.until = Math.min(this.until, vt + 0.05);
  }

  /**
   * A mark still to play that the camera swung off the screen (or under the HUD) while there is
   * still time to reach it: it rises again somewhere free.
   */
  replaceLost(vt: number, avoid: Rect[]) {
    const W = window.innerWidth, H = window.innerHeight;
    const r = MarkSet.radius() * 0.75;
    this.marks.forEach((m, i) => {
      if (m.state !== 0 || !m.group || m.t - vt < 0.45) return;
      let bad = !m.visible || m.x < r || m.y < r || m.x > W - r || m.y > H - r;
      for (const a of avoid) {
        if (bad) break;
        const cx = Math.max(a.left, Math.min(m.x, a.right)), cy = Math.max(a.top, Math.min(m.y, a.bottom));
        if (Math.hypot(cx - m.x, cy - m.y) < r) bad = true;
      }
      if (!bad) return;
      const prev = i > 0 && this.marks[i - 1].pos ? { pos: this.marks[i - 1].pos!, x: this.marks[i - 1].x, y: this.marks[i - 1].y } : null;
      const p = this.place(i, prev);
      if (!p) return;
      m.pos!.copy(p);
      m.group.position.copy(p);
    });
  }

  /** the world point of mark i (its pad) */
  world(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const m = this.marks[i];
    return m?.pos ? out.copy(m.pos) : out.set(0, 0, 0);
  }

  /** screen rects of the marks showing (for checks) */
  rects(): Rect[] {
    const r = MarkSet.radius();
    return this.marks.filter((m) => m.visible && m.group && m.group.visible).map((m) => ({ left: m.x - r, top: m.y - r, right: m.x + r, bottom: m.y + r }));
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    for (const m of this.marks) {
      if (m.group) this.scene.remove(m.group);
      for (const x of m.mats) x.dispose();
      m.mats = [];
      m.group = null;
    }
  }
}

const deterministic = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
};

/** the ground under a screen point (null: the sky) */
export function groundAt(view: JourneyView, x: number, y: number): THREE.Vector3 | null {
  const cam = view.engine.camera;
  const camWorld = new THREE.Matrix4().copy(cam.matrixWorldInverse).invert();
  const eye = new THREE.Vector3().setFromMatrixPosition(camWorld);
  const ndc = new THREE.Vector3((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5);
  const dir = ndc.applyMatrix4(cam.projectionMatrixInverse).applyMatrix4(camWorld).sub(eye).normalize();
  if (dir.y > -0.02) return null;
  const p = new THREE.Vector3();
  const above = (d: number) => {
    p.copy(eye).addScaledVector(dir, d);
    return p.y - view.land.heightAt(p.x, p.z);
  };
  let lo = 0, hi = 0;
  for (let d = 1; d < 260; d += 1.5) {
    if (above(d) <= 0) {
      hi = d;
      break;
    }
    lo = d;
  }
  if (!hi) return null;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (above(mid) > 0) lo = mid;
    else hi = mid;
  }
  above(hi);
  return p.clone().setY(view.land.heightAt(p.x, p.z) + 0.02);
}

/**
 * Where the next pad of a virada rises: on the ground, on a free part of the screen (clear of the HUD
 * and of the colossus itself), a comfortable thumb's move from the pad before it (`reach`: × the
 * short side of the screen, wider in the later lands). The first one rises near the colossus.
 */
export function pickPad(
  view: JourneyView,
  avoid: Rect[],
  prev: { x: number; y: number } | null,
  opts: { seed: number; reach: [number, number] },
): THREE.Vector3 | null {
  const W = window.innerWidth, H = window.innerHeight;
  const R = MarkSet.radius();
  const short = Math.min(W, H);
  const rnd = deterministic(opts.seed);
  const tp = view.turtle.group.position;
  // the colossus on screen: between its feet and the top of its shell
  const feet = view.screen(tp);
  const top = view.screen(view.turtle.heartWorld(new THREE.Vector3()).setY(tp.y + 5));
  const tc = { x: (feet.x + top.x) / 2, y: (feet.y + top.y) / 2, behind: feet.behind };
  const tall = Math.abs(feet.y - top.y) / 2;
  // the colossus on screen: about its shell's reach around its feet
  const cam = view.engine.camera;
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
  const edge = view.screen(tp.clone().addScaledVector(right, 6));
  const shellPx = Math.max(60, Math.hypot(edge.x - tc.x, edge.y - tc.y));
  const pad = R + 8;
  const free = (x: number, y: number, strict: boolean) => {
    if (x < pad || y < pad || x > W - pad || y > H - pad) return false;
    for (const r of avoid) {
      const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
      if (Math.hypot(cx - x, cy - y) < pad) return false;
    }
    if (strict && !tc.behind && Math.hypot((x - tc.x) / (shellPx * 1.15), (y - tc.y) / (Math.max(shellPx, tall) * 1.15)) < 1) return false;
    // not too far away (the ground there lies too flat to read) unless nothing else is free
    if (strict && y < H * 0.3) return false;
    return true;
  };
  const tries: { x: number; y: number }[] = [];
  for (let k = 0; k < 48; k++) {
    const ang = rnd() * Math.PI * 2;
    if (prev) {
      const d = short * (opts.reach[0] + (opts.reach[1] - opts.reach[0]) * rnd());
      tries.push({ x: prev.x + Math.cos(ang) * d, y: prev.y + Math.sin(ang) * d * 0.8 });
    } else {
      // the first one beside or in front of the colossus (the near ground, big on screen)
      const c = tc.behind ? { x: W / 2, y: H * 0.55 } : tc;
      const a2 = -0.35 + rnd() * (Math.PI + 0.7);
      const d = Math.max(shellPx, tall) * (1.35 + 0.6 * rnd());
      tries.push({ x: c.x + Math.cos(a2) * d, y: c.y + Math.sin(a2) * d });
    }
  }
  for (const strict of [true, false]) {
    for (const p of tries) {
      if (!free(p.x, p.y, strict)) continue;
      const g = groundAt(view, p.x, p.y);
      if (g && g.distanceTo(tp) < 70) return g;
    }
  }
  // nowhere good: the middle of the free screen, below the colossus
  for (let y = H * 0.75; y > H * 0.3; y -= 20) {
    if (!free(W / 2, y, false)) continue;
    const g = groundAt(view, W / 2, y);
    if (g) return g;
  }
  return null;
}

/**
 * Where a boss's call marks float: an arc around the boss on screen, toward the middle of the screen,
 * clear of the HUD.
 */
export function placeMarks(n: number, avoid: Rect[], opts: { seed: number; around: { x: number; y: number } }): { x: number; y: number }[] {
  const W = window.innerWidth, H = window.innerHeight;
  const R = MarkSet.radius();
  const flip = opts.seed % 2 === 1;
  const c = opts.around;
  const toMid = Math.atan2(H * 0.5 - c.y, W * 0.5 - c.x);
  const rad = Math.max(2.6 * R, Math.min(W, H) * 0.2);
  const anchors: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = toMid + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2.2) * (flip ? -1 : 1);
    anchors.push({ x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad });
  }
  const pad = R + 6;
  const clear = (x: number, y: number, chosen: { x: number; y: number }[]) => {
    if (x < pad || y < pad || x > W - pad || y > H - pad) return false;
    for (const r of avoid) {
      const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
      if (Math.hypot(cx - x, cy - y) < pad) return false;
    }
    for (const ch of chosen) if (Math.hypot(ch.x - x, ch.y - y) < 2 * R + 10) return false;
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

/** the world points under screen points, at about the depth of `anchor` (in the air around it) */
export function worldAt(view: JourneyView, pts: { x: number; y: number }[], anchor: THREE.Vector3, depth = 0.92): THREE.Vector3[] {
  const cam = view.engine.camera;
  const camWorld = new THREE.Matrix4().copy(cam.matrixWorldInverse).invert();
  const eye = new THREE.Vector3().setFromMatrixPosition(camWorld);
  const D = eye.distanceTo(anchor) * depth;
  const toAnchor = anchor.clone().sub(eye).normalize();
  return pts.map((p) => {
    const ndc = new THREE.Vector3((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1, 0.5);
    const dir = ndc.applyMatrix4(cam.projectionMatrixInverse).applyMatrix4(camWorld).sub(eye).normalize();
    const along = D / Math.max(0.2, dir.dot(toAnchor));
    const w = eye.clone().addScaledVector(dir, Math.min(along, D * 2.5));
    w.y = Math.max(w.y, view.land.heightAt(w.x, w.z) + 0.4);
    return w;
  });
}
