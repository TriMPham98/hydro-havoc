import * as THREE from "three";
import type { TrackWorld } from "../sim/Track";
import type { ArcSpline } from "../sim/spline";
import { createWaterMaterial } from "./WaterMaterial";

export const WATER_ALONG = 6.2;
export const WATER_WIDTH_SEGS = 6;
const WALL_ALONG = 4.6;
const FOAM_ALONG = 4.8;

function alongSegs(spline: ArcSpline, spacing: number): number {
  return Math.max(24, Math.floor(spline.totalLength / spacing));
}

function ribbonGeometry(spline: ArcSpline, closed: boolean, yLift = 0, widthSegs = WATER_WIDTH_SEGS): THREE.BufferGeometry {
  const segs = alongSegs(spline, WATER_ALONG);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = widthSegs + 1;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const y = f.y + yLift;
    for (let w = 0; w <= widthSegs; w++) {
      const u = w / widthSegs;
      const lat = -hw + f.width * u;
      positions.push(f.x + f.rx * lat, y, f.z + f.rz * lat);
      uvs.push(u, t * spline.totalLength * 0.08);
    }
    if (i < segs) {
      const row = i * cols;
      const next = (i + 1) * cols;
      for (let w = 0; w < widthSegs; w++) {
        const a = row + w;
        const b = a + 1;
        const c = next + w;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Thick flume wall with inner face on the water and a top coping. */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iy: number, period: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(u: number, v: number, period: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(x0, y0, period);
  const b = hash2(x0 + 1, y0, period);
  const c = hash2(x0, y0 + 1, period);
  const d = hash2(x0 + 1, y0 + 1, period);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function canalAlbedo(kind: "wall" | "cope"): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n0 = vnoise(u, v, 8);
      const n1 = vnoise(u, v, 16);
      const n2 = vnoise(u, v, 32);
      const grain = vnoise(u, v, 64);
      const blotch = Math.pow(vnoise(u, v, 6), 1.8);
      const column = vnoise(u, 0.21, 16);
      const brk = vnoise(u, v, 24);
      const streak = Math.pow(Math.max(0, column - 0.56) * 2.1, 1.45) * (0.35 + brk);
      const i = (y * size + x) * 4;
      let r: number;
      let g: number;
      let b: number;
      if (kind === "wall") {
        const wet = Math.pow(1 - v, 2.0) * 0.34;
        const base = 0.46 + n0 * 0.08 + n1 * 0.05 + grain * 0.045;
        r = base * 0.9;
        g = base * 0.94;
        b = base * 1.02;
        const rustAmt = Math.min(1, streak * 0.95 + blotch * 0.32);
        r = r * (1 - rustAmt) + (0.44 + n2 * 0.1) * rustAmt;
        g = g * (1 - rustAmt) + (0.22 + n1 * 0.05) * rustAmt;
        b = b * (1 - rustAmt) + (0.11 + grain * 0.04) * rustAmt;
        r -= wet * 0.12;
        g -= wet * 0.08;
        b -= wet * 0.04;
      } else {
        const base = 0.36 + n0 * 0.1 + grain * 0.05;
        r = base * 1.08;
        g = base * 0.96;
        b = base * 0.8;
        const rustAmt = Math.min(1, streak * 0.72 + blotch * 0.4);
        r = r * (1 - rustAmt) + (0.46 + n2 * 0.08) * rustAmt;
        g = g * (1 - rustAmt) + (0.23 + n1 * 0.04) * rustAmt;
        b = b * (1 - rustAmt) + (0.1 + grain * 0.03) * rustAmt;
      }
      data[i] = Math.max(0, Math.min(255, r * 255));
      data[i + 1] = Math.max(0, Math.min(255, g * 255));
      data[i + 2] = Math.max(0, Math.min(255, b * 255));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Cast-concrete form panels, one per UV tile (5 m along × 4.5 m tall): recessed joints,
 * tie-holes, rust bleeding down from the ties, efflorescence under the lift line.
 * Returns albedo + a tangent-space normal map baked from the same height field.
 */
export function concretePanelMaps(size = 256): { albedo: THREE.DataTexture; normal: THREE.DataTexture } {
  const H = new Float32Array(size * size);
  const A = new Float32Array(size * size * 3);
  const holes: [number, number][] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) holes.push([(i + 0.5) / 4, 0.22 + j * 0.5]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const pores = vnoise(u, v, 64) * 0.5 + vnoise(u, v, 128) * 0.5;
      const blotch = vnoise(u, v, 6) * 0.6 + vnoise(u, v, 12) * 0.4;
      let h = pores * 0.08 + blotch * 0.05;
      // Vertical form joint at the tile edge, shallower horizontal lift line at mid height.
      const du = Math.min(u, 1 - u);
      const joint = du < 0.008 ? 1 : du < 0.014 ? (0.014 - du) / 0.006 : 0;
      const lift = Math.abs(v - 0.5) < 0.004 ? 0.6 : 0;
      h -= joint * 0.9 + lift * 0.5;
      let rust = 0;
      let hole = 0;
      for (const [hu, hv] of holes) {
        const d = Math.hypot((u - hu) * 1.1, v - hv);
        if (d < 0.012) hole = Math.max(hole, 1 - d / 0.012);
        // Streak bleeds downward (v decreasing) from each tie.
        const below = hv - v;
        if (below > 0 && below < 0.32) {
          const w = Math.exp(-Math.pow((u - hu) / (0.005 + below * 0.03), 2));
          rust = Math.max(rust, w * (1 - below / 0.32) * (0.5 + vnoise(u, v, 40) * 0.6));
        }
      }
      h -= hole * 0.8;
      const effl = v < 0.5 && v > 0.3 ? Math.pow(Math.max(0, vnoise(u, 0.5, 48) - 0.5) * 2, 2) * (1 - (0.5 - v) / 0.2) : 0;
      H[y * size + x] = h;
      const base = 0.5 + blotch * 0.12 + pores * 0.06 - joint * 0.22 - hole * 0.3;
      let r = base * 0.93;
      let g = base * 0.94;
      let b = base * 0.98;
      r = r * (1 - rust) + 0.42 * rust;
      g = g * (1 - rust) + 0.2 * rust;
      b = b * (1 - rust) + 0.09 * rust;
      r += effl * 0.18;
      g += effl * 0.18;
      b += effl * 0.17;
      const i3 = (y * size + x) * 3;
      A[i3] = r;
      A[i3 + 1] = g;
      A[i3 + 2] = b;
    }
  }
  const alb = new Uint8Array(size * size * 4);
  const nrm = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => H[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      alb[i * 4] = Math.max(0, Math.min(255, A[i * 3] * 255));
      alb[i * 4 + 1] = Math.max(0, Math.min(255, A[i * 3 + 1] * 255));
      alb[i * 4 + 2] = Math.max(0, Math.min(255, A[i * 3 + 2] * 255));
      alb[i * 4 + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3.2;
      const len = Math.hypot(dx, dy, 1);
      nrm[i * 4] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      nrm[i * 4 + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      nrm[i * 4 + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      nrm[i * 4 + 3] = 255;
    }
  }
  const mk = (data: Uint8Array<ArrayBuffer>, srgb: boolean) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  };
  return { albedo: mk(alb, true), normal: mk(nrm, false) };
}

/** Wall UV v is metres × 0.22 from 1.6 m below the surface, so the waterline sits here. */
export const WALL_WATERLINE_V = 1.6 * 0.22;

/**
 * Concrete wall shader: wet algae band hugging the waterline (darker, glossier, greener)
 * and animated caustics thrown up the wall by the water.
 */
function wetConcrete(mat: THREE.MeshStandardMaterial, uTime: { value: number }): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWallUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvWallUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vWallUv;
        uniform float uTime;
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float wetBand() {
          float edge = ${WALL_WATERLINE_V.toFixed(4)} + 0.1 + wNoise(vec2(vWallUv.x * 9.0, 0.0)) * 0.08;
          return 1.0 - smoothstep(edge - 0.03, edge + 0.03, vWallUv.y);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float wet = wetBand();
          float algae = wet * smoothstep(${(WALL_WATERLINE_V - 0.12).toFixed(4)}, ${(WALL_WATERLINE_V + 0.05).toFixed(4)}, vWallUv.y)
            * (0.55 + 0.45 * wNoise(vWallUv * vec2(30.0, 12.0)));
          diffuseColor.rgb *= mix(1.0, 0.5, wet);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.14, 0.07), algae * 0.65);
          // Grime drips from the coping down the upper wall.
          float drip = smoothstep(1.2, 1.85, vWallUv.y) * smoothstep(0.55, 0.85, wNoise(vec2(vWallUv.x * 26.0, vWallUv.y * 1.5)));
          diffuseColor.rgb *= 1.0 - drip * 0.35;
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, wetBand());`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float wl = ${WALL_WATERLINE_V.toFixed(4)};
          float band = smoothstep(wl - 0.01, wl + 0.03, vWallUv.y) * (1.0 - smoothstep(wl + 0.04, wl + 0.42, vWallUv.y));
          // Iterated interference caustic: soft bright webbing that swims, not wiry arcs.
          vec2 p = mod(vec2(vWallUv.x * 2.6, vWallUv.y * 3.4) * 6.2831853, 6.2831853) - 250.0;
          vec2 q = p;
          float c = 1.0;
          float inten = 0.006;
          for (int n = 0; n < 4; n++) {
            float t = uTime * 0.55 * (1.0 - (3.5 / float(n + 1)));
            q = p + vec2(cos(t - q.x) + sin(t + q.y), sin(t - q.y) + cos(t + q.x));
            c += 1.0 / length(vec2(p.x / (sin(q.x + t) / inten), p.y / (cos(q.y + t) / inten)));
          }
          c /= 4.0;
          c = 1.17 - pow(c, 1.4);
          float caustic = clamp(pow(abs(c), 7.0), 0.0, 2.0);
          totalEmissiveRadiance += vec3(0.5, 0.82, 0.78) * caustic * band * 0.16;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "wetConcrete";
}

function hazardTexture(): THREE.DataTexture {
  const w = 64;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const stripe = Math.floor((x + y) / 8) % 2 === 0;
      const wear = vnoise(x / w, y / h, 8) > 0.82;
      const i = (y * w + x) * 4;
      const yel = stripe && !wear;
      data[i] = yel ? 235 : 22;
      data[i + 1] = yel ? 178 : 22;
      data[i + 2] = yel ? 20 : 24;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Hazard-striped band on the inner face of the coping lip, both banks in one mesh. */
function hazardGeometry(spline: ArcSpline, closed: boolean): THREE.BufferGeometry {
  const segs = alongSegs(spline, WALL_ALONG);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const side of [1, -1] as const) {
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
      const lat = (f.width * 0.5 - 0.32 - 0.012) * side;
      const y0 = f.y + f.bankHeight + 2.2;
      const x = f.x + f.rx * lat;
      const z = f.z + f.rz * lat;
      positions.push(x, y0 - 0.02, z, x, y0 + 0.36, z);
      const along = t * spline.totalLength * 0.5;
      uvs.push(along, 0, along, 1);
      if (i < segs) {
        const a = base + i * 2;
        const b = a + 2;
        if (side > 0) indices.push(a, a + 1, b + 1, a, b + 1, b);
        else indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    base += (segs + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

let weatherTex: THREE.DataTexture | null = null;

/** Greyscale detail: horizontal weld seams, vertical rust/grime streaks, dirtier at the base. */
function weatheredMetalMap(): THREE.DataTexture {
  if (weatherTex) return weatherTex;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const seam = Math.abs(((v * 6) % 1) - 0.5) > 0.485 ? 0.55 : 1;
      const col = vnoise(u, 0.37, 48);
      const streak = Math.pow(Math.max(0, col - 0.45) * 1.8, 1.6) * (0.4 + vnoise(u, v, 24) * 0.8) * (1 - v * 0.3);
      const grime = (1 - v) * 0.25 * vnoise(u, v, 6);
      const grain = vnoise(u, v, 64) * 0.08;
      const g = Math.max(0.35, Math.min(1, (0.92 - streak * 0.45 - grime + grain) * seam));
      const i = (y * size + x) * 4;
      data[i] = Math.round(g * 255);
      data[i + 1] = Math.round(g * 248);
      data[i + 2] = Math.round(g * 240);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  weatherTex = tex;
  return tex;
}

/** Give every plain prop material the weathering map so set dressing reads as built, not primitive. */
function weatherProps(group: THREE.Group, skip: THREE.Material[]): void {
  const keep = new Set<THREE.Material>(skip);
  const map = weatheredMetalMap();
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const m = obj.material;
    if (!(m instanceof THREE.MeshStandardMaterial) || keep.has(m) || m.map) return;
    if (m.emissiveIntensity > 0.05 && m.emissive.getHex() !== 0) return;
    m.map = map;
    m.needsUpdate = true;
  });
}

function canalWallGeometry(spline: ArcSpline, closed: boolean, side: number): THREE.BufferGeometry {
  const segs = alongSegs(spline, WALL_ALONG);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const thick = 2.6;
  const extraH = 2.2;
  const flip = side < 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const y0 = f.y - 1.6;
    const y1 = f.y + f.bankHeight + extraH;
    const ix = f.x + f.rx * hw * side;
    const iz = f.z + f.rz * hw * side;
    const ox = f.x + f.rx * (hw + thick) * side;
    const oz = f.z + f.rz * (hw + thick) * side;
    positions.push(ix, y0, iz, ix, y1, iz, ox, y1, oz, ox, y0, oz);
    const along = t * spline.totalLength * 0.2;
    const h = (y1 - y0) * 0.22;
    uvs.push(along, 0, along, h, along + 0.52, h, along + 0.52, 0);
    if (i < segs) {
      const a = i * 4;
      const b = a + 4;
      quad(indices, a + 0, a + 1, b + 1, b + 0, flip);
      quad(indices, a + 1, a + 2, b + 2, b + 1, flip);
      quad(indices, a + 2, a + 3, b + 3, b + 2, flip);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Weathered steel cap — a dock lip, not lane paint. */
function copingGeometry(spline: ArcSpline, closed: boolean, side: number): THREE.BufferGeometry {
  const segs = alongSegs(spline, WALL_ALONG);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const overhang = 0.32;
  const width = 1.35;
  const thick = 0.34;
  const extraH = 2.2;
  const flip = side < 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const y0 = f.y + f.bankHeight + extraH;
    const y1 = y0 + thick;
    const inner = hw - overhang;
    const outer = hw + width;
    const ix = f.x + f.rx * inner * side;
    const iz = f.z + f.rz * inner * side;
    const ox = f.x + f.rx * outer * side;
    const oz = f.z + f.rz * outer * side;
    positions.push(ix, y0, iz, ix, y1, iz, ox, y1, oz, ox, y0, oz);
    const along = t * spline.totalLength * 0.34;
    uvs.push(along, 0, along, 0.22, along, 1, along, 0.78);
    if (i < segs) {
      const a = i * 4;
      const b = a + 4;
      quad(indices, a + 0, a + 1, b + 1, b + 0, !flip);
      quad(indices, a + 1, a + 2, b + 2, b + 1, !flip);
      quad(indices, a + 3, a + 2, b + 2, b + 3, !flip);
      quad(indices, a + 0, a + 3, b + 3, b + 0, !flip);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function waterlineGeometry(spline: ArcSpline, closed: boolean, side: number): THREE.BufferGeometry {
  const segs = alongSegs(spline, FOAM_ALONG);
  const positions: number[] = [];
  const indices: number[] = [];
  const inset = 0.7;
  const flip = side < 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const y = f.y + 0.08;
    const ox = f.x + f.rx * hw * side;
    const oz = f.z + f.rz * hw * side;
    const ix = f.x + f.rx * (hw - inset) * side;
    const iz = f.z + f.rz * (hw - inset) * side;
    positions.push(ix, y, iz, ox, y, oz);
    if (i < segs) {
      const a = i * 2;
      const b = a + 2;
      if (flip) indices.push(a, a + 1, b + 1, a, b + 1, b);
      else indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function quad(indices: number[], a: number, b: number, c: number, d: number, inward: boolean): void {
  if (inward) indices.push(a, b, c, a, c, d);
  else indices.push(a, c, b, a, d, c);
}

type Xform = {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

const _dummy = new THREE.Object3D();

function addInstanced(
  group: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  xforms: Xform[],
): THREE.InstancedMesh | undefined {
  if (xforms.length === 0) return;
  const mesh = new THREE.InstancedMesh(geometry, material, xforms.length);
  for (let i = 0; i < xforms.length; i++) {
    const t = xforms[i];
    _dummy.position.set(t.x, t.y, t.z);
    _dummy.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _dummy.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

export function createTrackGroup(track: TrackWorld): {
  group: THREE.Group;
  waterMat: THREE.ShaderMaterial;
} {
  const group = new THREE.Group();
  const waterMat = createWaterMaterial("canal");
  const panels = concretePanelMaps();
  const copeTex = canalAlbedo("cope");
  const uTime = { value: 0 };
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xd8d2c6,
    map: panels.albedo,
    normalMap: panels.normal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.86,
    metalness: 0.04,
  });
  wetConcrete(wallMat, uTime);
  group.userData.tick = (time: number) => {
    uTime.value = time;
  };
  const copeMat = new THREE.MeshStandardMaterial({
    color: 0xc8b49a,
    map: copeTex,
    roughness: 0.42,
    metalness: 0.48,
  });
  const foamMat = new THREE.MeshStandardMaterial({
    color: 0x243840,
    roughness: 0.16,
    metalness: 0.58,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    envMapIntensity: 0.55,
  });

  const addRibbon = (spline: ArcSpline, closed: boolean, cope: THREE.Material, walls: THREE.Material) => {
    const water = new THREE.Mesh(ribbonGeometry(spline, closed, 0.02), waterMat);
    water.name = "canalWater";
    water.receiveShadow = true;
    water.renderOrder = 1;
    group.add(water);
    for (const side of [1, -1] as const) {
      const wall = new THREE.Mesh(canalWallGeometry(spline, closed, side), walls);
      wall.name = "canalWall";
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
      const lip = new THREE.Mesh(copingGeometry(spline, closed, side), cope);
      lip.name = "canalCoping";
      lip.castShadow = true;
      lip.receiveShadow = true;
      group.add(lip);
    }
    const foamL = new THREE.Mesh(waterlineGeometry(spline, closed, 1), foamMat);
    const foamR = new THREE.Mesh(waterlineGeometry(spline, closed, -1), foamMat);
    foamL.name = "canalWaterline";
    foamR.name = "canalWaterline";
    foamL.renderOrder = 2;
    foamR.renderOrder = 2;
    group.add(foamL, foamR);
  };

  addRibbon(track.main, true, copeMat, wallMat);
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTexture(),
    roughness: 0.55,
    metalness: 0.1,
    emissive: 0x2a1c00,
    emissiveIntensity: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const hazard = new THREE.Mesh(hazardGeometry(track.main, true), hazardMat);
  hazard.name = "copingHazard";
  group.add(hazard);

  const start = track.start;
  const gate = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1f24, metalness: 0.4, roughness: 0.45 });
  const gateSpan = start.width * 0.5 + 4;
  const postPoses: Xform[] = [];
  for (const side of [-1, 1]) {
    postPoses.push({
      x: start.x + start.rx * gateSpan * side,
      y: start.y + 7,
      z: start.z + start.rz * gateSpan * side,
    });
  }
  addInstanced(gate, new THREE.BoxGeometry(1.1, 14, 1.1), postMat, postPoses);
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(gateSpan * 2 + 2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x0b2c34, emissive: 0x0a3a44 }),
  );
  beam.position.set(start.x, start.y + 15.4, start.z);
  beam.rotation.y = Math.atan2(start.tx, start.tz);
  gate.add(beam);
  group.add(gate);

  dressProps(group, track);
  dressCavern(group, track);
  dressLandmarks(group, track);
  dressSkyline(group, track);
  dressReef(group, track);
  dressShipyard(group, track);
  dressBeacons(group, track);
  dressSilos(group, track);
  dressCampus(group);
  dressHorizon(group);
  dressRefineryFill(group, track);
  weatherProps(group, [wallMat, copeMat, foamMat, hazardMat]);
  return { group, waterMat };
}

function dressProps(group: THREE.Group, track: TrackWorld): void {
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.9, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3d4750, metalness: 0.55, roughness: 0.4 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x147d8c, emissiveIntensity: 1.4 });
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x3a1c10, roughness: 0.78, metalness: 0.32 });
  const fire = new THREE.MeshStandardMaterial({
    color: 0xffc060,
    emissive: 0xff5a10,
    emissiveIntensity: 3.6,
    roughness: 0.32,
    metalness: 0.04,
  });

  const tankPoses: Xform[] = [];
  for (const t of [0.14, 0.19, 0.38, 0.46, 0.52]) {
    const f = track.main.getFrameAtT(t);
    const side = t > 0.3 ? 1 : -1;
    tankPoses.push({
      x: f.x + f.rx * (f.width * 0.5 + 10) * side,
      y: f.y + 8,
      z: f.z + f.rz * (f.width * 0.5 + 10) * side,
    });
  }
  addInstanced(group, new THREE.CylinderGeometry(6, 6, 16, 12), rust, tankPoses);

  const pipePoses: Xform[] = [];
  const lampPoses: Xform[] = [];
  for (let i = 0; i < 18; i++) {
    const f = track.main.getFrameAtT(0.58 + i * 0.008);
    const side = f.width * 0.5 + 5;
    const yaw = Math.atan2(f.tx, f.tz);
    pipePoses.push({ x: f.x + f.rx * side, y: f.y + 6.2, z: f.z + f.rz * side, ry: yaw, rz: Math.PI / 2 });
    lampPoses.push({ x: f.x + f.rx * side, y: f.y + 8.2, z: f.z + f.rz * side, ry: yaw });
  }
  addInstanced(group, new THREE.CylinderGeometry(0.7, 0.7, 18, 8), steel, pipePoses);
  addInstanced(group, new THREE.BoxGeometry(0.3, 0.3, 3.5), neon, lampPoses);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 16, 10), rust);
  const hf = track.main.getFrameAtT(0.9);
  tower.position.set(hf.x + hf.rx * -44, hf.y + 8, hf.z + hf.rz * -44);
  group.add(tower);

  const g = track.main.getFrameAtT(0.04);
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(g.width + 10, 1.2, 2.4), steel);
  gantry.position.set(g.x, g.y + 16, g.z);
  gantry.rotation.y = Math.atan2(g.tx, g.tz);
  group.add(gantry);

  const postPoses: Xform[] = [];
  const beamPoses: Xform[] = [];
  const signPoses: Xform[] = [];
  for (const t of [0.27, 0.71]) {
    const f = track.main.getFrameAtT(t);
    const span = f.width + 10;
    const yaw = Math.atan2(f.tx, f.tz);
    for (const side of [-1, 1] as const) {
      postPoses.push({
        x: f.x + f.rx * (span * 0.5) * side,
        y: f.y + 8,
        z: f.z + f.rz * (span * 0.5) * side,
      });
    }
    beamPoses.push({ x: f.x, y: f.y + 15.2, z: f.z, ry: yaw, sx: span + 2 });
    signPoses.push({
      x: f.x + f.rx * (f.width * 0.5 + 8),
      y: f.y + 7,
      z: f.z + f.rz * (f.width * 0.5 + 8),
      ry: yaw,
    });
  }
  addInstanced(group, new THREE.BoxGeometry(1.2, 16, 1.2), steel, postPoses);
  addInstanced(group, new THREE.BoxGeometry(1, 1.1, 1.1), neon, beamPoses);
  addInstanced(group, new THREE.BoxGeometry(10, 3.2, 0.4), neon, signPoses);

  const stackPoses: Xform[] = [];
  const flamePoses: Xform[] = [];
  for (const t of [0.11, 0.33, 0.49]) {
    const f = track.main.getFrameAtT(t);
    const x = f.x + f.rx * (f.width * 0.5 + 16);
    const y = f.y + 24;
    const z = f.z + f.rz * (f.width * 0.5 + 16);
    stackPoses.push({ x, y, z });
    flamePoses.push({ x, y: y + 28, z });
  }
  const stacks = addInstanced(group, new THREE.CylinderGeometry(2.2, 3.4, 48, 8), stackMat, stackPoses);
  if (stacks) stacks.name = "flareStack";
  const flames = addInstanced(group, new THREE.ConeGeometry(3.0, 12, 6), fire, flamePoses);
  if (flames) flames.name = "flareFlame";

  const wf = track.main.getFrameAtT(0.83);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(14, 22, 1, 1), waterfallMaterial(group));
  fall.name = "waterfall";
  fall.position.set(wf.x + wf.rx * (wf.width * 0.5 + 6), wf.y + 10, wf.z + wf.rz * (wf.width * 0.5 + 6));
  fall.rotation.y = Math.atan2(wf.tx, wf.tz);
  group.add(fall);
}

/** Sheeting outfall: streaks racing down, frothing white at the lip and the foot. */
function waterfallMaterial(group: THREE.Group): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        float streak = n(vec2(vUv.x * 40.0, vUv.y * 3.0 + uTime * 4.0)) * 0.6 + n(vec2(vUv.x * 90.0, vUv.y * 6.0 + uTime * 6.5)) * 0.4;
        float froth = smoothstep(0.82, 1.0, vUv.y) + smoothstep(0.18, 0.0, vUv.y);
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float a = (0.32 + streak * 0.45 + froth * 0.5) * edge;
        vec3 col = mix(vec3(0.55, 0.78, 0.82), vec3(0.95, 0.98, 1.0), clamp(streak * 0.7 + froth, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
      }
    `,
  });
  const prev = group.userData.tick as ((t: number) => void) | undefined;
  group.userData.tick = (t: number) => {
    prev?.(t);
    mat.uniforms.uTime.value = t;
  };
  return mat;
}

