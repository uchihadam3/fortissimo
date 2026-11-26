/**
 * The mini-bosses (docs/DESIGN-v5.md §2): every one is a GREAT stolen sound of its land, sewn shut with
 * an X, bigger and more ornate than the creatures around it, and carrying the instrument it stole.
 *
 *   meadow  toad (Sapo-Borrão: a lily-pad hat with a golden bell-flower, a croaking throat sac) ·
 *           drumBeetle (Besouro-Bumbo: a bass drum and two toms on its back, drumstick antennae) ·
 *           crow (Corvo-Cinza: ragged wings, a stolen silver flute in its talons)
 *   dunes   sandworm (Verme-das-Dunas: its head is the bell of a great brass horn, a face inside) ·
 *           croc (Crocodilo-Miragem: a marimba on its back, a shimmering mirage double) ·
 *           sphinx (Esfinge Muda: nemes, a golden lyre on its back, a halo of riddle glyphs)
 *   peaks   yeti (Yeti-Eco: shaggy, ice horns, a pair of ice cymbals) · siren (Sereia de Gelo:
 *           icicle hair, a glass lyre) · stag (Cervo-Espelho: mirror antlers hung with chimes)
 *   forge   salamander (a pan-pipe crest that breathes fire) · magmaCrab (a steel drum for a shell,
 *           one giant claw) · smith (Ferreiro Sombrio: a giant hammer, an anvil-bell on its back)
 *   citadel gargoyle (stone ↔ alive, a bronze bell on a chain) · organist (Organista Fantasma: a fan
 *           of organ pipes, a floating console) · twin (Cavaleiros Gêmeos: tuning-fork swords; the
 *           sun twin and the moon twin, mirrored)
 *
 * Geometry is built once per kind (into the shared templates of enemies.ts); `animateMini` turns the
 * boss channels (wind-up, strike, recoil… see BossCh) into each creature's own gestures.
 * Parts named `ph1…`/`ph2…` appear from that phase on; parts named `pre1…` fall away at phase 1.
 */
import * as THREE from 'three';
import type { EnemyKind } from '../sim/defs';
import { at, box, capsule, cone, cyl, scl, sph, torus } from './kit';
import { Bins, ell, glowBy, grp, merge, paint, place, smooth, type CharMats, type Painter } from './musicians';
import { V, _c, alongY, ellAt, eyes2, facet, fan, lathe, stitchX, taperTube, xGlyph, drips, type BossCh, type Col, type Geo, type Tpl } from './creatureKit';

export const MINI_KINDS: EnemyKind[] = ['toad', 'drumBeetle', 'crow', 'sandworm', 'croc', 'sphinx', 'yeti', 'siren', 'stag', 'salamander', 'magmaCrab', 'smith', 'gargoyle', 'organist', 'twin'];

const GOLD = '#f2c84e';
const GOLD_D = '#a8721c';
const VIO = '#b48cff';
const Z = V(0, 0, 1);

const hash = (x: number, y: number, z: number) => {
  const v = Math.sin(x * 91.7 + y * 47.3 + z * 63.1) * 43758.5;
  return v - Math.floor(v);
};

/** a bell (mouth down), its crown at y = 0, about 1 × s tall */
function bellGeo(s: number, col: Col = GOLD, dark: Col = GOLD_D): Geo {
  const prof = [[0, 0], [0.17, -0.01], [0.27, -0.08], [0.31, -0.25], [0.34, -0.48], [0.42, -0.72], [0.55, -0.88], [0.58, -0.95], [0.5, -0.94], [0.36, -0.82]].map(([r, y]) => [r * s, y * s]);
  const A = new THREE.Color(col), B = new THREE.Color(dark);
  const g = paint(lathe(prof, 22), (p) => _c.copy(B).lerp(A, smooth(-0.95 * s, -0.1 * s, p.y) * 0.8 + 0.2));
  const lip = paint(at(torus(0.56 * s, 0.035 * s, 5, 22).rotateX(Math.PI / 2), 0, -0.93 * s, 0), col);
  const clap = paint(at(sph(0.11 * s, 8, 6), 0, -0.86 * s, 0), dark);
  const loop = paint(at(torus(0.09 * s, 0.03 * s, 5, 10), 0, 0.06 * s, 0), dark);
  return merge([g, lip, clap, loop]);
}

/** a drum along +y (skins up and down) */
function drumGeo(r: number, h: number, shell: Col, rim: Col = GOLD, skin: Col = '#f1e6cf', lugs = 8): Geo {
  const S = new THREE.Color(shell), K = new THREE.Color(skin);
  const parts: Geo[] = [paint(new THREE.CylinderGeometry(r, r, h, 26, 1), (p, n) => (Math.abs(n.y) > 0.9 ? _c.copy(K) : _c.copy(S).multiplyScalar(0.85 + 0.3 * smooth(-h / 2, h / 2, p.y))))];
  for (const sy of [-1, 1]) parts.push(paint(at(torus(r + 0.004, r * 0.08, 5, 26).rotateX(Math.PI / 2), 0, (sy * h) / 2, 0), rim));
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    parts.push(paint(at(box(r * 0.09, h * 0.62, r * 0.09), Math.cos(a) * r * 1.02, 0, Math.sin(a) * r * 1.02), rim));
  }
  return merge(parts);
}

/** a small fluffy tuft facing n */
const tuft = (p: THREE.Vector3, n: THREE.Vector3, s: number, col: Col | Painter) => place(paint(ell(s * 0.7, s, s * 0.45, 8, 6).translate(0, -s * 0.35, s * 0.2), col), p, n);

const _blue = new THREE.Color('#7f9cc8');
/** shaggy fur: rows of locks hanging down around a lathe profile (y0 … y1) */
function shag(b: Bins, part: string, prof: number[][], y0: number, y1: number, rows: number, per: number, len: number, col: Painter, o: { cx?: number; cz?: number; arc?: [number, number] } = {}) {
  const r = (y: number) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, a0] = prof[i], [r1, a1] = prof[i + 1];
      if (y >= a0 && y <= a1) return r0 + ((r1 - r0) * (y - a0)) / (a1 - a0 || 1);
    }
    return prof[prof.length - 1][0];
  };
  const [a0, a1] = o.arc ?? [0, Math.PI * 2];
  for (let k = 0; k < rows; k++) {
    const y = y1 - ((y1 - y0) * k) / Math.max(1, rows - 1);
    const n = Math.max(3, Math.round(per * (r(y) / 0.5)));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * (i + (k % 2) * 0.5)) / n;
      const l = len * (0.8 + hash(k, i, 1) * 0.45);
      const w = 0.07 + hash(k, i, 3) * 0.03;
      const lock = paint(lathe([[0, 0.01], [w * 0.8, -0.02], [w, -l * 0.3], [w * 0.55, -l * 0.72], [0, -l]], 6).scale(1, 1, 0.5), (q) => _c.copy(col(V(0, y, 0), V(0, 1, 0))).lerp(_blue, smooth(-l * 0.2, -l, q.y) * 0.45));
      b.add(part, 'm', lock.rotateZ((hash(i, k, 4) - 0.5) * 0.5).rotateX(-0.18 - hash(i, k, 2) * 0.2).rotateY(a).translate(Math.sin(a) * r(y) * 0.95 + (o.cx ?? 0), y, Math.cos(a) * r(y) * 0.95 + (o.cz ?? 0)));
    }
  }
}

type Joint = (name: string, parent: THREE.Object3D, p?: THREE.Vector3, pp?: THREE.Vector3, shadow?: boolean) => THREE.Group;

/** build the template of a mini-boss into `t` (false if `kind` is not one) */
export function buildMini(kind: EnemyKind, b: Bins, t: Tpl, body: THREE.Group, variant = 0): boolean {
  // a joint: its geometry is built in body coordinates; it turns about `p` (pp: its parent's pivot)
  const J: Joint = (name, parent, p = V(0, 0, 0), pp = V(0, 0, 0), shadow = true) => {
    const g = b.into(name, grp(name, p.x - pp.x, p.y - pp.y, p.z - pp.z), p, shadow);
    parent.add(g);
    return g;
  };
  switch (kind) {
    case 'toad': toad(b, t, body, J); break;
    case 'drumBeetle': drumBeetle(b, t, body, J); break;
    case 'crow': crow(b, t, body, J); break;
    case 'sandworm': sandworm(b, t, body, J); break;
    case 'croc': croc(b, t, body, J); break;
    case 'sphinx': sphinx(b, t, body, J); break;
    case 'yeti': yeti(b, t, body, J); break;
    case 'siren': siren(b, t, body, J); break;
    case 'stag': stag(b, t, body, J); break;
    case 'salamander': salamander(b, t, body, J); break;
    case 'magmaCrab': magmaCrab(b, t, body, J); break;
    case 'smith': smith(b, t, body, J); break;
    case 'gargoyle': gargoyle(b, t, body, J); break;
    case 'organist': organist(b, t, body, J); break;
    case 'twin': twin(b, t, body, J, variant); break;
    default: return false;
  }
  return true;
}

// ───────────────────────────── meadow ─────────────────────────────

function toad(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const top = new THREE.Color('#5a48a0'), bot = new THREE.Color('#130e26'), belly = new THREE.Color('#9282d8');
  const inkP: Painter = (p, n) => _c.copy(bot).lerp(top, smooth(0.05, 1.0, p.y)).lerp(belly, smooth(0.25, 0.95, n.z) * smooth(0.62, 0.2, p.y) * 0.75);
  const C = V(0, 0.5, 0), R = V(0.68, 0.47, 0.6);
  const H = V(0, 0.7, 0.26), HR = V(0.52, 0.34, 0.42);
  b.add('b', 'g', paint(at(ell(R.x, R.y, R.z, 32, 20), C.x, C.y, C.z), inkP));
  b.add('b', 'g', paint(at(ell(HR.x, HR.y, HR.z, 28, 18), H.x, H.y, H.z), inkP));
  // bulging eyes on top, heavy grumpy lids
  for (const sd of [-1, 1]) b.add('b', 'g', paint(at(sph(0.17, 16, 12), sd * 0.27, 0.93, 0.36), inkP));
  eyes2(b, 'b', 'g', 0.27, 0.95, 0.47, 0.125, { lid: '#4a3a8c', lidK: 0.46, small: 0.5, white: '#fbf6e4' });
  // the wide mouth: a long seam sewn with three Xs, ink drooling at the corners
  const seam: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = -0.44 + (i / 12) * 0.88;
    const y = 0.5 - Math.abs(x) * 0.12 + (x * x) * 0.2;
    seam.push(ellAt(H, HR, x, y - H.y, 0.42).p.add(V(0, 0, 0.004)));
  }
  b.add('b', 'g', paint(taperTube(new THREE.CatmullRomCurve3(seam), 24, 0.02, 0.02, 5), '#1b1030'));
  for (const [x, s] of [[0, 0.1], [-0.24, 0.075], [0.24, 0.075]] as [number, number][]) {
    const q = ellAt(H, HR, x, 0.5 - Math.abs(x) * 0.12 - H.y + x * x * 0.2, 0.42);
    stitchX(b, 'b', 'g', q.p.x, q.p.y, q.p.z + 0.01, s, { n: q.n });
  }
  drips(b, 'b', 'g', [[0.43, 0.5, 0.48, 0.14], [-0.44, 0.52, 0.47, 0.18], [0.6, 0.62, 0.2, 0.2], [-0.55, 0.75, -0.2, 0.22]], '#1a1233');
  // warts that glow brighter as it grows angry (phase)
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39, y = 0.2 + (i % 7) * 0.1;
    const q = ellAt(C, R, Math.cos(a), y - 0.4, Math.sin(a) - 0.25);
    if (q.p.z > 0.35 && q.p.y < 0.75) continue;
    b.add('warts', 'f', place(paint(scl(sph(0.035 + (i % 3) * 0.012, 8, 6), 1, 1, 0.55), '#b9a6ff', 0.35), q.p, q.n));
  }
  // front arms and big folded hind legs with webbed feet
  for (const sd of [-1, 1]) {
    b.add('b', 'g', paint(at(capsule(0.085, 0.2, 3, 8).rotateZ(sd * 0.35).rotateX(0.2), sd * 0.36, 0.17, 0.44), inkP));
    for (const a of [-0.5, 0, 0.5]) b.add('b', 'g', paint(at(ell(0.035, 0.022, 0.09), sd * 0.38 + Math.sin(a) * 0.08, 0.02, 0.52 + Math.cos(a) * 0.06), '#2a2050'));
    b.add('b', 'g', paint(at(ell(0.26, 0.24, 0.4, 18, 12).rotateY(sd * 0.3), sd * 0.56, 0.26, -0.12), inkP));
    const foot = fan([[0, 0.05], [0.06, 0.24], [0.14, 0.2], [0.16, 0.3], [0.24, 0.18], [0.3, 0.24], [0.28, 0.06], [0.1, -0.04]], (tt) => _c.set('#2a2050').lerp(new THREE.Color('#5a48a0'), tt * 0.5), undefined, 3);
    if (sd < 0) foot.scale(-1, 1, 1);
    b.add('b', 'd', foot.translate(sd * 0.55, 0.015, 0.1));
  }
  // the throat sac: a soft balloon that croaks (inflates on the beat, glows in phase 1)
  b.add('sac', 'f', paint(at(scl(sph(0.21, 18, 12), 1.25, 0.8, 0.85), 0, 0.31, 0.52), (p, n) => _c.set('#c2b3f6').lerp(new THREE.Color('#ffffff'), smooth(0.2, 0.9, n.z) * 0.35), 0.12));
  // the sticky tongue (only out for the blow)
  b.add('tongue', 'g', paint(at(capsule(0.05, 0.5, 3, 8).rotateX(Math.PI / 2), 0, 0, 0.3), '#e86a9a'), paint(at(sph(0.1, 10, 8), 0, 0, 0.58), '#f08ab4', 0.2));
  // a lily-pad hat with a golden bell-flower: the stolen sound of the meadow's morning
  const pad = fan(Array.from({ length: 19 }, (_, i) => {
    const a = 0.35 + (i / 18) * (Math.PI * 2 - 0.7);
    return [Math.cos(a) * 0.36, Math.sin(a) * 0.36] as [number, number];
  }), (tt, x, z) => _c.set('#3f8a3e').lerp(new THREE.Color('#9fd86a'), tt * 0.6).multiplyScalar(Math.abs(Math.sin(Math.atan2(z, x) * 6)) < 0.12 ? 0.75 : 1), undefined, 4);
  pad.scale(1.3, 1, 1.3).rotateX(0.3).rotateZ(0.12);
  b.add('hat', 'd', pad.translate(0, 1.15, -0.02));
  b.add('hat', 'm', paint(at(cyl(0.05, 0.08, 0.1, 8), 0, 1.11, -0.02), '#3f7a32'));
  const stem = new THREE.CatmullRomCurve3([V(0.05, 1.16, -0.04), V(0.1, 1.38, -0.04), V(0.04, 1.55, 0.08), V(-0.08, 1.52, 0.22)]);
  b.add('hat', 'g', paint(taperTube(stem, 12, 0.022, 0.012, 5), '#3f7a32'));
  b.add('hat', 'x', paint(bellGeo(0.26), (p) => _c.set(GOLD).lerp(new THREE.Color('#fff0b0'), smooth(-0.24, 0, p.y) * 0.4)).rotateX(0.5).translate(-0.1, 1.5, 0.26));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add('hat', 'g', paint(at(ell(0.06, 0.018, 0.11).rotateY(-a), Math.cos(a) * 0.07 - 0.1, 1.52, Math.sin(a) * 0.07 + 0.26), '#9fd86a'));
  }
  // phase 1: ink tendrils curl up from its back, tipped with violet light
  for (const sd of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([V(sd * 0.25, 0.85, -0.35), V(sd * 0.45, 1.15, -0.5), V(sd * 0.62, 1.32, -0.35), V(sd * 0.58, 1.25, -0.2)]);
    b.add('ph1', 'g', paint(taperTube(c, 18, 0.07, 0.015, 6), '#2a2050'));
    b.add('ph1', 'f', paint(at(sph(0.05, 8, 6), sd * 0.58, 1.25, -0.2), VIO, 1.6));
  }
  xGlyph(b, 'ph1', V(0, 0.92, -0.48), V(0, 0.4, -1), 0.22, VIO, 1.6);
  J('b', body);
  J('warts', body, V(0, 0, 0), V(0, 0, 0), false);
  J('sac', body, V(0, 0.31, 0.52));
  body.add(b.into('tongue', grp('tongue', 0, 0.44, 0.58), undefined, false));
  J('hat', body, V(0, 1.07, 0.05));
  J('ph1', body);
  t.height = 1.45;
  t.hop = 0.18;
  t.hops = 1;
  t.rim = '#c8b4ff';
  t.rimK = 0.55;
  t.front = 0.65;
}

