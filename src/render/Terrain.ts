import * as THREE from "three";
import type { TrackWorld } from "../sim/Track";

/**
 * Quayside landmass the canal is cut through. A distance field to the canal centreline
 * drives everything: the channel bed sinks out of sight under the water, the ground sits
 * flush with the wall tops, then concrete aprons give way to asphalt yards, scrub and a
 * shoreline that slopes into the sea. Elevated canal sections lift the land into a mesa.
 */

export interface TerrainOptions {
  cell?: number;
  margin?: number;
  /** Rectangles (centre, half-size, yaw) carved below sea level — harbour basins. */
  basins?: { x: number; z: number; hx: number; hz: number; yaw: number }[];
}

export interface TerrainBuild {
  mesh: THREE.Mesh;
  heightAt(x: number, z: number): number;
}

const COPING_RISE = 2.2;
const COPING_THICK = 0.34;
const FAR_SEA = -3.5;

function hash(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function smooth(t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

function groundTexture(): { map: THREE.DataTexture; normal: THREE.DataTexture } {
  const size = 256;
  const h = new Float32Array(size * size);
  const alb = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const P = (s: number) => {
        // Tileable noise: wrap the lattice at `s`.
        const fx = u * s;
        const fz = v * s;
        const ix = Math.floor(fx);
        const iz = Math.floor(fz);
        const tx = fx - ix;
        const tz = fz - iz;
        const w = (a: number) => ((a % s) + s) % s;
        const q = (a: number, b: number) => hash(w(a) + 17, w(b) + 31);
        const sx = tx * tx * (3 - 2 * tx);
        const sz = tz * tz * (3 - 2 * tz);
        const a = q(ix, iz);
        const b = q(ix + 1, iz);
        const c = q(ix, iz + 1);
        const d = q(ix + 1, iz + 1);
        return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
      };
      const grain = P(64) * 0.5 + P(128) * 0.5;
      const blot = P(8) * 0.6 + P(16) * 0.4;
      // Hairline cracks: thin ridged noise.
      const crack = Math.pow(1 - Math.abs(P(12) * 2 - 1), 22) * 0.9;
      // Expansion joints every quarter tile.
      const j = Math.min(u % 0.25, 0.25 - (u % 0.25), v % 0.25, 0.25 - (v % 0.25));
      const joint = j < 0.0025 ? 0.5 : 0;
      h[y * size + x] = grain * 0.4 + blot * 0.2 - crack * 0.6 - joint * 0.8;
      const base = 0.58 + blot * 0.16 + grain * 0.12 - crack * 0.35 - joint * 0.3;
      const i = (y * size + x) * 4;
      alb[i] = Math.max(0, Math.min(255, base * 255));
      alb[i + 1] = Math.max(0, Math.min(255, base * 252));
      alb[i + 2] = Math.max(0, Math.min(255, base * 246));
      alb[i + 3] = 255;
    }
  }
  const nrm = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.5;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nrm[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      nrm[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      nrm[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nrm[i + 3] = 255;
    }
  }
  const mk = (d: Uint8Array<ArrayBuffer>, srgb: boolean) => {
    const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(alb, true), normal: mk(nrm, false) };
}

export function buildTerrain(track: TrackWorld, opts: TerrainOptions = {}): TerrainBuild {
  const cell = opts.cell ?? 5;
  const margin = opts.margin ?? 320;
  const spline = track.main;
  const step = 3;
  const n = Math.ceil(spline.totalLength / step);
  const sx = new Float32Array(n);
  const sz = new Float32Array(n);
  const sy = new Float32Array(n);
  const shw = new Float32Array(n);
  const stop = new Float32Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const f = spline.getFrameAtS(i * step);
    sx[i] = f.x;
    sz[i] = f.z;
    sy[i] = f.y;
    shw[i] = f.width * 0.5;
    stop[i] = f.y + f.bankHeight + COPING_RISE + COPING_THICK;
    minX = Math.min(minX, f.x);
    maxX = Math.max(maxX, f.x);
    minZ = Math.min(minZ, f.z);
    maxZ = Math.max(maxZ, f.z);
  }
  const x0 = Math.floor((minX - margin) / cell) * cell;
  const z0 = Math.floor((minZ - margin) / cell) * cell;
  const cols = Math.ceil((maxX + margin - x0) / cell) + 1;
  const rows = Math.ceil((maxZ + margin - z0) / cell) + 1;
  const count = cols * rows;
  const dist = new Float32Array(count).fill(1e9);
  const near = new Int32Array(count).fill(-1);

  // Splat every canal sample into the grid within its reach — a brute-force distance field
  // that's still only ~15M ops for the whole course.
  const reach = 300;
  const rc = Math.ceil(reach / cell);
  for (let i = 0; i < n; i++) {
    const cx = Math.round((sx[i] - x0) / cell);
    const cz = Math.round((sz[i] - z0) / cell);
    for (let dz = -rc; dz <= rc; dz++) {
      const r = cz + dz;
      if (r < 0 || r >= rows) continue;
      const wz = z0 + r * cell - sz[i];
      for (let dx = -rc; dx <= rc; dx++) {
        const c = cx + dx;
        if (c < 0 || c >= cols) continue;
        const wx = x0 + c * cell - sx[i];
        const d = wx * wx + wz * wz;
        const k = r * cols + c;
        if (d < dist[k]) {
          dist[k] = d;
          near[k] = i;
        }
      }
    }
  }

  const basins = opts.basins ?? [];
  const inBasin = (x: number, z: number): number => {
    let best = 1e9;
    for (const b of basins) {
      const dx = x - b.x;
      const dz = z - b.z;
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      const lx = Math.abs(dx * c - dz * s) - b.hx;
      const lz = Math.abs(dx * s + dz * c) - b.hz;
      best = Math.min(best, Math.max(lx, lz));
    }
    return best;
  };

  const heights = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const concrete = new THREE.Color(0xb2ada2);
  const asphalt = new THREE.Color(0x6a6b6c);
  const scrub = new THREE.Color(0x5a6034);
  const dirt = new THREE.Color(0x6e5a40);
  const sand = new THREE.Color(0xb8a27a);
  const tmp = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const x = x0 + c * cell;
      const z = z0 + r * cell;
      const i = near[k];
      let y = FAR_SEA;
      const nz = vnoise(x * 0.02, z * 0.02);
      const nz2 = vnoise(x * 0.11 + 7, z * 0.11 - 3);
      if (i >= 0) {
        const d = Math.sqrt(dist[k]);
        const hw = shw[i];
        const quay = stop[i] - 0.36;
        const off = d - hw;
        // Bed sinks deep enough that the 5 m grid's ramp stays under the water and inside the wall body.
        if (off < 2.6) y = sy[i] - 12;
        else if (off < 150) y = quay + (off > 30 ? (nz - 0.5) * 0.6 * smooth((off - 30) / 40) : 0);
        else if (off < 270) y = quay + (FAR_SEA - quay) * smooth((off - 150) / 120) + (nz - 0.5) * 4 * Math.sin(Math.PI * smooth((off - 150) / 120));
        // Surface: concrete apron → asphalt yard → dirt/scrub → sand at the shoreline.
        if (off < 24) tmp.copy(concrete).lerp(asphalt, smooth((off - 16) / 8) * 0.2);
        else if (off < 110) tmp.copy(asphalt).lerp(concrete, nz2 > 0.72 ? 0.5 : 0).lerp(dirt, smooth((off - 80) / 30) * 0.6);
        else tmp.copy(dirt).lerp(scrub, smooth((off - 110) / 40) * (0.5 + nz * 0.5));
        if (y < quay - 2 && off > 150) tmp.lerp(sand, smooth((quay - 2 - y) / 4));
        tmp.multiplyScalar(0.9 + nz2 * 0.25);
      } else {
        tmp.copy(sand);
      }
      const bd = inBasin(x, z);
      if (bd < 12) {
        const k2 = smooth((12 - bd) / 12);
        y = y + (-7 - y) * k2;
      }
      heights[k] = y;
      colors[k * 3] = tmp.r;
      colors[k * 3 + 1] = tmp.g;
      colors[k * 3 + 2] = tmp.b;
    }
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      pos[k * 3] = x0 + c * cell;
      pos[k * 3 + 1] = heights[k];
      pos[k * 3 + 2] = z0 + r * cell;
      uv[k * 2] = (x0 + c * cell) / 40;
      uv[k * 2 + 1] = (z0 + r * cell) / 40;
    }
  }
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let o = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx[o++] = a;
      idx[o++] = d;
      idx[o++] = b;
      idx[o++] = b;
      idx[o++] = d;
      idx[o++] = e;
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const tex = groundTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "terrain";
  mesh.receiveShadow = true;

  const heightAt = (x: number, z: number): number => {
    const fc = (x - x0) / cell;
    const fr = (z - z0) / cell;
    const c = Math.max(0, Math.min(cols - 2, Math.floor(fc)));
    const r = Math.max(0, Math.min(rows - 2, Math.floor(fr)));
    const tx = Math.max(0, Math.min(1, fc - c));
    const tz = Math.max(0, Math.min(1, fr - r));
    const h00 = heights[r * cols + c];
    const h10 = heights[r * cols + c + 1];
    const h01 = heights[(r + 1) * cols + c];
    const h11 = heights[(r + 1) * cols + c + 1];
    return h00 + (h10 - h00) * tx + (h01 - h00) * tz + (h00 - h10 - h01 + h11) * tx * tz;
  };
  return { mesh, heightAt };
}