/** Indoor night beat — vault over the existing tunnel, not a second overlapping ribbon. */
function dressCavern(group: THREE.Group, track: TrackWorld): void {
  const rock = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.92, metalness: 0.08 });
  const rib = new THREE.MeshStandardMaterial({ color: 0x2ee0ff, emissive: 0x0a6a78, emissiveIntensity: 1.8 });
  const wallPoses: Xform[] = [];
  const trimPoses: Xform[] = [];
  for (let i = 0; i < 10; i++) {
    const t = 0.56 + i * 0.018;
    const f = track.main.getFrameAtT(t);
    const yaw = Math.atan2(f.tx, f.tz);
    const lat = f.width * 0.5 + 6;
    for (const side of [-1, 1] as const) {
      wallPoses.push({ x: f.x + f.rx * lat * side, y: f.y + 6, z: f.z + f.rz * lat * side, ry: yaw });
      trimPoses.push({
        x: f.x + f.rx * (lat - 1.4) * side,
        y: f.y + 6,
        z: f.z + f.rz * (lat - 1.4) * side,
        ry: yaw,
      });
    }
  }
  addInstanced(group, new THREE.BoxGeometry(3.2, 12, 10), rock, wallPoses);
  addInstanced(group, new THREE.BoxGeometry(0.3, 10, 8), rib, trimPoses);
}