function drumBeetle(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const ink = '#1a1428';
  b.add('b', 'g', paint(at(ell(0.6, 0.3, 0.74, 24, 14), 0, 0.4, 0), ink));
  // the stolen drum kit on its back: a great bass drum lying across, two toms, a cymbal
  // (its front skin faces the colossus like a band's kick drum, painted with the Silence's X)
  const kick = drumGeo(0.4, 0.46, '#b8382e', GOLD, '#f1e6cf', 10).rotateX(Math.PI / 2);
  b.add('drum', 'x', kick.translate(0, 0.95, -0.14));
  b.add('drum', 'f', paint(torus(0.3, 0.02, 4, 32).translate(0, 0.95, 0.095), VIO, 0.9));
  xGlyph(b, 'drum', V(0, 0.95, 0.096), Z, 0.42, VIO, 1.1);
  for (const sx of [-1, 1]) {
    const tom = drumGeo(0.16, 0.17, '#9a2c26', GOLD, '#f6ecd8', 6).rotateX(0.45).rotateZ(-sx * 0.35);
    b.add('drum', 'x', tom.translate(sx * 0.34, 1.36, 0.0));
    b.add('drum', 'x', paint(at(cyl(0.012, 0.012, 0.3, 5), sx * 0.3, 1.2, -0.08), '#8a8f9c'));
  }
  b.add('drum', 'x', paint(at(cyl(0.014, 0.014, 0.6, 5), 0, 1.25, -0.46), '#8a8f9c'));
  const cym = paint(lathe([[0, 0.03], [0.05, 0.03], [0.07, 0.015], [0.3, -0.01], [0.32, -0.02]], 22), (p) => _c.set('#e9c45a').multiplyScalar(0.85 + 0.25 * Math.abs(Math.sin(Math.hypot(p.x, p.z) * 60))));
  b.add('cym', 'x', cym.rotateX(-0.35).translate(0, 1.57, -0.5));
  // elytra flung open at the sides like a cape
  for (const sd of [-1, 1]) {
    const el = new THREE.SphereGeometry(1, 22, 12, sd < 0 ? Math.PI : 0, Math.PI, 0, Math.PI * 0.55);
    el.scale(0.42, 0.34, 0.72);
    b.add(sd < 0 ? 'elyL' : 'elyR', 'g', paint(el.translate(sd * 0.1, 0.5, -0.05), (q) => {
      const v = Math.abs(Math.sin(q.z * 9));
      return _c.set('#2a1f4a').lerp(new THREE.Color('#6a4ab8'), smooth(0.55, 0.85, q.y) * 0.6 + (v < 0.12 ? 0.3 : 0));
    }));
    b.add(sd < 0 ? 'elyL' : 'elyR', 'x', paint(taperTube(new THREE.CatmullRomCurve3([V(sd * 0.1, 0.84, 0.62), V(sd * 0.42, 0.62, 0.3), V(sd * 0.52, 0.5, -0.1), V(sd * 0.44, 0.42, -0.6)]), 16, 0.022, 0.016, 5), GOLD));
  }
  // head, fierce eyes, the X; drumstick antennae with felt mallets
  b.add('b', 'g', paint(at(sph(0.27, 20, 14), 0, 0.42, 0.68), '#221a33'));
  b.add('b', 'g', paint(at(ell(0.3, 0.1, 0.2), 0, 0.6, 0.62), '#2e2448'));
  eyes2(b, 'b', 'g', 0.115, 0.5, 0.88, 0.085, { brow: 0.42, small: 0.5 });
  stitchX(b, 'b', 'g', 0, 0.33, 0.925, 0.065, { pitch: -0.25 });
  for (const sd of [-1, 1]) {
    b.add('b', 'g', paint(at(cone(0.05, 0.2, 6).rotateX(Math.PI / 2 + 0.3).rotateY(-sd * 0.5), sd * 0.13, 0.27, 0.9), '#100c18'));
    const st = new THREE.CatmullRomCurve3([V(sd * 0.08, 0.6, 0.78), V(sd * 0.3, 0.98, 0.78), V(sd * 0.42, 1.36, 0.5), V(sd * 0.38, 1.56, 0.2)]);
    b.add('sticks', 'g', paint(taperTube(st, 18, 0.028, 0.02, 6), '#e8c896'));
    b.add('sticks', 'm', paint(at(sph(0.075, 12, 8), sd * 0.38, 1.58, 0.18), '#d24a6a'));
  }
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = 0.42 - i * 0.38;
    const leg = new THREE.CatmullRomCurve3([V(sd * 0.42, 0.28, z), V(sd * 0.58, 0.34, z - 0.02), V(sd * 0.64, 0.14, z - 0.04), V(sd * 0.7, 0.02, z + 0.06)]);
    b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(taperTube(leg, 12, 0.09, 0.05, 7), '#120e1c'));
    b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(at(ell(0.06, 0.03, 0.1), sd * 0.71, 0.02, z + 0.1), '#2a2040'));
  }
  // phase 1: glassy violet wings unfold from under the shell; the skins crack with light
  for (const sd of [-1, 1]) {
    const w = fan([[0, 0.05], [0.3, 0.12], [0.75, 0.05], [1.0, -0.12], [0.95, -0.3], [0.6, -0.42], [0.25, -0.3], [0.05, -0.1]], (tt) => _c.set('#7a5ad8').lerp(new THREE.Color('#e8dcff'), tt * 0.7), (tt) => 0.25 + tt * 0.5, 5);
    if (sd < 0) w.scale(-1, 1, 1);
    w.rotateZ(sd * 0.55).rotateY(sd * -0.5);
    b.add(sd < 0 ? 'ph1L' : 'ph1R', 'h', w.translate(sd * 0.25, 0.68, -0.25));
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.4;
    b.add('ph1c', 'f', paint(box(0.014, 0.16, 0.01).rotateZ(a + 0.5).translate(Math.cos(a) * 0.2, 0.95 + Math.sin(a) * 0.2, 0.1), '#ffb060', 1.8));
  }
  J('b', body);
  J('drum', body, V(0, 0.92, -0.08));
  J('cym', body, V(0, 1.57, -0.5));
  J('elyL', body, V(-0.1, 0.62, 0.1));
  J('elyR', body, V(0.1, 0.62, 0.1));
  J('sticks', body, V(0, 0.6, 0.78));
  J('legsL', body, V(-0.45, 0.3, 0));
  J('legsR', body, V(0.45, 0.3, 0));
  J('ph1L', body, V(-0.25, 0.68, -0.25), V(0, 0, 0), false);
  J('ph1R', body, V(0.25, 0.68, -0.25), V(0, 0, 0), false);
  J('ph1c', body, V(0, 0, 0), V(0, 0, 0), false);
  t.height = 1.7;
  t.style = 'run';
  t.hop = 0.03;
  t.hops = 2;
  t.rim = '#ffd0a0';
  t.rimK = 0.4;
  t.front = 0.95;
}

function crow(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const char = new THREE.Color('#25253a'), grey = new THREE.Color('#77778f'), silver = new THREE.Color('#d6d8e8');
  b.add('b', 'm', paint(at(ell(0.31, 0.31, 0.55, 22, 16), 0, 0, 0), (p, n) => _c.copy(char).lerp(grey, smooth(0.0, -0.9, n.y) * 0.8)));
  b.add('b', 'm', paint(at(sph(0.25, 20, 14), 0, 0.22, 0.44), char));
  // a ragged ruff around the neck
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const p = V(Math.cos(a) * 0.2, 0.08 + Math.sin(a) * 0.17, 0.3);
    b.add('b', 'm', place(paint(cone(0.06, 0.2, 5), char.clone().multiplyScalar(1.2)).rotateX(-Math.PI / 2), p, V(Math.cos(a), Math.sin(a) - 0.2, -0.9)));
  }
  // the beak, bound shut with an X
  b.add('b', 'g', paint(scl(cone(0.11, 0.5, 12), 1, 1, 0.8).rotateX(Math.PI / 2).translate(0, 0.17, 0.86), (p) => _c.set('#2e2e44').lerp(new THREE.Color('#a8a8c4'), smooth(0.75, 1.1, p.z))));
  b.add('b', 'g', paint(at(box(0.19, 0.012, 0.36), 0, 0.15, 0.78), '#14141e'));
  stitchX(b, 'b', 'g', 0, 0.225, 0.78, 0.065, { n: V(0, 1, 0.3) });
  eyes2(b, 'b', 'g', 0.12, 0.31, 0.6, 0.07, { brow: 0.55, small: 0.42, white: '#ece4ff', pupil: '#2a1450', glow: 0.5, yaw: 0.35 });
  // crest: three ragged plumes tipped with violet light
  for (let i = 0; i < 3; i++) {
    const c = new THREE.CatmullRomCurve3([V((i - 1) * 0.05, 0.44, 0.42), V((i - 1) * 0.08, 0.56, 0.3 - i * 0.02), V((i - 1) * 0.12, 0.6, 0.12)]);
    b.add('crest', 'm', paint(taperTube(c, 10, 0.045, 0.012, 5), char));
    b.add('crest', 'f', paint(at(sph(0.024, 6, 5), (i - 1) * 0.12, 0.6, 0.12), VIO, 1.4));
  }
  // wings: a broad dark fan with silver-tipped primary fingers
  const wing: [number, number][] = [[0, 0.2], [0.45, 0.34], [0.9, 0.3], [1.25, 0.16], [1.48, 0.04], [1.3, -0.02], [1.44, -0.12], [1.22, -0.14], [1.32, -0.26], [1.06, -0.25], [1.12, -0.38], [0.86, -0.34], [0.84, -0.46], [0.62, -0.4], [0.5, -0.5], [0.36, -0.4], [0.18, -0.44], [0, -0.22]];
  const sheen = new THREE.Color('#4a3a7a');
  const wingPaint = (tt: number, x: number, z: number) => {
    const fth = Math.abs(Math.sin(Math.atan2(z + 0.05, x - 0.05) * 13)) < 0.1 && tt > 0.45;
    _c.copy(char).multiplyScalar(0.8).lerp(sheen, smooth(0.3, 0.8, tt) * 0.45).lerp(grey, smooth(0.85, 1, tt) * 0.35);
    if (fth) _c.multiplyScalar(0.45);
    return _c;
  };
  const covert: [number, number][] = [[0, 0.2], [0.45, 0.33], [0.85, 0.28], [0.9, 0.12], [0.72, 0.02], [0.6, 0.06], [0.45, -0.04], [0.3, 0.0], [0.15, -0.06], [0, -0.04]];
  for (const sd of [-1, 1]) {
    const w = merge([fan(wing, wingPaint, (tt) => (tt > 0.95 ? 0.06 : 0), 7), fan(covert, (tt) => _c.copy(char).lerp(sheen, tt * 0.3).multiplyScalar(1.15), undefined, 4).translate(0, 0.012, 0)]);
    if (sd < 0) w.scale(-1, 1, 1);
    b.add(sd < 0 ? 'wingL' : 'wingR', 'd', w);
    // phase 1: the primaries burn with violet fire
    const tips: Geo[] = [];
    for (const [x, z] of [[1.48, 0.04], [1.44, -0.12], [1.32, -0.26], [1.12, -0.38]]) tips.push(paint(cone(0.045, 0.26, 5).rotateZ(-Math.PI / 2).translate(x + 0.1, 0.01, z), VIO, 1.8));
    const tg = merge(tips);
    if (sd < 0) tg.scale(-1, 1, 1);
    b.add(sd < 0 ? 'ph1L' : 'ph1R', 'f', tg);
  }
  // a fanned tail
  b.add('tail', 'd', fan([[0, 0], [-0.16, -0.32], [-0.24, -0.6], [-0.12, -0.56], [0, -0.68], [0.12, -0.56], [0.24, -0.6], [0.16, -0.32]], wingPaint, undefined, 4).translate(0, 0.02, -0.38));
  // legs hanging, talons gripping the stolen silver flute
  for (const sd of [-1, 1]) {
    b.add('b', 'g', paint(at(capsule(0.025, 0.2, 2, 5), sd * 0.08, -0.32, 0.08), '#3a3a52'));
    for (const a of [-0.6, 0, 0.6]) b.add('b', 'g', paint(at(torus(0.04, 0.012, 4, 8, Math.PI * 1.2).rotateY(Math.PI / 2 + a * 0.4).rotateX(-0.6), sd * 0.08 + a * 0.03, -0.47, 0.1), '#1a1a28'));
  }
  const flute = cyl(0.032, 0.032, 0.72, 10).rotateZ(Math.PI / 2);
  b.add('flute', 'x', paint(flute, (p) => _c.copy(silver).multiplyScalar(0.8 + 0.3 * smooth(-0.03, 0.03, p.y))));
  for (let i = 0; i < 6; i++) b.add('flute', 'g', paint(at(sph(0.012, 6, 4), -0.2 + i * 0.075, 0.03, 0), '#14141e'));
  for (const sx of [-1, 1]) b.add('flute', 'x', paint(at(torus(0.035, 0.008, 4, 12).rotateY(Math.PI / 2), sx * 0.34, 0, 0), GOLD));
  J('b', body);
  J('crest', body, V(0, 0.44, 0.42));
  const wl = b.into('wingL', grp('wingL', -0.2, 0.1, 0.02));
  const wr = b.into('wingR', grp('wingR', 0.2, 0.1, 0.02));
  body.add(wl, wr);
  wl.add(b.into('ph1L', grp('ph1L'), undefined, false));
  wr.add(b.into('ph1R', grp('ph1R'), undefined, false));
  J('tail', body, V(0, 0.02, -0.38));
  body.add(b.into('flute', grp('flute', 0, -0.5, 0.1)));
  t.height = 0.8;
  t.style = 'fly';
  t.flap = 7;
  t.rim = '#e4e0ff';
  t.rimK = 0.5;
  t.front = 0.9;
}

// ───────────────────────────── dunes ─────────────────────────────

