/**
 * Gênio da Miragem (desert secret path): a colossal sand djinn rising out of a whirlwind. Its skin is
 * flowing sand with golden runes that light on the beat; ornate golden bangles, armlets, collar and a
 * circlet with a jewel; a veil over the mouth with the X embroidered on it; a smoky topknot; and
 * MIRAGE HANDS: translucent, shimmering like heat haze (wobbling vertices, iridescent edges, a hazy
 * double around each). It dances with its arms on the beat.
 *   phase 2: each hand fans out into mirage copies
 *   phase 3: the whirlwind becomes a sandstorm crown around its head, the funnel widens and darkens
 */
import * as THREE from 'three';
import { capsule, clamp01, cone, sph } from '../kit';
import { ell } from '../musicians';
import { type ActS, type Geo, GlowPoints, type LU, NOISE, P, type Rig, V, legendMat, legendUniforms, merge, rng, smooth, xStitch } from './common';

const _c = new THREE.Color();
const SKIN = new THREE.Color('#b0662f'), SKIN_D = new THREE.Color('#5a2e16'), SKIN_L = new THREE.Color('#e09a5c');
const GOLD = '#f4c04a';
const WAIST = 3.05;

/** the whirlwind's radius at height y */
const funnelR = (y: number) => 0.22 + 1.25 * Math.pow(clamp01(y / (WAIST + 0.5)), 1.6);

// ───────────────────────────── shaders ─────────────────────────────

function sandMat(u: LU, o: { spin: number; seed: number; alpha: number; storm?: boolean }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: u.uTime, uBeat: u.uBeat, uTell: u.uTell, uAppear: u.uAppear, uPhase: u.uPhase, uSpin: { value: o.spin }, uSeed: { value: o.seed }, uAlpha: { value: o.alpha }, uStorm: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uStorm; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 p = position;
        float h = p.y;
        p.x += sin(h * 1.7 - uTime * 2.3) * 0.12 * h * 0.3;
        p.z += cos(h * 1.3 - uTime * 1.9) * 0.1 * h * 0.3;
        vP = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uTell; uniform float uAppear; uniform float uPhase;
      uniform float uSpin; uniform float uSeed; uniform float uAlpha; uniform float uStorm;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        float a = atan(vP.z, vP.x);
        float h = vP.y;
        float tw = a + h * 1.4 - uTime * uSpin;
        vec3 q = vec3(cos(tw) * 1.6, sin(tw) * 1.6, h * 2.2 - uTime * 0.9 + uSeed);
        float b = lF(q);
        float streak = smoothstep(0.42, 0.75, b);
        float fine = lN(vec3(cos(tw) * 6.0, sin(tw) * 6.0, h * 9.0 - uTime * 2.0));
        float edge = pow(1.0 - abs(dot(normalize(vN), vV)), 1.4);
        vec3 dark = mix(vec3(0.42, 0.24, 0.1), vec3(0.22, 0.14, 0.12), uStorm);
        vec3 light = mix(vec3(0.93, 0.66, 0.34), vec3(0.85, 0.6, 0.36), uStorm);
        vec3 c = mix(dark, light, streak * 0.8 + fine * 0.25);
        // golden glints (lightning in the storm)
        float gl = smoothstep(0.86, 0.95, lN(vec3(cos(tw) * 9.0, sin(tw) * 9.0, h * 4.0 - uTime * 5.0)));
        c += vec3(1.0, 0.8, 0.4) * gl * (0.6 + uBeat * 1.5) * (0.5 + uStorm * 2.0);
        c = mix(c, vec3(1.0, 0.3, 0.15), uTell * 0.25 * streak);
        float A = (0.45 + streak * 0.5 + fine * 0.2) * uAlpha * (0.65 + edge * 0.55) * uAppear;
        gl_FragColor = vec4(c, clamp(A, 0.0, 1.0));
      }`,
  });
}

function hazeMat(u: LU, k: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uTime: u.uTime, uBeat: u.uBeat, uTell: u.uTell, uAppear: u.uAppear, uK: { value: k } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uK; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec3 p = position;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        p += normal * (0.04 + 0.035 * sin(wp.y * 9.0 - uTime * 9.0 + uK * 3.0));
        p.x += sin(wp.y * 7.0 + uTime * 6.0 + uK) * 0.035;
        vP = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uTell; uniform float uAppear; uniform float uK; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
        float band = 0.5 + 0.5 * sin(vP.y * 22.0 - uTime * 7.0 + uK * 2.0);
        vec3 iri = 0.5 + 0.5 * cos(6.2832 * (f * 0.8 + vP.y * 0.7 + vec3(0.0, 0.33, 0.67)) + uTime * 1.5);
        vec3 c = mix(vec3(0.55, 0.95, 1.0), iri, 0.55) * (f * 0.9 + band * 0.12) * (0.6 + uBeat * 0.5);
        c = mix(c, vec3(1.0, 0.25, 0.08) * (f + 0.3), uTell * 0.8);
        gl_FragColor = vec4(c * uAppear * (uK > 1.5 ? 0.7 : 0.2), 1.0);
      }`,
  });
}