/** Original-IP landmarks well off the ribbon so distant-t never stacks. */
function dressLandmarks(group: THREE.Group, track: TrackWorld): void {
  const hull = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.62, metalness: 0.42 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a3a16, roughness: 0.78, metalness: 0.28 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.55, metalness: 0.5 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.35 });
  const lava = new THREE.MeshStandardMaterial({
    color: 0xffc060,
    emissive: 0xff4a10,
    emissiveIntensity: 3.2,
    roughness: 0.3,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffc878,
    emissive: 0xffb060,
    emissiveIntensity: 1.9,
    roughness: 0.22,
    metalness: 0.35,
  });
  const f0 = track.main.getFrameAtT(0.08);
  const tanker = new THREE.Group();
  tanker.name = "tanker";
  const body = new THREE.Mesh(new THREE.BoxGeometry(34, 22, 124), hull);
  body.position.y = 12;
  tanker.add(body);
  const keel = new THREE.Mesh(new THREE.BoxGeometry(34.6, 2.2, 122), boot);
  keel.position.y = 2.4;
  tanker.add(keel);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(12, 1.1, 108), stripe);
  belt.position.y = 16.4;
  tanker.add(belt);
  const superstruct = new THREE.Mesh(new THREE.BoxGeometry(20, 26, 22), rust);
  superstruct.position.set(0, 28, -38);
  tanker.add(superstruct);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(18, 3.4, 0.7), glass);
  windows.position.set(0, 34, -27.2);
  tanker.add(windows);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 24, 8), rust);
  stack.position.set(0, 46, -38);
  tanker.add(stack);
  const flare = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 6), lava);
  flare.position.set(0, 62, -38);
  tanker.add(flare);
  tanker.position.set(f0.x + f0.rx * (f0.width * 0.5 + 58), f0.y, f0.z + f0.rz * (f0.width * 0.5 + 58));
  tanker.rotation.y = Math.atan2(f0.tx, f0.tz) + 0.35;
  group.add(tanker);

  const fn = track.main.getFrameAtT(0.36);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 78, 12), rust);
  tower.position.set(fn.x + fn.rx * (fn.width * 0.5 + 95), fn.y + 32, fn.z + fn.rz * (fn.width * 0.5 + 95));
  group.add(tower);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(10, 9, 4, 12), hull);
  cap.position.copy(tower.position);
  cap.position.y += 40;
  group.add(cap);
  const glow = new THREE.Mesh(new THREE.ConeGeometry(4.2, 14, 8), lava);
  glow.position.copy(tower.position);
  glow.position.y += 48;
  group.add(glow);
}