function sandworm(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const sand = new THREE.Color('#e0b87a'), band = new THREE.Color('#a8622e'), brass = new THREE.Color('#d9a646');
  const ringP: Painter = (p) => {
    const v = Math.sin(p.y * 16 + p.z * 9);
    return _c.copy(sand).lerp(band, smooth(0.55, 0.95, v) * 0.7).multiplyScalar(0.9 + hash(p.x, p.y, p.z) * 0.12);
  };
  const base = new THREE.CatmullRomCurve3([V(0, -0.3, -1.25), V(0, 0.08, -0.9), V(0, 0.3, -0.42), V(0, 0.62, 0.02)]);
  const neckC = new THREE.CatmullRomCurve3([V(0, 0.62, 0.02), V(0, 1.0, 0.12), V(0, 1.36, 0.26), V(0, 1.56, 0.52)]);
  b.add('base', 'g', paint(taperTube(base, 30, 0.3, 0.36, 14), ringP));
  b.add('neck', 'g', paint(taperTube(neckC, 30, 0.36, 0.34, 14), ringP));
  // brass bands like the rings of a great horn, and ink fins along its back
  const rings = (c: THREE.Curve<THREE.Vector3>, part: string, n: number, r: number) => {
    for (let i = 1; i <= n; i++) {
      const u = i / (n + 1);
      const p = c.getPointAt(u), tg = c.getTangentAt(u);
      b.add(part, 'x', place(paint(torus(r, 0.035, 6, 28), brass), p, tg));
      const back = V(0, tg.z, -tg.y).normalize();
      b.add(part, 'g', alongY(paint(cone(0.07, 0.24, 5), '#2a1d30'), p.clone().addScaledVector(back, r + 0.06), back.clone().addScaledVector(tg, -0.5)));
    }
  };
  rings(base, 'base', 3, 0.36);
  rings(neckC, 'neck', 3, 0.37);
  // the sand mound it bursts from
  b.add('mound', 'm', paint(at(ell(1.05, 0.2, 1.15, 26, 10), 0, 0, -0.55), (p, n) => _c.copy(sand).multiplyScalar(0.82 + n.y * 0.18 + hash(p.x, 0, p.z) * 0.08)));
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.2, r = 0.7 + (i % 3) * 0.2;
    b.add('mound', 'g', paint(facet(new THREE.DodecahedronGeometry(0.07 + (i % 2) * 0.05, 0)).translate(Math.cos(a) * r, 0.1, Math.sin(a) * r - 0.55), i % 2 ? '#a87a4a' : '#c89a62'));
  }
  // the head: the bell of a great brass horn, and a face peering out of it
  const E = neckC.getPointAt(1), tan = neckC.getTangentAt(1);
  const bell = lathe([[0.34, 0], [0.35, 0.1], [0.4, 0.2], [0.5, 0.3], [0.6, 0.37], [0.62, 0.4], [0.56, 0.4], [0.46, 0.34], [0.34, 0.27], [0.3, 0.25]], 30).rotateX(Math.PI / 2);
  b.add('head', 'x', paint(bell, (p) => _c.copy(brass).lerp(new THREE.Color('#fff0b8'), smooth(0.2, 0.4, p.z) * 0.5)));
  b.add('head', 'x', paint(torus(0.6, 0.045, 6, 32).translate(0, 0, 0.39), GOLD));
  b.add('head', 'g', paint(new THREE.CircleGeometry(0.31, 28).translate(0, 0, 0.25), (p) => _c.set('#1a1024').lerp(new THREE.Color('#3a2448'), smooth(0.3, 0, Math.hypot(p.x, p.y)))));
  eyes2(b, 'head', 'g', 0.12, 0.08, 0.27, 0.075, { brow: 0.4, small: 0.48, white: '#fff6d8' });
  stitchX(b, 'head', 'g', 0, -0.12, 0.27, 0.085);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    b.add('head', 'g', alongY(paint(cone(0.04, 0.16, 5), '#f2e2c0'), V(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.34), V(-Math.cos(a), -Math.sin(a), 0.6)));
  }
  // phase 1: a crown of burning spikes on the rim, the throat lit from inside
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    b.add('ph1', 'f', alongY(paint(cone(0.06, 0.3, 5), (p) => _c.set('#ff8a3a').lerp(new THREE.Color('#ffe08a'), 0.3), 1.4), V(Math.cos(a) * 0.63, Math.sin(a) * 0.63, 0.42), V(Math.cos(a), Math.sin(a), 0.5)));
  }
  b.add('ph1', 'f', paint(torus(0.2, 0.05, 6, 20).translate(0, 0, 0.255), '#ff9a40', 2));
  J('mound', body);
  J('base', body);
  const neck = J('neck', body, V(0, 0.62, 0.02));
  const head = b.into('head', grp('head'));
  neck.add(head);
  head.position.copy(E).sub(V(0, 0.62, 0.02));
  head.quaternion.setFromUnitVectors(Z, tan);
  const ph = b.into('ph1', grp('ph1'), undefined, false);
  head.add(ph);
  t.height = 2.1;
  t.style = 'crawl';
  t.rim = '#ffe0b0';
  t.rimK = 0.45;
  t.front = 1.0;
  t.actK = 0.35;
}

function croc(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const teal = new THREE.Color('#2f6f5e'), deep = new THREE.Color('#173a33'), belly = new THREE.Color('#e2cf98');
  const skin: Painter = (p, n) => {
    _c.copy(deep).lerp(teal, smooth(-0.4, 0.6, n.y)).lerp(belly, smooth(-0.15, -0.6, n.y));
    if (n.y > -0.2 && hash(Math.round(p.x * 14), Math.round(p.y * 14), Math.round(p.z * 14)) > 0.86) _c.multiplyScalar(0.55);
    return _c;
  };
  b.add('b', 'g', paint(at(ell(0.44, 0.27, 0.9, 30, 16), 0, 0.37, 0), skin));
  b.add('b', 'g', paint(at(ell(0.3, 0.2, 0.36, 20, 12), 0, 0.42, 0.82), skin));
  b.add('b', 'g', paint(at(ell(0.21, 0.1, 0.46, 18, 10), 0, 0.38, 1.24), skin));
  for (const sd of [-1, 1]) {
    b.add('b', 'g', paint(at(sph(0.105, 12, 10), sd * 0.15, 0.56, 0.84), skin));
    b.add('b', 'g', paint(at(sph(0.045, 8, 6), sd * 0.07, 0.45, 1.66), '#173a33'));
  }
  eyes2(b, 'b', 'g', 0.15, 0.585, 0.925, 0.075, { lid: '#2f6f5e', lidK: 0.52, small: 0.42, white: '#fff3b0', pupil: '#1a1020' });
  // upper teeth along the jaw line, the snout sewn shut
  for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) b.add('b', 'g', paint(at(cone(0.022, 0.07, 4).rotateX(Math.PI), sd * (0.2 - i * 0.008), 0.29, 0.92 + i * 0.1), '#fff8e8'));
  stitchX(b, 'b', 'g', 0, 0.33, 1.69, 0.075);
  for (const sd of [-1, 1]) stitchX(b, 'b', 'g', sd * 0.205, 0.31, 1.22, 0.06, { n: V(sd, 0, 0.15) });
  b.add('jaw', 'g', paint(at(ell(0.2, 0.07, 0.48, 18, 8), 0, 0.26, 1.18), (p, n) => _c.copy(belly).lerp(teal, smooth(0, -0.8, n.y) * 0.4)));
  for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) b.add('jaw', 'g', paint(at(cone(0.02, 0.06, 4), sd * (0.18 - i * 0.008), 0.31, 0.97 + i * 0.1), '#fff8e8'));
  // the tail, with a ridge of scutes
  const tc = new THREE.CatmullRomCurve3([V(0, 0.36, -0.7), V(0.1, 0.3, -1.2), V(-0.08, 0.22, -1.7), V(0.06, 0.15, -2.15)]);
  b.add('tail', 'g', paint(taperTube(tc, 24, 0.26, 0.03, 10), skin));
  for (let i = 1; i < 9; i++) {
    const u = i / 10, p = tc.getPointAt(u);
    b.add('tail', 'g', paint(at(cone(0.045 * (1 - u * 0.6), 0.12 * (1 - u * 0.5), 4), p.x, p.y + 0.24 * (1 - u * 0.9), p.z), '#173a33'));
  }
  // short splayed legs
  [[0.38, 0.42], [0.38, -0.5]].forEach(([x, z], i) => {
    for (const sd of [-1, 1]) {
      const part = `leg${i * 2 + (sd > 0 ? 1 : 0)}`;
      b.add(part, 'g', paint(at(capsule(0.08, 0.2, 3, 6).rotateZ(sd * 1.0), sd * (x + 0.08), 0.24, z), skin), paint(at(ell(0.12, 0.04, 0.14), sd * (x + 0.2), 0.04, z + 0.06), '#173a33'));
    }
  });
  // the stolen marimba: golden keys across its back, on brass rails
  for (const sd of [-1, 1]) b.add('keys', 'x', paint(cyl(0.02, 0.02, 1.15, 6).rotateX(Math.PI / 2).translate(sd * 0.2, 0.62, -0.08), '#c89a3a'));
  for (let i = 0; i < 8; i++) {
    const z = 0.42 - i * 0.14, w = 0.66 - i * 0.04;
    b.add('keys', 'f', paint(at(box(w, 0.045, 0.1), 0, 0.665, z), (p) => _c.set('#c8823a').lerp(new THREE.Color('#ffd27a'), smooth(0.65, 0.69, p.y)), 0.18));
    for (const sd of [-1, 1]) b.add('keys', 'x', paint(at(sph(0.014, 6, 4), sd * 0.2, 0.69, z), GOLD));
  }
  // the mirage: a shimmering double of its silhouette (two of them from phase 1)
  const ghost = () => merge([
    paint(at(ell(0.46, 0.3, 0.92, 18, 10), 0, 0.37, 0), '#bff4ff', 0.5),
    paint(at(ell(0.22, 0.12, 0.7, 14, 8), 0, 0.36, 1.05), '#bff4ff', 0.5),
    paint(taperTube(tc, 12, 0.27, 0.04, 6), '#bff4ff', 0.5),
  ]);
  b.add('mirage', 'h', ghost());
  b.add('ph1', 'h', ghost());
  J('b', body);
  J('jaw', body, V(0, 0.29, 0.85));
  J('tail', body, V(0, 0.36, -0.7));
  for (let i = 0; i < 4; i++) J(`leg${i}`, body, V((i % 2 ? 1 : -1) * 0.38, 0.3, i < 2 ? 0.42 : -0.5));
  J('keys', body);
  J('mirage', body, V(0, 0, 0), V(0, 0, 0), false);
  J('ph1', body, V(0, 0, 0), V(0, 0, 0), false);
  root(t).scale.setScalar(1.12);
  t.height = 0.9;
  t.style = 'run';
  t.hop = 0.025;
  t.hops = 2;
  t.glass = 0.24;
  t.rim = '#d8fff0';
  t.rimK = 0.45;
  t.front = 1.75;
}

function sphinx(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const stoneA = new THREE.Color('#e6c286'), stoneB = new THREE.Color('#a8743e');
  const stone: Painter = (p, n) => {
    _c.copy(stoneB).lerp(stoneA, smooth(-0.6, 0.7, n.y) * 0.8 + 0.2);
    if (Math.abs(Math.sin(p.x * 13 + p.y * 7) * Math.sin(p.z * 11 - p.y * 5)) < 0.03) _c.multiplyScalar(0.62);
    return _c;
  };
  const gold = new THREE.Color('#e9b949'), lapis = new THREE.Color('#2f4a9a');
  const stripes: Painter = (p) => (Math.floor(p.y * 16 + 100) % 2 ? _c.copy(gold) : _c.copy(lapis));
  b.add('b', 'g', paint(at(ell(0.36, 0.33, 0.74, 24, 16), 0, 0.82, -0.08), stone));
  b.add('b', 'g', paint(at(ell(0.38, 0.42, 0.34, 22, 16), 0, 0.92, 0.44), stone));
  // the face under the nemes, kohl-lidded, a chipped nose, the false beard, the X
  b.add('b', 'g', paint(at(ell(0.2, 0.24, 0.2, 20, 14), 0, 1.5, 0.7), (p, n) => _c.set('#efd29a').multiplyScalar(0.85 + n.z * 0.15)));
  b.add('b', 'g', paint(at(box(0.06, 0.09, 0.06), 0, 1.5, 0.9), '#c8a06a'));
  eyes2(b, 'b', 'g', 0.085, 1.57, 0.86, 0.056, { lid: '#2f4a9a', lidK: 0.5, small: 0.5 });
  stitchX(b, 'b', 'g', 0, 1.39, 0.88, 0.05, { pitch: -0.2 });
  b.add('b', 'g', paint(at(capsule(0.04, 0.14, 3, 6), 0, 1.2, 0.84), stripes));
  // the nemes: a striped cap and side flaps that leave the face open
  b.add('b', 'g', paint(new THREE.SphereGeometry(0.27, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.3).scale(1.05, 1, 1).translate(0, 1.55, 0.66), stripes));
  b.add('b', 'g', paint(new THREE.SphereGeometry(0.27, 22, 10, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, Math.PI * 0.28, Math.PI * 0.36).scale(1.12, 1, 1).translate(0, 1.55, 0.64), stripes));
  b.add('b', 'x', paint(at(torus(0.255, 0.018, 4, 26, Math.PI * 1.1).rotateZ(-0.05 * Math.PI).rotateX(-0.1), 0, 1.58, 0.68), GOLD));
  for (const sd of [-1, 1]) {
    const lap = box(0.13, 0.5, 0.05).translate(0, -0.25, 0).rotateZ(sd * 0.08);
    b.add('b', 'g', paint(lap.translate(sd * 0.24, 1.52, 0.66), stripes));
  }
  xGlyph(b, 'b', V(0, 1.75, 0.86), V(0, 0.3, 1), 0.08, VIO, 1.6);
  // four pillar legs with great paws
  [[0.22, 0.52], [-0.22, 0.52], [0.24, -0.56], [-0.24, -0.56]].forEach(([x, z], i) => {
    b.add(`leg${i}`, 'g', paint(at(capsule(0.115, 0.42, 3, 10), x, 0.37, z), stone), paint(at(ell(0.15, 0.08, 0.2), x, 0.06, z + 0.07), stone));
    for (const k of [-1, 0, 1]) b.add(`leg${i}`, 'g', paint(at(sph(0.04, 6, 5), x + k * 0.06, 0.05, z + 0.25), '#c8a06a'));
  });
  // folded feathered wings (they open in phase 1)
  const wing: [number, number][] = [[0, 0.15], [0.25, 0.14], [0.48, 0.02], [0.63, -0.25], [0.68, -0.56], [0.62, -0.86], [0.52, -1.06], [0.42, -0.9], [0.37, -0.98], [0.29, -0.82], [0.23, -0.88], [0.16, -0.7], [0.09, -0.74], [0.03, -0.5], [0, -0.25]];
  const teal = new THREE.Color('#3fb4c4');
  for (const sd of [-1, 1]) {
    const w = fan(wing, (tt, x, z) => {
      const stripe = Math.abs(Math.sin(Math.atan2(z, x - 0.05) * 16)) < 0.14;
      if (tt < 0.36) _c.copy(gold).multiplyScalar(0.85 + 0.25 * (Math.floor(tt * 14) % 2));
      else if (tt < 0.68) _c.copy(lapis).lerp(gold, Math.floor(tt * 14) % 2 ? 0.0 : 0.25);
      else _c.copy(teal).lerp(stoneA, smooth(0.9, 1, tt) * 0.4);
      if (stripe && tt > 0.36) _c.multiplyScalar(0.6);
      return _c;
    }, (tt) => (tt < 0.36 ? 0.08 : 0), 8);
    w.rotateZ(Math.PI / 2);
    if (sd < 0) w.scale(-1, 1, 1);
    b.add(sd < 0 ? 'wingL' : 'wingR', 'd', w.translate(sd * 0.36, 1.0, 0.3));
  }
  // the stolen golden lyre on its back
  for (const sd of [-1, 1]) {
    const arm = new THREE.CatmullRomCurve3([V(sd * 0.12, 1.08, -0.55), V(sd * 0.3, 1.3, -0.55), V(sd * 0.26, 1.6, -0.55), V(sd * 0.36, 1.86, -0.55)]);
    b.add('lyre', 'x', paint(taperTube(arm, 16, 0.05, 0.03, 6), GOLD));
    b.add('lyre', 'x', paint(at(sph(0.05, 8, 6), sd * 0.36, 1.88, -0.55), '#ffe08a'));
  }
  b.add('lyre', 'x', paint(cyl(0.025, 0.025, 0.62, 6).rotateZ(Math.PI / 2).translate(0, 1.76, -0.55), GOLD));
  b.add('lyre', 'x', paint(at(ell(0.16, 0.06, 0.08), 0, 1.1, -0.55), GOLD_D));
  for (let i = 0; i < 5; i++) b.add('lyre', 'f', paint(at(cyl(0.006, 0.006, 0.64, 4), -0.12 + i * 0.06, 1.44, -0.55), '#fff4c0', 1.2));
  // a halo of riddle glyphs behind its head
  b.add('halo', 'x', paint(torus(0.4, 0.022, 5, 40), GOLD));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = i % 2 ? paint(new THREE.OctahedronGeometry(0.05, 0).scale(1, 1.6, 0.5), '#8fd0ff', 1.2) : merge([paint(box(0.1, 0.022, 0.02).rotateZ(0.78), VIO, 1.4), paint(box(0.1, 0.022, 0.02).rotateZ(-0.78), VIO, 1.4)]);
    b.add('halo', 'f', g.translate(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.01));
  }
  // phase 1: the glyphs blaze, the eyes burn
  b.add('ph1', 'f', paint(torus(0.47, 0.03, 5, 40), '#ff6a8a', 1.6));
  for (const sd of [-1, 1]) b.add('ph1e', 'f', paint(at(sph(0.022, 8, 6), sd * 0.085, 1.565, 0.92), '#ff6a8a', 2.2));
  // a lion's tail with a tuft
  const tc = new THREE.CatmullRomCurve3([V(0, 0.95, -0.78), V(0.1, 0.7, -1.0), V(0.15, 0.85, -1.25), V(0.1, 1.15, -1.3)]);
  b.add('tail', 'g', paint(taperTube(tc, 16, 0.05, 0.03, 6), stone), paint(at(ell(0.07, 0.11, 0.07), 0.1, 1.2, -1.3), lapis));
  J('b', body);
  for (let i = 0; i < 4; i++) J(`leg${i}`, body, V([0.22, -0.22, 0.24, -0.24][i], 0.66, i < 2 ? 0.52 : -0.56));
  J('wingL', body, V(-0.36, 1.0, 0.3));
  J('wingR', body, V(0.36, 1.0, 0.3));
  J('lyre', body);
  const halo = J('halo', body, V(0, 0, 0));
  halo.position.set(0, 1.6, 0.42);
  const ph = J('ph1', body);
  ph.position.set(0, 1.6, 0.42);
  J('ph1e', body, V(0, 0, 0), V(0, 0, 0), false);
  J('tail', body, V(0, 0.95, -0.78));
  t.height = 2.15;
  t.style = 'march';
  t.rim = '#ffe8b8';
  t.rimK = 0.4;
  t.front = 0.95;
}

