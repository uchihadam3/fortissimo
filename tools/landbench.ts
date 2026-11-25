// Landscape build-time and triangle budget check: BARS=60,240 npx tsx tools/landbench.ts
import { buildLandscape } from '../src/view/landscape';
import { LOOKS } from '../src/view/styles';
import * as THREE from 'three';
for (const bars of (process.env.BARS ?? '60,120,240').split(',').map(Number)) {
  const len = bars * 4 * 0.42;
  const t0 = performance.now();
  const land: any = (buildLandscape as any)('meadow', LOOKS.meadow.land, len, [{ kind: 'meadow', from: 0, to: len * 0.3 }, { kind: 'forest', from: len * 0.3, to: len * 0.6, side: -1 }, { kind: 'lake', from: len * 0.6, to: len * 0.8, side: 1 }, { kind: 'hills', from: len * 0.8, to: len }], 7, new THREE.Vector3(0.5, 0.5, -0.6));
  const ms = performance.now() - t0;
  let tris = 0, meshes = 0, inst = 0;
  land.group.traverse((o: any) => { if (o.isMesh) { meshes++; const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += n * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh) inst++; } });
  console.log(`bars ${bars} len ${len.toFixed(0)}: build ${ms.toFixed(0)} ms, meshes ${meshes} (instanced ${inst}), triangles ${(tris / 1e6).toFixed(2)}M`);
  for (const fs of [10, len / 2, len - 10]) {
    land.setFocus(fs);
    let vt = 0, vs = 0, vm = 0;
    land.group.traverse((o: any) => { if (o.isMesh && o.visible) { vm++; const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; vt += n * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh && o.castShadow) vs += n * o.count; } });
    console.log(`   focus s=${fs.toFixed(0)}: visible meshes ${vm}, triangles ${(vt / 1e6).toFixed(2)}M, shadow-casting props ${(vs / 1e6).toFixed(2)}M`);
  }
}
