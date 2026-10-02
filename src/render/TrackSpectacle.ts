import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TrackWorld } from "../sim/Track";
import type { Frame } from "../sim/spline";
import { buildTerrain } from "./Terrain";

/**
 * Trackside realism + set pieces, kept out of TrackMesh so the canal shell stays lean:
 * railings, ladders, sodium lamps with light pools, truss bridges with sponsor banners,
 * a grandstand crowd with camera flashes, a chase-lit start/finish arch, sweeping
 * searchlights, live flare fire and fireworks. Everything is instanced or merged.
 */

export const COPING_RISE = 2.2;
export const COPING_THICK = 0.34;
const GRID_T = 0.042;

type Ticker = (time: number, dt: number, cam: THREE.Vector3) => void;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function copeTop(f: Frame): number {
  return f.y + f.bankHeight + COPING_RISE + COPING_THICK;
}

function yawOf(f: Frame): number {
  return Math.atan2(f.tx, f.tz);
}

function at(f: Frame, lat: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(f.x + f.rx * lat, y, f.z + f.rz * lat);
}

function setInst(mesh: THREE.InstancedMesh, i: number, pos: THREE.Vector3, rot: THREE.Euler, scale = _s.set(1, 1, 1)): void {
  _q.setFromEuler(rot);
  _m.compose(pos, _q, scale);
  mesh.setMatrixAt(i, _m);
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of prepared) {
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  }
  const out = mergeGeometries(prepared, false)!;
  for (const g of parts) g.dispose();
  return out;
}

// ─────────────────────────────── canvas banners ───────────────────────────────

const SPONSORS: [string, string, string][] = [
  ["SURGE OIL", "#ffb020", "#1a0c02"],
  ["KRAKEN ENERGY", "#2ee6ff", "#021018"],
  ["HYDRO HAVOC", "#ff3d6e", "#14040a"],
  ["TURBO COLA", "#ffe14a", "#2a0606"],
  ["RIPTIDE REFINERY", "#e7fbff", "#0a1a22"],
  ["NITRO MARINE", "#7af0ff", "#04121a"],
  ["WAKE ZONE", "#ff8a2a", "#100a04"],
  ["MAX THROTTLE", "#b4ff3a", "#081004"],
];

/** 8-row atlas of sponsor boards. Null under Node (tests), where boards fall back to colour. */
function sponsorAtlas(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d");
  if (!g) return null;
  SPONSORS.forEach(([text, fg, bg], i) => {
    const y = i * 128;
    const grad = g.createLinearGradient(0, y, 0, y + 128);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, "#000");
    g.fillStyle = grad;
    g.fillRect(0, y, 1024, 128);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(8, y + 8, 1008, 112);
    g.font = "900 76px Orbitron, 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = fg;
    g.shadowBlur = 22;
    g.fillStyle = fg;
    g.fillText(text, 512, y + 68);
    g.shadowBlur = 0;
    for (let k = 0; k < 6; k++) {
      g.fillStyle = fg;
      g.globalAlpha = 0.55;
      g.fillRect(30 + k * 12, y + 30, 6, 68);
      g.fillRect(1024 - 36 - k * 12, y + 30, 6, 68);
      g.globalAlpha = 1;
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Quad facing -Z (toward boats that approach along +Z) using atlas row `row`. */
function bannerQuad(w: number, h: number, row: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i);
    uv.setY(i, 1 - (row + 1 - v) / SPONSORS.length);
  }
  return g;
}

// ─────────────────────────────── shaders ───────────────────────────────

function lightPoolMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0xffa040) } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 2.2) * 0.32;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