// ───────────────────────────── peaks ─────────────────────────────

function yeti(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const fur = new THREE.Color('#eef4fb'), shade = new THREE.Color('#8aa4c4');
  const furP: Painter = (p, n) => _c.copy(shade).lerp(fur, smooth(-0.8, 0.5, n.y) * 0.85 + 0.15).multiplyScalar(0.93 + hash(p.x, p.y, p.z) * 0.1);
  const prof = [[0, 0.5], [0.36, 0.52], [0.5, 0.72], [0.56, 1.0], [0.55, 1.26], [0.45, 1.5], [0.28, 1.64], [0, 1.68]];
  b.add('b', 'm', paint(lathe(prof, 28), furP));
  shag(b, 'b', prof, 0.62, 1.56, 9, 20, 0.24, furP);
  // head and the bare ice-blue face
  b.add('b', 'm', paint(at(sph(0.3, 20, 14), 0, 1.66, 0.12), furP));
  b.add('b', 'g', paint(at(ell(0.22, 0.25, 0.1, 18, 12), 0, 1.6, 0.36), (p, n) => _c.set('#7fb4e0').lerp(new THREE.Color('#c8e6ff'), smooth(-0.2, 0.8, n.y) * 0.5)));
  b.add('b', 'm', paint(at(ell(0.27, 0.07, 0.14).rotateX(0.2), 0, 1.74, 0.36), furP));
  eyes2(b, 'b', 'g', 0.09, 1.65, 0.43, 0.065, { brow: 0.5, small: 0.48, browCol: '#3a5a8a' });
  stitchX(b, 'b', 'g', 0, 1.47, 0.44, 0.07);
  // curling ice horns
  for (const sd of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([V(sd * 0.22, 1.8, 0.06), V(sd * 0.45, 1.92, -0.02), V(sd * 0.54, 2.12, 0.12), V(sd * 0.42, 2.26, 0.3)]);
    b.add('b', 'c', paint(taperTube(c, 18, 0.085, 0.012, 8), (p) => _c.set('#7fd4ff').lerp(new THREE.Color('#ffffff'), smooth(1.9, 2.25, p.y)), 0.5));
  }
  // ice crystals growing on its back (more of them from phase 1)
  const crystals = (part: string, list: [number, number, number, number, number][], glow: number) => {
    for (const [x, y, z, s, a] of list) b.add(part, 'c', paint(new THREE.CylinderGeometry(0, s * 0.35, s * 1.6, 6).translate(0, s * 0.8, 0).rotateX(-0.9 + a * 0.3).rotateZ(a).translate(x, y, z), (p) => _c.set('#8fdcff').lerp(new THREE.Color('#ffffff'), 0.4), glow));
  };
  crystals('b', [[0, 1.4, -0.42, 0.22, 0], [0.18, 1.25, -0.46, 0.16, -0.5], [-0.2, 1.2, -0.45, 0.18, 0.5]], 0.5);
  crystals('ph1', [[0.08, 1.55, -0.3, 0.3, -0.2], [-0.25, 1.45, -0.35, 0.26, 0.6], [0.3, 1.35, -0.38, 0.24, -0.7], [0, 1.0, -0.5, 0.2, 0.1]], 1.2);
  for (const sd of [-1, 1]) {
    b.add(sd < 0 ? 'legL' : 'legR', 'm', paint(at(capsule(0.17, 0.28, 3, 10), sd * 0.24, 0.32, 0), furP), paint(at(ell(0.2, 0.09, 0.28), sd * 0.24, 0.06, 0.08), '#5a7aa4'));
    // long arms holding the stolen ice cymbals
    const arm = sd < 0 ? 'armL' : 'armR';
    b.add(arm, 'm', paint(at(capsule(0.14, 0.62, 3, 10).rotateZ(sd * 0.15), sd * 0.62, 0.95, 0.05), furP));
    shag(b, arm, [[0.12, 0.6], [0.15, 1.0], [0.15, 1.3]], 0.75, 1.25, 5, 9, 0.18, furP, { cx: sd * 0.62, cz: 0.05 });
    b.add(arm, 'g', paint(at(sph(0.14, 12, 10), sd * 0.68, 0.56, 0.12), '#7fb4e0'));
    const cymbal = lathe([[0, 0.05], [0.06, 0.045], [0.08, 0.02], [0.33, -0.015], [0.35, -0.03]], 28).rotateZ(-sd * Math.PI / 2);
    b.add(arm, 'x', paint(cymbal, (p) => _c.set('#7cc8f4').lerp(new THREE.Color('#e8fbff'), Math.abs(Math.sin(Math.hypot(p.y, p.z) * 50)) * 0.6), 0.25).translate(sd * 0.6, 0.56, 0.32));
    b.add(arm, 'x', paint(torus(0.35, 0.02, 4, 28).rotateY(Math.PI / 2).translate(sd * 0.58, 0.56, 0.32), '#1f6a9a'));
  }
  J('b', body);
  J('ph1', body, V(0, 0, 0), V(0, 0, 0), false);
  J('legL', body, V(-0.24, 0.55, 0));
  J('legR', body, V(0.24, 0.55, 0));
  J('armL', body, V(-0.55, 1.32, 0.05));
  J('armR', body, V(0.55, 1.32, 0.05));
  t.height = 2.25;
  t.style = 'march';
  t.glass = 0.78;
  t.rim = '#d8f0ff';
  t.rimK = 0.55;
  t.front = 0.55;
}

function siren(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const skin = grad2('#9fd0f0', '#e8f8ff', 0.95, 1.5);
  const tail = new THREE.CatmullRomCurve3([V(0, 0.98, 0), V(0, 0.62, -0.08), V(0, 0.3, 0.05), V(0, 0.12, 0.3), V(0, 0.2, 0.52)]);
  const scales: Painter = (p) => {
    const s = Math.abs(Math.sin(p.y * 40) * Math.sin(p.x * 40 + p.z * 30));
    return _c.set('#173f8a').lerp(new THREE.Color('#38c8d8'), smooth(0.1, 0.9, p.y) * 0.8).multiplyScalar(s > 0.85 ? 1.35 : 1);
  };
  b.add('tail', 'g', paint(taperTube(tail, 30, 0.2, 0.05, 12), scales));
  const fluke = fan([[0, 0.02], [0.12, 0.2], [0.3, 0.34], [0.26, 0.12], [0.34, -0.02], [0.14, -0.04]], (tt) => _c.set('#7fe0ff').lerp(new THREE.Color('#ffffff'), tt * 0.5), (tt) => tt * 0.6, 4);
  for (const sd of [-1, 1]) {
    const f = fluke.clone();
    if (sd < 0) f.scale(-1, 1, 1);
    b.add('tail', 'c', f.rotateX(0.6).translate(0, 0.2, 0.52));
  }
  for (const sd of [-1, 1]) {
    const hip = fan([[0, 0], [0.18, 0.1], [0.3, -0.05], [0.2, -0.2], [0.05, -0.12]], (tt) => _c.set('#7fe0ff').lerp(new THREE.Color('#ffffff'), tt * 0.5), (tt) => tt * 0.5, 3);
    if (sd < 0) hip.scale(-1, 1, 1);
    b.add('tail', 'c', hip.rotateZ(sd * -0.8).translate(sd * 0.16, 0.92, 0));
  }
  b.add('b', 'g', paint(lathe([[0, 0.9], [0.17, 0.92], [0.2, 1.04], [0.15, 1.2], [0.19, 1.32], [0.15, 1.42], [0.07, 1.48], [0, 1.49]], 22), skin));
  b.add('b', 'g', paint(at(sph(0.155, 18, 14), 0, 1.62, 0.02), '#eaf7ff'));
  eyes2(b, 'b', 'g', 0.06, 1.645, 0.145, 0.045, { lid: '#7fb8e0', lidK: 0.45, small: 0.55, pupil: '#1a3a6a' });
  stitchX(b, 'b', 'g', 0, 1.55, 0.15, 0.03, { col: '#2a4a7a', hole: '#a0c8e8' });
  // an ice tiara
  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) / 3) * 0.9;
    b.add('b', 'c', alongY(paint(cone(0.03, 0.18 - Math.abs(i - 3) * 0.035, 5), '#dff6ff', 0.9), V(Math.sin(a) * 0.14, 1.74, Math.cos(a) * 0.1), V(Math.sin(a) * 0.4, 1, 0.1)));
  }
  // icicle hair flowing back, tinted by the aurora
  for (let i = 0; i < 9; i++) {
    const a = ((i - 4) / 4) * 1.3;
    const c = new THREE.CatmullRomCurve3([V(Math.sin(a) * 0.12, 1.72, -0.04), V(Math.sin(a) * 0.22, 1.6, -0.2), V(Math.sin(a) * 0.26, 1.3, -0.3), V(Math.sin(a) * 0.2, 1.0 - (i % 3) * 0.08, -0.36)]);
    b.add('hair', 'c', paint(taperTube(c, 16, 0.05, 0.01, 6), (p) => _c.setHSL(0.5 + (1.7 - p.y) * 0.18 + i * 0.01, 0.85, 0.62 + smooth(1.6, 1.0, p.y) * 0.12), 0.8));
  }
  // arms holding the stolen glass lyre
  for (const sd of [-1, 1]) {
    const a = new THREE.CatmullRomCurve3([V(sd * 0.17, 1.38, 0), V(sd * 0.25, 1.22, 0.12), V(sd * 0.14, 1.18, 0.3)]);
    b.add('arms', 'g', paint(taperTube(a, 10, 0.04, 0.03, 6), '#bfe4fa'));
    const fr = new THREE.CatmullRomCurve3([V(sd * 0.04, 1.06, 0.34), V(sd * 0.16, 1.14, 0.36), V(sd * 0.14, 1.32, 0.36), V(sd * 0.2, 1.44, 0.36)]);
    b.add('arms', 'c', paint(taperTube(fr, 12, 0.028, 0.016, 6), '#cff4ff', 0.6));
  }
  b.add('arms', 'c', paint(cyl(0.016, 0.016, 0.38, 6).rotateZ(Math.PI / 2).translate(0, 1.38, 0.36), '#cff4ff', 0.6));
  for (let i = 0; i < 4; i++) b.add('arms', 'f', paint(at(cyl(0.004, 0.004, 0.3, 4), -0.06 + i * 0.04, 1.23, 0.36), '#ffffff', 1.6));
  // phase 1: an aurora veil streaming behind her
  const veil = new THREE.PlaneGeometry(0.5, 1.2, 4, 12);
  const vp = veil.attributes.position;
  for (let i = 0; i < vp.count; i++) {
    const y = vp.getY(i);
    vp.setXYZ(i, vp.getX(i) * (1 + (0.6 - y) * 0.6), y + 1.0, -0.4 - (0.6 - y) * 0.4 + Math.sin(y * 6 + vp.getX(i) * 4) * 0.06);
  }
  veil.computeVertexNormals();
  b.add('ph1', 'h', paint(veil, (p) => _c.setHSL(0.38 + p.y * 0.12, 0.8, 0.62), 0.9));
  J('tail', body, V(0, 0.98, 0));
  J('b', body);
  J('hair', body, V(0, 1.7, -0.05), V(0, 0, 0), false);
  J('arms', body, V(0, 1.38, 0));
  J('ph1', body, V(0, 1.4, -0.4), V(0, 0, 0), false);
  root(t).scale.setScalar(1.25);
  t.height = 1.85;
  t.style = 'float';
  t.hover = 0.75;
  t.glass = 0.82;
  t.rim = '#d8f4ff';
  t.rimK = 0.7;
  t.front = 0.4;
}

