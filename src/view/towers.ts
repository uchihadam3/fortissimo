/**
 * Towers are musicians playing on their plate of the shell: building a tower is hiring a member of
 * the band. Each level the musician gets a bigger, golden instrument, a costume detail and a fancier
 * little stage. Firing plays the musician's gesture (pluck, strike, ring, shake, zap, blow, sing,
 * bow). Muted towers cover their ears and go grey; disabled ones (the lava slug's bite) slump, dizzy,
 * with smoke rising from a scorched stage.
 */
import * as THREE from 'three';
import type { TowerKind } from '../sim/defs';
import { TOWERS } from '../sim/defs';
import { at, box, clamp01, cyl, easeOutBack, glowMat, rotX, sph, torus } from './kit';
import { noteMesh } from './models';
import { Bins, CharMats, MUSICIAN_COLOR, MusicianView, mixc, paint, shade } from './musicians';

const GOLD = '#f2c84e';

/** the little round stage under each musician (geometry cached per kind and level) */
const stageCache = new Map<string, THREE.Group>();
function stage(kind: TowerKind, level: number): THREE.Group {
  const key = `${kind}:${level}`;
  let g = stageCache.get(key);
  if (!g) {
    const b = new Bins();
    const wood = new THREE.Color(level >= 2 ? '#c28a4e' : '#a8743f');
    const plank = shade(wood, 0.82);
    b.add('stage', 'm', paint(at(cyl(0.4, 0.43, 0.06, 28), 0, 0.03, 0), (p) => (Math.abs(((p.x + 0.5) / 0.1) % 1) < 0.08 && p.y > 0.055 ? plank : wood)));
    const body = MUSICIAN_COLOR[kind];
    const rug = mixc(body, '#ffffff', 0.18), rim = level >= 1 ? new THREE.Color(GOLD) : mixc(body, '#fff4dc', 0.7);
    b.add('stage', 'm', paint(at(cyl(0.31, 0.31, 0.012, 28), 0, 0.064, 0), (p) => (Math.hypot(p.x, p.z) > 0.26 ? rim : rug)));
    if (level >= 1) {
      b.add('stage', 'x', paint(at(torus(0.4, 0.015, 6, 40).rotateX(Math.PI / 2), 0, 0.06, 0), GOLD));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add('stage', 'x', paint(at(sph(0.02, 8, 6), Math.cos(a) * 0.425, 0.03, Math.sin(a) * 0.425), GOLD));
      }
    }
    if (level >= 2) {
      // footlights all around and a golden star in the middle of the rug
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        b.add('stage', 'g', paint(at(cyl(0.022, 0.026, 0.03, 8), Math.cos(a) * 0.36, 0.075, Math.sin(a) * 0.36), '#3a2a20'));
        b.add('stage', 'f', paint(at(sph(0.022, 10, 8), Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36), '#ffe8a0', 1.2));
      }
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.05 : 0.11, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      b.add('stage', 'x', paint(new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2).translate(0, 0.072, 0), GOLD, 0.25));
    }
    g = b.into('stage', new THREE.Group());
    stageCache.set(key, g);
  }
  return g;
}