// ───────────────────────────── shapes ─────────────────────────────

function torsoGeo(): Geo {
  const sk = (q: THREE.Vector3, n: THREE.Vector3) => _c.copy(SKIN_D).lerp(SKIN, smooth(-0.6, 0.5, n.y * 0.35 + n.z * 0.65)).lerp(SKIN_L, smooth(0.55, 1, n.z) * smooth(3.9, 5.0, q.y) * 0.45);
  const parts: Geo[] = [];
  parts.push(ell(0.8, 0.75, 0.6, 24, 16).translate(0, 2.85, 0));
  parts.push(ell(0.95, 0.85, 0.66, 24, 16).translate(0, 3.65, 0.02));
  parts.push(ell(1.32, 0.88, 0.78, 28, 18).translate(0, 4.65, 0));
  for (const sd of [-1, 1]) {
    parts.push(ell(0.62, 0.42, 0.34, 18, 12).rotateZ(sd * 0.25).translate(sd * 0.5, 4.78, 0.42));
    parts.push(ell(0.52, 0.55, 0.5, 18, 12).translate(sd * 1.28, 5.08, -0.02));
  }
  parts.push(ell(0.85, 0.42, 0.55, 20, 12).translate(0, 5.35, -0.08));
  parts.push(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 16).translate(0, 5.65, 0));
  return merge(parts.map((g) => P(g, sk)));
}