function dressSkyline(group: THREE.Group, track: TrackWorld): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c343c, metalness: 0.55, roughness: 0.42 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.88, metalness: 0.18 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x0a6a78, emissiveIntensity: 1.6 });
  const sites = [0.16, 0.24, 0.44, 0.82, 0.91];
  const towerPoses: Xform[] = [];
  const boomPoses: Xform[] = [];
  const cabPoses: Xform[] = [];
  for (let i = 0; i < sites.length; i++) {
    const f = track.main.getFrameAtT(sites[i]);
    const side = i % 2 === 0 ? -1 : 1;
    const yaw = Math.atan2(f.tx, f.tz);
    const lat = f.width * 0.5 + 48 + i * 6;
    const x = f.x + f.rx * lat * side;
    const z = f.z + f.rz * lat * side;
    const h = 38 + i * 4;
    towerPoses.push({ x, y: f.y + h * 0.5, z, sy: h });
    boomPoses.push({
      x: x + f.rx * 14 * side,
      y: f.y + 36 + i * 2,
      z: z + f.rz * 14 * side,
      ry: yaw,
    });
    cabPoses.push({ x, y: f.y + 38 + i * 2, z });
  }
  addInstanced(group, new THREE.BoxGeometry(6, 1, 6), steel, towerPoses);
  addInstanced(group, new THREE.BoxGeometry(28, 1.2, 1.4), rust, boomPoses);
  addInstanced(group, new THREE.BoxGeometry(3.2, 2.4, 3.2), neon, cabPoses);

  const drumPoses: Xform[] = [];
  for (let i = 0; i < 8; i++) {
    const f = track.main.getFrameAtT(0.86 + i * 0.012);
    const side = i % 2 ? 1 : -1;
    drumPoses.push({
      x: f.x + f.rx * (f.width * 0.5 + 16) * side,
      y: f.y + 4,
      z: f.z + f.rz * (f.width * 0.5 + 16) * side,
      sy: 7 + (i % 3),
    });
  }
  addInstanced(group, new THREE.CylinderGeometry(2.4, 2.6, 1, 8), rust, drumPoses);
}