function beamMaterial(color: number, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vAlong = uv.y;
        #ifdef USE_INSTANCING
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        #else
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
        #endif
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // Bright at the lamp, soft-edged, fading down the shaft.
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fall = pow(vAlong, 1.8);
        float a = edge * fall * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

function fireMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        // Camera-facing billboard around the instance origin.
        vec4 origin = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 scale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        origin.xy += position.xy * scale;
        gl_Position = projectionMatrix * origin;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec2 p = vUv;
        float t = uTime * 1.6 + vSeed * 10.0;
        float turb = n(vec2(p.x * 4.0, p.y * 3.0 - t * 2.2)) * 0.6 + n(vec2(p.x * 9.0, p.y * 6.0 - t * 3.6)) * 0.4;
        float width = mix(0.36, 0.04, pow(p.y, 0.8)) * (0.8 + 0.4 * turb);
        float body = smoothstep(width, width * 0.25, abs(p.x - 0.5 + (turb - 0.5) * 0.18 * p.y));
        float core = smoothstep(width * 0.55, 0.0, abs(p.x - 0.5)) * (1.0 - p.y);
        float fade = smoothstep(0.0, 0.08, p.y) * (1.0 - smoothstep(0.55, 1.0, p.y + turb * 0.3));
        float a = body * fade;
        vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.3), turb);
        col = mix(col, vec3(1.0, 0.95, 0.8), core);
        gl_FragColor = vec4(col * a * 2.6, a);
      }
    `,
  });
}

function crowdMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHype: { value: 0 },
      uSun: { value: new THREE.Vector3(-0.62, 0.45, 0.38).normalize() },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSeed;
      uniform float uTime;
      uniform float uHype;
      varying vec3 vColor;
      varying vec3 vN;
      void main() {
        vColor = aColor;
        vec3 p = position;
        // Everyone bobs; at hype the stand erupts into a travelling wave.
        float bob = abs(sin(uTime * (3.0 + aSeed * 2.0) + aSeed * 30.0)) * 0.12;
        vec4 world = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float wave = max(0.0, sin(world.x * 0.12 + world.z * 0.12 - uTime * 5.0)) * uHype * 0.55;
        p.y += (bob + wave) * step(0.0, position.y);
        if (position.y > 0.2) p.x += sin(uTime * 7.0 + aSeed * 20.0) * 0.08 * (0.3 + uHype);
        vN = normalize(mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSun;
      varying vec3 vColor;
      varying vec3 vN;
      void main() {
        float l = 0.45 + 0.55 * max(0.0, dot(normalize(vN), uSun));
        gl_FragColor = vec4(vColor * l, 1.0);
      }
    `,
  });
}

function sparkMaterial(size: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: size } },
    vertexShader: `
      attribute vec4 aColor;
      uniform float uSize;
      varying vec4 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(uSize * (0.35 + 0.65 * aColor.a) * (220.0 / max(1.0, -mv.z)), 0.0, 64.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec4 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = pow(1.0 - d, 1.8) * vColor.a;
        gl_FragColor = vec4(vColor.rgb * (1.0 + (1.0 - d) * 1.5) * a, a);
      }
    `,
  });
}

// ─────────────────────────────── fireworks ───────────────────────────────

const FW_PARTICLES = 2400;
const FW_PALETTE = [0xff3d6e, 0x2ee6ff, 0xffe14a, 0xb4ff3a, 0xff8a2a, 0xe7fbff, 0xc070ff];

class Fireworks {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private hue: Float32Array;
  private head = 0;
  private rockets: { x: number; y: number; z: number; vy: number; burstY: number; color: number; at: number; trail: number }[] = [];
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private live = 0;
  onBurst?: (x: number, y: number, z: number) => void;
  onLaunch?: (x: number, y: number, z: number) => void;

  constructor() {
    this.pos = new Float32Array(FW_PARTICLES * 3);
    this.vel = new Float32Array(FW_PARTICLES * 3);
    this.col = new Float32Array(FW_PARTICLES * 4);
    this.life = new Float32Array(FW_PARTICLES);
    this.max = new Float32Array(FW_PARTICLES);
    this.hue = new Float32Array(FW_PARTICLES * 3);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aColor", this.colAttr);
    this.points = new THREE.Points(geo, sparkMaterial(11));
    this.points.frustumCulled = false;
    this.points.name = "fireworks";
    this.points.renderOrder = 8;
  }

  /** Rocket climbs from (x, y, z) and bursts `delay + ~1.1 s` later. Returns burst time offset. */
  launch(x: number, y: number, z: number, delay: number, color?: number): number {
    const climb = 20 + Math.random() * 14;
    const vy = 30 + Math.random() * 6;
    const c = color ?? FW_PALETTE[Math.floor(Math.random() * FW_PALETTE.length)];
    this.rockets.push({ x, y, z, vy, burstY: y + climb, color: c, at: delay, trail: 0 });
    return delay + climb / (vy * 0.8);
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, life: number): void {
    const i = this.head;
    this.head = (this.head + 1) % FW_PARTICLES;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.hue[i * 3] = color.r;
    this.hue[i * 3 + 1] = color.g;
    this.hue[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.max[i] = life;
  }

  private burst(x: number, y: number, z: number, hex: number): void {
    const c = new THREE.Color(hex);
    const white = new THREE.Color(0xffffff);
    const ring = Math.random() < 0.35;
    const n = 170;
    for (let k = 0; k < n; k++) {
      let dx: number;
      let dy: number;
      let dz: number;
      if (ring) {
        const a = (k / n) * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a) * 0.3 + 0.1;
        dz = Math.sin(a);
      } else {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        dx = r * Math.cos(a);
        dy = u;
        dz = r * Math.sin(a);
      }
      const sp = 13 + Math.random() * 6;
      this.emit(x, y, z, dx * sp, dy * sp, dz * sp, k % 9 === 0 ? white : c, 1.5 + Math.random() * 0.9);
    }
    this.onBurst?.(x, y, z);
  }

