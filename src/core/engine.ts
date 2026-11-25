/** Renderer, post-processing (bloom + colour grade with the "colour returns" saturation), loop. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Quality = 'low' | 'medium' | 'high';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.28 },
    uSaturation: { value: 1.0 },
    uContrast: { value: 1.04 },
    uWarmth: { value: 0.015 },
    uGrain: { value: 0.025 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uPulse: { value: 0 },
    uAberration: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uSaturation; uniform float uContrast;
uniform float uWarmth; uniform float uGrain; uniform float uFade; uniform vec3 uFadeColor; uniform vec3 uTint; uniform float uPulse;
uniform float uAberration;
varying vec2 vUv;
float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*0.37) * 43758.5453); }
void main(){
  vec2 d = vUv - 0.5;
  vec4 c = texture2D(tDiffuse, vUv);
  if (uAberration > 0.0) {
    vec2 off = d * uAberration * 0.012;
    c.r = texture2D(tDiffuse, vUv + off).r;
    c.b = texture2D(tDiffuse, vUv - off).b;
  }
  float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
  // desaturated world keeps a faint cold tint (the Silence)
  vec3 grey = vec3(l) * vec3(0.96, 0.98, 1.04);
  c.rgb = mix(grey, c.rgb, uSaturation);
  c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
  c.rgb += vec3(uWarmth, uWarmth*0.4, -uWarmth*0.6) * (1.0 - l);
  c.rgb *= uTint;
  c.rgb *= 1.0 + uPulse * 0.08;
  float v = 1.0 - dot(d, d) * uVignette * 2.2;
  c.rgb *= clamp(v, 0.0, 1.0);
  c.rgb += (rnd(vUv * 731.0) - 0.5) * uGrain * (0.35 + 0.65 * (1.0 - l));
  c.rgb = mix(c.rgb, uFadeColor, uFade);
  gl_FragColor = vec4(max(c.rgb, 0.0), 1.0);
}`,
};

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private renderPass: RenderPass;
  private updaters = new Set<(dt: number, t: number) => void>();
  private last = performance.now();
  time = 0;
  quality: Quality = 'high';
  running = false;
  /** skip 3D rendering (an opaque screen covers everything) */
  paused = false;
  fps = 60;
  /** automatic resolution scale (drops on slow machines) */
  private dynScale = 1;
  private slowFrames = 0;
  private fastFrames = 0;
  autoResolution = true;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(0, 14, 14);
    this.camera.lookAt(0, 0, 0);

    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setScene(scene: THREE.Scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
  }

  private basePixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    const q = this.quality;
    return q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.dynScale = 1;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.bloom.enabled = q !== 'low';
    const samples = q === 'high' ? 4 : q === 'medium' ? 2 : 0;
    const rt = this.composer.renderTarget1 as THREE.WebGLRenderTarget;
    const rt2 = this.composer.renderTarget2 as THREE.WebGLRenderTarget;
    if (rt.samples !== samples) {
      rt.samples = rt2.samples = samples;
      rt.dispose();
      rt2.dispose();
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.basePixelRatio() * this.dynScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    for (const f of this.resizers) f(w, h);
  }

  private resizers: ((w: number, h: number) => void)[] = [];
  onResize(fn: (w: number, h: number) => void) {
    this.resizers.push(fn);
  }

  onUpdate(fn: (dt: number, t: number) => void): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  set saturation(v: number) {
    this.grade.uniforms.uSaturation.value = v;
  }
  get saturation(): number {
    return this.grade.uniforms.uSaturation.value;
  }

  setFade(v: number, color = 0x000000) {
    this.grade.uniforms.uFade.value = v;
    (this.grade.uniforms.uFadeColor.value as THREE.Color).set(color);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const raw = (now - this.last) / 1000;
      const dt = Math.min(0.1, raw);
      this.last = now;
      this.time += dt;
      this.fps = this.fps * 0.95 + (1 / Math.max(raw, 1e-3)) * 0.05;
      this.adapt(raw);
      for (const u of this.updaters) u(dt, this.time);
      if (this.paused) return;
      this.grade.uniforms.uTime.value = this.time;
      this.composer.render(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Lower the resolution when frames are slow, raise it back when there is headroom. */
  private adapt(raw: number) {
    if (!this.autoResolution || this.paused) return;
    if (raw > 1 / 42) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else if (raw < 1 / 57) {
      this.fastFrames++;
      this.slowFrames = Math.max(0, this.slowFrames - 1);
    }
    if (this.slowFrames > 45 && this.dynScale > 0.55) {
      this.dynScale = Math.max(0.55, this.dynScale - 0.12);
      this.slowFrames = 0;
      this.resize();
    } else if (this.fastFrames > 240 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.08);
      this.fastFrames = 0;
      this.resize();
    }
  }

  renderOnce() {
    this.composer.render(0.016);
  }
}
