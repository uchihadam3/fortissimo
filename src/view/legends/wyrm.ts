/**
 * Serpente-Vagalume (meadow secret path): an enormous serpent of night ink covered in firefly lights,
 * coiling in the air like a cobra rising from its own coils. Lights pulse on the beat (a ripple from
 * head to tail), a peristaltic swell runs down the body every beat, four lacy firefly wings buzz on
 * its back, a lantern burns at the tail tip, antennae end in two little lamps.
 *   phase 2: the loose lights leave the body and become a swarm around it
 *   phase 3: the coils wind tighter, the head wears a crown of fireflies
 */
import * as THREE from 'three';
import { capsule, cone, sph, clamp01 } from '../kit';
import { ell } from '../musicians';
import { type ActS, type Frame, type Geo, GlowPoints, P, type Rig, Spine, V, glowAlong, legendMat, legendUniforms, merge, newFrame, rng, smooth, xStitch } from './common';

const L = 20;
const NB = 30;
const rad = (u: number) => 1.3 * (0.07 + 0.37 * Math.pow(smooth(0, 0.5, u), 0.75) + 0.05 * smooth(0.45, 0.75, u) - 0.12 * smooth(0.82, 1, u));
/** overall size */
const SZ = 1.2;

const INK_TOP = new THREE.Color('#0a0920'), INK_SIDE = new THREE.Color('#18163e'), INK_BELLY = new THREE.Color('#3a346c');
const FIRE = new THREE.Color('#d8ff6a'), FIRE2 = new THREE.Color('#fff09a'), RED = new THREE.Color('#ff4a24');
const _c = new THREE.Color();
const frac = (x: number) => x - Math.floor(x);

function bodyGeo(): Geo {
  const NZ = 160, NR = 18;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NZ; j++) {
    const z = (j / NZ) * L;
    const u = z / L;
    const r = rad(u);
    for (let i = 0; i <= NR; i++) {
      const a = (i / NR) * Math.PI * 2;
      const s = Math.sin(a);
      const x = Math.cos(a) * r, y = s * r * 0.84;
      pos.push(x, y, z);
      const band = 0.5 + 0.5 * Math.sin(z * 10);
      _c.copy(INK_TOP).lerp(INK_SIDE, smooth(0.9, 0.1, s)).lerp(INK_BELLY, smooth(-0.25, -0.8, s) * (0.7 + 0.3 * band));
      // faint diamond pattern on the back
      const dia = Math.abs(((z * 1.6 + Math.abs(Math.cos(a)) * 2) % 1) - 0.5);
      if (s > 0.3) _c.multiplyScalar(0.85 + 0.5 * smooth(0.12, 0.0, dia));
      col.push(_c.r, _c.g, _c.b);
    }
  }
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NR; i++) {
      const a = j * (NR + 1) + i, b = a + NR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tube = g.toNonIndexed();
  const cArr = new Float32Array(tube.attributes.position.count * 3);
  const ci = g.index!.array;
  for (let k = 0; k < ci.length; k++) cArr.set(col.slice(ci[k] * 3, ci[k] * 3 + 3), k * 3);
  // P() would repaint: set the attributes directly
  tube.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
  tube.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(tube.attributes.position.count), 1));
  tube.setAttribute('aTell', new THREE.BufferAttribute(new Float32Array(tube.attributes.position.count), 1));
  const parts: Geo[] = [tube];
  // the dorsal fin ridge: little dark fins with burning tips
  for (let z = 1.6; z < L - 0.5; z += 0.48) {
    const r = rad(z / L);
    const h = 0.12 + 0.36 * r;
    const f = cone(0.07, h, 4).scale(0.3, 1, 1).translate(0, h / 2, 0).rotateX(-0.6);
    glowAlong(P(f, (p) => _c.set('#14123a').lerp(FIRE, smooth(h * 0.5, h, p.y / 0.83)), 1.6, 1), (p) => smooth(h * 0.45, h * 0.85, p.y / 0.83));
    f.translate(0, r * 0.8, z);
    parts.push(f);
  }
  // the lantern at the tail tip: three glowing segments
  for (let k = 0; k < 3; k++) {
    const rr = 0.2 - k * 0.04;
    parts.push(P(ell(rr, rr * 0.85, rr * 1.25, 16, 12).translate(0, 0, 0.35 - k * 0.42), k === 0 ? FIRE : FIRE2, 2.4 - k * 0.3, 0.6));
    parts.push(P(new THREE.TorusGeometry(rr * 0.96, 0.025, 5, 18).translate(0, 0, 0.35 - k * 0.42 + rr * 1.05), '#0c0b22', 0, 0));
  }
  return merge(parts);
}