function stag(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const ink = new THREE.Color('#252c58'), pale = new THREE.Color('#e8f2ff');
  const coat: Painter = (p, n) => {
    _c.copy(ink).lerp(pale, smooth(-0.1, -0.7, n.y) * 0.8 + smooth(0.3, 0.9, n.z) * smooth(0.95, 1.3, p.y) * 0.6);
    if (hash(Math.round(p.x * 18), Math.round(p.y * 18), Math.round(p.z * 18)) > 0.9 && n.y > 0) _c.lerp(pale, 0.6);
    return _c;
  };
  b.add('b', 'g', paint(at(ell(0.27, 0.3, 0.62, 22, 14), 0, 1.06, 0), coat));
  b.add('b', 'g', paint(alongY(capsule(0.13, 0.36, 3, 10), V(0, 1.36, 0.5), V(0, 1, 0.55)), coat));
  shag(b, 'b', [[0.12, 1.1], [0.14, 1.45]], 1.16, 1.4, 3, 5, 0.16, (p) => _c.set('#f2f6ff'), { cz: 0.52, arc: [-1.2, 1.2] });
  // legs, long and fine, silver hooves
  [[0.14, 0.45], [-0.14, 0.45], [0.14, -0.45], [-0.14, -0.45]].forEach(([x, z], i) => {
    const P = `leg${i}`;
    b.add(P, 'g', paint(at(capsule(0.065, 0.36, 3, 8), x, 0.72, z - 0.02), coat), paint(at(capsule(0.035, 0.42, 3, 6), x, 0.3, z), '#1a1f3e'));
    b.add(P, 'x', paint(at(cyl(0.05, 0.055, 0.07, 8), x, 0.04, z), '#cfd8ec'));
  });
  // the head and its mirror antlers hung with chimes
  b.add('head', 'g', paint(at(ell(0.14, 0.15, 0.2, 16, 12), 0, 1.66, 0.7), coat));
  b.add('head', 'g', paint(at(ell(0.09, 0.085, 0.15, 14, 10), 0, 1.6, 0.86), (p, n) => _c.copy(ink).lerp(pale, 0.35)));
  b.add('head', 'g', paint(at(sph(0.03, 8, 6), 0, 1.62, 1.0), '#0c0e1e'));
  for (const sd of [-1, 1]) b.add('head', 'g', paint(at(ell(0.06, 0.025, 0.13).rotateY(sd * 0.9).rotateZ(sd * 0.4), sd * 0.17, 1.74, 0.62), coat));
  eyes2(b, 'head', 'g', 0.09, 1.7, 0.79, 0.045, { glow: 0.4, small: 0.52, white: '#f2faff', yaw: 0.55 });
  stitchX(b, 'head', 'g', 0, 1.55, 0.95, 0.032, { pitch: -0.4 });
  b.add('head', 'f', paint(new THREE.OctahedronGeometry(0.045, 0).scale(1, 1.4, 0.4).translate(0, 1.78, 0.82), '#dff6ff', 1.6));
  const glassP: Painter = (p) => _c.set('#b8d8ff').lerp(new THREE.Color('#ffffff'), smooth(1.8, 2.6, p.y) * 0.7);
  for (const sd of [-1, 1]) {
    const beam = new THREE.CatmullRomCurve3([V(sd * 0.07, 1.78, 0.66), V(sd * 0.26, 2.02, 0.58), V(sd * 0.4, 2.32, 0.48), V(sd * 0.44, 2.62, 0.4)]);
    b.add('antlers', 'c', paint(taperTube(beam, 18, 0.04, 0.016, 7), glassP, 0.4));
    const tips: [number, THREE.Vector3][] = [[1, beam.getPointAt(1)]];
    for (const [u, dir] of [[0.3, V(sd * 0.1, 0.35, 0.3)], [0.55, V(sd * 0.3, 0.25, 0.1)], [0.75, V(sd * -0.05, 0.35, 0.15)]] as [number, THREE.Vector3][]) {
      const p0 = beam.getPointAt(u);
      const p1 = p0.clone().add(dir);
      const tc = new THREE.CatmullRomCurve3([p0, p0.clone().lerp(p1, 0.5).add(V(0, 0.04, 0)), p1]);
      b.add('antlers', 'c', paint(taperTube(tc, 8, 0.026, 0.01, 6), glassP, 0.4));
      tips.push([u, p1]);
    }
    for (const [, p] of tips) b.add('antlers', 'f', paint(new THREE.OctahedronGeometry(0.05, 0).scale(0.7, 1.5, 0.3).rotateY(sd * 0.5).translate(p.x, p.y + 0.03, p.z), '#e8fbff', 1.5));
    // chimes hanging from the beams
    for (const u of [0.4, 0.62, 0.85]) {
      const p = beam.getPointAt(u);
      const l = 0.12 + u * 0.08;
      b.add('chimes', 'x', paint(at(cyl(0.004, 0.004, l, 3), p.x, p.y - l / 2, p.z), '#9aa6c0'));
      b.add('chimes', 'x', paint(at(cyl(0.018, 0.018, 0.16, 8), p.x, p.y - l - 0.08, p.z), (q) => _c.set('#e6ecf8').multiplyScalar(0.8 + 0.3 * smooth(p.y - l - 0.16, p.y - l, q.y))));
    }
  }
  b.add('ph1', 'f', paint(torus(0.22, 0.02, 5, 28).rotateX(-0.3).translate(0, 2.3, 0.5), '#e8fbff', 1.8));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add('ph1', 'f', paint(new THREE.OctahedronGeometry(0.035, 0).translate(Math.cos(a) * 0.22, 2.3 + Math.sin(a) * 0.21, 0.5 - Math.sin(a) * 0.06), '#ffffff', 2));
  }
  b.add('b', 'm', paint(at(ell(0.07, 0.09, 0.05), 0, 1.16, -0.62), '#f6f8ff'));
  J('b', body);
  for (let i = 0; i < 4; i++) J(`leg${i}`, body, V(i % 2 ? -0.14 : 0.14, 0.9, i < 2 ? 0.45 : -0.45));
  const head = J('head', body, V(0, 1.45, 0.55));
  const ant = J('antlers', head, V(0, 1.78, 0.66), V(0, 1.45, 0.55));
  J('chimes', ant, V(0, 2.3, 0.5), V(0, 1.78, 0.66), false);
  J('ph1', ant, V(0, 2.3, 0.5), V(0, 1.78, 0.66), false);
  t.height = 2.7;
  t.style = 'run';
  t.hop = 0.07;
  t.hops = 1;
  t.glass = 0.85;
  t.rim = '#dff0ff';
  t.rimK = 0.6;
  t.front = 1.0;
}

// ───────────────────────────── forge ─────────────────────────────

function salamander(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const blk = new THREE.Color('#1c1216'), lava = new THREE.Color('#ff7a2a');
  const spot = (p: THREE.Vector3) => hash(Math.round(p.x * 7), Math.round(p.y * 7), Math.round(p.z * 7)) > 0.7 && Math.abs(Math.sin(p.x * 21) * Math.sin(p.z * 17)) > 0.55;
  const skinP: Painter = (p, n) => (spot(p) && n.y > -0.3 ? _c.copy(lava) : _c.copy(blk).lerp(new THREE.Color('#4a2a30'), smooth(-0.2, -0.8, n.y)));
  const skin = (g: Geo) => glowBy(paint(g, skinP, 1.4), (p) => (spot(p) ? 1 : 0));
  b.add('b', 'g', skin(at(ell(0.3, 0.2, 0.64, 24, 14), 0, 0.32, 0)));
  b.add('b', 'g', skin(at(ell(0.27, 0.15, 0.28, 20, 12), 0, 0.36, 0.72)));
  eyes2(b, 'b', 'g', 0.15, 0.46, 0.86, 0.07, { white: '#ffe9a0', glow: 0.7, small: 0.42, brow: 0.35, browCol: '#ff7a2a' });
  stitchX(b, 'b', 'g', 0, 0.3, 0.99, 0.06, { col: '#ffd9a0' });
  // feathery gills burning at the tips
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
    const c = new THREE.CatmullRomCurve3([V(sd * 0.2, 0.4 + i * 0.04, 0.62), V(sd * (0.35 + i * 0.03), 0.52 + i * 0.08, 0.52), V(sd * (0.42 + i * 0.04), 0.66 + i * 0.1, 0.42)]);
    b.add('gills', 'g', paint(taperTube(c, 10, 0.03, 0.012, 5), '#4a1a20'));
    for (let k = 1; k < 6; k++) {
      const q = c.getPointAt(k / 6);
      b.add('gills', 'f', paint(at(ell(0.02, 0.05, 0.02).rotateZ(sd * 0.8), q.x, q.y + 0.03, q.z), '#ff5a3a', 1.4));
    }
  }
  // the tail
  const tc = new THREE.CatmullRomCurve3([V(0, 0.3, -0.55), V(0.22, 0.24, -1.05), V(0.08, 0.17, -1.55), V(-0.2, 0.13, -1.85), V(-0.3, 0.14, -1.7)]);
  b.add('tail', 'g', glowBy(paint(taperTube(tc, 30, 0.2, 0.025, 10), skinP, 1.4), (p) => (spot(p) ? 1 : 0)));
  // splayed legs, elbows out
  [[0.28, 0.38], [0.28, -0.4]].forEach(([x, z], i) => {
    for (const sd of [-1, 1]) {
      const P = `leg${i * 2 + (sd > 0 ? 1 : 0)}`;
      const c = new THREE.CatmullRomCurve3([V(sd * x * 0.8, 0.3, z), V(sd * (x + 0.2), 0.36, z + 0.04), V(sd * (x + 0.28), 0.05, z + 0.1)]);
      b.add(P, 'g', paint(taperTube(c, 10, 0.07, 0.045, 6), '#2a1a1e'));
      for (const a of [-0.6, 0, 0.6]) b.add(P, 'g', paint(at(ell(0.025, 0.015, 0.07).rotateY(a), sd * (x + 0.28) + Math.sin(a) * 0.05, 0.015, z + 0.15 + Math.cos(a) * 0.04), '#2a1a1e'));
    }
  });
  // the stolen pan pipes: a crest of copper pipes along its spine, breathing fire
  const n = 7;
  for (let i = 0; i < n; i++) {
    const z = 0.42 - i * 0.14, h = 0.56 - i * 0.055;
    b.add('pipes', 'x', paint(at(cyl(0.045, 0.045, h, 10), 0, 0.45 + h / 2, z), (p) => _c.set('#b8602a').lerp(new THREE.Color('#ffb070'), smooth(0.45, 0.45 + h, p.y) * 0.6)));
    b.add('pipes', 'f', paint(at(torus(0.04, 0.012, 4, 10).rotateX(Math.PI / 2), 0, 0.45 + h, z), '#ffd070', 1.6));
    b.add('flames', 'f', paint(at(cone(0.045, 0.22, 6), 0, 0.45 + h + 0.12, z), (p) => _c.set('#ff6a1f').lerp(new THREE.Color('#ffe08a'), 0.4), 1.8));
  }
  for (const y of [0.55, 0.72]) b.add('pipes', 'x', paint(box(0.12, 0.04, 0.95).translate(0, y, -0.0), GOLD_D));
  for (let i = 0; i < n; i++) {
    const z = 0.42 - i * 0.14, h = 0.56 - i * 0.055;
    b.add('ph1', 'f', paint(at(cone(0.08, 0.5, 6), 0, 0.45 + h + 0.3, z - 0.04).rotateX(0), (p) => _c.set('#ff4a1a').lerp(new THREE.Color('#ffe08a'), 0.2), 2));
  }
  J('b', body);
  J('gills', body, V(0, 0.42, 0.62));
  J('tail', body, V(0, 0.3, -0.55));
  for (let i = 0; i < 4; i++) J(`leg${i}`, body, V((i % 2 ? 1 : -1) * 0.22, 0.3, i < 2 ? 0.38 : -0.4));
  J('pipes', body);
  J('flames', body, V(0, 0.9, 0), V(0, 0, 0), false);
  J('ph1', body, V(0, 0.9, 0), V(0, 0, 0), false);
  root(t).scale.setScalar(1.15);
  t.height = 1.15;
  t.style = 'run';
  t.hop = 0.03;
  t.hops = 2;
  t.rim = '#ffb070';
  t.rimK = 0.5;
  t.front = 1.0;
}

function magmaCrab(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const basalt = new THREE.Color('#2a2224'), lava = new THREE.Color('#ff6a1f');
  const crack = (p: THREE.Vector3) => Math.abs(Math.sin(p.x * 9.3 + p.y * 3.1) * Math.sin(p.z * 8.1 - p.y * 5.7));
  const rock = (g: Geo, k = 1) => glowBy(paint(facet(g), (p) => (crack(p) < 0.07 * k ? _c.copy(lava) : _c.copy(basalt).multiplyScalar(0.85 + 0.35 * smooth(0.3, 1.1, p.y))), 1.5), (p) => (crack(p) < 0.07 * k ? 1 : 0));
  b.add('b', 'g', rock(new THREE.SphereGeometry(1, 26, 14).scale(0.82, 0.38, 0.62).translate(0, 0.66, 0)));
  // its shell is the stolen steel drum: a dish of hammered copper with glowing notes
  b.add('b', 'x', paint(lathe([[0, 0.93], [0.25, 0.94], [0.42, 0.97], [0.5, 1.02], [0.54, 1.05], [0.56, 1.02], [0.56, 0.9]], 30), (p) => _c.set('#c8823a').lerp(new THREE.Color('#ffd08a'), smooth(0.93, 1.05, p.y) * 0.4)));
  b.add('b', 'x', paint(at(torus(0.55, 0.03, 5, 30).rotateX(Math.PI / 2), 0, 1.05, 0), GOLD));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, r = i ? 0.33 : 0;
    b.add('notes', 'f', paint(at(scl(sph(0.08 + (i ? 0 : 0.03), 12, 6), 1, 0.15, 0.8).rotateY(-a), Math.cos(a) * r, 0.95 + r * 0.06, Math.sin(a) * r), '#ffb060', 0.7));
  }
  // armour slabs that fall away in phase 1
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    b.add('pre1', 'g', paint(facet(new THREE.DodecahedronGeometry(0.2, 0)).scale(1.4, 0.55, 1).rotateY(-a).translate(Math.cos(a) * 0.68, 0.86, Math.sin(a) * 0.5), (p) => _c.copy(basalt).multiplyScalar(1.1 + 0.3 * smooth(0.8, 1, p.y))));
  }
  // face: eyes on stalks, mandibles, the X
  for (const sd of [-1, 1]) {
    b.add('stalks', 'g', paint(alongY(capsule(0.035, 0.3, 3, 6), V(sd * 0.2, 1.02, 0.52), V(sd * 0.15, 1, 0.2)), '#3a2a2a'));
    b.add('stalks', 'g', paint(at(sph(0.09, 14, 10), sd * 0.23, 1.22, 0.57), '#f6f2ea', 0.2), paint(at(scl(sph(0.05, 10, 8), 1, 1.1, 0.5), sd * 0.23, 1.22, 0.64), '#1a0d0d'), paint(at(sph(0.016, 6, 4), sd * 0.23 + 0.02, 1.25, 0.66), '#ffffff', 1));
    b.add('stalks', 'g', paint(at(box(0.15, 0.035, 0.05).rotateZ(sd * 0.4), sd * 0.23, 1.33, 0.58), '#1a1214'));
  }
  b.add('b', 'g', paint(at(ell(0.3, 0.14, 0.12), 0, 0.6, 0.56), '#3a2224'));
  stitchX(b, 'b', 'g', 0, 0.6, 0.67, 0.08, { col: '#ffd9a0' });
  for (const sd of [-1, 1]) b.add('b', 'g', paint(at(cone(0.05, 0.16, 5).rotateX(Math.PI / 2 + 0.6), sd * 0.12, 0.5, 0.66), '#1a1214'));
  // the claws: one giant, one small
  for (const sd of [-1, 1]) {
    const k = sd > 0 ? 1 : 0.62;
    const P = sd < 0 ? 'clawL' : 'clawR', F = sd < 0 ? 'fingL' : 'fingR';
    const s0 = V(sd * 0.62, 0.6, 0.34), s1 = V(sd * (0.62 + 0.34 * k), 0.66, 0.34 + 0.3 * k);
    b.add(P, 'g', rock(new THREE.CylinderGeometry(0.1 * k, 0.12 * k, s0.distanceTo(s1), 8).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), s1.clone().sub(s0).normalize())).translate((s0.x + s1.x) / 2, (s0.y + s1.y) / 2, (s0.z + s1.z) / 2)));
    const palm = V(sd * (0.7 + 0.42 * k), 0.74, 0.5 + 0.48 * k);
    b.add(P, 'g', rock(new THREE.SphereGeometry(1, 14, 10).scale(0.22 * k, 0.2 * k, 0.3 * k).translate(palm.x, palm.y, palm.z)));
    b.add(P, 'g', rock(new THREE.ConeGeometry(0.11 * k, 0.42 * k, 8).rotateX(Math.PI / 2).translate(palm.x - sd * 0.04 * k, palm.y - 0.08 * k, palm.z + 0.42 * k)));
    b.add(P, 'f', paint(at(sph(0.03 * k + 0.01, 6, 4), palm.x - sd * 0.04 * k, palm.y - 0.08 * k, palm.z + 0.62 * k), '#ffb060', 1.6));
    b.add(F, 'g', rock(new THREE.ConeGeometry(0.09 * k, 0.4 * k, 8).rotateX(Math.PI / 2 - 0.1).translate(palm.x + sd * 0.02 * k, palm.y + 0.12 * k, palm.z + 0.4 * k)));
  }
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = 0.22 - i * 0.2;
    const leg = new THREE.CatmullRomCurve3([V(sd * 0.62, 0.55, z), V(sd * 0.98, 0.72, z - 0.05), V(sd * 1.18, 0.32, z - 0.1), V(sd * 1.24, 0.0, z - 0.14)]);
    b.add(sd < 0 ? 'legsL' : 'legsR', 'g', paint(taperTube(leg, 14, 0.07, 0.025, 6), (p) => (Math.abs(Math.sin(p.y * 20)) < 0.15 ? _c.copy(lava) : _c.copy(basalt))));
  }
  b.add('ph1', 'f', paint(at(torus(0.62, 0.02, 4, 32).rotateX(Math.PI / 2), 0, 0.88, 0).scale(1.15, 1, 0.85), '#ff8a3a', 2));
  J('b', body);
  J('notes', body, V(0, 0, 0), V(0, 0, 0), false);
  J('pre1', body);
  J('stalks', body, V(0, 1.0, 0.5));
  const cl = J('clawL', body, V(-0.62, 0.6, 0.34));
  const cr = J('clawR', body, V(0.62, 0.6, 0.34));
  const pl = V(-(0.7 + 0.42 * 0.62), 0.74, 0.5 + 0.48 * 0.62), pr = V(1.12, 0.74, 0.98);
  J('fingL', cl, pl.clone().add(V(0, 0.12 * 0.62, 0.05)), V(-0.62, 0.6, 0.34));
  J('fingR', cr, pr.clone().add(V(0, 0.12, 0.05)), V(0.62, 0.6, 0.34));
  J('legsL', body, V(-0.62, 0.55, 0));
  J('legsR', body, V(0.62, 0.55, 0));
  J('ph1', body, V(0, 0, 0), V(0, 0, 0), false);
  t.height = 1.4;
  t.style = 'run';
  t.hop = 0.02;
  t.hops = 2;
  t.rim = '#ffa070';
  t.rimK = 0.45;
  t.front = 1.4;
}