function headGeo(): { skin: Geo; gold: Geo; veil: Geo; eyes: Geo } {
  const skin: Geo[] = [], gold: Geo[] = [], eyes: Geo[] = [];
  const sk = (q: THREE.Vector3, n: THREE.Vector3) => _c.copy(SKIN_D).lerp(SKIN, smooth(-0.5, 0.5, n.y * 0.4 + n.z * 0.6));
  skin.push(P(ell(0.5, 0.62, 0.52, 28, 20).translate(0, 0.62, 0), sk));
  skin.push(P(ell(0.38, 0.3, 0.36, 18, 12).translate(0, 0.25, 0.12), sk));
  // brow and nose
  skin.push(P(ell(0.42, 0.1, 0.2, 18, 8).translate(0, 0.78, 0.36), sk));
  skin.push(P(cone(0.08, 0.34, 6).rotateX(0.35).translate(0, 0.6, 0.48), sk));
  // pointed ears
  for (const sd of [-1, 1]) skin.push(P(cone(0.11, 0.62, 6).scale(0.5, 1, 1).rotateZ(-sd * 1.05).rotateY(sd * 0.35).translate(sd * 0.64, 0.75, -0.02), sk));
  // eyes: glowing almonds without pupils
  for (const sd of [-1, 1]) eyes.push(P(ell(0.13, 0.05, 0.05, 14, 8).rotateZ(-sd * 0.22).translate(sd * 0.19, 0.67, 0.45), '#bff8ff', 2.6, 1));
  // circlet and forehead jewel
  gold.push(P(new THREE.TorusGeometry(0.52, 0.045, 8, 40).rotateX(Math.PI / 2 - 0.18).translate(0, 0.98, 0.02), GOLD));
  gold.push(P(new THREE.OctahedronGeometry(0.11, 0).scale(0.9, 1.3, 0.5).translate(0, 0.98, 0.53), '#56e0ff', 1.6, 1));
  gold.push(P(new THREE.TorusGeometry(0.13, 0.025, 6, 16).translate(0, 0.98, 0.5), GOLD));
  // the veil over the mouth: an indigo cloth hanging from ear to ear, the X embroidered on it in gold
  // a band of cloth hugging the lower face, with a pointed flap hanging below the chin
  const vg = new THREE.SphereGeometry(1, 28, 10, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.5, Math.PI * 0.32);
  vg.scale(0.55, 0.66, 0.56).translate(0, 0.62, 0.02);
  const vp = vg.attributes.position;
  for (let i = 0; i < vp.count; i++) {
    const x = vp.getX(i), y = vp.getY(i), z = vp.getZ(i);
    // below the jaw the cloth falls straight down into a point
    const k = smooth(0.35, 0.05, y);
    const sag = 0.28 * (1 - Math.min(1, Math.abs(x) / 0.5)) * k;
    vp.setXYZ(i, x, y - sag, Math.max(z, 0.38 * k + z * (1 - k)));
  }
  vg.computeVertexNormals();
  const veil = merge([
    P(vg, (q) => _c.set('#24185a').lerp(new THREE.Color('#5a3ca0'), smooth(0.0, 0.55, q.y))),
    P(new THREE.TorusGeometry(0.56, 0.022, 4, 30, 2.5).rotateX(Math.PI / 2).rotateY(-(Math.PI / 2 - 1.25)).scale(1, 1, 1.02).translate(0, 0.62, 0.02), GOLD, 0.4),
    xStitch(0.24, 0.024, '#ffd36b', 0.9, 1).translate(0, 0.36, 0.55),
  ]);
  return { skin: merge(skin), gold: merge(gold), veil, eyes: merge(eyes) };
}

function handGeo(): Geo {
  const parts: Geo[] = [];
  parts.push(ell(0.34, 0.42, 0.13, 16, 12).translate(0, -0.4, 0));
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.15;
    const len = 0.5 + (i === 1 || i === 2 ? 0.1 : 0);
    const f = capsule(0.062, len, 3, 8).translate(0, -len / 2, 0).rotateX(0.25 + i * 0.05).rotateZ((i - 1.5) * 0.1);
    parts.push(f.translate(x, -0.75, 0.02));
    parts.push(cone(0.05, 0.16, 6).rotateX(Math.PI).translate(x + (i - 1.5) * 0.06, -0.8 - len - 0.04, 0.16 + i * 0.01));
  }
  parts.push(capsule(0.07, 0.36, 3, 8).translate(0, -0.18, 0).rotateZ(0.9).translate(-0.3, -0.35, 0.06));
  return merge(parts.map((g) => P(g, '#ffffff')));
}

// ───────────────────────────── the djinn ─────────────────────────────

interface Arm {
  sd: number;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  ghosts: THREE.Mesh[];
}

interface Pose {
  lean: number;
  roll: number;
  yaw: number;
  shX: number;
  shZ: number;
  shY: number;
  elX: number;
  elZ: number;
  wrist: number;
  head: number;
}
const IDLE: Pose = { lean: 0.04, roll: 0, yaw: 0, shX: -0.2, shZ: 1.2, shY: 0, elX: -0.35, elZ: 1.25, wrist: -0.15, head: 0.08 };
const TELL: Pose = { lean: -0.3, roll: 0, yaw: 0, shX: 0.55, shZ: 1.5, shY: 0, elX: -0.7, elZ: 1.65, wrist: 0.45, head: -0.15 };
const BLOW: Pose = { lean: 0.4, roll: 0, yaw: 0, shX: -1.45, shZ: 0.28, shY: 0, elX: -0.05, elZ: 0.0, wrist: -1.2, head: 0.25 };
const RECOIL: Pose = { lean: -0.45, roll: 0.1, yaw: 0, shX: 0.8, shZ: 1.8, shY: 0, elX: -0.2, elZ: 0.6, wrist: 0.6, head: -0.4 };
const STAG: Pose = { lean: 0.22, roll: 0.25, yaw: 0, shX: 0.05, shZ: 0.45, shY: 0, elX: -0.35, elZ: 0.2, wrist: 0, head: 0.35 };
const SUMMON: Pose = { lean: -0.12, roll: 0, yaw: 0, shX: -0.1, shZ: 2.5, shY: 0, elX: -0.1, elZ: 0.35, wrist: -0.3, head: -0.25 };
const KEYS = ['lean', 'roll', 'yaw', 'shX', 'shZ', 'shY', 'elX', 'elZ', 'wrist', 'head'] as const;
const mixPose = (a: Pose, b: Pose, k: number) => {
  if (k <= 0) return;
  for (const key of KEYS) a[key] += (b[key] - a[key]) * k;
};