/** Rusted quay cliffs beside the ribbon — still a refinery coast, never on the water. */
function dressReef(group: THREE.Group, track: TrackWorld): void {
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a28, roughness: 0.9, metalness: 0.14 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a4448, roughness: 0.92, metalness: 0.08 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a545c, metalness: 0.5, roughness: 0.42 });
  const rustCliffs: Xform[] = [];
  const stoneCliffs: Xform[] = [];
  const tanks: Xform[] = [];
  for (let i = 0; i < 12; i++) {
    const t = 0.78 + i * 0.014;
    const f = track.main.getFrameAtT(t);
    const lat = f.width * 0.5 + 22 + (i % 3) * 5;
    const pose: Xform = {
      x: f.x + f.rx * lat * -1,
      y: f.y + 8,
      z: f.z + f.rz * lat * -1,
      ry: Math.atan2(f.tx, f.tz) + 0.2 * (i % 2 ? 1 : -1),
      sx: 10 + (i % 3) * 4,
      sy: 18 + (i % 4) * 5,
      sz: 14,
    };
    (i % 2 ? stoneCliffs : rustCliffs).push(pose);
    if (i % 3 === 0) tanks.push({ x: pose.x, y: pose.y + 12, z: pose.z });
  }
  const cliffGeo = new THREE.BoxGeometry(1, 1, 1);
  addInstanced(group, cliffGeo, rust, rustCliffs);
  addInstanced(group, cliffGeo, stone, stoneCliffs);
  addInstanced(group, new THREE.CylinderGeometry(3.4, 3.6, 10, 8), steel, tanks);
  const archF = track.main.getFrameAtT(0.9);
  const reefArch = new THREE.Mesh(new THREE.TorusGeometry(14, 2.4, 8, 16, Math.PI), stone);
  reefArch.position.set(archF.x + archF.rx * (archF.width * 0.5 + 28), archF.y + 10, archF.z + archF.rz * (archF.width * 0.5 + 28));
  reefArch.rotation.y = Math.atan2(archF.tx, archF.tz);
  reefArch.rotation.z = Math.PI;
  group.add(reefArch);
}

