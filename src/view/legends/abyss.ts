/**
 * Rei do Abismo (citadel secret path, the ultimate duel): a towering shadow king. His cloak is a
 * window onto a starry void (stars and nebula drawn along the view ray, so the cloak looks like a hole
 * in the world), with a torn, rippling hem; spiked pauldrons and a high collar; a black porcelain mask
 * with glowing cracks and the X sewn in silver; a CROWN OF BROKEN INSTRUMENTS (violin scroll,
 * trumpet bell, broken harp, organ pipes, lyre, drumsticks, piano keys); and six long arms holding
 * black batons that CONDUCT the music (the 4/4 pattern, the three pairs in canon).
 *   phase 2: the crown ignites (violet-gold flames on every broken instrument)
 *   phase 3: the void cloak opens like a galaxy: it parts in front and a spiral galaxy turns inside,
 *            spilling out behind him
 */
import * as THREE from 'three';
import { capsule, clamp01, cone, cyl, sph } from '../kit';
import { ell } from '../musicians';
import { type ActS, type Geo, GlowPoints, type LU, NOISE, P, type Rig, V, curtain, glowAlong, legendMat, legendUniforms, merge, mergeAR, rng, smooth, xStitch } from './common';

const _c = new THREE.Color();
const SHADOW = new THREE.Color('#120e1e'), SHADOW2 = new THREE.Color('#2a2244'), BRONZE = '#6a5a4a', VIOLET = '#b48cff';

const ROBE: [number, number][] = [[2.3, 0], [2.05, 0.4], [1.8, 1.2], [1.55, 2.2], [1.42, 3.0], [1.4, 3.8], [1.45, 4.5], [1.55, 5.0], [1.48, 5.35], [1.0, 5.62], [0.42, 5.78], [0.0, 5.82]];
const robeR = (y: number) => {
  for (let i = 0; i < ROBE.length - 1; i++) {
    const [r0, y0] = ROBE[i], [r1, y1] = ROBE[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
};

// ───────────────────────────── the void cloak ─────────────────────────────

function voidMat(u: LU) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: u.uTime, uBeat: u.uBeat, uAppear: u.uAppear, uClipY: u.uClipY, uOpen: { value: 0 }, uFlash: u.uFlash, uTell: u.uTell,
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uOpen; varying vec3 vW; varying vec3 vObj; varying vec3 vN; varying float vEdge;
      void main(){
        vec3 p = position;
        float r = length(p.xz);
        float a = atan(p.x, p.z); // 0 = front
        // the hem ripples like smoke in water
        float k = 1.0 - smoothstep(0.0, 1.6, p.y);
        float w = sin(a * 5.0 + uTime * 1.5 + p.y * 2.0);
        r += w * 0.09 * k;
        p.y += sin(a * 7.0 - uTime * 2.0) * 0.05 * k;
        // the cloak opens in front like a galaxy (phase 3): the front parts and flares outward
        float lo = smoothstep(5.4, 3.6, p.y); // the collar stays closed
        float gap = uOpen * 1.35 * lo;
        float s = a < 0.0 ? -1.0 : 1.0; float aa = abs(a);
        float na = gap + aa * (3.14159 - gap) / 3.14159;
        vEdge = 1.0 - smoothstep(0.0, 0.12, na - gap);
        r *= 1.0 + uOpen * lo * 0.35 * (1.0 - smoothstep(0.0, 1.6, na - gap));
        p.x = sin(na * s) * r; p.z = cos(na) * r;
        vObj = position;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uAppear; uniform float uClipY; uniform float uOpen; uniform vec3 uFlash; uniform float uTell;
      varying vec3 vW; varying vec3 vObj; varying vec3 vN; varying float vEdge;
      ${NOISE}
      void main(){
        if (vW.y < uClipY) discard;
        // torn hem
        float ang = atan(vObj.x, vObj.z);
        float hem = lN(vec3(ang * 4.0, 0.0, 3.0)) * 0.35 + lN(vec3(ang * 13.0, 1.0, 7.0)) * 0.18;
        if (vObj.y < hem - 0.05) discard;
        if (uAppear < 0.999) { float dn = lN(vObj * 2.3) * 0.62 + lN(vObj * 7.1) * 0.38; if (dn < 1.0 - uAppear * 1.2) discard; }
        vec3 V = normalize(vW - cameraPosition);
        // the void: stars and nebula along the view ray (a window, not a surface)
        vec3 q = V * 260.0;
        float st = 0.0;
        for (int i = 0; i < 2; i++) {
          vec3 g = q * (1.0 + float(i) * 1.7);
          vec3 id = floor(g); vec3 f = fract(g) - 0.5;
          float h = lH(id + float(i) * 13.0);
          float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 4.0) + h * 40.0);
          st += step(0.93, h) * smoothstep(0.16, 0.0, length(f)) * tw * (1.6 - float(i) * 0.6);
        }
        float neb = lF(V * 22.0 + vec3(0.0, uTime * 0.15, 0.0));
        float neb2 = lF(V * 40.0 + 5.0);
        vec3 c = vec3(0.012, 0.008, 0.03);
        c += vec3(0.3, 0.07, 0.5) * smoothstep(0.5, 0.85, neb) * 0.7;
        c += vec3(0.03, 0.25, 0.45) * smoothstep(0.58, 0.9, neb2) * 0.5;
        c += vec3(1.0, 0.95, 1.0) * st * (0.8 + uBeat * 0.6);
        // a dark ink rim so the shape reads, violet light along the folds and the opening
        float rim = pow(1.0 - abs(dot(normalize(vN), -V)), 2.5);
        c = mix(c, vec3(0.05, 0.035, 0.09), rim * 0.6);
        c += vec3(0.5, 0.32, 1.0) * pow(rim, 2.0) * 0.45;
        c += vec3(0.75, 0.55, 1.0) * vEdge * uOpen * (0.7 + uBeat * 0.8);
        c += uFlash * 0.5;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function robeGeo(): Geo {
  const curve = new THREE.SplineCurve(ROBE.map(([r, y]) => new THREE.Vector2(r, y)));
  const g = new THREE.LatheGeometry(curve.getPoints(48).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y)), 72);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const fk = 1 + (Math.sin(a * 9 + y * 1.2) * 0.5 + Math.sin(a * 4 - y * 0.6) * 0.5) * 0.06 * smooth(5.0, 0.5, y);
    p.setXYZ(i, x * fk, y, z * fk * 0.85);
  }
  g.computeVertexNormals();
  return g;
}

