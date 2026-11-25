/** The route a colossus walks: a gently winding line through the land (pure math). */
import { noise2 } from '../core/noise';

export class JourneyPath {
  readonly pts: { x: number; z: number }[] = [];
  readonly dirs: { x: number; z: number }[] = [];
  readonly length: number;
  readonly step = 1;
  private grid = new Map<string, number[]>();
  private cell = 10;

  constructor(length: number, seed: number, curviness = 1) {
    let x = 0, z = 0;
    let a = -Math.PI / 2; // heading toward -Z
    const total = Math.ceil(length + 80);
    for (let i = 0; i <= total; i++) {
      this.pts.push({ x, z });
      this.dirs.push({ x: Math.cos(a), z: Math.sin(a) });
      const s = i * this.step;
      // gentle curves; the first stretch runs straight so the level opens calmly
      const k = noise2(s * 0.012 + seed * 0.37, seed) * 0.018 * curviness * Math.min(1, s / 40);
      a += k;
      // keep the overall heading roughly forward
      a += (-Math.PI / 2 - a) * 0.004;
      x += Math.cos(a) * this.step;
      z += Math.sin(a) * this.step;
    }
    this.length = length;
    this.pts.forEach((p, i) => {
      const key = this.key(p.x, p.z);
      let l = this.grid.get(key);
      if (!l) this.grid.set(key, (l = []));
      l.push(i);
    });
  }

  private key(x: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  /** position and heading at distance s */
  at(s: number, out = { x: 0, z: 0, dx: 0, dz: -1 }) {
    const f = Math.max(0, Math.min(this.pts.length - 1.001, s / this.step));
    const i = Math.floor(f), t = f - i;
    const a = this.pts[i], b = this.pts[i + 1];
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    const da = this.dirs[i], db = this.dirs[i + 1];
    out.dx = da.x + (db.x - da.x) * t;
    out.dz = da.z + (db.z - da.z) * t;
    const l = Math.hypot(out.dx, out.dz) || 1;
    out.dx /= l;
    out.dz /= l;
    return out;
  }

  /** nearest path distance s and signed lateral offset d (+ = right of travel) */
  nearest(x: number, z: number, out = { s: 0, d: 0 }) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = Infinity, bi = -1;
    for (let r = 0; r <= 12 && bi < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const l = this.grid.get(`${cx + dx},${cz + dz}`);
          if (!l) continue;
          for (const i of l) {
            const p = this.pts[i];
            const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (d2 < best) {
              best = d2;
              bi = i;
            }
          }
        }
      }
      if (bi >= 0 && r > 0) break;
    }
    if (bi < 0) {
      out.s = 0;
      out.d = 999;
      return out;
    }
    const p = this.pts[bi], dir = this.dirs[bi];
    // right of travel = (−dz, dx) rotated: for heading (dx, dz), right is (−dz, dx)
    const rx = -dir.z, rz = dir.x;
    out.s = bi * this.step + ((x - p.x) * dir.x + (z - p.z) * dir.z);
    out.d = (x - p.x) * rx + (z - p.z) * rz;
    if (best > 400 * 400) out.d = Math.sign(out.d || 1) * Math.sqrt(best);
    return out;
  }
}