function headGeo(): Geo {
  const parts: Geo[] = [];
  const ink = (p: THREE.Vector3, n: THREE.Vector3) => _c.copy(INK_TOP).lerp(INK_SIDE, smooth(0.6, -0.1, n.y)).lerp(INK_BELLY, smooth(-0.1, -0.7, n.y));
  parts.push(P(ell(0.44, 0.31, 0.64, 22, 16).translate(0, 0.05, 0.3), ink));
  parts.push(P(ell(0.31, 0.2, 0.52, 20, 14).translate(0, 0.0, 0.92), ink));
  parts.push(P(ell(0.3, 0.13, 0.56, 18, 12).translate(0, -0.15, 0.78), (p, n) => _c.copy(INK_BELLY).lerp(INK_SIDE, smooth(-0.3, 0.4, n.y))));
  for (const sd of [-1, 1]) {
    // brow ridge
    parts.push(P(ell(0.17, 0.08, 0.32, 12, 8).rotateY(sd * 0.35).translate(sd * 0.22, 0.24, 0.6), '#121034'));
    // lantern eye with a slit pupil
    parts.push(P(sph(0.13, 18, 14).translate(sd * 0.31, 0.13, 0.62), (p) => _c.copy(FIRE2).lerp(FIRE, smooth(0.0, 0.1, p.y - 0.13)), 2.2, 1));
    const pup = ell(0.022, 0.085, 0.03, 8, 8);
    const out = V(sd * 0.75, 0.05, 0.66).normalize();
    pup.translate(sd * 0.31 + out.x * 0.12, 0.13 + out.y * 0.12, 0.62 + out.z * 0.12);
    parts.push(P(pup, '#0a0510'));
    // the sewn lips: a seam along the jaw with little stitches
    const seam = new THREE.CatmullRomCurve3([V(sd * 0.28, -0.08, 0.45), V(sd * 0.27, -0.1, 0.8), V(sd * 0.2, -0.11, 1.15), V(sd * 0.06, -0.1, 1.38)]);
    parts.push(P(new THREE.TubeGeometry(seam, 16, 0.014, 4, false), '#05040c', 0, 0.6));
    for (let k = 0; k < 4; k++) {
      const q = seam.getPointAt(0.12 + k * 0.22);
      parts.push(P(capsule(0.012, 0.09, 2, 4).translate(q.x, q.y, q.z), '#2a2050', 0, 1));
    }
    // antennae ending in little lamps
    const ant = new THREE.CatmullRomCurve3([V(sd * 0.12, 0.3, 0.72), V(sd * 0.38, 0.8, 0.42), V(sd * 0.78, 1.22, -0.08), V(sd * 1.02, 1.36, 0.22)]);
    parts.push(P(new THREE.TubeGeometry(ant, 24, 0.03, 5, false), '#100e2c'));
    const tip = ant.getPointAt(1);
    parts.push(P(sph(0.11, 14, 10).translate(tip.x, tip.y, tip.z), FIRE2, 2.6, 0.5));
  }
  // a lantern throat under the jaw, glowing like a firefly's belly
  parts.push(P(ell(0.2, 0.13, 0.3, 16, 12).translate(0, -0.27, 0.45), (p) => _c.copy(FIRE).lerp(FIRE2, smooth(-0.3, -0.2, p.y)), 1.5, 0.4));
  for (let k = 0; k < 3; k++) parts.push(P(new THREE.TorusGeometry(0.17 - Math.abs(k - 1) * 0.03, 0.018, 4, 16).rotateX(0.35).translate(0, -0.27, 0.33 + k * 0.12), '#0c0b22'));
  // the X on the snout
  parts.push(xStitch(0.3, 0.024, '#07060f', 0, 1).translate(0, -0.06, 1.41));
  // a crest of spines behind the skull, burning at the tips
  for (let k = -2; k <= 2; k++) {
    const h = 0.75 - Math.abs(k) * 0.12;
    const f = cone(0.06, h, 5).translate(0, h / 2, 0);
    glowAlong(P(f, (p) => _c.set('#16143c').lerp(FIRE, smooth(h * 0.55, h, p.y)), 1.8, 1), (p) => smooth(h * 0.5, h * 0.9, p.y));
    f.rotateX(-1.05).rotateZ(k * 0.32).translate(k * 0.07, 0.26, 0.05);
    parts.push(f);
  }
  return merge(parts);
}