// ───────────────────────────── crown of broken instruments ─────────────────────────────

function crownGeo(): Geo {
  const parts: Geo[] = [];
  const B = (g: Geo, glow = 0) => parts.push(P(g, (p) => _c.set(BRONZE).lerp(new THREE.Color('#2a2230'), smooth(0.6, 0.0, p.y) * 0.6), glow, 0.3));
  const R = 0.46;
  B(new THREE.TorusGeometry(R, 0.05, 6, 36).rotateX(Math.PI / 2));
  B(new THREE.TorusGeometry(R * 1.02, 0.025, 4, 36).rotateX(Math.PI / 2).translate(0, 0.1, 0));
  const at = (a: number, g: Geo) => g.rotateY(-a + Math.PI / 2).translate(Math.cos(a) * R, 0, Math.sin(a) * R);
  // violin neck with its scroll (front)
  {
    const v: Geo[] = [P(new THREE.BoxGeometry(0.07, 0.9, 0.05).translate(0, 0.45, 0), '#3a2418'), P(new THREE.TorusGeometry(0.07, 0.03, 6, 14, Math.PI * 1.6).rotateY(Math.PI / 2).translate(0, 0.95, 0.03), '#4a2c1c'), P(new THREE.BoxGeometry(0.03, 0.12, 0.12).translate(0, 0.78, 0), '#1a1010')];
    for (let k = 0; k < 4; k++) v.push(P(cyl(0.004, 0.004, 0.85, 3).translate((k - 1.5) * 0.014, 0.42, 0.03), '#d8d0c0', 0.6));
    parts.push(at(Math.PI / 2, merge(v)).rotateZ(0.0));
  }
  // trumpet bell (front right)
  B(at(Math.PI / 2 - 0.75, merge([P(cone(0.2, 0.4, 16, ).rotateX(Math.PI).translate(0, 0.62, 0), BRONZE), P(cyl(0.03, 0.03, 0.5, 8).translate(0, 0.25, 0), BRONZE)])), 0.1);
  // broken harp arch (right)
  {
    const arch = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.05, 0.4, 0), V(0.22, 0.7, 0), V(0.4, 0.75, 0)]);
    const h: Geo[] = [P(new THREE.TubeGeometry(arch, 16, 0.03, 5, false), '#b89a5a', 0.15)];
    for (let k = 0; k < 4; k++) {
      const q = arch.getPointAt(0.3 + k * 0.17);
      h.push(P(cyl(0.004, 0.004, q.y * 0.9, 3).translate(q.x, q.y * 0.45, 0), '#e8e0d0', 0.8));
    }
    parts.push(at(0.0, merge(h).rotateY(0.6)));
  }
  // organ pipes (back right), bent
  for (let k = 0; k < 3; k++) {
    const hgt = 0.85 + k * 0.25;
    const pipe = merge([P(cyl(0.05, 0.05, hgt, 10).translate(0, hgt / 2, 0), '#8a8a92'), P(new THREE.BoxGeometry(0.06, 0.04, 0.02).translate(0, 0.18, 0.05), '#111')]);
    pipe.rotateZ((k - 1) * 0.18 + 0.1);
    parts.push(at(-0.45 - k * 0.22, pipe));
  }
  // lyre (back)
  {
    const lyre = new THREE.CatmullRomCurve3([V(-0.2, 0.75, 0), V(-0.18, 0.2, 0), V(0, 0.05, 0), V(0.18, 0.2, 0), V(0.2, 0.75, 0)]);
    const l: Geo[] = [P(new THREE.TubeGeometry(lyre, 20, 0.03, 5, false), '#c8a860', 0.15), P(cyl(0.02, 0.02, 0.48, 5).rotateZ(Math.PI / 2).translate(0, 0.62, 0), '#c8a860')];
    for (let k = 0; k < 3; k++) l.push(P(cyl(0.004, 0.004, 0.5, 3).translate((k - 1) * 0.08, 0.38, 0), '#e8e0d0', 0.8));
    parts.push(at(-Math.PI / 2, merge(l)));
  }
  // crossed drumsticks (back left)
  for (const k of [-1, 1]) parts.push(at(-Math.PI / 2 - 0.75, merge([P(capsule(0.025, 0.9, 2, 5).translate(0, 0.45, 0), '#d8b890'), P(sph(0.05, 8, 6).translate(0, 0.92, 0), '#e8d0a0')]).rotateZ(k * 0.4)));
  // piano keys fan (left)
  {
    const keys: Geo[] = [];
    for (let k = 0; k < 7; k++) keys.push(P(new THREE.BoxGeometry(0.06, 0.55 + (k % 3) * 0.12, 0.03).translate(0, 0.3, 0).rotateZ((k - 3) * 0.12).translate((k - 3) * 0.03, 0, 0), k % 2 ? '#141018' : '#ece6da'));
    parts.push(at(Math.PI, merge(keys)));
  }
  // a cracked cymbal shard (front left)
  parts.push(at(Math.PI / 2 + 0.75, P(new THREE.CircleGeometry(0.28, 12, 0, 4.2).translate(0, 0.42, 0), '#c8a040', 0.15)));
  return merge(parts);
}