/** scorch marks and smoke for a disabled plate */
function scorch(): THREE.Group {
  const g = new THREE.Group();
  const b = new Bins();
  const ink = new THREE.Color('#231a22'), ember = new THREE.Color('#ff7a2a');
  for (let i = 0; i < 7; i++) {
    const a = i * 2.3, r = 0.08 + (i % 3) * 0.08;
    b.add('s', 'm', paint(at(cyl(0.07 + (i % 2) * 0.04, 0.07 + (i % 2) * 0.04, 0.008, 10), Math.cos(a) * r, 0.072 + i * 0.0005, Math.sin(a) * r), ink));
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9 + 0.4;
    b.add('s', 'f', paint(at(sph(0.018, 6, 4), Math.cos(a) * 0.2, 0.078, Math.sin(a) * 0.2), ember, 1.4));
  }
  b.into('s', g, undefined, false);
  const puffs = new THREE.Group();
  puffs.name = 'puffs';
  const pm = new THREE.MeshStandardMaterial({ color: '#8d8794', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(sph(0.07, 10, 8), pm);
    m.userData.ph = i / 4;
    puffs.add(m);
  }
  g.add(puffs);
  return g;
}

export class TowerView {
  readonly group = new THREE.Group();
  private inner = new THREE.Group();
  private stageG: THREE.Group;
  private stageMats = new CharMats();
  readonly musician: MusicianView;
  level: number;
  private aim = 0;
  private aimTarget = 0;
  private aimHold = 0;
  private buildT = 0;
  private upT = 1;
  muted = false;
  disabled = false;
  private muteIcon: THREE.Group;
  boosted = false;
  private boostRing: THREE.Mesh;
  private range: THREE.Mesh | null = null;
  private scorchG: THREE.Group | null = null;
  /** overall size multiplier (towers on the colossus are big) */
  scaleMul = 1;
  /**
   * Where the audience is (world position, usually the camera). Musicians that are not busy aiming
   * turn to play for it; without it they face outward from the shell.
   * INTEGRATION: journeyView can set `TowerView.audience = camera.position` once.
   */
  static audience: THREE.Vector3 | null = null;
  private static tmpV = new THREE.Vector3();

  constructor(readonly kind: TowerKind, level: number, readonly id: number) {
    this.level = level;
    this.group.add(this.inner);
    this.stageG = stage(kind, level).clone();
    this.stageMats.apply(this.stageG);
    this.inner.add(this.stageG);
    this.musician = new MusicianView(kind, { level });
    this.musician.group.position.y = 0.066;
    this.inner.add(this.musician.group);
    this.inner.scale.setScalar(1 + level * 0.07);
    this.aim = this.aimTarget = Math.PI;
    // a little "silenced" sign: crossed note
    this.muteIcon = new THREE.Group();
    const n = noteMesh(0.16, '#cfd3e6', 1.2);
    const bar = new THREE.Mesh(box(0.32, 0.035, 0.02), glowMat('#ff5a6a', 1.6));
    bar.rotation.z = -0.8;
    bar.position.set(0.04, 0.08, 0.02);
    this.muteIcon.add(n, bar);
    this.muteIcon.visible = false;
    this.group.add(this.muteIcon);
    this.boostRing = new THREE.Mesh(torus(0.46, 0.03, 6, 40).rotateX(Math.PI / 2), glowMat('#ffd36b', 2.2, 0.8));
    this.boostRing.position.y = 0.1;
    this.boostRing.visible = false;
    this.group.add(this.boostRing);
  }

  setLevel(l: number) {
    if (l === this.level) return;
    this.level = l;
    this.inner.remove(this.stageG);
    this.stageG = stage(this.kind, l).clone();
    this.stageMats.apply(this.stageG);
    this.inner.add(this.stageG);
    if (this.scorchG) this.inner.add(this.scorchG);
    this.musician.setLevel(l);
    this.inner.scale.setScalar(1 + l * 0.07);
    this.upT = 0;
  }

  /** aim angle in tile space (atan2(dz, dx)) */
  aimAt(a: number) {
    this.aimTarget = Math.PI / 2 - a;
    this.aimHold = 2.2;
  }

  fire() {
    this.musician.play(1);
  }

  pulse() {
    this.musician.play(1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.muteIcon.visible = m;
    this.musician.setMood(this.disabled ? 'disabled' : m ? 'muted' : 'normal');
  }

  /**
   * The plate was bitten by a lava slug: the musician cannot play for a while.
   * INTEGRATION: journeyView calls this when the sim reports a disabled tower (and false when it recovers).
   */
  setDisabled(d: boolean) {
    this.disabled = d;
    this.musician.setMood(d ? 'disabled' : this.muted ? 'muted' : 'normal');
    if (d && !this.scorchG) {
      this.scorchG = scorch();
      this.inner.add(this.scorchG);
    } else if (!d && this.scorchG) {
      this.inner.remove(this.scorchG);
      this.scorchG = null;
    }
  }

  showRange(show: boolean, scene?: THREE.Object3D) {
    void scene;
    const r = TOWERS[this.kind].levels[this.level].range;
    if (show && r > 0) {
      if (!this.range) {
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TOWERS[this.kind].color), transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
        this.range = new THREE.Mesh(rotX(new THREE.RingGeometry(r - 0.06, r, 64), -Math.PI / 2), mat);
        const fill = new THREE.Mesh(rotX(new THREE.CircleGeometry(r, 64), -Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(TOWERS[this.kind].color), transparent: true, opacity: 0.07, depthWrite: false }));
        this.range.add(fill);
        this.range.position.y = 0.06;
        this.range.renderOrder = 3;
        this.group.add(this.range);
      }
      this.range.visible = true;
    } else if (this.range) {
      this.group.remove(this.range);
      this.range = null;
    }
  }

  muzzleWorld(out = new THREE.Vector3()) {
    return this.musician.muzzle.getWorldPosition(out);
  }

  /** the angle (in the tower's parent frame) at which a musician faces the audience / outward */
  private restAngle(): number {
    const aud = TowerView.audience;
    const parent = this.group.parent;
    if (aud && parent) {
      const local = parent.worldToLocal(TowerView.tmpV.copy(aud));
      return Math.atan2(local.x - this.group.position.x, local.z - this.group.position.z);
    }
    const p = this.group.position;
    if (Math.abs(p.x) + Math.abs(p.z) < 0.01) return 0;
    return Math.atan2(p.x, p.z);
  }

  update(dt: number, t: number, beatPos: number) {
    const bp = beatPos - Math.floor(beatPos);
    // build pop
    this.buildT = Math.min(1, this.buildT + dt * 2.2);
    this.upT = Math.min(1, this.upT + dt * 2.5);
    const pop = easeOutBack(clamp01(this.buildT)) * (0.85 + 0.15 * easeOutBack(clamp01(this.upT)));
    const live = !this.muted && !this.disabled;
    const dance = live ? Math.exp(-bp * 6) * 0.025 : 0;
    const S = pop * this.scaleMul;
    this.group.scale.set(S * (1 + dance * 0.5), S * (1 - dance), S * (1 + dance * 0.5));
    // facing: toward the target while shooting, else toward the audience
    this.aimHold -= dt;
    const goal = this.aimHold > 0 ? this.aimTarget : this.restAngle();
    let d = goal - this.aim;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.aim += d * Math.min(1, dt * (this.aimHold > 0 ? 9 : 2.5));
    this.musician.group.rotation.y = this.aim;
    this.musician.update(dt, t, beatPos);
    const ml = this.stageMats.flashK;
    ml.value = 0.6 + 0.6 * Math.exp(-bp * 4);
    // muted sign over the head
    if (this.muteIcon.visible) {
      this.muteIcon.position.y = (this.musician.size + 0.25) * (1 + this.level * 0.07) + Math.sin(t * 3) * 0.04;
      this.muteIcon.rotation.y = t;
    }
    if (this.scorchG) {
      const puffs = this.scorchG.getObjectByName('puffs')!;
      puffs.children.forEach((m, i) => {
        const k = (t * 0.45 + (m.userData.ph as number)) % 1;
        m.position.set(Math.sin(i * 2.1 + k * 3) * 0.12, 0.15 + k * 0.9, Math.cos(i * 1.3) * 0.1);
        m.scale.setScalar(0.6 + k * 1.6);
        ((m as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - k) * Math.min(1, k * 5);
      });
    }
    this.boostRing.visible = this.boosted;
    if (this.boosted) this.boostRing.scale.setScalar(1 + Math.exp(-bp * 5) * 0.15);
  }

  dispose() {
    this.musician.dispose();
    this.stageMats.dispose();
  }
}