/** a lacy firefly wing lying in the bone's xz plane, root at the origin, reaching +x and back */
function wingGeo(len: number, w: number): Geo {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.3, w * 0.9, len * 0.85, w * 0.75, len, w * 0.1);
  s.bezierCurveTo(len * 0.9, -w * 0.4, len * 0.4, -w * 0.5, 0, 0);
  const g = new THREE.ShapeGeometry(s, 20);
  g.rotateX(-Math.PI / 2); // shape y → -z: leading edge toward the head (+z)
  g.rotateY(-0.35); // swept back
  return g;
}

function wingMat(u: ReturnType<typeof legendUniforms>) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uTime: u.uTime, uTell: u.uTell, uAppear: u.uAppear, uBeat: u.uBeat, uLen: { value: 1.9 } },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uTell; uniform float uAppear; uniform float uBeat; uniform float uLen; varying vec3 vP;
      void main(){
        float r = length(vP.xz) / uLen;
        float a = atan(vP.z, vP.x);
        // veins: radial ribs and cross veins (a dragonfly's lace)
        float rib = smoothstep(0.06, 0.0, abs(fract(a * 7.0) - 0.5) - 0.42);
        float cross = smoothstep(0.05, 0.0, abs(fract(r * 9.0 + sin(a * 21.0) * 0.12) - 0.5) - 0.44);
        float vein = max(rib, cross * 0.7);
        float edge = smoothstep(0.75, 1.0, r);
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (r * 1.4 + a * 0.3 + vec3(0.0, 0.33, 0.67)) + uTime * 0.8);
        vec3 c = mix(vec3(0.3, 0.55, 0.5), film, 0.6) * 0.14 + vec3(0.6, 1.0, 0.35) * vein * (0.35 + uBeat * 0.5) + vec3(0.7, 1.0, 0.45) * edge * 0.25;
        c = mix(c, vec3(1.0, 0.25, 0.1) * (0.4 + vein), uTell * 0.75);
        float A = uAppear;
        gl_FragColor = vec4(c * A, 1.0);
      }`,
  });
}

interface Light {
  u: number;
  a: number;
  d: number;
  seed: number;
  w: number;
  orbR: number;
  warm: boolean;
}

export function wyrmRig(): Rig {
  const u = legendUniforms(new THREE.Color('#7a70ff').multiplyScalar(0.55), '#d8ff6a');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = legendMat(u, {
    rough: 0.42,
    metal: 0.15,
    key: 'wyrm',
    pars: `#define WL ${L.toFixed(1)}`,
    emissive: /* glsl */ `
      {
        // firefly lanterns in rows along the flanks and the back, flashing on the beat (a ripple from the head)
        float along = vObj.z;
        float rr = max(0.05, length(vObj.xy * vec2(1.0, 1.19)));
        float sy = vObj.y * 1.19 / rr, sx = abs(vObj.x) / rr;
        if (along > 0.9 && along < WL - 0.15 && vGlow < 0.01) {
          float spot = 0.0, hh = 0.0;
          for (int k = 0; k < 3; k++) {
            float row = k == 0 ? 0.05 : (k == 1 ? 0.55 : 0.93);
            float per = k == 2 ? 0.9 : 0.62;
            float zz = along / per + float(k) * 0.37;
            float fz = fract(zz) - 0.5;
            float h = lH(vec3(floor(zz), float(k), 5.0));
            float d = length(vec2(fz * per, (sy - row) * rr * 0.8));
            float sz = rr * (k == 2 ? 0.15 : 0.2) * (0.75 + 0.4 * h);
            float s1 = smoothstep(sz, sz * 0.35, d) * step(0.18, h) * (k == 2 ? 1.0 : step(0.1, sx));
            if (s1 > spot) { spot = s1; hh = h; }
          }
          float fl = exp(-fract(uBeatPos - (WL - along) * 0.016 - hh * 0.05) * 3.4);
          float swarm = clamp(uPhase - 1.0, 0.0, 1.0);
          vec3 fc = mix(vec3(0.62, 1.0, 0.12), vec3(1.0, 0.86, 0.25), hh * hh);
          fc = mix(fc, uTellCol, uTell * 0.9);
          totalEmissiveRadiance += fc * spot * (0.3 + 1.7 * fl * (1.0 + uTellBeat * uTell)) * (1.0 - 0.4 * swarm) * uK;
        }
      }`,
  });
  u.uK.value = 1;
  const spine = new Spine(bodyGeo(), NB, L, mat);
  body.add(spine.mesh);
  const head = new THREE.Mesh(headGeo(), mat);
  head.castShadow = true;
  head.scale.setScalar(1.55);
  spine.bones[NB - 1].add(head);
  // wings on the back
  const wm = wingMat(u);
  const wings: { m: THREE.Mesh; side: number; ph: number }[] = [];
  for (const [bu, len] of [[0.7, 2.7], [0.77, 2.1]] as const) {
    const bi = Math.round(bu * (NB - 1));
    for (const sd of [-1, 1]) {
      const g = wingGeo(len, len * 0.32);
      if (sd < 0) g.scale(-1, 1, 1);
      const m = new THREE.Mesh(g, wm);
      m.position.set(sd * 0.12, rad(bu) * 0.75, 0);
      m.renderOrder = 7;
      spine.bones[bi].add(m);
      wings.push({ m, side: sd, ph: bu * 9 });
    }
  }
  // the loose firefly lights
  const rnd = rng(11);
  const NL = 120;
  const lights: Light[] = [];
  for (let i = 0; i < NL; i++) {
    lights.push({ u: 0.05 + rnd() * 0.9, a: (rnd() * 1.5 - 0.25) * Math.PI, d: 0.12 + rnd() * 0.45, seed: rnd(), w: 0.6 + rnd() * 1.2, orbR: 1.1 + rnd() * 2.0, warm: rnd() < 0.3 });
  }
  const gp = new GlowPoints(NL, { soft: 1.8 });
  root.add(gp.points);

  const ctrl: THREE.Vector3[] = Array.from({ length: 13 }, () => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const up = V(0, 1, -0.25).normalize();
  const fr: Frame = newFrame();
  const hf: Frame = newFrame();
  const strikeAt = new THREE.Vector3();
  let phase = 1;
  let crownT = 0;

  const rig: Rig = {
    root,
    u,
    height: 6.2 * SZ,
    strikeAt,
    enterDur: 4.2,
    phaseDur: 2.4,
    setPhase(n) {
      phase = n;
    },
    update(s: ActS) {
      const { t, beat } = s;
      const tight = clamp01(s.phase - 2);
      const swarm = clamp01(s.phase - 1);
      // ── the path: a coil rising in the air, a neck rearing up from its front
      const R = THREE.MathUtils.lerp(1.75, 1.25, tight) * (1 - s.stagger * 0.1);
      const turns = THREE.MathUtils.lerp(1.45, 2.0, tight);
      const y0 = 1.35 - s.stagger * 0.7, y1 = 3.35 - s.stagger * 0.9;
      const K = 9;
      for (let k = 0; k < K; k++) {
        const q = k / (K - 1);
        const ang = Math.PI / 2 - (1 - q) * turns * Math.PI * 2;
        const wave = Math.sin(q * 9 - t * 2.1) * 0.12 + Math.sin(beat * Math.PI - q * 4) * 0.06;
        const r = R * (0.92 + 0.08 * q) + wave;
        ctrl[k + 1].set(Math.cos(ang) * r, y0 + q * (y1 - y0) + Math.sin(q * 7 - t * 1.7) * 0.14, Math.sin(ang) * r - 0.3);
      }
      // the tail hangs out of the bottom of the coil, the lantern swinging
      const c1 = ctrl[1];
      ctrl[0].set(c1.x * 1.25 + Math.sin(t * 1.3) * 0.3, c1.y - 1.15 + Math.sin(beat * Math.PI) * 0.15, c1.z * 1.2 - 0.6);
      // neck and head
      const top = ctrl[K];
      const sway = Math.sin(beat * Math.PI * 0.5) * 0.35 * (1 - s.telling);
      const w = s.windup * s.telling, st = s.strike, rc = s.recoil, sg = s.stagger;
      const shake = (Math.sin(t * 43) * 0.12 + Math.sin(t * 31) * 0.08) * (rc + s.tellBeat * w * 0.6);
      const sum = s.summon;
      ctrl[K + 1].set(top.x + 0.35 + sway * 0.3, top.y + 0.75, top.z + 0.55 - w * 0.5 + st * 1.2 - rc * 0.4);
      ctrl[K + 2].set(-0.1 + sway * 0.6 + shake, top.y + 1.6 + w * 0.6 - st * 1.2 + rc * 0.5 - sg * 0.8 + sum * 0.6, top.z + 0.5 - w * 1.3 + st * 2.6 - rc * 0.9);
      ctrl[K + 3].set(sway + shake + Math.sin(s.staggerAge * 5) * 0.7 * sg, top.y + 2.05 + w * 0.95 - st * 2.2 + rc * 1.1 - sg * 1.5 + s.pulse * 0.08 + sum * 1.0, top.z + 1.45 - w * 1.7 + st * 4.4 - rc * 2.0);
      // the head's up: rearing back tilts it up, the strike points it down
      up.set(0, 1, -0.25 - w * 0.6 + st * 0.7).normalize();
      curve.points = ctrl;
      curve.updateArcLengths();
      // a swell runs down the body on every beat
      spine.pose(curve, up, (q) => 1 + 0.09 * Math.exp(-frac(beat - (1 - q) * 0.6) * 5) + w * 0.05 * smooth(0.7, 1, q));
      spine.frame(1, hf);
      strikeAt.copy(hf.p).addScaledVector(hf.t, 1.3);
      // ── whole body: phase flourish (one full spin), entrance (spirals down from the sky), sink
      const fx = s.phaseFx;
      const spin = fx >= 0 ? smooth(0, 1, fx) * Math.PI * 2 : 0;
      const e = 1 - s.enter;
      body.rotation.y = spin - e * e * 5.5;
      body.position.y = e * e * 13 - s.sink * 4.5 + (fx >= 0 ? Math.sin(fx * Math.PI) * 0.6 : 0);
      body.position.z = -e * e * 3;
      body.scale.setScalar(SZ);
      body.updateMatrix();
      strikeAt.applyMatrix4(body.matrix);
      // glow strength
      u.uGlow.value.set(0.9 + sum * 1.2 + (fx >= 0 ? Math.sin(fx * Math.PI) * 1.5 : 0), 0.7);
      u.uK.value = 1 - sg * 0.6;
      // ── wings buzz (and beat once per beat)
      for (const wg of wings) {
        const buzz = Math.sin(t * 38 + wg.ph) * 0.18 + Math.sin(beat * Math.PI * 2) * 0.12;
        wg.m.rotation.z = wg.side * (0.35 + buzz - w * 0.5 + st * 0.6);
        wg.m.rotation.y = wg.side * (-0.15 + w * 0.3);
      }
      // ── the loose lights
      crownT += s.dt * (0.6 + s.pulse * 1.5);
      const tellC = RED;
      for (let i = 0; i < NL; i++) {
        const L0 = lights[i];
        spine.frame(L0.u, fr);
        const r = rad(L0.u) * spine.bones[Math.round(L0.u * (NB - 1))].scale.x;
        const dr = L0.d + Math.sin(t * L0.w + L0.seed * 20) * 0.06 + sum * 0.8 * L0.seed + (fx >= 0 ? Math.sin(fx * Math.PI) * 1.8 * L0.seed : 0) + e * 6 * L0.seed;
        const a = L0.a + Math.sin(t * 0.5 + L0.seed * 9) * 0.2;
        let x = fr.p.x + (fr.x.x * Math.cos(a) + fr.n.x * Math.sin(a)) * (r + dr);
        let y = fr.p.y + (fr.x.y * Math.cos(a) + fr.n.y * Math.sin(a)) * (r + dr);
        let z = fr.p.z + (fr.x.z * Math.cos(a) + fr.n.z * Math.sin(a)) * (r + dr);
        // the swarm (phase 2+): an orbiting cloud around the coils
        const k = smooth(0, 1, swarm * 1.6 - L0.seed * 0.6);
        if (k > 0) {
          const oa = L0.a * 2 + t * (0.4 + L0.seed * 0.5) * (L0.seed > 0.5 ? 1 : -1);
          const orb = L0.orbR * (1 - tight * 0.25) * (1 + s.pulse * 0.08);
          const sx = Math.cos(oa) * orb, sz = Math.sin(oa) * orb - 0.3;
          const sy = 0.8 + L0.u * 4.2 + Math.sin(t * L0.w + L0.seed * 7) * 0.4;
          x += (sx - x) * k;
          y += (sy - y) * k;
          z += (sz - z) * k;
        }
        // the crown (phase 3): a ring over the head
        if (i < 22) {
          const kc = smooth(0, 1, (s.phase - 2) * 1.5 - i / 60);
          if (kc > 0) {
            const ca = (i / 22) * Math.PI * 2 + crownT;
            const cr = 0.72 + Math.sin(i * 2.1) * 0.05;
            const cx = hf.p.x + hf.n.x * 0.9 + (hf.x.x * Math.cos(ca) + hf.t.x * Math.sin(ca)) * cr;
            const cy = hf.p.y + hf.n.y * 0.9 + (hf.x.y * Math.cos(ca) + hf.t.y * Math.sin(ca)) * cr + Math.sin(ca * 3 + t * 2) * 0.06;
            const cz = hf.p.z + hf.n.z * 0.9 + (hf.x.z * Math.cos(ca) + hf.t.z * Math.sin(ca)) * cr;
            x += (cx - x) * kc;
            y += (cy - y) * kc;
            z += (cz - z) * kc;
          }
        }
        // flash on the beat, a ripple from the head down the body
        const fl = Math.exp(-frac(beat - (1 - L0.u) * 0.35 - L0.seed * 0.1) * 3.4);
        const crown = i < 22 && s.phase > 2.05;
        const bright = (0.6 + 2.6 * fl) * (crown ? 1.6 : 1) * (1 - sg * 0.5) * (1 + sum);
        _c.copy(L0.warm ? FIRE2 : FIRE).lerp(tellC, s.telling * 0.85).multiplyScalar(bright * (1 + s.tellBeat * s.telling));
        const sz = (crown ? 0.7 : 0.42 + L0.seed * 0.3) * (0.75 + fl * 0.6);
        gp.set(i, x, y, z, sz, Math.min(1, u.uAppear.value * 1.2 + e), _c);
      }
      gp.points.position.copy(body.position);
      gp.points.rotation.copy(body.rotation);
      gp.points.scale.copy(body.scale);
      gp.mat.uniforms.uClipY.value = u.uClipY.value;
      gp.commit();
      void phase;
    },
    dispose() {
      wm.dispose();
      gp.mat.dispose();
      gp.points.geometry.dispose();
    },
  };
  return rig;
}