  update(dt: number): void {
    for (let r = this.rockets.length - 1; r >= 0; r--) {
      const k = this.rockets[r];
      if (k.at > 0) {
        k.at -= dt;
        if (k.at <= 0) this.onLaunch?.(k.x, k.y, k.z);
        continue;
      }
      k.y += k.vy * dt;
      k.vy *= 1 - 0.6 * dt;
      k.trail -= dt;
      if (k.trail <= 0) {
        k.trail = 0.016;
        this.emit(k.x, k.y, k.z, (Math.random() - 0.5) * 1.5, -2, (Math.random() - 0.5) * 1.5, new THREE.Color(0xffd8a0), 0.45);
      }
      if (k.y >= k.burstY) {
        this.burst(k.x, k.y, k.z, k.color);
        this.rockets.splice(r, 1);
      }
    }
    let live = 0;
    for (let i = 0; i < FW_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        if (this.col[i * 4 + 3] !== 0) this.col[i * 4 + 3] = 0;
        continue;
      }
      live++;
      this.life[i] -= dt;
      const drag = 1 - 1.4 * dt;
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - 9 * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const twinkle = k < 0.35 ? (Math.random() < 0.5 ? 1 : 0.2) : 1;
      this.col[i * 4] = this.hue[i * 3];
      this.col[i * 4 + 1] = this.hue[i * 3 + 1];
      this.col[i * 4 + 2] = this.hue[i * 3 + 2];
      this.col[i * 4 + 3] = Math.min(1, k * 1.6) * twinkle;
    }
    if (live || this.live) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    this.live = live;
    this.points.visible = live > 0 || this.rockets.length > 0;
  }
}

// ─────────────────────────────── spectacle ───────────────────────────────

export type Celebration = "go" | "lap" | "finish";

export class TrackSpectacle {
  readonly group = new THREE.Group();
  private tickers: Ticker[] = [];
  private fireworks = new Fireworks();
  private track: TrackWorld;
  private hype = 0;
  private crowdMat: THREE.ShaderMaterial | null = null;
  private groundAt: (x: number, z: number) => number = () => 0;

  constructor(track: TrackWorld) {
    this.track = track;
    this.group.name = "trackSpectacle";
    const atlas = sponsorAtlas();
    this.terrain();
    this.railings();
    this.ladders();
    this.lamps();
    this.bridges(atlas);
    this.wallBanners(atlas);
    this.startArch();
    this.grandstands();
    this.searchlights();
    this.flareFire();
    this.group.add(this.fireworks.points);
  }

  set onBurst(fn: ((x: number, y: number, z: number) => void) | undefined) {
    this.fireworks.onBurst = fn;
  }

  set onLaunch(fn: ((x: number, y: number, z: number) => void) | undefined) {
    this.fireworks.onLaunch = fn;
  }

  update(time: number, dt: number, cam: THREE.Vector3): void {
    this.hype = Math.max(0, this.hype - dt * 0.12);
    if (this.crowdMat) {
      this.crowdMat.uniforms.uTime.value = time;
      this.crowdMat.uniforms.uHype.value = Math.min(1, this.hype);
    }
    for (const t of this.tickers) t(time, dt, cam);
    this.fireworks.update(dt);
  }

  /** Fireworks + crowd eruption. Returns burst offsets (s) so audio can land the booms. */
  celebrate(kind: Celebration, atT?: number): number[] {
    const tr = this.track;
    const rockets = kind === "finish" ? 16 : kind === "go" ? 8 : 4;
    const spread = kind === "finish" ? 4.2 : kind === "go" ? 1.8 : 1.0;
    const baseT = atT ?? (kind === "go" ? GRID_T + 0.035 : 0.004);
    this.hype = kind === "finish" ? 3 : kind === "go" ? 2 : 1.2;
    const out: number[] = [];
    for (let i = 0; i < rockets; i++) {
      const f = tr.main.getFrameAtT(baseT + (Math.random() - 0.3) * 0.012);
      const side = i % 2 ? 1 : -1;
      const lat = (f.width * 0.5 + 8 + Math.random() * 16) * side;
      const delay = (i / rockets) * spread + Math.random() * 0.15;
      out.push(this.fireworks.launch(f.x + f.rx * lat, f.y + 2, f.z + f.rz * lat, delay));
    }
    return out;
  }

