/**
 * Painted sky: a gradient dome with soft procedural clouds, big hand-drawn cumulus around the
 * horizon, and layered distant mountain rings fading into the haze.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { fbm2, noise2 } from '../core/noise';
import { worldColor } from './worldColor';

export interface SkyStyle {
  top: string;
  horizon: string;
  sunGlow: string;
  cloud: string;
  cloudShade: string;
  sunDir: [number, number, number];
  cloudCover: number;
  stars: number;
  aurora: number;
  mountains: string[]; // near → far
  snow: boolean;
  mountainHeight: number;
}

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private puffs: THREE.Sprite[] = [];

  constructor(style: SkyStyle, seed: number) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(style.top) },
        uHorizon: { value: new THREE.Color(style.horizon) },
        uGlow: { value: new THREE.Color(style.sunGlow) },
        uCloud: { value: new THREE.Color(style.cloud) },
        uShade: { value: new THREE.Color(style.cloudShade) },
        uSun: { value: new THREE.Vector3(...style.sunDir).normalize() },
        uCover: { value: style.cloudCover },
        uStars: { value: style.stars },
        uAurora: { value: style.aurora },
        uTime: { value: 0 },
        uWorldSat: worldColor.uWorldSat,
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uCloud; uniform vec3 uShade; uniform vec3 uSun;
        uniform float uCover; uniform float uStars; uniform float uAurora; uniform float uTime; uniform float uWorldSat;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          float h = clamp(y, 0.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(h, 0.38));
          // below the horizon: a soft haze
          if (y < 0.0) c = mix(uHorizon, uHorizon * 0.92, smoothstep(0.0, -0.3, y));
          float s = max(0.0, dot(d, uSun));
          c += uGlow * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6) * (1.0 - h * 0.5);
          c += vec3(1.0, 0.98, 0.92) * pow(s, 900.0) * 6.0;
          // painted clouds on a high layer
          if (y > 0.015) {
            vec2 uv = d.xz / (y + 0.08) * 1.6;
            vec2 w = vec2(fbm(uv * 0.35 + uTime * 0.004), fbm(uv * 0.35 + 7.3));
            float n = fbm(uv * 0.6 + w * 1.2 + vec2(uTime * 0.01, 0.0));
            float cov = smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, n);
            // light from the sun side: sample the noise a little toward the sun
            float n2 = fbm(uv * 0.6 + w * 1.2 + vec2(uTime * 0.01, 0.0) + uSun.xz * 0.25);
            float lit = clamp(0.55 + (n - n2) * 3.5, 0.0, 1.0);
            vec3 cc = mix(uShade, uCloud, lit);
            cc += uGlow * pow(s, 6.0) * 0.4;
            float fade = smoothstep(0.015, 0.22, y);
            c = mix(c, cc, cov * fade * 0.95);
          }
          if (uStars > 0.0 && y > 0.05) {
            vec2 q = floor(d.xz / (y + 0.3) * 160.0);
            float st = step(0.996, hash(q));
            c += vec3(st) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(q + 3.0) * 30.0)) * uStars * smoothstep(0.05, 0.4, y);
          }
          if (uAurora > 0.0 && y > 0.08) {
            float band = sin(d.x * 5.0 + uTime * 0.12 + sin(d.z * 3.0 + uTime * 0.08) * 1.8);
            float a = smoothstep(0.55, 1.0, band) * smoothstep(0.1, 0.32, y) * smoothstep(0.85, 0.45, y);
            c += mix(vec3(0.2, 1.0, 0.65), vec3(0.6, 0.35, 1.0), smoothstep(0.2, 0.7, y)) * a * 0.45 * uAurora;
          }
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l) * vec3(0.92, 0.95, 1.02), c, clamp(0.5 + uWorldSat * 0.55, 0.0, 1.1));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.mat);
    this.dome.scale.setScalar(1800);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // big cumulus clusters around the horizon: soft spheres, lit by the sun, flat bottoms
    const rng = new Rng(seed * 3 + 11);
    const cloudMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.cloud), emissive: new THREE.Color(style.cloud).lerp(new THREE.Color(style.cloudShade), 0.5), emissiveIntensity: 0.62, fog: false });
    const sphere = new THREE.IcosahedronGeometry(1, 3);
    const parts: THREE.Matrix4[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(1150, 1500);
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      const cy = rng.range(150, 300);
      const w = rng.range(70, 130);
      const n = rng.int(14, 24);
      for (let k = 0; k < n; k++) {
        const r = rng.range(0.25, 0.5) * w * (1 - (k / n) * 0.4);
        const ox = (rng.next() - 0.5) * w * 1.6;
        const oz = (rng.next() - 0.5) * w * 0.6;
        const oy = Math.pow(rng.next(), 1.5) * w * 0.55;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(cx + ox * Math.cos(a + Math.PI / 2) + oz * Math.cos(a), cy + oy + r * 0.2, cz + ox * Math.sin(a + Math.PI / 2) + oz * Math.sin(a)),
          new THREE.Quaternion(),
          new THREE.Vector3(r, r * 0.82, r),
        );
        parts.push(m);
      }
    }
    const clouds = new THREE.InstancedMesh(sphere, cloudMat, parts.length);
    parts.forEach((m, i) => clouds.setMatrixAt(i, m));
    clouds.instanceMatrix.needsUpdate = true;
    clouds.frustumCulled = false;
    clouds.renderOrder = -90;
    this.group.add(clouds);
    void cumulusTexture;
    void this.puffs;

    // distant mountain rings
    this.group.add(buildMountains(style, seed));
  }

  /** Keep the sky centred on the camera. */
  follow(cam: THREE.Camera) {
    this.group.position.set(cam.position.x, 0, cam.position.z);
  }

  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}