/** Huge drydock frame over the canal — visual only, banks stay the playable walls. */
function dressShipyard(group: THREE.Group, track: TrackWorld): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x1c242a, metalness: 0.78, roughness: 0.28 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x9a3e16, roughness: 0.68, metalness: 0.3 });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xffc060,
    emissive: 0xff9a30,
    emissiveIntensity: 2.4,
    roughness: 0.28,
    metalness: 0.2,
  });
  const f = track.main.getFrameAtT(0.2);
  const yaw = Math.atan2(f.tx, f.tz);
  const yard = new THREE.Group();
  yard.name = "drydock";
  const span = f.width + 52;
  const legs: Xform[] = [];
  const cables: Xform[] = [];
  for (const side of [-1, 1] as const) {
    legs.push({ x: f.rx * (span * 0.5) * side, y: 29, z: f.rz * (span * 0.5) * side });
    cables.push({ x: span * 0.38 * side, y: 40, z: 0 });
  }
  addInstanced(yard, new THREE.BoxGeometry(5.4, 58, 8), steel, legs);
  addInstanced(yard, new THREE.CylinderGeometry(0.2, 0.2, 20, 5), rust, cables);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(span + 14, 4.6, 7), rust);
  cross.position.y = 56;
  yard.add(cross);
  const hoist = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 14), steel);
  hoist.position.set(span * 0.28, 50, 0);
  yard.add(hoist);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 1.4), lamp);
  beacon.position.set(span * 0.28, 54.6, 0);
  yard.add(beacon);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5.5, 6), rust);
  hook.position.set(span * 0.28, 24, 0);
  yard.add(hook);
  yard.position.set(f.x, f.y, f.z);
  yard.rotation.y = yaw;
  group.add(yard);
}