  // ── realism ──

  private terrain(): void {
    // Harbour basin for the moored tanker (matches dressLandmarks in TrackMesh).
    const f0 = this.track.main.getFrameAtT(0.08);
    const lat = f0.width * 0.5 + 58;
    const yaw = Math.atan2(f0.tx, f0.tz) + 0.35;
    const t = buildTerrain(this.track, {
      basins: [{ x: f0.x + f0.rx * lat, z: f0.z + f0.rz * lat, hx: 26, hz: 74, yaw: -yaw }],
    });
    this.groundAt = t.heightAt;
    this.group.add(t.mesh);
  }

  private railings(): void {
    const tr = this.track;
    const step = 3;
    const n = Math.floor(tr.main.totalLength / step);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), new THREE.MeshStandardMaterial({ color: 0x8a949c, metalness: 0.7, roughness: 0.42 }), n * 2);
    const railGeo = new THREE.BoxGeometry(0.07, 0.07, 1);
    const rails = new THREE.InstancedMesh(railGeo, new THREE.MeshStandardMaterial({ color: 0x9aa4ac, metalness: 0.75, roughness: 0.36 }), n * 2);
    const tops = new THREE.InstancedMesh(railGeo, new THREE.MeshStandardMaterial({ color: 0xe8b818, metalness: 0.3, roughness: 0.45, emissive: 0x2a1c00, emissiveIntensity: 0.5 }), n * 2);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const f0 = tr.main.getFrameAtS(i * step);
      const f1 = tr.main.getFrameAtS((i + 1) * step);
      for (const side of [-1, 1] as const) {
        const lat0 = (f0.width * 0.5 + 0.95) * side;
        const lat1 = (f1.width * 0.5 + 0.95) * side;
        const y0 = copeTop(f0);
        const y1 = copeTop(f1);
        const a = at(f0, lat0, y0);
        const b = at(f1, lat1, y1);
        setInst(posts, k, _p.set(a.x, y0 + 0.55, a.z), _e.set(0, yawOf(f0), 0));
        const len = a.distanceTo(b);
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        const pitch = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
        const mid = a.clone().add(b).multiplyScalar(0.5);
        setInst(rails, k, _p.set(mid.x, mid.y + 0.55, mid.z), _e.set(pitch, yaw, 0, "YXZ"), _s.set(1, 1, len));
        setInst(tops, k, _p.set(mid.x, mid.y + 1.08, mid.z), _e.set(pitch, yaw, 0, "YXZ"), _s.set(1.3, 1.3, len));
        k++;
      }
    }
    for (const m of [posts, rails, tops]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.name = "railing";
      this.group.add(m);
    }
    _e.order = "XYZ";
  }

  private ladders(): void {
    const tr = this.track;
    const parts: THREE.BufferGeometry[] = [];
    const h = 8.6;
    for (const x of [-0.24, 0.24]) parts.push(boxAt(0.06, h, 0.06, x, h * 0.5, 0));
    for (let r = 0; r < 26; r++) parts.push(boxAt(0.5, 0.035, 0.035, 0, 0.3 + r * 0.32, 0));
    parts.push(boxAt(0.06, 0.06, 0.3, -0.24, h, 0.15), boxAt(0.06, 0.06, 0.3, 0.24, h, 0.15));
    const geo = merge(parts);
    const every = 85;
    const count = Math.floor(tr.main.totalLength / every);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x6a6e70, metalness: 0.8, roughness: 0.5 }), count);
    for (let i = 0; i < count; i++) {
      const f = tr.main.getFrameAtS(i * every + 20);
      const side = i % 2 ? 1 : -1;
      const p = at(f, (f.width * 0.5 - 0.1) * side, f.y - 1.2);
      // Rails lie in the wall plane; face the canal.
      setInst(mesh, i, p, _e.set(0, Math.atan2(side * f.rx, side * f.rz), 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = "ladders";
    this.group.add(mesh);
  }

  private lamps(): void {
    const tr = this.track;
    const every = 46;
    const count = Math.floor(tr.main.totalLength / every);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3034, metalness: 0.6, roughness: 0.5 });
    const pole = merge([boxAt(0.22, 9, 0.22, 0, 4.5, 0), boxAt(0.14, 0.14, 2.6, 0, 8.9, -1.2), boxAt(0.5, 0.7, 0.5, 0, 0.35, 0)]);
    const poles = new THREE.InstancedMesh(pole, poleMat, count);
    const heads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 5.5 }),
      count,
    );
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, lightPoolMaterial(), count);
    const coneGeo = new THREE.CylinderGeometry(0.25, 3.6, 1, 16, 1, true);
    coneGeo.translate(0, -0.5, 0);
    const cones = new THREE.InstancedMesh(coneGeo, beamMaterial(0xffa850, 0.07), count);
    for (let i = 0; i < count; i++) {
      const f = tr.main.getFrameAtS(i * every + 7);
      const side = i % 2 ? 1 : -1;
      const yaw = yawOf(f) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const base = at(f, (f.width * 0.5 + 1.7) * side, copeTop(f));
      setInst(poles, i, base, _e.set(0, yaw, 0));
      // Arm reaches over the canal toward local -Z of the pole.
      const head = at(f, (f.width * 0.5 + 1.7 - 2.4) * side, copeTop(f) + 8.78);
      setInst(heads, i, head, _e.set(0, yaw, 0));
      const drop = head.y - f.y;
      setInst(cones, i, head, _e.set(0, 0, 0), _s.set(1, drop, 1));
      setInst(pools, i, _p.set(head.x, f.y + 0.09, head.z), _e.set(0, 0, 0), _s.set(9, 1, 9));
    }
    for (const m of [poles, heads, pools, cones]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      this.group.add(m);
    }
    poles.name = "lampPoles";
    heads.name = "lampHeads";
    pools.name = "lampPools";
    cones.name = "lampCones";
    pools.renderOrder = 3;
    cones.renderOrder = 9;
  }

  // ── set pieces ──

  private bridges(atlas: THREE.CanvasTexture | null): void {
    const tr = this.track;
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a4248, metalness: 0.7, roughness: 0.38 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa0301a, metalness: 0.45, roughness: 0.5 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.9 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7af0ff, emissiveIntensity: 3.2 });
    const boardMat = atlas
      ? new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.5 })
      : new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0x2ee6ff, emissiveIntensity: 0.6 });
    const sites = [0.125, 0.435, 0.865];
    sites.forEach((t, si) => {
      const f = tr.main.getFrameAtT(t);
      const span = f.width + 14;
      const deckY = copeTop(f) + 7.5;
      const trussParts: THREE.BufferGeometry[] = [];
      const redParts: THREE.BufferGeometry[] = [];
      const H = 3.4;
      for (const z of [-1.8, 1.8]) {
        trussParts.push(boxAt(span, 0.5, 0.5, 0, 0, z));
        redParts.push(boxAt(span, 0.45, 0.45, 0, H, z));
        const bays = Math.round(span / 3.2);
        for (let b = 0; b <= bays; b++) {
          const x = -span / 2 + (b / bays) * span;
          trussParts.push(boxAt(0.3, H, 0.3, x, H / 2, z));
          if (b < bays) {
            const x2 = -span / 2 + ((b + 1) / bays) * span;
            const dx = x2 - x;
            const len = Math.hypot(dx, H);
            const ang = Math.atan2(H, dx) * (b % 2 ? -1 : 1);
            trussParts.push(boxAt(len, 0.22, 0.22, (x + x2) / 2, H / 2, z, 0, 0, ang));
          }
        }
      }
      for (let b = 0; b <= 6; b++) redParts.push(boxAt(0.3, 0.3, 3.6, -span / 2 + (b / 6) * span, H, 0));
      trussParts.push(boxAt(span, 0.32, 3.4, 0, -0.3, 0));
      const g = new THREE.Group();
      g.name = `bridge${si}`;
      const truss = new THREE.Mesh(merge(trussParts), steel);
      const top = new THREE.Mesh(merge(redParts), red);
      truss.castShadow = true;
      top.castShadow = true;
      g.add(truss, top);
      // Under-deck light bar and sponsor boards on both faces.
      const strip = new THREE.Mesh(new THREE.BoxGeometry(span - 2, 0.12, 0.4), glow);
      strip.position.set(0, -0.52, 0);
      g.add(strip);
      const front = new THREE.Mesh(bannerQuad(Math.min(18, span * 0.7), 2.3, (si * 3) % SPONSORS.length), boardMat);
      front.position.set(0, H * 0.5, -2.1);
      const back = new THREE.Mesh(bannerQuad(Math.min(18, span * 0.7), 2.3, (si * 3 + 1) % SPONSORS.length), boardMat);
      back.rotation.y = Math.PI;
      back.position.set(0, H * 0.5, 2.1);
      g.add(front, back);
      // Abutments on both banks.
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(4, deckY - copeTop(f) + 0.6, 6), concrete);
        pier.position.set((span / 2 + 0.5) * side, -(deckY - copeTop(f)) / 2 - 0.2, 0);
        pier.castShadow = true;
        g.add(pier);
      }
      g.position.set(f.x, deckY, f.z);
      // Local X spans the canal (along the right vector), local +Z runs with traffic,
      // so the -Z banner faces oncoming boats.
      g.rotation.y = Math.atan2(-f.rz, f.rx);
      this.group.add(g);
    });
  }

  private wallBanners(atlas: THREE.CanvasTexture | null): void {
    if (!atlas) return;
    const tr = this.track;
    const parts: THREE.BufferGeometry[] = [];
    const every = 210;
    const count = Math.floor(tr.main.totalLength / every);
    for (let i = 0; i < count; i++) {
      const f = tr.main.getFrameAtS(i * every + 120);
      if (f.t > 0.52 && f.t < 0.78) continue;
      const side = i % 2 ? 1 : -1;
      const q = bannerQuad(12, 1.5, i % SPONSORS.length);
      // Face the canal: plane normal points to -side across the channel.
      q.rotateY(Math.atan2(f.rx, f.rz) + (side > 0 ? 0 : Math.PI));
      const p = at(f, (f.width * 0.5 - 0.04) * side, f.y + 2.6);
      q.translate(p.x, p.y, p.z);
      parts.push(q);
    }
    if (!parts.length) return;
    const mesh = new THREE.Mesh(
      mergeGeometries(parts, false)!,
      new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    mesh.name = "wallBanners";
    this.group.add(mesh);
  }

  private startArch(): void {
    const s = this.track.start;
    const span = s.width * 0.5 + 4;
    const count = 64;
    const bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          attribute float aIdx;
          varying float vIdx;
          void main() {
            vIdx = aIdx;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying float vIdx;
          void main() {
            float chase = step(0.55, fract(vIdx * 0.125 - uTime * 2.2));
            vec3 a = vec3(1.0, 0.85, 0.35);
            vec3 b = vec3(0.2, 0.9, 1.0);
            gl_FragColor = vec4(mix(a * 0.25, mix(a, b, step(0.5, fract(vIdx * 0.5))) * 4.0, chase), 1.0);
          }
        `,
      }),
      count,
    );
    const idx = new Float32Array(count);
    const yaw = Math.atan2(s.tx, s.tz);
    for (let i = 0; i < count; i++) {
      idx[i] = i;
      // Up the left post, across the beam, down the right post.
      const u = i / (count - 1);
      let lat: number;
      let y: number;
      if (u < 0.25) {
        lat = -span;
        y = u / 0.25 * 14.6;
      } else if (u < 0.75) {
        lat = -span + ((u - 0.25) / 0.5) * span * 2;
        y = 16.1;
      } else {
        lat = span;
        y = (1 - (u - 0.75) / 0.25) * 14.6;
      }
      const p = at(s, lat, s.y + y);
      p.addScaledVector(new THREE.Vector3(s.tx, 0, s.tz), -0.75);
      setInst(bulbs, i, p, _e.set(0, yaw, 0));
    }
    bulbs.geometry.setAttribute("aIdx", new THREE.InstancedBufferAttribute(idx, 1));
    bulbs.instanceMatrix.needsUpdate = true;
    bulbs.computeBoundingSphere();
    bulbs.name = "startBulbs";
    this.group.add(bulbs);
    const mat = bulbs.material as THREE.ShaderMaterial;
    this.tickers.push((t) => (mat.uniforms.uTime.value = t));

    // Chequered banner hanging under the beam.
    const tex = new THREE.DataTexture(
      (() => {
        const d = new Uint8Array(16 * 2 * 4);
        for (let x = 0; x < 16; x++) {
          for (let y = 0; y < 2; y++) {
            const w = (x + y) % 2 === 0 ? 240 : 14;
            d.set([w, w, w, 255], (y * 16 + x) * 4);
          }
        }
        return d;
      })(),
      16,
      2,
    );
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 2, 1.6), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6 }));
    banner.position.set(s.x, s.y + 14.6, s.z);
    banner.rotation.y = yaw;
    banner.name = "finishBanner";
    this.group.add(banner);
  }

  private grandstands(): void {
    const tr = this.track;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x7a7670, roughness: 0.92 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xd8dde0, metalness: 0.4, roughness: 0.4 });
    const tiers = 6;
    const people: { p: THREE.Vector3; yaw: number }[] = [];
    const steps: THREE.BufferGeometry[] = [];
    const roofs: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1] as const) {
      const t0 = GRID_T + 0.006;
      const t1 = GRID_T + 0.03;
      const segs = 14;
      for (let k = 0; k < segs; k++) {
        const f = tr.main.getFrameAtT(t0 + ((t1 - t0) * (k + 0.5)) / segs);
        const segLen = ((t1 - t0) * tr.main.totalLength) / segs + 0.2;
        const yaw = Math.atan2(f.rx, f.rz);
        for (let r = 0; r < tiers; r++) {
          const lat = (f.width * 0.5 + 3.6 + r * 1.3) * side;
          const y = copeTop(f) + 0.4 + r * 0.75;
          // Each tier runs down to the water so the stand sits on the quay, not in the air.
          const topY = y + 0.4;
          const botY = f.y - 1.6;
          const g = new THREE.BoxGeometry(1.3, topY - botY, segLen);
          g.rotateY(yaw - Math.PI / 2);
          const c = at(f, lat, (topY + botY) / 2);
          g.translate(c.x, c.y, c.z);
          steps.push(g);
          const seats = Math.floor(segLen / 0.85);
          for (let q = 0; q < seats; q++) {
            if (Math.random() < 0.12) continue;
            const along = (q / seats - 0.5) * segLen;
            const pp = at(f, lat + (Math.random() - 0.5) * 0.3, y + 0.72);
            pp.x += f.tx * along;
            pp.z += f.tz * along;
            people.push({ p: pp, yaw: yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2) });
          }
        }
        const roof = new THREE.BoxGeometry(tiers * 1.3 + 2, 0.18, segLen);
        roof.rotateY(yaw - Math.PI / 2);
        roof.rotateZ(0);
        const rc = at(f, (f.width * 0.5 + 3.6 + tiers * 0.65) * side, copeTop(f) + tiers * 0.75 + 4.2);
        roof.translate(rc.x, rc.y, rc.z);
        roofs.push(roof);
        if (k % 3 === 0) {
          const post = new THREE.BoxGeometry(0.25, tiers * 0.75 + 4.2, 0.25);
          const pc = at(f, (f.width * 0.5 + 3.6 + tiers * 1.3) * side, copeTop(f) + (tiers * 0.75 + 4.2) / 2);
          post.translate(pc.x, pc.y, pc.z);
          roofs.push(post);
        }
      }
    }
    const stand = new THREE.Mesh(merge(steps), concrete);
    stand.name = "grandstand";
    stand.receiveShadow = true;
    const roof = new THREE.Mesh(merge(roofs), roofMat);
    roof.castShadow = true;
    this.group.add(stand, roof);

    // Crowd: a body + head per spectator, coloured shirts, bobbing in the shader.
    const body = merge([boxAt(0.42, 0.62, 0.26, 0, 0.0, 0), boxAt(0.24, 0.24, 0.24, 0, 0.48, 0)]);
    this.crowdMat = crowdMaterial();
    const crowd = new THREE.InstancedMesh(body, this.crowdMat, people.length);
    const colors = new Float32Array(people.length * 3);
    const seeds = new Float32Array(people.length);
    const shirts = [0xff3d6e, 0x2ee6ff, 0xffe14a, 0xe7fbff, 0x1a2a3a, 0xff8a2a, 0x3a8a3a, 0x8a3ac0, 0xc02a2a];
    const c = new THREE.Color();
    people.forEach((pp, i) => {
      setInst(crowd, i, pp.p, _e.set(0, pp.yaw, 0), _s.set(1, 0.9 + Math.random() * 0.25, 1));
      c.setHex(shirts[Math.floor(Math.random() * shirts.length)]);
      colors.set([c.r, c.g, c.b], i * 3);
      seeds[i] = Math.random();
    });
    crowd.geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
    crowd.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    crowd.instanceMatrix.needsUpdate = true;
    crowd.computeBoundingSphere();
    crowd.name = "crowd";
    this.group.add(crowd);

    // Camera flashes popping across the stands.
    const nFlash = 90;
    const fpos = new Float32Array(nFlash * 3);
    const fcol = new Float32Array(nFlash * 4);
    const geo = new THREE.BufferGeometry();
    for (let i = 0; i < nFlash; i++) {
      const pp = people[Math.floor(Math.random() * people.length)]?.p ?? new THREE.Vector3();
      fpos.set([pp.x, pp.y + 0.6, pp.z], i * 3);
      fcol.set([1, 1, 1, 0], i * 4);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    const colAttr = new THREE.BufferAttribute(fcol, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aColor", colAttr);
    const flashes = new THREE.Points(geo, sparkMaterial(2.2));
    flashes.frustumCulled = false;
    flashes.name = "cameraFlashes";
    this.group.add(flashes);
    this.tickers.push((_t, dt) => {
      const rate = 0.6 + this.hype * 2.4;
      for (let i = 0; i < nFlash; i++) {
        const a = fcol[i * 4 + 3];
        fcol[i * 4 + 3] = a > 0 ? Math.max(0, a - dt * 9) : Math.random() < rate * dt * 0.25 ? 1 : 0;
      }
      colAttr.needsUpdate = true;
    });
  }

  private searchlights(): void {
    const tr = this.track;
    const sites = [0.095, 0.24, 0.4, 0.82, 0.93, 0.995];
    const geo = new THREE.CylinderGeometry(9, 0.6, 1, 20, 1, true);
    geo.translate(0, 0.5, 0);
    // Flip uv.y so the lamp end (y = 0) is bright.
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mat = beamMaterial(0xfff0d8, 0.42);
    const beams = new THREE.InstancedMesh(geo, mat, sites.length);
    const housings = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1.1, 1.3, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0d0, emissiveIntensity: 4 }),
      sites.length,
    );
    const bases = sites.map((t, i) => {
      const f = tr.main.getFrameAtT(t);
      const side = i % 2 ? 1 : -1;
      const p = at(f, (f.width * 0.5 + 38 + (i % 3) * 9) * side, 0);
      p.y = this.groundAt(p.x, p.z) + 1.2;
      return { p, phase: i * 1.7, side };
    });
    beams.name = "searchlights";
    beams.frustumCulled = false;
    beams.renderOrder = 10;
    housings.name = "searchlightHousings";
    this.group.add(beams, housings);
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    this.tickers.push((t) => {
      bases.forEach((b, i) => {
        const yaw = t * 0.32 * (i % 2 ? 1 : -1) + b.phase;
        const elev = 0.95 + 0.28 * Math.sin(t * 0.5 + b.phase);
        dir.set(Math.cos(yaw) * Math.cos(elev), Math.sin(elev), Math.sin(yaw) * Math.cos(elev));
        _q.setFromUnitVectors(up, dir);
        _m.compose(b.p, _q, _s.set(1, 520, 1));
        beams.setMatrixAt(i, _m);
        _m.compose(b.p, _q, _s.set(1, 1, 1));
        housings.setMatrixAt(i, _m);
      });
      beams.instanceMatrix.needsUpdate = true;
      housings.instanceMatrix.needsUpdate = true;
    });
  }

  private flareFire(): void {
    const tr = this.track;
    const spots: THREE.Vector3[] = [];
    for (const t of [0.11, 0.33, 0.49]) {
      const f = tr.main.getFrameAtT(t);
      spots.push(at(f, f.width * 0.5 + 16, f.y + 24 + 28 + 3.5));
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const seeds = new Float32Array(spots.length * 2);
    const mat = fireMaterial();
    const fires = new THREE.InstancedMesh(geo, mat, spots.length * 2);
    spots.forEach((p, i) => {
      setInst(fires, i * 2, p, _e.set(0, 0, 0), _s.set(9, 24, 1));
      setInst(fires, i * 2 + 1, p, _e.set(0, 0, 0), _s.set(6, 15, 1));
      seeds[i * 2] = i * 0.37;
      seeds[i * 2 + 1] = i * 0.37 + 0.5;
    });
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    fires.instanceMatrix.needsUpdate = true;
    fires.frustumCulled = false;
    fires.name = "flareFire";
    fires.renderOrder = 9;
    this.group.add(fires);
    this.tickers.push((t) => (mat.uniforms.uTime.value = t));

    // Embers drifting up off each flare.
    const n = 160;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const vel = new Float32Array(n * 3);
    const life = new Float32Array(n);
    const geoE = new THREE.BufferGeometry();
    const posA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const colA = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
    geoE.setAttribute("position", posA);
    geoE.setAttribute("aColor", colA);
    const embers = new THREE.Points(geoE, sparkMaterial(1.6));
    embers.frustumCulled = false;
    embers.name = "flareEmbers";
    this.group.add(embers);
    this.tickers.push((_t, dt) => {
      for (let i = 0; i < n; i++) {
        life[i] -= dt;
        if (life[i] <= 0) {
          const s = spots[i % spots.length];
          pos.set([s.x + (Math.random() - 0.5) * 3, s.y + 4 + Math.random() * 6, s.z + (Math.random() - 0.5) * 3], i * 3);
          vel.set([(Math.random() - 0.5) * 3 + 2, 5 + Math.random() * 6, (Math.random() - 0.5) * 3], i * 3);
          life[i] = 1.5 + Math.random() * 2;
        }
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = Math.min(1, life[i] / 1.5);
        col.set([1, 0.45 + k * 0.3, 0.12, k * (Math.random() < 0.9 ? 1 : 0.3)], i * 4);
      }
      posA.needsUpdate = true;
      colA.needsUpdate = true;
    });
  }
}