function smith(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const ink = new THREE.Color('#231b29'), iron = new THREE.Color('#5c6072');
  const inkP: Painter = (p, n) => _c.copy(ink).lerp(new THREE.Color('#4e3c62'), smooth(0.2, 0.9, n.y) * 0.55);
  const ironP: Painter = (p, n) => _c.copy(iron).multiplyScalar(0.7 + 0.5 * smooth(-0.4, 0.9, n.y));
  for (const sd of [-1, 1]) {
    b.add(sd < 0 ? 'legL' : 'legR', 'g', paint(at(capsule(0.15, 0.26, 3, 8), sd * 0.27, 0.33, 0), inkP), paint(at(ell(0.18, 0.11, 0.26), sd * 0.27, 0.08, 0.07), '#3a2a24'), paint(at(torus(0.16, 0.025, 4, 16).rotateX(Math.PI / 2), sd * 0.27, 0.16, 0.02), '#6a4a34'));
  }
  // a hunched hulk: broad shoulders, narrow waist
  const prof = [[0, 0.5], [0.3, 0.52], [0.36, 0.7], [0.48, 0.95], [0.62, 1.2], [0.66, 1.36], [0.56, 1.5], [0.3, 1.58], [0, 1.6]];
  const hunch = (g: Geo) => g.translate(0, -0.55, 0).rotateX(0.32).translate(0, 0.55, 0);
  b.add('b', 'g', paint(hunch(lathe(prof, 26)), inkP));
  b.add('b', 'x', paint(at(torus(0.34, 0.05, 6, 24).rotateX(Math.PI / 2), 0, 0.64, 0.02), '#5a3826'));
  b.add('b', 'x', paint(at(box(0.16, 0.12, 0.05), 0, 0.64, 0.37), GOLD));
  // leather apron with a pocket of tongs
  const apron = hunch(new THREE.CylinderGeometry(0.5, 0.42, 0.9, 14, 4, true, -0.8, 1.6).translate(0, 1.02, 0.08));
  b.add('b', 'd', paint(apron, (p) => _c.set('#7a4c32').multiplyScalar(0.8 + 0.25 * Math.abs(Math.sin(p.x * 12)))));
  b.add('b', 'd', paint(hunch(box(0.26, 0.2, 0.04).translate(0.15, 0.85, 0.5)), '#5a3624'));
  b.add('b', 'x', paint(hunch(box(0.03, 0.3, 0.03).translate(0.12, 0.98, 0.53)), '#8a8f9c'), paint(hunch(box(0.03, 0.3, 0.03).translate(0.19, 0.98, 0.53)), '#8a8f9c'));
  // great riveted pauldrons
  for (const sd of [-1, 1]) {
    b.add('b', 'x', paint(at(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.75, 1.05).rotateZ(-sd * 0.35), sd * 0.62, 1.42, 0.28), ironP));
    for (let i = 0; i < 4; i++) b.add('b', 'x', paint(at(sph(0.025, 6, 4), sd * (0.5 + i * 0.07), 1.53 - i * 0.04, 0.5), GOLD));
  }
  // head sunk low and forward: a leather cowl, an iron mask with a burning visor slit, the X
  const H = V(0, 1.5, 0.6);
  b.add('b', 'g', paint(at(sph(0.2, 16, 12), H.x, H.y, H.z - 0.04), inkP));
  b.add('b', 'd', paint(new THREE.SphereGeometry(0.25, 18, 10, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.62).translate(H.x, H.y + 0.03, H.z - 0.06), '#4a3024'));
  b.add('b', 'x', paint(new THREE.SphereGeometry(0.2, 16, 10, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.12, Math.PI * 0.66).translate(H.x, H.y, H.z), ironP));
  b.add('b', 'f', paint(at(box(0.26, 0.035, 0.03), H.x, H.y + 0.05, H.z + 0.19), '#ffa040', 2.2));
  for (const sd of [-1, 1]) b.add('b', 'f', paint(at(scl(sph(0.04, 10, 8), 1.4, 0.7, 0.5), sd * 0.075, H.y + 0.05, H.z + 0.2), '#ffd070', 2.4));
  stitchX(b, 'b', 'g', 0, H.y - 0.09, H.z + 0.19, 0.05, { col: '#ffd9a0' });
  // the anvil-bell strapped to its back with chains
  const anvil = merge([
    paint(box(0.4, 0.16, 0.26).translate(0, 0.1, 0), '#3a3c48'),
    paint(box(0.22, 0.12, 0.18).translate(0, -0.02, 0), '#30323c'),
    paint(box(0.34, 0.07, 0.22).translate(0, -0.1, 0), '#3a3c48'),
    paint(cone(0.08, 0.3, 8).rotateZ(Math.PI / 2).translate(0.34, 0.12, 0), '#3a3c48'),
    paint(box(0.4, 0.015, 0.26).translate(0, 0.185, 0), '#b8bccc'),
  ]);
  b.add('anvil', 'x', anvil.rotateX(-0.5).translate(0, 1.5, -0.32));
  b.add('anvil', 'x', paint(bellGeo(0.34, GOLD, GOLD_D), (p) => _c.set(GOLD).lerp(new THREE.Color('#fff0b0'), smooth(-0.3, 0, p.y) * 0.4)).translate(0.36, 1.58, -0.3));
  for (let i = 0; i < 7; i++) b.add('anvil', 'x', paint(at(torus(0.045, 0.014, 4, 8).rotateY(i % 2 ? Math.PI / 2 : 0).rotateZ(0.8), -0.5 + i * 0.13, 1.62 - i * 0.07, -0.02 - Math.sin((i / 6) * Math.PI) * 0.2), '#7a7e8c'));
  // arms: thin upper arms, huge forearms; the right fist drags the giant hammer, head on the ground
  const sR = V(0.66, 1.34, 0.34), sL = V(-0.66, 1.34, 0.34);
  for (const sd of [-1, 1]) {
    const P = sd < 0 ? 'armL' : 'armR';
    b.add(P, 'g', paint(alongY(capsule(0.11, 0.3, 3, 8), V(sd * 0.7, 1.12, 0.34), V(sd * 0.1, 1, 0)), inkP));
    b.add(P, 'g', paint(at(ell(0.2, 0.3, 0.2, 16, 12), sd * 0.72, 0.74, 0.34), inkP));
    b.add(P, 'd', paint(at(torus(0.19, 0.035, 4, 16).rotateX(Math.PI / 2), sd * 0.72, 0.62, 0.34), '#6a4a34'));
    b.add(P, 'g', paint(at(sph(0.16, 14, 10), sd * 0.72, 0.44, 0.34), inkP));
  }
  const hx = 0.72, hz = 0.34;
  b.add('armR', 'x', paint(at(cyl(0.05, 0.055, 0.72, 8), hx, 0.24, hz), '#6a4a34'));
  b.add('armR', 'x', paint(at(torus(0.06, 0.018, 4, 10).rotateX(Math.PI / 2), hx, 0.36, hz), GOLD));
  const hy = -0.22;
  b.add('armR', 'x', paint(at(box(0.52, 0.4, 0.62), hx, hy, hz), (p) => (p.y < hy - 0.17 ? _c.set('#ff8a3a') : _c.copy(iron).multiplyScalar(0.75 + 0.35 * smooth(hy - 0.2, hy + 0.2, p.y)))));
  b.add('armR', 'x', paint(at(box(0.56, 0.07, 0.66), hx, hy + 0.15, hz), '#3a3c48'), paint(at(box(0.56, 0.07, 0.66), hx, hy - 0.12, hz), '#3a3c48'));
  b.add('armR', 'f', paint(at(box(0.48, 0.03, 0.58), hx, hy - 0.205, hz), '#ffa040', 1.8));
  xGlyph(b, 'armR', V(hx, hy, hz + 0.315), Z, 0.22, '#ff9a4a', 1.6);
  b.add('ph1', 'f', paint(at(box(0.55, 0.43, 0.65), hx, hy, hz), '#ffd8a0', 1.4));
  // phase 1: the furnace in its chest opens
  b.add('ph1b', 'f', paint(new THREE.OctahedronGeometry(0.15, 0).scale(1, 1.3, 0.6).translate(0, 1.12, 0.62), '#ff7a2a', 2.2));
  b.add('ph1b', 'f', paint(at(torus(0.18, 0.025, 5, 18), 0, 1.12, 0.6), '#ffc070', 1.6));
  J('legL', body, V(-0.27, 0.6, 0));
  J('legR', body, V(0.27, 0.6, 0));
  J('b', body);
  J('anvil', body);
  const ar = J('armR', body, sR);
  J('ph1', ar, V(hx, hy, hz), sR, false);
  J('armL', body, sL);
  J('ph1b', body, V(0, 0, 0), V(0, 0, 0), false);
  root(t).scale.setScalar(1.08);
  t.height = 1.8;
  t.style = 'march';
  t.rim = '#ffb070';
  t.rimK = 0.45;
  t.front = 0.95;
}

// ───────────────────────────── citadel ─────────────────────────────

function gargoyle(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const st = new THREE.Color('#6a6480'), dk = new THREE.Color('#2a2638');
  const stoneP: Painter = (p, n) => _c.copy(dk).lerp(st, smooth(-0.6, 0.6, n.y) * 0.7 + 0.3).multiplyScalar(0.9 + hash(p.x, p.y, p.z) * 0.14);
  b.add('b', 'g', paint(at(ell(0.27, 0.32, 0.27, 20, 14), 0, 0, 0), stoneP));
  b.add('b', 'g', paint(at(sph(0.2, 18, 14), 0, 0.33, 0.16), stoneP));
  b.add('b', 'g', paint(at(ell(0.13, 0.09, 0.12), 0, 0.27, 0.33), stoneP));
  eyes2(b, 'b', 'g', 0.085, 0.385, 0.315, 0.056, { brow: 0.6, white: '#efe6ff', pupil: '#3a1a6a', glow: 0.6, small: 0.45 });
  stitchX(b, 'b', 'g', 0, 0.24, 0.45, 0.045);
  for (const sd of [-1, 1]) {
    b.add('b', 'g', paint(at(cone(0.022, 0.07, 4).rotateX(Math.PI), sd * 0.07, 0.2, 0.42), '#e8e2f0'));
    b.add('b', 'g', paint(alongY(cone(0.06, 0.2, 5), V(sd * 0.17, 0.45, 0.12), V(sd * 0.8, 0.6, -0.2)), stoneP));
    const horn = new THREE.CatmullRomCurve3([V(sd * 0.1, 0.48, 0.18), V(sd * 0.18, 0.62, 0.08), V(sd * 0.22, 0.66, -0.1), V(sd * 0.16, 0.56, -0.2)]);
    b.add('b', 'g', paint(taperTube(horn, 12, 0.045, 0.01, 6), '#2a2638'));
  }
  // haunches, clawed feet tucked under, little arms clutching a chain
  for (const sd of [-1, 1]) {
    b.add('b', 'g', paint(at(ell(0.12, 0.16, 0.18), sd * 0.18, -0.2, 0.05), stoneP));
    for (const a of [-0.4, 0, 0.4]) b.add('b', 'g', paint(alongY(cone(0.02, 0.08, 4), V(sd * 0.18 + a * 0.08, -0.36, 0.17), V(0, -0.4, 1)), '#1a1626'));
    b.add('b', 'g', paint(alongY(capsule(0.045, 0.16, 2, 6), V(sd * 0.16, 0.02, 0.24), V(-sd * 0.3, -0.6, 0.5)), stoneP));
  }
  // the stolen bronze bell on a chain round its neck
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    b.add('bell', 'x', paint(at(torus(0.03, 0.01, 4, 8).rotateY(i % 2 ? Math.PI / 2 : 0), Math.cos(a) * 0.18, 0.12 - Math.sin(a) * 0.12, 0.26), '#8a7a5a'));
  }
  b.add('bell', 'x', paint(bellGeo(0.26, '#c8933a', '#6a4a1a'), (p) => _c.set('#c8933a').lerp(new THREE.Color('#ffd08a'), smooth(-0.2, 0, p.y) * 0.4)).translate(0, -0.02, 0.32));
  // bat wings of stone with finger bones
  const wing: [number, number][] = [[0, 0.12], [0.35, 0.3], [0.75, 0.34], [1.05, 0.2], [0.95, 0.02], [0.82, -0.04], [0.72, -0.18], [0.55, -0.12], [0.42, -0.26], [0.26, -0.15], [0.1, -0.2], [0, -0.06]];
  for (const sd of [-1, 1]) {
    const w = fan(wing, (tt) => _c.copy(dk).lerp(st, 0.35 + tt * 0.35), undefined, 5);
    const bones: Geo[] = [];
    for (const [x, z] of [[1.05, 0.2], [0.82, -0.04], [0.55, -0.12], [0.26, -0.15]]) {
      const l = Math.hypot(x, z);
      bones.push(paint(capsule(0.016, l, 2, 4).rotateZ(Math.PI / 2).rotateY(-Math.atan2(z, x)).translate(x / 2, 0.01, z / 2), '#3a3448'));
    }
    const g = merge([w, ...bones]);
    if (sd < 0) g.scale(-1, 1, 1);
    b.add(sd < 0 ? 'wingL' : 'wingR', 'd', g);
  }
  const tc = new THREE.CatmullRomCurve3([V(0, -0.15, -0.2), V(0, -0.3, -0.45), V(0, -0.2, -0.7), V(0, -0.05, -0.82)]);
  b.add('tail', 'g', paint(taperTube(tc, 16, 0.05, 0.02, 6), stoneP), paint(new THREE.OctahedronGeometry(0.07, 0).scale(0.4, 1.1, 1.2).translate(0, -0.02, -0.88), '#2a2638'));
  // phase 1: cracks of violet light split its stone
  for (const [x, y, z, a] of [[0.12, 0.05, 0.22, 0.4], [-0.15, -0.08, 0.2, -0.6], [0.05, 0.35, 0.34, 1.2], [-0.2, 0.1, -0.1, 0.2], [0.22, -0.05, -0.05, -0.3]] as [number, number, number, number][]) {
    const n = V(x, y - 0.05, z).normalize();
    b.add('ph1', 'f', place(paint(merge([box(0.02, 0.16, 0.01).rotateZ(a), box(0.02, 0.1, 0.01).rotateZ(a + 1).translate(0.03, 0.06, 0)]), VIO, 2), V(x, y, z).addScaledVector(n, 0.01), n));
  }
  J('b', body);
  J('bell', body, V(0, 0.12, 0.26));
  body.add(b.into('wingL', grp('wingL', -0.2, 0.12, -0.05)), b.into('wingR', grp('wingR', 0.2, 0.12, -0.05)));
  J('tail', body, V(0, -0.15, -0.2));
  J('ph1', body, V(0, 0, 0), V(0, 0, 0), false);
  root(t).scale.setScalar(1.25);
  t.height = 0.95;
  t.style = 'fly';
  t.flap = 5;
  t.rim = '#cbbcff';
  t.rimK = 0.45;
  t.front = 0.55;
}