export function djinnRig(): Rig {
  const u = legendUniforms(new THREE.Color('#ffd9a0').multiplyScalar(0.32), '#ffd36b');
  const root = new THREE.Group();
  const lift = new THREE.Group(); // the whole djinn (entrance / sink)
  root.add(lift);
  root.scale.setScalar(1.15);
  const skinMat = legendMat(u, {
    rough: 0.85,
    key: 'djinn-skin',
    color: /* glsl */ `
      { // flowing sand: grains and streaks drifting upward
        float st = lF(vec3(vObj.x * 2.2, vObj.y * 0.9 - uTime * 0.35, vObj.z * 2.2));
        float gr = lH(floor(vObj * 60.0));
        diffuseColor.rgb *= 0.78 + 0.38 * st + 0.08 * gr;
      }`,
    emissive: /* glsl */ `
      { // golden runes: thin noise isolines that light on the beat
        float n = lN(vObj * vec3(1.6, 1.1, 1.6) + vec3(0.0, uBeatPos * 0.05, 0.0));
        float line = smoothstep(0.012, 0.0, abs(n - 0.5)) * smoothstep(0.45, 0.6, lN(vObj * 0.7 + 4.0)) * uK;
        totalEmissiveRadiance += mix(vec3(1.0, 0.68, 0.2), uTellCol, uTell) * line * (0.25 + 1.4 * uBeat);
      }`,
  });
  u.uK.value = 1;
  const goldMat = legendMat(u, { rough: 0.28, metal: 0.95, key: 'djinn-gold' });
  const veilMat = legendMat(u, {
    rough: 0.9,
    side: THREE.DoubleSide,
    key: 'djinn-veil',
    vert: /* glsl */ `
      { float k = smoothstep(0.55, 0.0, position.y);
        transformed.z += sin(position.x * 9.0 + uTime * 3.2) * 0.03 * k;
        transformed.y += sin(position.x * 6.0 - uTime * 2.4) * 0.02 * k; }`,
  });
  const handMat = legendMat(u, {
    rough: 0.7,
    metal: 0.0,
    transparent: true,
    opacity: 0.7,
    key: 'djinn-hand',
    vert: /* glsl */ `
      { vec4 wq = modelMatrix * vec4(position, 1.0);
        transformed.x += sin(wq.y * 6.0 + uTime * 7.0) * 0.03;
        transformed.z += sin(wq.y * 5.0 - uTime * 6.0) * 0.02; }`,
    color: /* glsl */ `
      { float band = 0.5 + 0.5 * sin(vWPosL.y * 3.0 - uTime * 6.0);
        diffuseColor.rgb = mix(vec3(1.0, 0.7, 0.36), vec3(0.85, 0.9, 1.0), band * 0.3);
        lBase = vec3(0.0); }`,
    emissive: /* glsl */ `
      { float f = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
        vec3 iri = 0.5 + 0.5 * cos(6.2832 * (f + vObj.y * 0.6 + vec3(0.0, 0.33, 0.67)) + uTime * 2.0);
        vec3 hot = mix(vec3(1.0, 0.7, 0.35) * 0.18 + mix(vec3(0.7, 0.95, 1.0), iri, 0.35) * f * 0.45, uTellCol * (0.5 + f * 1.4), uTell);
        totalEmissiveRadiance += hot * (0.8 + uBeat * 0.5); }`,
  });
  handMat.depthWrite = true;
  const eyeMat = legendMat(u, { key: 'djinn-eye' });
  const funnelMats = [sandMat(u, { spin: 2.4, seed: 0, alpha: 1.6 }), sandMat(u, { spin: 3.3, seed: 4, alpha: 0.8 }), sandMat(u, { spin: 1.6, seed: 9, alpha: 0.5 })];
  const haze = [hazeMat(u, 1), hazeMat(u, 2)];
  const mats: THREE.Material[] = [skinMat, goldMat, veilMat, handMat, eyeMat, ...funnelMats, ...haze];

  // ── the whirlwind
  const whirl = new THREE.Group();
  lift.add(whirl);
  const funnels: THREE.Mesh[] = [];
  [1.0, 1.12, 1.28].forEach((k, i) => {
    const pts: THREE.Vector2[] = [];
    for (let j = 0; j <= 24; j++) {
      const y = (j / 24) * (WAIST + 0.9);
      pts.push(new THREE.Vector2(funnelR(y) * k + i * 0.04, y));
    }
    const g = new THREE.LatheGeometry(pts, 40);
    const m = new THREE.Mesh(g, funnelMats[i]);
    m.renderOrder = 3 + i;
    whirl.add(m);
    funnels.push(m);
  });
  // a skirt of dust where the whirlwind scours the ground
  {
    const pts: THREE.Vector2[] = [];
    for (let j = 0; j <= 10; j++) {
      const q = j / 10;
      pts.push(new THREE.Vector2(0.3 + q * 2.4, 0.05 + Math.sin(q * Math.PI) * 0.55 * (1 - q * 0.4)));
    }
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), sandMat(u, { spin: 2.0, seed: 13, alpha: 0.7 }));
    mats.push(skirt.material as THREE.Material);
    skirt.renderOrder = 2;
    whirl.add(skirt);
    funnels.push(skirt);
  }
  // ── the body
  const torsoMesh = new THREE.Mesh(torsoGeo(), skinMat);
  torsoMesh.castShadow = true;
  torsoMesh.position.y = -WAIST;
  const chest = new THREE.Group();
  chest.position.y = WAIST;
  lift.add(chest);
  chest.add(torsoMesh);
  // gold: collar plates, a belt of coins
  {
    const gp: Geo[] = [];
    const col = new THREE.TorusGeometry(0.74, 0.16, 8, 40).scale(1, 1, 0.72).rotateX(Math.PI / 2).scale(1, 0.45, 1).translate(0, 5.5 - WAIST, 0.02);
    gp.push(P(col, GOLD));
    for (let i = 0; i < 9; i++) {
      const a = -0.95 + (i / 8) * 1.9;
      const pl = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12).rotateX(Math.PI / 2);
      pl.translate(Math.sin(a) * 0.9, 5.42 - WAIST - Math.cos(a * 1.2) * 0.12, Math.cos(a) * 0.66);
      gp.push(P(pl, GOLD, 0.15));
      gp.push(P(sph(0.045, 8, 6).translate(Math.sin(a) * 0.93, 5.42 - WAIST - Math.cos(a * 1.2) * 0.12, Math.cos(a) * 0.7), i % 2 ? '#56e0ff' : '#ff5a4a', 1.0, 1));
    }
    gp.push(P(new THREE.TorusGeometry(0.96, 0.07, 6, 36).scale(1, 1, 0.68).rotateX(Math.PI / 2).translate(0, 2.95 - WAIST, 0), GOLD));
    const m = new THREE.Mesh(merge(gp), goldMat);
    m.castShadow = true;
    chest.add(m);
  }
  // ── the head
  const head = new THREE.Group();
  head.position.y = 5.62 - WAIST;
  head.scale.setScalar(1.6);
  chest.add(head);
  const hg = headGeo();
  const headSkin = new THREE.Mesh(hg.skin, skinMat);
  headSkin.castShadow = true;
  head.add(headSkin, new THREE.Mesh(hg.gold, goldMat), new THREE.Mesh(hg.veil, veilMat), new THREE.Mesh(hg.eyes, eyeMat));
  // topknot: a plume of sand streaming up and back
  {
    const pts: THREE.Vector3[] = [V(0, 1.05, -0.2), V(0, 1.5, -0.45), V(0.1, 1.95, -0.85), V(-0.05, 2.25, -1.4), V(0.1, 2.4, -2.0)];
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.15, 10, false);
    const pp = tg.attributes.position;
    // taper toward the tip (the tube's u runs along its length)
    const uv = tg.attributes.uv;
    for (let i = 0; i < pp.count; i++) {
      const t = uv.getX(i);
      const c = new THREE.CatmullRomCurve3(pts).getPointAt(t);
      const k = 1 - t * 0.85;
      pp.setXYZ(i, c.x + (pp.getX(i) - c.x) * k, c.y + (pp.getY(i) - c.y) * k, c.z + (pp.getZ(i) - c.z) * k);
    }
    const plume = new THREE.Mesh(tg, sandMat(u, { spin: 2.0, seed: 2, alpha: 1.0 }));
    mats.push(plume.material as THREE.Material);
    head.add(plume);
    head.add(new THREE.Mesh(merge([P(new THREE.TorusGeometry(0.2, 0.06, 6, 16).rotateX(Math.PI / 2).translate(0, 1.08, -0.2), GOLD)]), goldMat));
  }
  // ── the arms
  const hand = handGeo();
  const arms: Arm[] = [];
  for (const sd of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sd * 1.42, 5.18 - WAIST, -0.02);
    chest.add(shoulder);
    const up = new THREE.Mesh(P(merge([P(capsule(0.34, 1.25, 4, 12).translate(0, -0.7, 0), '#fff'), P(sph(0.46, 16, 12).scale(1, 0.85, 0.9), '#fff')]), (q, n) => _c.copy(SKIN_D).lerp(SKIN, smooth(-0.6, 0.6, n.y * 0.3 + n.z * 0.7))), skinMat);
    up.castShadow = true;
    shoulder.add(up);
    shoulder.add(new THREE.Mesh(merge([P(new THREE.TorusGeometry(0.37, 0.07, 6, 24).rotateX(Math.PI / 2).translate(0, -0.55, 0), GOLD), P(new THREE.TorusGeometry(0.36, 0.045, 6, 24).rotateX(Math.PI / 2).translate(0, -0.72, 0), GOLD), P(new THREE.OctahedronGeometry(0.08, 0).translate(0, -0.63, 0.38), '#56e0ff', 1.2, 1)]), goldMat));
    const elbow = new THREE.Group();
    elbow.position.y = -1.45;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(P(capsule(0.29, 1.15, 4, 12).translate(0, -0.62, 0), (q, n) => _c.copy(SKIN_D).lerp(SKIN, smooth(-0.6, 0.6, n.y * 0.3 + n.z * 0.7))), skinMat);
    fore.castShadow = true;
    elbow.add(fore);
    // the bangles: a stack of thick golden rings, studded
    const bg: Geo[] = [];
    for (let k = 0; k < 4; k++) bg.push(P(new THREE.TorusGeometry(0.3 + k * 0.012, 0.055 - (k % 2) * 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, -0.95 - k * 0.12, 0), GOLD, 0.05, k % 2 ? 0 : 0.7));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      bg.push(P(sph(0.04, 8, 6).translate(Math.cos(a) * 0.35, -1.01, Math.sin(a) * 0.35), k % 2 ? '#ff5a4a' : '#56e0ff', 1.2, 1));
    }
    elbow.add(new THREE.Mesh(merge(bg), goldMat));
    const wrist = new THREE.Group();
    wrist.position.y = -1.35;
    elbow.add(wrist);
    const hg2 = hand.clone();
    if (sd < 0) hg2.scale(-1, 1, 1);
    const hm = new THREE.Mesh(hg2, handMat);
    hm.scale.setScalar(1.75);
    hm.renderOrder = 9;
    wrist.add(hm);
    const hz = new THREE.Mesh(hg2, haze[0]);
    hz.scale.setScalar(1.84);
    hz.renderOrder = 10;
    wrist.add(hz);
    // mirage copies (phase 2): fanned out around the wrist
    const ghosts: THREE.Mesh[] = [];
    for (let k = 0; k < 2; k++) {
      const gm = new THREE.Mesh(hg2, haze[1]);
      gm.scale.setScalar(1.35);
      gm.visible = false;
      gm.renderOrder = 10;
      wrist.add(gm);
      ghosts.push(gm);
    }
    arms.push({ sd, shoulder, elbow, wrist, ghosts });
  }
  // ── the sandstorm crown (phase 3)
  const crown = new THREE.Group();
  crown.position.y = 6.9 - WAIST;
  chest.add(crown);
  const crownMat = sandMat(u, { spin: 3.0, seed: 6, alpha: 1.0 });
  crownMat.uniforms.uStorm.value = 1;
  mats.push(crownMat);
  {
    const pts: THREE.Vector2[] = [];
    for (let j = 0; j <= 20; j++) {
      const y = (j / 20) * 3.2;
      pts.push(new THREE.Vector2(0.5 + 2.4 * Math.pow(y / 3.2, 1.5), y - 1.2));
    }
    const vortex = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), crownMat);
    vortex.renderOrder = 11;
    crown.add(vortex);
  }
  for (let k = 0; k < 2; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2 + k * 0.6, 0.36 - k * 0.1, 10, 48).rotateX(Math.PI / 2), crownMat);
    ring.position.y = 1.6 + k * 0.4;
    ring.rotation.z = k ? 0.2 : -0.1;
    ring.renderOrder = 12;
    crown.add(ring);
  }
  crown.visible = false;
  // ── sand grains
  const NG = 200;
  const gp = new GlowPoints(NG, { soft: 1.4 });
  lift.add(gp.points);
  const rnd = rng(23);
  const grains = Array.from({ length: NG }, () => ({ a: rnd() * 6.28, h: rnd(), s: 0.6 + rnd() * 0.9, r: 0.95 + rnd() * 0.5, z: rnd() }));
  const GC = new THREE.Color('#ffcf7a'), GC2 = new THREE.Color('#fff1c8');

  const strikeAt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const pose: Pose = { ...IDLE };
  let phase = 1;

  const rig: Rig = {
    root,
    u,
    height: 7.6 * 1.15,
    strikeAt,
    enterDur: 4.0,
    phaseDur: 2.2,
    setPhase(n) {
      phase = n;
    },
    update(s: ActS) {
      const { t, beat } = s;
      const storm = clamp01(s.phase - 2);
      const mir = clamp01(s.phase - 1);
      // ── pose: a dance of the arms on the beat, then the acts on top
      Object.assign(pose, IDLE);
      const sw = Math.sin(beat * Math.PI); // one sway per two beats
      pose.roll = sw * 0.07;
      pose.yaw = Math.sin(beat * Math.PI * 0.5) * 0.12;
      const w = s.windup * s.telling;
      mixPose(pose, TELL, w);
      mixPose(pose, BLOW, s.strike);
      mixPose(pose, RECOIL, s.recoil);
      mixPose(pose, STAG, s.stagger);
      mixPose(pose, SUMMON, s.summon);
      const shake = (Math.sin(t * 41) * 0.03 + Math.sin(t * 29) * 0.02) * (s.recoil + s.tellBeat * w);
      chest.rotation.set(pose.lean + shake, pose.yaw, pose.roll + Math.sin(s.staggerAge * 4) * 0.12 * s.stagger);
      head.rotation.set(pose.head - sw * 0.0, -pose.yaw * 0.6, -pose.roll * 1.4);
      const calm = 1 - Math.max(w, s.strike, s.recoil, s.stagger, s.summon);
      arms.forEach((a, i) => {
        const ph = beat * Math.PI + i * Math.PI; // the arms answer each other
        const dance = Math.sin(ph) * calm;
        a.shoulder.rotation.set(pose.shX + dance * 0.12, a.sd * pose.shY, a.sd * (pose.shZ + dance * 0.12), 'XYZ');
        a.elbow.rotation.set(pose.elX + Math.sin(ph + 0.8) * 0.15 * calm, 0, a.sd * (pose.elZ + Math.sin(ph + 0.8) * 0.28 * calm), 'ZXY');
        a.wrist.rotation.set(pose.wrist + Math.sin(ph + 1.6) * 0.3 * calm, 0, a.sd * Math.sin(ph) * 0.2 * calm);
        // mirage copies fan out (phase 2+), opening and closing on the beat
        a.ghosts.forEach((g, k) => {
          const on = smooth(0, 1, mir * 1.4 - k * 0.3);
          g.visible = on > 0.01;
          const fan = (k ? -1 : 1) * a.sd * (0.55 + 0.15 * s.pulse + 0.35 * s.strike) * on;
          g.rotation.set(0.15 * on, 0, fan);
          g.position.set(Math.sin(fan) * 0.3, 0, -0.15 * on);
          g.scale.setScalar(1.75 * (0.6 + 0.4 * on));
        });
      });
      // the strike point: between the hands
      arms[0].wrist.getWorldPosition(strikeAt);
      arms[1].wrist.getWorldPosition(tmp);
      strikeAt.add(tmp).multiplyScalar(0.5);
      root.parent?.worldToLocal(strikeAt);
      // ── whirlwind
      const e = s.enter;
      const spin = 1 + w * 2 + s.summon * 1.5 + storm * 0.8;
      funnels.forEach((f, i) => {
        f.rotation.y -= s.dt * (1.6 + i * 0.7) * spin;
        f.scale.set(1 + storm * 0.35 + s.pulse * 0.03, smooth(0, 0.5, e), 1 + storm * 0.35 + s.pulse * 0.03);
      });
      funnelMats.forEach((m) => (m.uniforms.uStorm.value = storm));
      // ── entrance: the whirlwind rises first, then the body comes up out of it
      const rise = smooth(0.2, 0.85, e);
      chest.position.y = WAIST - (1 - rise) * 6.5 + Math.sin(beat * Math.PI) * 0.06 - s.stagger * 0.4;
      lift.position.y = -s.sink * 7.5;
      const fx = s.phaseFx;
      lift.rotation.y = fx >= 0 ? smooth(0, 1, fx) * Math.PI * 2 : 0;
      // ── sandstorm crown
      crown.visible = storm > 0.01;
      crown.scale.setScalar(0.3 + 0.7 * smooth(0, 1, storm));
      crown.rotation.y -= s.dt * (2.2 + s.pulse);
      crown.children.forEach((c, i) => (c.rotation.y += s.dt * (i ? 1.3 : -0.8)));
      // ── glow
      u.uGlow.value.set(0.9 + s.summon + (fx >= 0 ? Math.sin(fx * Math.PI) * 1.5 : 0), 0.8);
      u.uK.value = 1 - s.stagger * 0.7;
      // ── sand grains spiral up the whirlwind (and around the crown in the storm)
      for (let i = 0; i < NG; i++) {
        const g = grains[i];
        const crownG = storm > 0.01 && i % 3 === 0;
        let x: number, y: number, z: number;
        if (crownG) {
          const a = g.a - t * (2.5 + g.s);
          const r = (2.0 + g.r * 1.4) * (0.4 + 0.6 * storm);
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          y = chest.position.y + 6.9 - WAIST + 1.2 + Math.sin(a * 3 + t) * 0.6 * g.z;
        } else {
          const h = (g.h + t * 0.12 * g.s) % 1;
          const yy = h * (WAIST + 1.2);
          const a = g.a - t * (2 + g.s * 2) * spin * 0.6 - yy * 1.5;
          const r = funnelR(yy) * g.r * (1 + storm * 0.4) + (1 - e) * 3 * g.z;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          y = yy * smooth(0, 0.5, e);
        }
        _c.copy(g.z > 0.8 ? GC2 : GC).multiplyScalar((crownG ? 0.8 : 0.32) + s.pulse * 0.35 + storm * 0.3);
        gp.set(i, x, y, z, 0.07 + g.z * 0.09, 0.8 * u.uAppear.value, _c);
      }
      gp.mat.uniforms.uClipY.value = u.uClipY.value;
      gp.commit();
      void phase;
    },
    dispose() {
      for (const m of mats) m.dispose();
      gp.mat.dispose();
      gp.points.geometry.dispose();
    },
  };
  return rig;
}
