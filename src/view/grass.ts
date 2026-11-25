/**
 * A field of grass blades that follows the camera (GPU instancing on a wrapping window, so blades
 * keep their place in the world). Heights and density come from a texture of the landscape.
 * Wind waves roll across the field; the colossus' feet press the grass down.
 */
import * as THREE from 'three';
import type { Landscape } from './landscape';
import { WORLD_COLOR_GLSL, worldColor } from './worldColor';

export interface GrassStyle {
  base: string;
  tip: string;
  dry: string;
  height: number;
}

export class Grass {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshLambertMaterial;
  readonly uniforms: Record<string, THREE.IUniform>;
  private tex: THREE.DataTexture;

  constructor(land: Landscape, style: GrassStyle, count: number, window = 72) {
    const b = land.bounds;
    // landscape texture: R height, G density, B variation
    const tw = Math.ceil((b.maxX - b.minX) / 1) + 1, th = Math.ceil((b.maxZ - b.minZ) / 1) + 1;
    const data = new Uint16Array(tw * th * 4);
    for (let j = 0; j < th; j++) {
      for (let i = 0; i < tw; i++) {
        const x = b.minX + i, z = b.minZ + j;
        const k = (j * tw + i) * 4;
        const wl = land.waterAt(x, z);
        const h = land.heightAt(x, z);
        let dens = land.grassAt(x, z);
        if (wl !== null && h < wl + 0.15) dens = 0;
        data[k] = THREE.DataUtils.toHalfFloat(h);
        data[k + 1] = THREE.DataUtils.toHalfFloat(dens);
        data[k + 2] = THREE.DataUtils.toHalfFloat(Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + 0.5);
        data[k + 3] = THREE.DataUtils.toHalfFloat(1);
      }
    }
    this.tex = new THREE.DataTexture(data, tw, th, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.flipY = false;
    this.tex.needsUpdate = true;

    // one blade: a curved, tapered strip
    const SEG = 4;
    const pos: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const w = 0.5 * (1 - t * 0.85);
      pos.push(-w, t, 0, w, t, 0);
      uvs.push(0, t, 1, t);
    }
    const idx: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const blade = new THREE.InstancedBufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    blade.setIndex(idx);
    const off = new Float32Array(count * 4);
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      off[i * 4] = rnd() * window;
      off[i * 4 + 1] = rnd() * window;
      off[i * 4 + 2] = rnd();
      off[i * 4 + 3] = rnd();
    }
    blade.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    blade.instanceCount = count;

    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uWindow: { value: window },
      uLand: { value: this.tex },
      uBounds: { value: new THREE.Vector4(b.minX, b.minZ, tw, th) },
      uBase: { value: new THREE.Color(style.base) },
      uTip: { value: new THREE.Color(style.tip) },
      uDry: { value: new THREE.Color(style.dry) },
      uHeight: { value: style.height },
      uPush: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uWorldSat: worldColor.uWorldSat,
      uSources: worldColor.uSources,
      uWave: worldColor.uWave,
    };
    const U = this.uniforms;
    this.mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    this.mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOff;
          uniform float uTime; uniform vec2 uCenter; uniform float uWindow; uniform sampler2D uLand; uniform vec4 uBounds;
          uniform float uHeight; uniform vec4 uPush[6];
          varying float vT; varying float vVar; varying vec3 vWorldPosWC; varying float vDry; varying float vFlower;
          vec4 land(vec2 p){ vec2 uv = (p - uBounds.xy + 0.5) / uBounds.zw; return texture2D(uLand, uv); }`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = vec3(0.0, 1.0, 0.0);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 wp = aOff.xy + uWindow * floor((uCenter - aOff.xy) / uWindow + 0.5);
          vec4 L = land(wp);
          float dist = length(wp - uCenter);
          float fade = 1.0 - smoothstep(uWindow * 0.32, uWindow * 0.5, dist);
          float keep = step(aOff.z, L.g) * fade;
          float hgt = uHeight * (0.55 + aOff.w * 0.9) * (0.6 + 0.4 * L.g) * keep;
          float ang = aOff.z * 6.2831;
          vec3 side = vec3(cos(ang), 0.0, sin(ang));
          vec3 transformed = vec3(0.0);
          float t = position.y;
          vT = t; vVar = L.b * 0.6 + aOff.w * 0.4; vDry = smoothstep(0.75, 0.3, L.g); vFlower = step(0.955, fract(aOff.z * 37.0)) * (1.0 + floor(fract(aOff.w * 13.0) * 3.0));
          // wind: steady sway plus big gusts rolling across the field
          float gust = sin(dot(wp, vec2(0.11, 0.07)) - uTime * 1.6) * 0.5 + 0.5;
          gust = gust * gust;
          float sway = sin(uTime * 2.1 + wp.x * 0.7 + wp.y * 0.5) * 0.18 + gust * 0.75;
          vec2 bend = vec2(0.82, 0.57) * sway + vec2(sin(uTime * 1.3 + aOff.z * 9.0), cos(uTime * 1.1 + aOff.w * 7.0)) * 0.08;
          // pressed by the colossus' feet and body
          for (int i = 0; i < 6; i++) {
            vec4 pu = uPush[i];
            if (pu.z <= 0.0) continue;
            vec2 d = wp - pu.xy;
            float l = length(d);
            float k = (1.0 - smoothstep(pu.z * 0.4, pu.z, l)) * pu.w;
            bend += normalize(d + 1e-4) * k * 1.6;
            hgt *= 1.0 - k * 0.55;
          }
          float bt = t * t;
          transformed = side * position.x * 0.17 * keep;
          transformed.y = t * hgt;
          transformed.xz += bend * bt * hgt * 0.8;
          transformed.y -= length(bend) * bt * hgt * 0.25;
          transformed += vec3(wp.x, L.r - 0.02, wp.y);
          vWorldPosWC = transformed;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uDry;
          varying float vT; varying float vVar; varying float vDry; varying float vFlower;
          ${WORLD_COLOR_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 gc = mix(uBase, uTip, smoothstep(0.0, 1.0, vT));
          gc = mix(gc, gc * vec3(1.08, 1.04, 0.86), vVar * 0.6);
          gc = mix(gc, uDry, vDry * 0.6 * vT);
          gc *= 0.62 + 0.38 * smoothstep(0.0, 0.5, vT);
          if (vFlower > 0.5 && vT > 0.78) {
            vec3 fc = vFlower < 1.5 ? vec3(1.0, 0.98, 0.9) : vFlower < 2.5 ? vec3(1.0, 0.82, 0.25) : vec3(1.0, 0.55, 0.72);
            gc = fc;
          }
          diffuseColor.rgb = gc;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          gl_FragColor.rgb = applyWorldColor(gl_FragColor.rgb, vWorldPosWC);`,
        );
    };
    this.mat.customProgramCacheKey = () => 'grass-field';
    this.mesh = new THREE.Mesh(blade, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
  }

  /** Recentre on the point the camera looks at. */
  follow(x: number, z: number) {
    (this.uniforms.uCenter.value as THREE.Vector2).set(x, z);
  }

  /** Up to 6 pushers (feet / body): x, z, radius, strength */
  setPushers(list: { x: number; z: number; r: number; s: number }[]) {
    const arr = this.uniforms.uPush.value as THREE.Vector4[];
    for (let i = 0; i < 6; i++) {
      const p = list[i];
      if (p) arr[i].set(p.x, p.z, p.r, p.s);
      else arr[i].set(0, 0, 0, 0);
    }
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