function maskGeo(): Geo {
  const parts: Geo[] = [];
  // a long regal mask of black porcelain
  const mg = new THREE.SphereGeometry(1, 32, 24, Math.PI / 2 - 1.2, 2.4, 0.08, Math.PI * 0.84);
  mg.scale(0.34, 0.56, 0.27);
  parts.push(P(mg, (p, n) => _c.set('#1a1624').lerp(new THREE.Color('#3a3450'), smooth(0.3, 1.0, n.z) * smooth(-0.2, 0.3, p.y + 0.2))));
  // behind it, the head: shadow
  parts.push(P(ell(0.33, 0.52, 0.32, 20, 14).translate(0, 0, -0.1), SHADOW));
  const onM = (x: number, y: number) => {
    const k = 1 - (x / 0.34) ** 2 - (y / 0.56) ** 2;
    return V(x, y, 0.27 * Math.sqrt(Math.max(0, k)) + 0.006);
  };
  // hollow eyes (almond slits) that glow
  for (const sd of [-1, 1]) {
    const c = onM(sd * 0.12, 0.08);
    parts.push(P(ell(0.085, 0.03, 0.03, 12, 8).rotateZ(-sd * 0.25).translate(c.x, c.y, c.z), '#e6d8ff', 3.0, 1));
  }
  // glowing cracks
  const crack = (pts: [number, number][]) => {
    const cv = new THREE.CatmullRomCurve3(pts.map(([x, y]) => onM(x, y)), false, 'catmullrom', 0.1);
    parts.push(P(new THREE.TubeGeometry(cv, pts.length * 5, 0.008, 4, false), VIOLET, 2.0, 0.5));
  };
  crack([[0.04, 0.5], [0.0, 0.38], [-0.04, 0.3], [-0.06, 0.18]]);
  crack([[-0.2, 0.0], [-0.18, -0.12], [-0.22, -0.25], [-0.17, -0.36]]);
  crack([[0.2, 0.3], [0.16, 0.22], [0.2, 0.12]]);
  crack([[0.0, 0.38], [0.08, 0.34], [0.12, 0.28]]);
  // the X in silver thread
  const m = onM(0, -0.22);
  parts.push(xStitch(0.2, 0.018, '#e6e0f0', 1.0, 1).translate(m.x, m.y, m.z + 0.01));
  return merge(parts);
}