function cumulusTexture(style: SkyStyle, seed: number): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  const top = new THREE.Color(style.cloud).convertLinearToSRGB();
  const shade = new THREE.Color(style.cloudShade).convertLinearToSRGB();
  const css = (c: THREE.Color, a: number) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
  for (let v = 0; v < 3; v++) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 280;
    const g = cv.getContext('2d')!;
    const rng = new Rng(seed * 17 + v * 101);
    // a base of rounded puffs, then lit tops
    const puffs: [number, number, number][] = [];
    const n = 46;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const x = 256 + (rng.next() - 0.5) * 380 * (1 - k * 0.55);
      const y = 230 - Math.pow(rng.next(), 0.7) * 150 * k - 14;
      const r = rng.range(22, 48) * (1 - k * 0.3);
      puffs.push([x, y, r]);
    }
    // shadow layer first, then lit layer offset toward the light: crisp, painted edges
    for (const [x, y, r] of puffs) {
      g.fillStyle = css(shade, 1);
      g.beginPath();
      g.arc(x, y + r * 0.12, r, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, y, r] of puffs) {
      const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.5, r * 0.15, x - r * 0.1, y - r * 0.12, r * 0.95);
      grd.addColorStop(0, css(top, 1));
      grd.addColorStop(0.75, css(top.clone().lerp(shade, 0.25), 1));
      grd.addColorStop(1, css(top.clone().lerp(shade, 0.6), 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x - r * 0.08, y - r * 0.1, r * 0.92, 0, Math.PI * 2);
      g.fill();
    }
    // flat-ish bottom shading
    const bot = g.createLinearGradient(0, 180, 0, 260);
    bot.addColorStop(0, 'rgba(0,0,0,0)');
    bot.addColorStop(1, css(shade, 0.35));
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = bot;
    g.fillRect(0, 0, 512, 280);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    out.push(t);
  }
  return out;
}

function buildMountains(style: SkyStyle, seed: number): THREE.Group {
  const group = new THREE.Group();
  const rings = style.mountains.length;
  for (let r = 0; r < rings; r++) {
    const dist = 520 + r * 320;
    const count = 42 + r * 10;
    const positions: number[] = [];
    const colors: number[] = [];
    const base = new THREE.Color(style.mountains[r]);
    const snow = new THREE.Color('#f4f8ff');
    const rng = new Rng(seed * 7 + r * 31);
    // a continuous ridge: a strip of triangles whose top follows noise
    const seg = 360;
    const ridge: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n = fbm2(Math.cos(a) * 3 + r * 10 + seed, Math.sin(a) * 3, 5);
      const peaks = Math.pow(Math.max(0, fbm2(Math.cos(a) * 7 + 40 + r, Math.sin(a) * 7 + seed, 3) + 0.25), 1.6);
      ridge.push((0.35 + n * 0.5 + peaks * 1.3) * style.mountainHeight * (0.7 + r * 0.45));
    }
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = Math.cos(a0) * dist, z0 = Math.sin(a0) * dist;
      const x1 = Math.cos(a1) * dist, z1 = Math.sin(a1) * dist;
      const h0 = ridge[i], h1 = ridge[i + 1];
      const yb = -60;
      // two triangles: base to ridge
      positions.push(x0, yb, z0, x1, yb, z1, x1, h1, z1, x0, yb, z0, x1, h1, z1, x0, h0, z0);
      const shade = (y: number, top: number) => {
        const c = base.clone();
        const k = y / Math.max(1, top);
        c.offsetHSL(0, -0.05, k * 0.08);
        if (style.snow && y > style.mountainHeight * 0.75) c.lerp(snow, 0.85);
        return c;
      };
      for (const [y, top] of [[yb, h0], [yb, h1], [h1, h1], [yb, h0], [h1, h1], [h0, h0]] as [number, number][]) {
        const c = shade(y, top);
        colors.push(c.r, c.g, c.b);
      }
    }
    void count;
    void rng;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -80 + r;
    group.add(m);
  }
  void noise2;
  return group;
}
