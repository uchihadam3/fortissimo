/**
 * "The colour comes back with the music."
 * World materials (ground, cliffs, props, water) are desaturated by a shared amount, except inside
 * colour sources (towers, the Heart) and behind an expanding colour wave from the Heart. Towers,
 * enemies, projectiles and UI are never desaturated.
 */
import * as THREE from 'three';

export const MAX_SOURCES = 24;

export const worldColor = {
  uWorldSat: { value: 0.3 },
  uSources: { value: Array.from({ length: MAX_SOURCES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  /** colour wave: centre (world xz), radius, target saturation inside */
  uWave: { value: new THREE.Vector4(0, 0, -1, 1) },
};

const GLSL_PARS = /* glsl */ `
uniform float uWorldSat;
uniform vec4 uSources[${MAX_SOURCES}];
uniform vec4 uWave;
varying vec3 vWorldPosWC;
float worldSaturation(vec3 wp) {
  float s = uWorldSat;
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    vec4 src = uSources[i];
    if (src.z <= 0.0) continue;
    float d = length(wp.xz - src.xy);
    s = max(s, mix(uWorldSat, src.w, smoothstep(src.z, src.z * 0.45, d)));
  }
  if (uWave.z > 0.0) {
    float d = length(wp.xz - uWave.xy);
    s = max(s, mix(s, uWave.w, smoothstep(uWave.z, uWave.z - 2.5, d)));
  }
  return s;
}
vec3 applyWorldColor(vec3 c, vec3 wp) {
  float s = worldSaturation(wp);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // the Silence's grey: cool, slightly violet, a touch of contrast
  vec3 grey = vec3(l) * vec3(0.84, 0.86, 1.0);
  grey = (grey - 0.16) * 1.1 + 0.16;
  return max(mix(grey, c, clamp(s, 0.0, 1.3)), 0.0);
}
`;

/** Patch a built-in material so it obeys the world colour. Chains an existing onBeforeCompile. */
export function applyWorldColor<T extends THREE.Material>(mat: T, key: string): T {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uWorldSat = worldColor.uWorldSat;
    sh.uniforms.uSources = worldColor.uSources;
    sh.uniforms.uWave = worldColor.uWave;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosWC;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wpc = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wpc = instanceMatrix * wpc;
          #endif
          vWorldPosWC = (modelMatrix * wpc).xyz;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_PARS}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = applyWorldColor(gl_FragColor.rgb, vWorldPosWC);');
  };
  mat.customProgramCacheKey = () => `wc:${key}:${prevKey()}`;
  mat.needsUpdate = true;
  return mat;
}

/** GLSL snippet for custom ShaderMaterials (declare pars, then call applyWorldColor). */
export const WORLD_COLOR_GLSL = GLSL_PARS;

export function setSources(list: { x: number; z: number; r: number; s: number }[]) {
  const arr = worldColor.uSources.value;
  for (let i = 0; i < MAX_SOURCES; i++) {
    const src = list[i];
    if (src) arr[i].set(src.x, src.z, src.r, src.s);
    else arr[i].set(0, 0, 0, 0);
  }
}