// ───────────────────────────── the king ─────────────────────────────

interface Arm {
  sd: number;
  pair: number;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  tip: THREE.Object3D;
}

/** the 4/4 conducting pattern: [shX, shZ, elbow] at beats 1 (down), 2 (in), 3 (out), 4 (up) */
const PATTERN: [number, number, number][] = [[-0.75, 0.75, -0.55], [-1.05, 0.3, -1.0], [-0.95, 1.3, -0.5], [-1.75, 0.8, -0.95]];

function conduct(b: number, out: number[]) {
  const i = Math.floor(b) % 4, f = b - Math.floor(b);
  // reach the next point quickly, then rest on it (the ictus)
  const k = smooth(0, 0.55, f);
  const a = PATTERN[i], c = PATTERN[(i + 1) % 4];
  for (let j = 0; j < 3; j++) out[j] = a[j] + (c[j] - a[j]) * k;
  out[2] -= Math.exp(-f * 7) * 0.3; // a flick of the wrist on every beat
}

export function abyssRig(): Rig {
  const u = legendUniforms(new THREE.Color('#9d7cff').multiplyScalar(0.7), '#b48cff');
  const root = new THREE.Group();
  const king = new THREE.Group();
  root.add(king);
  root.scale.setScalar(1.12);
  const vMat = voidMat(u);
  const shadowMat = legendMat(u, { rough: 0.6, metal: 0.25, key: 'abyss-shadow' });
  const maskMat = legendMat(u, { rough: 0.15, metal: 0.1, key: 'abyss-mask' });
  const crownMat = legendMat(u, {
    rough: 0.35,
    metal: 0.85,
    key: 'abyss-crown',
    emissive: /* glsl */ `
      { // the crown ignites (phase 2): embers crawling up the broken instruments
        float f = lF(vec3(vObj.x * 6.0, vObj.y * 5.0 - uTime * 2.5, vObj.z * 6.0));
        totalEmissiveRadiance += mix(vec3(0.6, 0.3, 1.0), vec3(1.0, 0.8, 0.45), f) * uK2 * smoothstep(0.2, 0.9, f + vObj.y * 0.5) * (0.6 + uBeat * 0.3);
      }`,
  });
  const mats: THREE.Material[] = [vMat, shadowMat, maskMat, crownMat];
  // ── the cloak
  const cloak = new THREE.Mesh(robeGeo(), vMat);
  cloak.castShadow = true;
  cloak.frustumCulled = false;
  king.add(cloak);
  // ── shoulders, collar
  const upper = new THREE.Group();
  upper.position.y = 4.6;
  king.add(upper);
  {
    const g: Geo[] = [];
    for (const sd of [-1, 1]) {
      g.push(P(sph(0.62, 18, 12, ).scale(1.05, 0.55, 0.9).translate(sd * 1.15, 0.72, 0), SHADOW2));
      for (let k = 0; k < 4; k++) {
        const sp = cone(0.12, 0.75 - k * 0.1, 6).translate(0, 0.35, 0).rotateZ(-sd * (0.35 + k * 0.32)).translate(sd * (1.05 + k * 0.15), 0.95 - k * 0.1, -0.1 + k * 0.08);
        g.push(glowAlong(P(sp, (p) => _c.copy(SHADOW).lerp(new THREE.Color(VIOLET), smooth(0.9, 1.6, p.y) * 0.8), 1.2, 0.5), (p) => smooth(1.0, 1.5, p.y)));
      }
    }
    // the high collar: a fan of spikes behind the head
    for (let k = -4; k <= 4; k++) {
      const h = 1.5 - Math.abs(k) * 0.12;
      const sp = cone(0.1, h, 5).scale(1, 1, 0.5).translate(0, h / 2, 0).rotateX(-0.25).rotateZ(-k * 0.2).translate(k * 0.12, 1.0, -0.45);
      g.push(glowAlong(P(sp, (p) => _c.copy(SHADOW).lerp(new THREE.Color(VIOLET), smooth(1.6, 2.4, p.y) * 0.9), 1.4, 0.3), (p) => smooth(1.9, 2.4, p.y)));
    }
    const m = new THREE.Mesh(merge(g), shadowMat);
    m.castShadow = true;
    upper.add(m);
  }
  // ── head, mask, crown
  const head = new THREE.Group();
  head.position.set(0, 1.75, 0.12);
  upper.add(head);
  head.scale.setScalar(1.9);
  head.add(new THREE.Mesh(maskGeo(), maskMat));
  const crown = new THREE.Group();
  crown.position.set(0, 0.5, -0.06);
  crown.rotation.x = -0.12;
  head.add(crown);
  crown.add(new THREE.Mesh(crownGeo(), crownMat));
  // crown flames (phase 2)
  const flameMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uTime: u.uTime, uBeat: u.uBeat, uTell: u.uTell, uAppear: u.uAppear, uGain: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aR; uniform float uTime; varying vec3 vR;
      void main(){ vec3 p = position; float v = aR.y;
        p.x += sin(v * 6.0 - uTime * 5.0 + aR.x * 2.0) * 0.08 * v;
        p.z += cos(v * 5.0 - uTime * 4.0 + aR.x) * 0.06 * v;
        vR = aR.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uTell; uniform float uAppear; uniform float uGain; varying vec3 vR;
      ${NOISE}
      void main(){
        float v = vR.y, w = vR.z;
        float n = lF(vec3(w * 3.0 + vR.x * 1.3, v * 3.0 - uTime * 3.5, vR.x));
        float body = smoothstep(0.0, 0.3, w) * smoothstep(1.0, 0.7, w);
        float fl = smoothstep(v - 0.1, v + 0.3, n + 0.3 - v * 0.3) * body * (1.0 - smoothstep(0.6, 1.0, v));
        vec3 c = mix(vec3(1.0, 0.85, 0.6), vec3(0.55, 0.2, 1.0), smoothstep(0.0, 0.35, v));
        c = mix(c, vec3(1.0, 0.2, 0.1), uTell * 0.6);
        gl_FragColor = vec4(c * fl * uGain * uAppear * (0.6 + uBeat * 0.5) * 0.8, 1.0);
      }`,
  });
  mats.push(flameMat);
  {
    const strips: Geo[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const base = V(Math.cos(a) * 0.46, 0.55 + (k % 3) * 0.12, Math.sin(a) * 0.46);
      const side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.12);
      strips.push(curtain(base.clone().sub(side), base.clone().add(side), V(0, 1, 0), 1, () => 0.9 + (k % 2) * 0.35, 50 + k));
    }
    const flames = new THREE.Mesh(mergeAR(strips), flameMat);
    flames.frustumCulled = false;
    flames.renderOrder = 8;
    crown.add(flames);
  }
  // ── six arms with batons, conducting in canon
  const arms: Arm[] = [];
  const skinG = (g: Geo) => P(g, (p) => _c.copy(SHADOW).lerp(SHADOW2, smooth(-1.4, 0, p.y)));
  for (let pair = 0; pair < 3; pair++) {
    const y = 0.45 - pair * 0.75;
    for (const sd of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sd * (robeR(4.6 + y) * 0.92), y, 0.1 + pair * 0.05);
      upper.add(shoulder);
      const k = 1 - pair * 0.1;
      const sleeve = new THREE.LatheGeometry([new THREE.Vector2(0.16, 0.08), new THREE.Vector2(0.15, -0.3), new THREE.Vector2(0.2, -0.8), new THREE.Vector2(0.26, -1.15)], 12);
      const up = new THREE.Mesh(merge([skinG(capsule(0.1, 1.3 * k, 3, 8).translate(0, -0.65 * k, 0)), P(sleeve, (p) => _c.copy(SHADOW2).lerp(SHADOW, smooth(-0.2, -1.1, p.y)))]), shadowMat);
      up.castShadow = true;
      shoulder.add(up);
      const elbow = new THREE.Group();
      elbow.position.y = -1.35 * k;
      shoulder.add(elbow);
      // forearm, a long thin hand closed on the baton, the baton
      const fa: Geo[] = [skinG(capsule(0.085, 1.2 * k, 3, 8).translate(0, -0.6 * k, 0)), skinG(ell(0.12, 0.18, 0.08, 10, 8).translate(0, -1.32 * k, 0))];
      for (let f = 0; f < 4; f++) fa.push(skinG(capsule(0.022, 0.16, 2, 5).rotateX(-1.2).translate((f - 1.5) * 0.035, -1.42 * k, 0.07)));
      const bl = 1.5;
      fa.push(P(cyl(0.03, 0.045, bl, 6).rotateX(Math.PI / 2 + 0.25).translate(0, -1.42 * k - 0.2, bl / 2 + 0.02), '#0a080e'));
      fa.push(P(sph(0.075, 8, 6).translate(0, -1.42 * k - 0.2 - Math.sin(0.25) * bl, Math.cos(0.25) * bl + 0.02), '#f2ecff', 2.6, 1));
      const fm = new THREE.Mesh(merge(fa), shadowMat);
      fm.castShadow = true;
      elbow.add(fm);
      const tip = new THREE.Object3D();
      tip.position.set(0, -1.42 * k - 0.2 - Math.sin(0.25) * bl, Math.cos(0.25) * bl);
      elbow.add(tip);
      arms.push({ sd, pair, shoulder, elbow, tip });
    }
  }
  // ── the galaxy inside the cloak (phase 3) and the motes of the void
  const NGX = 1300;
  const galaxy = new GlowPoints(NGX, { soft: 1.8 });
  const gx = new THREE.Group();
  gx.position.set(0, 3.3, 0.05);
  gx.add(galaxy.points);
  king.add(gx);
  const rnd = rng(99);
  const gal = Array.from({ length: NGX }, (_, i) => {
    const arm = i % 3;
    const r = Math.pow(rnd(), 0.7) * 1.0;
    const a = arm * ((Math.PI * 2) / 3) + r * 5.5 + (rnd() - 0.5) * 0.55 * (1 - r * 0.4);
    return { r, a, y: (rnd() - 0.5) * 0.08 * (1 - r), s: rnd(), hue: rnd() };
  });
  const GC = [new THREE.Color('#fff2e0'), new THREE.Color('#b48cff'), new THREE.Color('#7ad8ff'), new THREE.Color('#ff9ad8')];
  const NM = 120;
  const motes = new GlowPoints(NM, { star: true, soft: 2.0 });
  king.add(motes.points);
  const mote = Array.from({ length: NM }, () => ({ a: rnd() * 6.28, r: 1.6 + rnd() * 2.6, h: rnd(), s: rnd() }));

  // ── a pool of void on the ground (he rises out of it, sinks into it)
  const poolMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: u.uTime, uBeat: u.uBeat, uK: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uK; varying vec2 vP;
      ${NOISE}
      void main(){
        float r = length(vP) / 3.4;
        float a = atan(vP.y, vP.x);
        float edge = lN(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 0.4)) * 0.18;
        float inside = smoothstep(1.0 - edge, 0.86 - edge, r);
        float ring = smoothstep(0.12, 0.0, abs(r - 0.9 + edge)) * (0.7 + uBeat * 0.6);
        float st = step(0.985, lH(floor(vec3(vP * 9.0, 1.0)))) * (0.5 + 0.5 * sin(uTime * 3.0 + vP.x * 7.0));
        vec3 c = vec3(0.01, 0.0, 0.03) + vec3(0.9, 0.85, 1.0) * st * inside + vec3(0.6, 0.35, 1.0) * ring;
        gl_FragColor = vec4(c, max(inside, ring) * uK);
      }`,
  });
  mats.push(poolMat);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48).rotateX(-Math.PI / 2), poolMat);
  pool.position.y = 0.03;
  pool.renderOrder = 1;
  root.add(pool);

  const strikeAt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const cp = [0, 0, 0];

  const rig: Rig = {
    root,
    u,
    height: 8.6 * 1.12,
    strikeAt,
    enterDur: 4.5,
    phaseDur: 2.6,
    setPhase() {},
    update(s: ActS) {
      const { t, beat } = s;
      const ign = clamp01(s.phase - 1), open = clamp01(s.phase - 2);
      const w = s.windup * s.telling, st = s.strike, rc = s.recoil, sg = s.stagger, sm = s.summon;
      const fx = s.phaseFx;
      // ── body: breathes, leans into the wind-up and the blow
      const e = s.enter;
      king.position.y = -(1 - smooth(0.0, 0.9, e)) * 9 - s.sink * 9.5 + Math.sin(t * 0.9) * 0.05;
      upper.rotation.set(-w * 0.25 + st * 0.3 - rc * 0.25 + sg * 0.25, Math.sin(beat * Math.PI * 0.5) * 0.06, Math.sin(s.staggerAge * 4) * 0.12 * sg);
      head.rotation.set(0.12 - w * 0.2 + st * 0.2 + sg * 0.35, -Math.sin(beat * Math.PI * 0.5) * 0.08, 0);
      // ── the arms conduct; the acts take over
      const calm = 1 - Math.max(w, st, rc, sg, sm);
      for (const a of arms) {
        conduct(beat + 4 - a.pair * 0.25, cp);
        let shX = cp[0], shZ = cp[1] + a.pair * 0.25, el = cp[2];
        // wind-up: every baton raised high; the blow: slashed down toward the colossus, in a cascade
        const dl = a.pair * 0.06;
        const stk = s.blowAge < 2 ? (s.blowAge - dl < 0 ? 0 : s.strike) : 0;
        shX += (-2.5 + a.pair * 0.25 - shX) * w;
        shZ += (0.55 + a.pair * 0.2 - shZ) * w;
        el += (-0.9 - el) * w;
        shX += (-1.15 + a.pair * 0.12 - shX) * stk;
        shZ += (0.25 - shZ) * stk;
        el += (-0.05 - el) * stk;
        shX += (-2.0 - shX) * rc;
        shZ += (1.4 - shZ) * rc;
        shX += (-0.1 - shX) * sg;
        shZ += (0.25 - shZ) * sg;
        el += (-0.2 - el) * sg;
        shX += (-1.6 - shX) * sm;
        shZ += (1.6 - shZ) * sm;
        a.shoulder.rotation.set(shX, a.sd * (0.3 * calm), a.sd * shZ, 'XYZ');
        a.elbow.rotation.x = el;
      }
      // the blow lands between the lowest batons
      arms[4].tip.getWorldPosition(strikeAt);
      arms[5].tip.getWorldPosition(tmp);
      strikeAt.add(tmp).multiplyScalar(0.5);
      root.parent?.worldToLocal(strikeAt);
      // ── the pool shows while he rises or sinks
      const pk = Math.max(e < 1 ? Math.sin(Math.PI * Math.min(1, e * 1.1)) : 0, Math.sin(Math.PI * Math.min(1, s.sink)), s.sink > 0.99 ? 0.6 : 0);
      poolMat.uniforms.uK.value = pk;
      pool.visible = pk > 0.01;
      pool.scale.setScalar(0.4 + pk * 0.6);
      // ── crown, cloak, glow
      crown.rotation.y = Math.sin(t * 0.4) * 0.05;
      crown.scale.setScalar(1 + s.pulse * 0.04 * (1 + ign));
      u.uK2.value = ign * (0.85 + s.pulse * 0.15) + sm * 0.3;
      flameMat.uniforms.uGain.value = ign * (1 + sm);
      vMat.uniforms.uOpen.value = open * (1 + Math.sin(beat * Math.PI) * 0.04) + (fx >= 0 ? Math.sin(fx * Math.PI) * 0.15 : 0);
      u.uGlow.value.set(0.9 + sm + ign * 0.4 + (fx >= 0 ? Math.sin(fx * Math.PI) * 1.5 : 0), 0.8);
      // ── the galaxy: spins inside the opening and spills behind him
      const gk = smooth(0, 1, open);
      gx.visible = gk > 0.01 || (fx >= 0 && s.phase > 2);
      gx.scale.setScalar(0.4 + gk * 3.4 + (fx >= 0 ? Math.sin(fx * Math.PI) * 0.4 : 0));
      gx.rotation.set(-0.15, 0, -t * 0.25);
      if (gx.visible) {
        for (let i = 0; i < NGX; i++) {
          const g = gal[i];
          const a = g.a + t * (0.35 / (0.25 + g.r));
          const r = g.r;
          const tw = 0.6 + 0.4 * Math.sin(t * 3 + g.s * 30);
          const core = Math.exp(-r * 5);
          _c.copy(GC[g.hue < 0.45 ? 0 : g.hue < 0.7 ? 1 : g.hue < 0.88 ? 2 : 3]).multiplyScalar((0.5 + core * 2.5) * tw * (0.8 + s.pulse * 0.5));
          galaxy.set(i, Math.cos(a) * r, Math.sin(a) * r, g.y, 0.025 + g.s * 0.03 + core * 0.06, gk * u.uAppear.value, _c);
        }
        galaxy.commit();
      }
      // ── motes of the void drifting up around him
      for (let i = 0; i < NM; i++) {
        const m = mote[i];
        const h = (m.h + t * 0.05 * (0.5 + m.s)) % 1;
        const a = m.a + t * 0.1;
        _c.set(i % 4 ? '#c8b0ff' : '#ffffff').multiplyScalar(0.6 + s.pulse * 0.8 + ign * 0.3);
        motes.set(i, Math.cos(a) * m.r, h * 8.5 + king.position.y, Math.sin(a) * m.r, 0.06 + m.s * 0.07, Math.sin(h * Math.PI) * u.uAppear.value, _c);
      }
      motes.mat.uniforms.uClipY.value = u.uClipY.value;
      galaxy.mat.uniforms.uClipY.value = u.uClipY.value;
      motes.commit();
      // the entrance: rising out of the ground (clipped at the ground)
      if (e < 1) u.uClipY.value = Math.max(u.uClipY.value, (() => {
        root.getWorldPosition(tmp);
        return tmp.y - 0.02;
      })());
    },
    dispose() {
      for (const m of mats) m.dispose();
      galaxy.mat.dispose();
      galaxy.points.geometry.dispose();
      motes.mat.dispose();
      motes.points.geometry.dispose();
    },
  };
  return rig;
}