function organist(b: Bins, t: Tpl, body: THREE.Group, J: Joint) {
  const robeP: Painter = (p) => _c.set('#140c22').lerp(new THREE.Color('#4a2a72'), smooth(0.1, 1.5, p.y) * 0.8);
  const prof = [[0, 1.62], [0.17, 1.6], [0.25, 1.5], [0.28, 1.3], [0.33, 1.0], [0.42, 0.62], [0.53, 0.28], [0.6, 0.06]];
  const robe = lathe(prof, 30);
  const rp = robe.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i);
    if (y < 0.3) rp.setY(i, y + Math.max(0, Math.sin(Math.atan2(rp.getZ(i), rp.getX(i)) * 7)) * 0.16 * (1 - y / 0.3));
  }
  robe.computeVertexNormals();
  b.add('b', 'd', paint(robe, robeP));
  b.add('b', 'd', paint(new THREE.SphereGeometry(0.3, 20, 12, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.7).scale(1, 1.25, 1.05).translate(0, 1.66, 0.04), robeP));
  b.add('b', 'g', paint(at(sph(0.2, 14, 10), 0, 1.66, 0.0), '#0c0716'));
  b.add('b', 'g', paint(at(scl(sph(0.17, 16, 12), 1, 1.25, 0.5), 0, 1.66, 0.2), '#f3eff6'));
  for (const sd of [-1, 1]) b.add('b', 'g', paint(at(scl(sph(0.036, 8, 6), 1.4, 0.8, 0.4), sd * 0.062, 1.71, 0.278), '#120d1c'), paint(at(sph(0.013, 6, 4), sd * 0.062, 1.71, 0.29), VIO, 1.8));
  stitchX(b, 'b', 'g', 0, 1.57, 0.276, 0.045, { col: '#2a2033', hole: '#5a4a6a' });
  b.add('b', 'g', paint(at(box(0.012, 0.12, 0.01).rotateZ(0.3), 0.05, 1.8, 0.27), '#8a7a9a'));
  // long sleeves and bony fingers reaching for the keys
  for (const sd of [-1, 1]) {
    const P = sd < 0 ? 'armL' : 'armR';
    const c = new THREE.CatmullRomCurve3([V(sd * 0.24, 1.45, 0.02), V(sd * 0.34, 1.25, 0.25), V(sd * 0.26, 1.1, 0.52)]);
    b.add(P, 'd', paint(taperTube(c, 12, 0.075, 0.05, 8), robeP));
    for (let f = 0; f < 4; f++) b.add(P, 'g', paint(alongY(capsule(0.01, 0.09, 2, 4), V(sd * (0.2 + f * 0.03), 1.05, 0.6), V(0, -0.6, 0.5)), '#e8e2f0'));
  }
  // the floating console: keys, gilt trim, a music stand with a page sewn with an X
  b.add('console', 'g', paint(at(box(0.92, 0.1, 0.34), 0, 0.98, 0.64), '#3a1f30'));
  b.add('console', 'x', paint(at(box(0.96, 0.02, 0.36), 0, 1.035, 0.64), GOLD));
  b.add('console', 'g', paint(at(box(0.92, 0.5, 0.06), 0, 0.72, 0.5), '#2a1624'));
  for (let i = 0; i < 14; i++) b.add('console', 'g', paint(at(box(0.055, 0.025, 0.14), -0.39 + i * 0.06, 1.05, 0.74), '#f4efe2'));
  for (let i = 0; i < 13; i++) if (i % 7 !== 2 && i % 7 !== 6) b.add('console', 'g', paint(at(box(0.03, 0.03, 0.08), -0.36 + i * 0.06, 1.07, 0.7), '#140c16'));
  b.add('console', 'g', paint(at(box(0.4, 0.28, 0.015).rotateX(-0.35), 0, 1.25, 0.52), '#ece4d0'));
  xGlyph(b, 'console', V(0, 1.25, 0.535), V(0, 0.33, 0.94), 0.12, VIO, 1.3);
  // the fan of organ pipes rising behind it like a crown
  const pipes = 9;
  for (let i = 0; i < pipes; i++) {
    const k = (i - (pipes - 1) / 2) / ((pipes - 1) / 2);
    const h = 1.9 - Math.abs(k) * 0.95, r = 0.075 - Math.abs(k) * 0.018;
    const tilt = k * 0.22;
    const g = merge([
      paint(at(cyl(r, r, h, 12), 0, h / 2, 0), (p) => _c.set(i % 2 ? '#c8ccd8' : '#e2c46a').multiplyScalar(0.75 + 0.35 * smooth(0, h, p.y))),
      paint(at(cone(r, r * 2.2, 12).rotateX(Math.PI), 0, -r * 1.1, 0), i % 2 ? '#9aa0b4' : GOLD_D),
      paint(at(box(r * 1.1, r * 0.9, 0.02), 0, h * 0.2, r * 0.98), '#1a1024'),
    ]);
    b.add('pipes', 'x', g.rotateZ(-tilt).translate(k * 0.82, 0.85, -0.38 - (1 - Math.abs(k)) * 0.08));
    b.add('mouths', 'f', paint(at(box(r * 1.1, 0.018, 0.02), 0, h * 0.2 + r * 0.45, r + 0.01), VIO, 1.6).rotateZ(-tilt).translate(k * 0.82, 0.85, -0.38 - (1 - Math.abs(k)) * 0.08));
    b.add('ph1', 'f', paint(at(cone(r * 0.9, 0.3, 8), 0, h + 0.15, 0), '#c8a8ff', 2).rotateZ(-tilt).translate(k * 0.82, 0.85, -0.38 - (1 - Math.abs(k)) * 0.08));
  }
  b.add('pipes', 'g', paint(at(box(1.9, 0.16, 0.24), 0, 0.82, -0.4), '#3a1f30'));
  b.add('pipes', 'x', paint(at(box(1.94, 0.03, 0.26), 0, 0.91, -0.4), GOLD));
  J('b', body);
  J('armL', body, V(-0.24, 1.45, 0.02));
  J('armR', body, V(0.24, 1.45, 0.02));
  J('console', body, V(0, 0.98, 0.64));
  J('pipes', body, V(0, 0.85, -0.4));
  J('mouths', body, V(0, 0.85, -0.4), V(0, 0, 0), false);
  J('ph1', body, V(0, 0.85, -0.4), V(0, 0, 0), false);
  t.height = 2.75;
  t.style = 'float';
  t.hover = 0.3;
  t.rim = '#b9a6ff';
  t.rimK = 0.6;
  t.front = 0.8;
}

function twin(b: Bins, t: Tpl, body: THREE.Group, J: Joint, variant: number) {
  // the sun twin: ivory and gold · the moon twin: ink and silver (and mirrored)
  const moon = variant % 2 === 1;
  const steel = new THREE.Color(moon ? '#211d30' : '#d9dbe8'), trim = moon ? '#c9d2ee' : '#e9b949', cloth = moon ? '#3b2672' : '#b8402e', glow = moon ? '#bfe4ff' : '#ffd36b';
  const steelP: Painter = (p, n) => _c.copy(steel).multiplyScalar(0.8 + 0.4 * smooth(-0.3, 0.9, n.y));
  for (const sd of [-1, 1]) {
    b.add(sd < 0 ? 'legL' : 'legR', 'x', paint(at(cyl(0.08, 0.09, 0.5, 10), sd * 0.13, 0.3, 0), steelP), paint(at(ell(0.1, 0.07, 0.17), sd * 0.13, 0.05, 0.05), steelP), paint(at(sph(0.085, 10, 8), sd * 0.13, 0.5, 0.03), trim));
  }
  const prof = [[0.0, 0.56], [0.26, 0.58], [0.31, 0.78], [0.34, 1.0], [0.3, 1.16], [0.16, 1.22], [0, 1.23]];
  b.add('b', 'x', paint(lathe(prof, 24), steelP));
  b.add('b', 'x', paint(at(torus(0.3, 0.025, 5, 26).rotateX(Math.PI / 2), 0, 0.74, 0), trim));
  // tabard with the emblem: a sun or a crescent moon
  b.add('b', 'd', paint(at(box(0.36, 0.72, 0.015), 0, 0.68, 0.33), (p) => (p.y < 0.36 ? _c.set(trim) : _c.set(cloth))));
  if (!moon) {
    b.add('b', 'f', paint(new THREE.CircleGeometry(0.08, 20).translate(0, 0.86, 0.345), glow, 1.4));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add('b', 'f', paint(cone(0.02, 0.06, 4).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.12, 0.86 + Math.sin(a) * 0.12, 0.345), glow, 1.4));
    }
  } else {
    const cr = new THREE.Shape();
    cr.absarc(0, 0, 0.1, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0.045, 0.02, 0.085, 0, Math.PI * 2, true);
    cr.holes.push(hole);
    b.add('b', 'f', paint(new THREE.ShapeGeometry(cr, 16).translate(0, 0.86, 0.345), glow, 1.4));
  }
  // pauldrons, the helm with the porcelain mask, a tuning-fork crest
  for (const sd of [-1, 1]) {
    b.add('b', 'x', paint(at(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.8, 1.1), sd * 0.35, 1.12, 0), steelP));
    b.add('b', 'x', paint(at(torus(0.17, 0.016, 5, 20).rotateX(Math.PI / 2), sd * 0.35, 1.12, 0), trim));
  }
  b.add('b', 'x', paint(at(cyl(0.17, 0.18, 0.3, 18), 0, 1.38, 0), steelP));
  b.add('b', 'x', paint(at(new THREE.SphereGeometry(0.17, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.53, 0), steelP));
  b.add('b', 'x', paint(at(box(0.04, 0.22, 0.03), 0, 1.47, 0.175), trim));
  b.add('b', 'g', paint(at(scl(sph(0.11, 16, 12), 1, 1.2, 0.35), 0, 1.36, 0.16), '#f3eff6'));
  for (const sd of [-1, 1]) b.add('b', 'g', paint(at(box(0.07, 0.022, 0.01), sd * 0.055, 1.42, 0.2), '#120d1c'), paint(at(sph(0.01, 6, 4), sd * 0.055, 1.42, 0.207), glow, 1.8));
  stitchX(b, 'b', 'g', 0, 1.3, 0.2, 0.035, { col: '#2a2033', hole: '#5a4a6a' });
  b.add('b', 'x', paint(at(cyl(0.022, 0.022, 0.18, 6), 0, 1.78, 0), trim));
  b.add('b', 'x', paint(at(torus(0.09, 0.022, 6, 16, Math.PI).rotateZ(Math.PI), 0, 1.92, 0), trim));
  for (const sd of [-1, 1]) {
    b.add('b', 'x', paint(at(cyl(0.022, 0.022, 0.26, 6), sd * 0.09, 2.05, 0), trim));
    b.add('b', 'f', paint(at(sph(0.03, 8, 6), sd * 0.09, 2.19, 0), glow, 1.6));
  }
  // the cape
  const capeG = new THREE.PlaneGeometry(0.56, 0.95, 6, 6).translate(0, -0.475, 0);
  const cp = capeG.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, -Math.sin(cp.getX(i) * 8) * 0.03 * -cp.getY(i) - cp.getY(i) * -0.1);
  capeG.computeVertexNormals();
  b.add('cape', 'd', paint(capeG, (p) => (p.y < -0.86 ? _c.set(trim) : _c.set(cloth).multiplyScalar(0.7))));
  // the sword arm: a great tuning-fork blade that hums; the shield arm
  const sR = V(0.38, 1.08, 0.05);
  b.add('armR', 'x', paint(alongY(capsule(0.065, 0.36, 3, 8), V(0.42, 0.86, 0.1), V(0.1, 1, -0.2)), steelP), paint(at(sph(0.075, 10, 8), 0.44, 0.64, 0.2), trim));
  const blade = (x: number) => paint(box(0.04, 1.05, 0.02).translate(x, 1.18, 0.24), (p) => _c.set(moon ? '#dfe8ff' : '#fff6dc').multiplyScalar(0.8 + 0.3 * smooth(0.7, 1.7, p.y)));
  b.add('armR', 'x', paint(at(cyl(0.022, 0.022, 0.3, 6), 0.44, 0.62, 0.24), '#3a2a24'));
  b.add('armR', 'x', paint(at(box(0.34, 0.05, 0.06), 0.44, 0.78, 0.24), trim), paint(at(sph(0.04, 8, 6), 0.44, 0.47, 0.24), trim));
  b.add('armR', 'x', blade(0.44 - 0.05), blade(0.44 + 0.05), paint(at(box(0.14, 0.06, 0.03), 0.44, 0.66 + 0.18, 0.24), trim));
  b.add('armR', 'f', paint(at(box(0.012, 0.95, 0.008), 0.44, 1.2, 0.24), glow, 1.8));
  const sL = V(-0.38, 1.08, 0.05);
  b.add('armL', 'x', paint(alongY(capsule(0.065, 0.32, 3, 8), V(-0.42, 0.88, 0.08), V(-0.1, 1, -0.1)), steelP));
  const sh = new THREE.Shape();
  sh.moveTo(-0.2, 0.26);
  sh.quadraticCurveTo(0, 0.34, 0.2, 0.26);
  sh.lineTo(0.19, -0.06);
  sh.quadraticCurveTo(0.12, -0.26, 0, -0.36);
  sh.quadraticCurveTo(-0.12, -0.26, -0.19, -0.06);
  sh.lineTo(-0.2, 0.26);
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 1 });
  b.add('armL', 'x', paint(sg.translate(0, 0, 0).rotateY(-0.35).translate(-0.5, 0.78, 0.2), (p) => (Math.abs(p.x + 0.5) < 0.15 && p.y < 1.0 && p.y > 0.5 ? _c.set(cloth) : _c.set(trim))));
  J('legL', body, V(-0.13, 0.56, 0));
  J('legR', body, V(0.13, 0.56, 0));
  J('b', body);
  J('cape', body, V(0, 1.18, -0.24));
  J('armR', body, sR);
  J('armL', body, sL);
  if (moon) root(t).scale.set(-1, 1, 1);
  root(t).scale.multiplyScalar(1.12);
  t.height = 2.25;
  t.style = 'march';
  t.rim = moon ? '#b9c6ff' : '#ffe6b0';
  t.rimK = 0.5;
  t.front = 0.6;
}