function dressBeacons(group: THREE.Group, track: TrackWorld): void {
  const white = new THREE.MeshStandardMaterial({ color: 0xd8e0e6, roughness: 0.45, metalness: 0.25 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc43a28, roughness: 0.5 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x148898, emissiveIntensity: 1.5 });
  const lf = track.main.getFrameAtT(0.5);
  const lat = lf.width * 0.5 + 34;
  const lx = lf.x + lf.rx * lat;
  const lz = lf.z + lf.rz * lat;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 46, 10), white);
  shaft.position.set(lx, lf.y + 23, lz);
  group.add(shaft);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 4, 10), stripe);
  band.position.set(lx, lf.y + 36, lz);
  group.add(band);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), neon);
  lamp.position.set(lx, lf.y + 47, lz);
  group.add(lamp);

  const boards: Xform[] = [];
  for (const t of [0.31, 0.47, 0.73]) {
    const f = track.main.getFrameAtT(t);
    boards.push({
      x: f.x + f.rx * (f.width * 0.5 + 20),
      y: f.y + 10,
      z: f.z + f.rz * (f.width * 0.5 + 20),
      ry: Math.atan2(f.tx, f.tz),
    });
  }
  addInstanced(group, new THREE.BoxGeometry(16, 8, 0.6), neon, boards);
}

function dressSilos(group: THREE.Group, track: TrackWorld): void {
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3e28, roughness: 0.86, metalness: 0.18 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a545c, metalness: 0.5, roughness: 0.4 });
  const rustPoses: Xform[] = [];
  const steelPoses: Xform[] = [];
  for (let i = 0; i < 8; i++) {
    const t = 0.37 + i * 0.012;
    const f = track.main.getFrameAtT(t);
    for (const side of [-1, 1] as const) {
      const pose = {
        x: f.x + f.rx * (f.width * 0.5 + 16) * side,
        y: f.y + 13,
        z: f.z + f.rz * (f.width * 0.5 + 16) * side,
      };
      (i % 2 ? rustPoses : steelPoses).push(pose);
    }
  }
  const geo = new THREE.CylinderGeometry(5.5, 5.8, 26, 10);
  addInstanced(group, geo, rust, rustPoses);
  addInstanced(group, geo, steel, steelPoses);
}

/** Interior campus — world mass in the loop hole, never on the ribbon. */
function dressCampus(group: THREE.Group): void {
  const brick = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.88, metalness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1a3a48,
    metalness: 0.7,
    roughness: 0.25,
    emissive: 0x0a2030,
    emissiveIntensity: 0.4,
  });
  const amber = new THREE.MeshStandardMaterial({ color: 0xff9a30, emissive: 0xaa4010, emissiveIntensity: 0.9 });
  const ox = 440;
  const oz = 560;
  const brickPoses: Xform[] = [];
  const glassPoses: Xform[] = [];
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      if (Math.abs(gx) + Math.abs(gz) < 1) continue;
      const h = 18 + ((gx * 3 + gz * 7 + 20) % 28);
      const pose = { x: ox + gx * 22, y: h * 0.5, z: oz + gz * 22, sy: h };
      ((gx + gz) % 2 === 0 ? brickPoses : glassPoses).push(pose);
    }
  }
  const box = new THREE.BoxGeometry(14, 1, 14);
  addInstanced(group, box, brick, brickPoses);
  addInstanced(group, box, glass, glassPoses);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 64, 10), brick);
  stack.position.set(ox, 32, oz);
  group.add(stack);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(3, 10, 6), amber);
  flame.position.set(ox, 68, oz);
  group.add(flame);
}