const root = (t: Tpl) => t.root;
function grad2(a: Col, b2: Col, y0: number, y1: number): Painter {
  const A = new THREE.Color(a), B = new THREE.Color(b2);
  return (p) => _c.copy(A).lerp(B, smooth(y0, y1, p.y));
}

// ───────────────────────────── animation ─────────────────────────────

const wave = (x: number) => Math.sin(x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Each mini-boss's own gestures: idle life plus the boss channels (A.wind: the wind-up of a tell,
 * A.strike: the blow, A.recoil: parried, A.roar: its entrance, A.summon…).
 */
export function animateMini(kind: EnemyKind, n: Record<string, THREE.Object3D>, body: THREE.Object3D, A: BossCh, t: number, beat: number, bp: number, speed: number, mats: CharMats | null): void {
  const fast = Math.min(2, speed * 0.35 + 0.4);
  const hit = A.strike, w = A.wind, up = Math.max(A.roar, A.summon);
  const glow = (base: number) => {
    if (mats) mats.flashK.value = base * (1 + A.phase * 0.5) + w * (0.6 + 0.5 * A.pulse) + A.flourish * 0.6;
  };
  switch (kind) {
    case 'toad': {
      const croak = Math.max(0, Math.sin(t * 2.4)) ** 3 * (0.08 + A.phase * 0.12);
      if (n.sac) n.sac.scale.setScalar(1 + croak + w * 0.45 + up * 0.6 - hit * 0.3);
      if (n.tongue) {
        const k = Math.max(0.01, hit * 1.6);
        n.tongue.scale.set(k > 0.02 ? 1 : 0.01, k > 0.02 ? 1 : 0.01, k);
      }
      if (n.hat) n.hat.rotation.z = Math.sin(t * 1.7) * 0.06 + A.recoil * 0.4 - w * 0.1;
      glow(0.5);
      break;
    }
    case 'drumBeetle': {
      const lw = t * 10 * fast;
      if (n.legsL) n.legsL.rotation.x = Math.sin(lw) * 0.22;
      if (n.legsR) n.legsR.rotation.x = -Math.sin(lw) * 0.22;
      const tap = Math.exp(-bp * 9);
      if (n.sticks) n.sticks.rotation.x = 0.22 * (1 - tap) - w * 0.7 + hit * 0.5 - up * 0.3;
      if (n.drum) n.drum.scale.setScalar(1 + tap * 0.035 + hit * 0.08);
      if (n.cym) n.cym.rotation.z = Math.sin(t * 9) * 0.05 * tap + hit * 0.3;
      const open = up * 0.6 + w * 0.25 + (A.phase ? 0.15 : 0);
      if (n.elyL) n.elyL.rotation.z = open;
      if (n.elyR) n.elyR.rotation.z = -open;
      for (const [k, sd] of [['ph1L', -1], ['ph1R', 1]] as [string, number][]) if (n[k]) n[k].rotation.z = sd * Math.sin(t * 40) * 0.15;
      glow(0.4);
      break;
    }
    case 'crow': {
      // its wings: beat slowly, rise for the wind-up, sweep back to dive, spread wide to arrive
      const flap = Math.sin(t * 7);
      let a = 0.15 + flap * 0.55;
      a = lerp(a, 1.15 + Math.sin(t * 20) * 0.04, w);
      a = lerp(a, -0.55, hit);
      a = lerp(a, 0.05 + Math.sin(t * 3) * 0.08, up);
      if (n.wingL) {
        n.wingL.rotation.z = a;
        n.wingL.rotation.y = hit * 0.6;
      }
      if (n.wingR) {
        n.wingR.rotation.z = -a;
        n.wingR.rotation.y = -hit * 0.6;
      }
      if (n.crest) n.crest.rotation.x = -0.2 - w * 0.5 - up * 0.4;
      if (n.tail) n.tail.rotation.x = Math.sin(t * 1.5) * 0.1 + up * -0.3 + hit * 0.3;
      if (n.flute) n.flute.rotation.z = Math.sin(t * 2) * 0.1;
      glow(0.6);
      break;
    }
    case 'sandworm': {
      const sway = Math.sin(t * 1.3);
      if (n.neck) {
        n.neck.rotation.z = sway * 0.08;
        n.neck.rotation.x = Math.sin(t * 0.9) * 0.05 - w * 0.55 + hit * 0.75 + A.dive * 1.1 - A.erupt * 0.3 - up * 0.3;
      }
      if (n.base) n.base.rotation.z = -sway * 0.03;
      // the sand mound stays on the surface while it is under
      if (n.mound) n.mound.position.y = A.sink * 2.1 * 0.9;
      if (n.head) n.head.rotation.z = Math.sin(t * 0.7) * 0.15 + A.dizzy * Math.sin(t * 6) * 0.4;
      glow(0.5);
      break;
    }
    case 'croc': {
      const g = t * 9 * fast;
      for (let i = 0; i < 4; i++) {
        const l = n[`leg${i}`];
        if (l) l.rotation.x = Math.sin(g + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.4;
      }
      if (n.tail) n.tail.rotation.y = Math.sin(t * 3) * 0.18 + w * 0.3;
      if (n.jaw) n.jaw.rotation.x = Math.max(0, w * 0.3 + up * 0.35 - hit * 0.3) + Math.max(0, Math.sin(t * 1.1)) ** 6 * 0.08;
      // the mirage double drifts beside it, shimmering (a second one from phase 1)
      if (n.mirage) {
        n.mirage.position.x = Math.sin(t * 0.9) * 0.25 + 0.45;
        n.mirage.position.z = Math.sin(t * 1.3) * 0.12 - 0.1;
        n.mirage.scale.set(1 + Math.sin(t * 7) * 0.03, 1 - Math.sin(t * 7) * 0.05, 1);
      }
      if (n.ph1) n.ph1.position.x = -Math.sin(t * 0.8 + 1) * 0.25 - 0.45;
      if (mats) mats.get('h').opacity = 0.1 + Math.sin(t * 2.3) * 0.05 + up * 0.15;
      glow(0.5);
      break;
    }
    case 'sphinx': {
      const ph = beat * Math.PI;
      for (let i = 0; i < 4; i++) {
        const l = n[`leg${i}`];
        if (l) l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.3;
      }
      const open = Math.max(A.phase ? 0.75 : 0, up, w * 0.8);
      if (n.wingL) {
        n.wingL.rotation.z = lerp(0.3, 1.1, open) + Math.sin(t * 2) * 0.03 * open;
        n.wingL.rotation.x = open * -0.25;
      }
      if (n.wingR) {
        n.wingR.rotation.z = -lerp(0.3, 1.1, open) - Math.sin(t * 2) * 0.03 * open;
        n.wingR.rotation.x = open * -0.25;
      }
      if (n.halo) n.halo.rotation.z = t * (0.3 + w * 3);
      if (n.ph1) n.ph1.rotation.z = -t * 0.5;
      if (n.tail) n.tail.rotation.y = Math.sin(t * 1.4) * 0.3;
      glow(0.6);
      break;
    }
    case 'yeti': {
      const ph = beat * Math.PI;
      // arms: swing as it walks · spread wide for the wind-up · crash the cymbals together · beat its chest
      let lx = Math.sin(ph) * 0.3, lz = 0, rx = -Math.sin(ph) * 0.3, rz = 0;
      lz = lerp(lz, -1.25, w);
      rz = lerp(rz, 1.25, w);
      lx = lerp(lx, -0.5, w);
      rx = lerp(rx, -0.5, w);
      lx = lerp(lx, -1.3, hit);
      rx = lerp(rx, -1.3, hit);
      lz = lerp(lz, 0.35, hit);
      rz = lerp(rz, -0.35, hit);
      const drum = Math.abs(Math.sin(t * 12));
      lx = lerp(lx, -1.6 - drum * 0.3, up);
      rx = lerp(rx, -1.6 - (1 - drum) * 0.3, up);
      lz = lerp(lz, 0.5, up);
      rz = lerp(rz, -0.5, up);
      if (n.armL) n.armL.rotation.set(lx, 0, lz);
      if (n.armR) n.armR.rotation.set(rx, 0, rz);
      glow(0.4);
      break;
    }
    case 'siren': {
      if (n.hair) {
        n.hair.rotation.x = Math.sin(t * 1.4) * 0.08 - w * 0.2;
        n.hair.rotation.z = Math.sin(t * 1.1) * 0.06;
      }
      if (n.tail) n.tail.rotation.x = Math.sin(t * 1.8) * 0.12 + hit * -0.3;
      if (n.arms) n.arms.rotation.x = -w * 0.9 + hit * 0.4 - up * 0.5;
      if (n.ph1) n.ph1.rotation.x = Math.sin(t * 2.1) * 0.15;
      glow(0.7);
      break;
    }
    case 'stag': {
      const g = beat * Math.PI * 2;
      for (let i = 0; i < 4; i++) {
        const l = n[`leg${i}`];
        if (l) l.rotation.x = Math.sin(g + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.4) * 0.45 * Math.min(1, fast);
      }
      // it lowers its antlers to charge
      if (n.head) n.head.rotation.x = Math.sin(t * 1.2) * 0.04 + w * 0.75 + hit * 0.45 - up * 0.45 - A.recoil * 0.3;
      if (w > 0.05 && n.leg0) n.leg0.rotation.x = -0.6 * w + Math.max(0, Math.sin(t * 14)) * 0.5 * w;
      if (n.chimes) n.chimes.rotation.z = Math.sin(t * 2.3) * 0.08 + Math.sin(t * 17) * 0.04 * (w + hit);
      glow(0.6);
      break;
    }
    case 'salamander': {
      const g = t * 12 * fast;
      for (let i = 0; i < 4; i++) {
        const l = n[`leg${i}`];
        if (l) l.rotation.y = Math.sin(g + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35;
      }
      if (n.tail) n.tail.rotation.y = Math.sin(t * 5) * 0.25;
      body.rotation.y = Math.sin(t * 5 + 1.5) * 0.05;
      if (n.gills) n.gills.scale.setScalar(1 + Math.sin(t * 6) * 0.06 + w * 0.3);
      const fl = 0.8 + Math.sin(t * 23) * 0.15 + Math.sin(t * 37) * 0.1;
      if (n.flames) n.flames.scale.set(1, fl + w * 1.2 + hit * 2, 1);
      if (n.ph1) n.ph1.scale.set(1, fl * 0.9 + hit, 1);
      glow(0.7);
      break;
    }
    case 'magmaCrab': {
      const lw = t * 9 * fast;
      if (n.legsL) n.legsL.rotation.z = Math.sin(lw) * 0.12;
      if (n.legsR) n.legsR.rotation.z = Math.sin(lw + Math.PI) * 0.12;
      const snap = (o: number) => Math.max(0, Math.sin(t * 2.6 + o)) ** 10;
      for (const [P, F, sd, o] of [['clawL', 'fingL', -1, 1.7], ['clawR', 'fingR', 1, 0]] as [string, string, number, number][]) {
        if (n[P]) {
          n[P].rotation.x = -w * 0.9 + hit * 0.5 - up * 0.7;
          n[P].rotation.z = sd * (w * 0.35 + up * 0.5);
        }
        if (n[F]) n[F].rotation.x = -0.3 * snap(o) - w * 0.45 + hit * 0.1;
      }
      if (n.stalks) n.stalks.rotation.z = Math.sin(t * 2) * 0.1;
      if (n.notes) n.notes.scale.setScalar(1 + Math.exp(-bp * 6) * 0.15);
      glow(0.8);
      break;
    }
    case 'smith': {
      const ph = beat * Math.PI;
      if (n.legL) n.legL.rotation.x = Math.sin(ph) * 0.35;
      if (n.legR) n.legR.rotation.x = -Math.sin(ph) * 0.35;
      // the hammer keeps the beat on the anvil: a lift and a strike every beat
      // (the hammer lifts off the ground between beats and drops back on the beat)
      const lift = Math.sin(Math.min(1, bp / 0.85) * Math.PI) ** 2;
      let hx = -0.72 - lift * 0.32;
      hx = lerp(hx, -2.85 - Math.sin(t * 30) * 0.03, w);
      hx = lerp(hx, -0.7, hit);
      hx = lerp(hx, -2.2, up);
      if (n.armR) n.armR.rotation.x = hx;
      if (n.armL) n.armL.rotation.x = Math.sin(ph + 1) * 0.2 - up * 1.4 - w * 0.4;
      glow(0.8);
      break;
    }
    case 'gargoyle': {
      const live = 1 - A.stone;
      const flap = Math.sin(t * 5);
      let a = (0.15 + flap * 0.55) * live + -0.65 * A.stone;
      a = lerp(a, 1.1, w * live);
      a = lerp(a, -0.5, hit);
      a = lerp(a, 0.1, up * live);
      if (n.wingL) n.wingL.rotation.z = a;
      if (n.wingR) n.wingR.rotation.z = -a;
      if (n.bell) n.bell.rotation.x = Math.sin(t * 2.2) * 0.25 * live + hit * 0.6;
      if (n.tail) n.tail.rotation.y = Math.sin(t * 1.7) * 0.3 * live;
      glow(0.8);
      break;
    }
    case 'organist': {
      const b4 = Math.floor(beat) % 2;
      const press = Math.exp(-bp * 7);
      const ax = (sd: number) => (b4 === (sd < 0 ? 0 : 1) ? press * 0.12 : 0);
      if (n.armL) n.armL.rotation.x = ax(-1) - w * 1.1 + hit * 0.25 - up * 0.8;
      if (n.armR) n.armR.rotation.x = ax(1) - w * 1.1 + hit * 0.25 - up * 0.8;
      if (n.console) n.console.position.y = 0.98 + Math.sin(t * 1.6) * 0.03 - hit * 0.06;
      if (n.pipes) n.pipes.scale.y = 1 + Math.exp(-bp * 5) * 0.02 + hit * 0.06;
      glow(0.6 + Math.exp(-bp * 4) * 0.6);
      break;
    }
    case 'twin': {
      const ph = beat * Math.PI;
      if (n.legL) n.legL.rotation.x = Math.sin(ph) * 0.4;
      if (n.legR) n.legR.rotation.x = -Math.sin(ph) * 0.4;
      let sx = -0.55 + Math.sin(ph) * 0.04;
      sx = lerp(sx, -2.8, w);
      sx = lerp(sx, -0.75, hit);
      sx = lerp(sx, -3.0, up);
      if (n.armR) n.armR.rotation.x = sx;
      if (n.armL) n.armL.rotation.x = -0.2 - w * 0.4 + A.recoil * -0.8;
      if (n.cape) n.cape.rotation.x = 0.15 + Math.sin(t * 2) * 0.05 + w * 0.2;
      glow(0.8);
      break;
    }
  }
  void wave;
}