/** Extra off-ribbon density: catwalks, tanks, pipe racks — never on the water. */
function dressRefineryFill(group: THREE.Group, track: TrackWorld): void {
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.9, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3d4750, metalness: 0.55, roughness: 0.4 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x2a3238, metalness: 0.62, roughness: 0.32 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xff9a30, emissive: 0xaa4010, emissiveIntensity: 0.85 });
  const flare = new THREE.MeshStandardMaterial({ color: 0xff6a18, emissive: 0xff4a00, emissiveIntensity: 1.6 });
  const warning = new THREE.MeshStandardMaterial({ color: 0xffc428, emissive: 0x886010, emissiveIntensity: 0.55 });
  const k0tower: Xform[] = [];
  const k0lip: Xform[] = [];
  const k1drum: Xform[] = [];
  const k1ring: Xform[] = [];
  const k2mast: Xform[] = [];
  const k2jib: Xform[] = [];
  const k2cab: Xform[] = [];
  const k3stack: Xform[] = [];
  const k3flame: Xform[] = [];
  const k4rust: Xform[] = [];
  const k4steel: Xform[] = [];
  const walks: Xform[] = [];
  const rails: Xform[] = [];
  const lamps: Xform[] = [];
  for (let i = 0; i < 22; i++) {
    const t = (i * 0.041) % 1;
    const f = track.main.getFrameAtT(t);
    const side = i % 2 ? 1 : -1;
    const lat = f.width * 0.5 + 20 + (i % 5) * 3.4;
    const px = f.x + f.rx * lat * side;
    const pz = f.z + f.rz * lat * side;
    const yaw = Math.atan2(f.tx, f.tz);
    const kind = i % 5;
    if (kind === 0) {
      k0tower.push({ x: px, y: f.y + 11, z: pz });
      k0lip.push({ x: px, y: f.y + 21.4, z: pz, rx: Math.PI / 2 });
    } else if (kind === 1) {
      k1drum.push({ x: px, y: f.y + 6.2, z: pz });
      k1ring.push({ x: px, y: f.y + 11.4, z: pz, rx: Math.PI / 2 });
    } else if (kind === 2) {
      k2mast.push({ x: px, y: f.y + 14, z: pz });
      k2jib.push({ x: px + f.tx * 8, y: f.y + 26, z: pz + f.tz * 8, ry: yaw });
      k2cab.push({ x: px, y: f.y + 24.2, z: pz });
    } else if (kind === 3) {
      k3stack.push({ x: px, y: f.y + 13, z: pz });
      k3flame.push({ x: px, y: f.y + 28, z: pz });
    } else {
      const pose = { x: px, y: f.y + 6.5, z: pz, sy: 12 + (i % 3) * 2 };
      (i % 2 ? k4rust : k4steel).push(pose);
    }
    if (i % 2 === 0) {
      walks.push({
        x: f.x + f.rx * (lat + 6) * side,
        y: f.y + 12.2,
        z: f.z + f.rz * (lat + 6) * side,
        ry: yaw,
      });
      rails.push({
        x: f.x + f.rx * (lat + 6) * side,
        y: f.y + 13.1,
        z: f.z + f.rz * (lat + 6) * side,
        ry: yaw,
      });
    }
    if (i % 4 === 0) {
      lamps.push({
        x: f.x + f.rx * (lat + 1.2) * side,
        y: f.y + 14.4,
        z: f.z + f.rz * (lat + 1.2) * side,
      });
    }
  }
  addInstanced(group, new THREE.CylinderGeometry(5.4, 7.2, 22, 12), rust, k0tower);
  addInstanced(group, new THREE.TorusGeometry(5.6, 0.35, 6, 14), steel, k0lip);
  addInstanced(group, new THREE.CylinderGeometry(4.4, 4.6, 11, 12), rust, k1drum);
  addInstanced(group, new THREE.TorusGeometry(4.5, 0.22, 6, 12), steel, k1ring);
  addInstanced(group, new THREE.CylinderGeometry(0.45, 0.7, 28, 6), steel, k2mast);
  addInstanced(group, new THREE.BoxGeometry(22, 0.55, 0.7), rust, k2jib);
  addInstanced(group, new THREE.BoxGeometry(3.2, 2.2, 2.4), warning, k2cab);
  addInstanced(group, new THREE.CylinderGeometry(1.1, 1.6, 26, 8), slate, k3stack);
  addInstanced(group, new THREE.ConeGeometry(1.4, 4.2, 6), flare, k3flame);
  const tankGeo = new THREE.CylinderGeometry(3.2, 3.4, 1, 10);
  addInstanced(group, tankGeo, rust, k4rust);
  addInstanced(group, tankGeo, steel, k4steel);
  addInstanced(group, new THREE.BoxGeometry(10, 0.28, 1.15), steel, walks);
  addInstanced(group, new THREE.BoxGeometry(10, 0.12, 0.12), warning, rails);
  addInstanced(group, new THREE.SphereGeometry(0.7, 8, 6), amber, lamps);
}

function dressHorizon(group: THREE.Group): void {
  const rock = new THREE.MeshStandardMaterial({ color: 0x243038, roughness: 1, metalness: 0 });
  const dusk = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.96, metalness: 0 });
  const ridges: [number, number, number, number][] = [
    [-380, -180, 70, 1],
    [1100, 200, 86, 0],
    [80, 1480, 92, 1],
    [-420, 900, 64, 0],
    [1280, 1320, 78, 1],
  ];
  const rockPoses: Xform[] = [];
  const duskPoses: Xform[] = [];
  for (const [x, z, h, warm] of ridges) {
    const pose = { x, y: h * 0.18, z, sx: h, sy: h, sz: h };
    (warm ? duskPoses : rockPoses).push(pose);
  }
  const ridgeGeo = new THREE.CylinderGeometry(0.9, 1.15, 0.55, 6);
  addInstanced(group, ridgeGeo, dusk, duskPoses);
  addInstanced(group, ridgeGeo, rock, rockPoses);
}
