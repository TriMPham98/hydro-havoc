import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { saturate } from "../sim/math";
import { gerstnerHeight } from "../sim/waterHeight";

/** Hull pose is ~0.55 above Gerstner water; keep the strip on the canal. */
const WATERLINE = 0.52;

export function ribbonLength(speed: number, boosting: boolean, player: boolean): number {
  const stretch = 4.15 + speed * 0.15 + (boosting ? 3.9 : 0);
  const cap = player ? 19 : 14;
  return Math.min(cap, stretch * (player ? 1.18 : 1));
}

function foamMaterial(skirt: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    uniforms: {
      uColorFoam: { value: new THREE.Color(0xd8eef2) },
      uColorTeal: { value: new THREE.Color(0x0e6a78) },
      uColorBoost: { value: new THREE.Color(0x7af0ff) },
      uBoost: { value: 0 },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uSkirt: { value: skirt ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorFoam;
      uniform vec3 uColorTeal;
      uniform vec3 uColorBoost;
      uniform float uBoost;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uSkirt;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.42, 0.0, min(vUv.x, 1.0 - vUv.x));
        float fade = pow(1.0 - vUv.y, 1.85);
        float tail = 1.0 - smoothstep(0.72, 1.0, vUv.y);
        float streak = 0.82 + 0.18 * sin(vUv.y * 22.0 - uTime * 8.0 + vUv.x * 6.0);
        if (uSkirt > 0.5) {
          float stern = 1.0 - smoothstep(0.0, 0.3, abs(vUv.x - 0.5));
          edge = mix(0.35, 1.0, vUv.y) * mix(0.4, 1.0, stern);
          fade = mix(0.55, 1.0, stern) * mix(0.45, 1.0, vUv.y);
          tail = 1.0;
          streak = 0.88 + 0.12 * sin(vUv.x * 40.0 - uTime * 6.0);
        }
        vec3 col = mix(uColorTeal, uColorFoam, clamp(edge * 0.85 + 0.2, 0.0, 1.0));
        col = mix(col, uColorBoost, uBoost * (0.25 + edge * 0.5));
        float alpha = uOpacity * fade * tail * mix(0.0, 0.95, edge) * streak;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

function gridGeometry(rows: number, cols: number): THREE.BufferGeometry {
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const indices: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const n = i * cols + j;
      uv[n * 2] = cols <= 1 ? 0 : j / (cols - 1);
      uv[n * 2 + 1] = rows <= 1 ? 0 : i / (rows - 1);
      if (i < rows - 1 && j < cols - 1) {
        const a = n;
        const b = n + 1;
        const c = n + cols;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  pa.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", pa);
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  return geo;
}

type TrailPt = { x: number; y: number; z: number; hx: number; hz: number; rx: number; rz: number };

class HullWake {
  readonly group = new THREE.Group();
  private ribbon: THREE.Mesh;
  private skirt: THREE.Mesh;
  private ribbonMat: THREE.ShaderMaterial;
  private skirtMat: THREE.ShaderMaterial;
  private player: boolean;
  private alongRows: number;
  private across: number;
  private ringRows: number;
  private trail: TrailPt[] = [];

  constructor(id: string, player: boolean) {
    this.player = player;
    this.alongRows = (player ? 22 : 12) + 1;
    this.across = player ? 9 : 5;
    this.ringRows = (player ? 24 : 16) + 1;
    this.ribbonMat = foamMaterial(false);
    this.skirtMat = foamMaterial(true);
    this.ribbon = new THREE.Mesh(gridGeometry(this.alongRows, this.across), this.ribbonMat);
    this.skirt = new THREE.Mesh(gridGeometry(this.ringRows, 2), this.skirtMat);
    this.ribbon.name = "wakeRibbon";
    this.skirt.name = "wakeSkirt";
    this.ribbon.renderOrder = 4;
    this.skirt.renderOrder = 3;
    this.ribbon.frustumCulled = false;
    this.skirt.frustumCulled = false;
    this.group.userData.boatId = id;
    this.group.add(this.skirt, this.ribbon);
  }

  sync(boat: Boat, time: number): void {
    const fwd = headingVector(boat.yaw);
    const rightX = fwd.z;
    const rightZ = -fwd.x;
    const boosting = boat.boostHeld && (boat.boostFuel > 0 || boat.superBoostRemaining > 0);
    const wet = boat.onWater && !boat.airborne ? 1 : 0;
    const speedK = saturate(boat.speed / 28);
    const len = ribbonLength(boat.speed, boosting, this.player);
    const wave0 = gerstnerHeight(boat.x, boat.z, time);
    this.pushTrail(boat, fwd.x, fwd.z, rightX, rightZ);
    this.fillRibbon(boat, time, fwd.x, fwd.z, rightX, rightZ, len, wave0, boosting);
    this.fillSkirt(boat, time, fwd.x, fwd.z, rightX, rightZ, wave0);
    const dens = this.player ? 1 : 0.62;
    this.ribbonMat.uniforms.uOpacity.value =
      wet * dens * (this.player ? 0.28 + speedK * 0.64 : 0.16 + speedK * 0.48) * saturate((boat.speed - 2) / 8);
    this.skirtMat.uniforms.uOpacity.value =
      wet * dens * (this.player ? 0.18 + speedK * 0.26 : 0.1 + speedK * 0.16) * saturate((boat.speed - 4) / 10);
    this.ribbonMat.uniforms.uBoost.value = boosting ? 1 : 0;
    this.skirtMat.uniforms.uBoost.value = boosting ? 0.7 : 0;
    this.ribbonMat.uniforms.uTime.value = time;
    this.skirtMat.uniforms.uTime.value = time;
    this.ribbon.visible = (this.ribbonMat.uniforms.uOpacity.value as number) > 0.02;
    this.skirt.visible = (this.skirtMat.uniforms.uOpacity.value as number) > 0.02;
  }

  dispose(): void {
    this.ribbon.geometry.dispose();
    this.skirt.geometry.dispose();
    this.ribbonMat.dispose();
    this.skirtMat.dispose();
  }

  private pushTrail(boat: Boat, hx: number, hz: number, rx: number, rz: number): void {
    const head = this.trail[0];
    if (!head || Math.hypot(boat.x - head.x, boat.z - head.z) > 0.4) {
      this.trail.unshift({ x: boat.x, y: boat.y, z: boat.z, hx, hz, rx, rz });
      while (this.trail.length > 56) this.trail.pop();
    } else {
      head.x = boat.x;
      head.y = boat.y;
      head.z = boat.z;
      head.hx = hx;
      head.hz = hz;
      head.rx = rx;
      head.rz = rz;
    }
  }

  private sampleTrail(
    aft: number,
    boat: Boat,
    fwdX: number,
    fwdZ: number,
    rightX: number,
    rightZ: number,
  ): { x: number; y: number; z: number; rx: number; rz: number } {
    if (this.trail.length < 2) {
      return { x: boat.x - fwdX * aft, y: boat.y, z: boat.z - fwdZ * aft, rx: rightX, rz: rightZ };
    }
    let remain = aft;
    for (let i = 0; i < this.trail.length - 1; i++) {
      const a = this.trail[i];
      const b = this.trail[i + 1];
      const seg = Math.hypot(a.x - b.x, a.z - b.z);
      if (remain <= seg) {
        const u = seg > 1e-4 ? remain / seg : 0;
        return {
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
          z: a.z + (b.z - a.z) * u,
          rx: a.rx + (b.rx - a.rx) * u,
          rz: a.rz + (b.rz - a.rz) * u,
        };
      }
      remain -= seg;
    }
    const last = this.trail[this.trail.length - 1];
    return {
      x: last.x - last.hx * remain,
      y: last.y,
      z: last.z - last.hz * remain,
      rx: last.rx,
      rz: last.rz,
    };
  }

  private fillRibbon(
    boat: Boat,
    time: number,
    fwdX: number,
    fwdZ: number,
    rightX: number,
    rightZ: number,
    len: number,
    wave0: number,
    boosting: boolean,
  ): void {
    const pos = this.ribbon.geometry.getAttribute("position") as THREE.BufferAttribute;
    const hw0 = boat.def.hullWidth * 0.34;
    const hw1 = boat.def.hullWidth * 0.62 + len * 0.12 + (boosting ? 0.6 : 0);
    const aft0 = boat.def.hullLength * 0.4;
    let n = 0;
    for (let i = 0; i < this.alongRows; i++) {
      const t = i / (this.alongRows - 1);
      const flare = hw0 + (hw1 - hw0) * Math.pow(t, 0.55);
      const half = flare * (1 - t * t * 0.88);
      const aft = aft0 + t * len;
      const c = this.sampleTrail(aft, boat, fwdX, fwdZ, rightX, rightZ);
      const rl = Math.hypot(c.rx, c.rz) || 1;
      const rx = c.rx / rl;
      const rz = c.rz / rl;
      for (let j = 0; j < this.across; j++) {
        const u = j / (this.across - 1);
        const edge = Math.abs(u - 0.5) * 2;
        const lat = (u - 0.5) * 2 * half;
        const px = c.x + rx * lat;
        const pz = c.z + rz * lat;
        const py =
          c.y -
          WATERLINE +
          (gerstnerHeight(px, pz, time) - wave0) +
          0.05 +
          edge * edge * 0.05 -
          (1 - edge) * 0.03;
        pos.setXYZ(n, px, py, pz);
        n += 1;
      }
    }
    pos.needsUpdate = true;
  }

  private fillSkirt(
    boat: Boat,
    time: number,
    fwdX: number,
    fwdZ: number,
    rightX: number,
    rightZ: number,
    wave0: number,
  ): void {
    const pos = this.skirt.geometry.getAttribute("position") as THREE.BufferAttribute;
    const hl = boat.def.hullLength * 0.42;
    const hw = boat.def.hullWidth * 0.38;
    let n = 0;
    for (let i = 0; i < this.ringRows; i++) {
      const u = i / (this.ringRows - 1);
      const side = (u - 0.5) * 2;
      for (let j = 0; j < 2; j++) {
        const outer = j === 1;
        const aft = hl + (outer ? 1.1 : 0.2);
        const lat = side * hw * (outer ? 1.15 : 0.7);
        const px = boat.x - fwdX * aft + rightX * lat;
        const pz = boat.z - fwdZ * aft + rightZ * lat;
        const py = boat.y - WATERLINE + (gerstnerHeight(px, pz, time) - wave0) + 0.04;
        pos.setXYZ(n, px, py, pz);
        n += 1;
      }
    }
    pos.needsUpdate = true;
  }
}

export class WakeField {
  readonly group = new THREE.Group();
  private byId = new Map<string, HullWake>();

  constructor() {
    this.group.name = "wakes";
  }

  sync(boats: Boat[], time: number): void {
    const seen = new Set<string>();
    for (const boat of boats) {
      seen.add(boat.id);
      let hull = this.byId.get(boat.id);
      if (!hull) {
        hull = new HullWake(boat.id, !boat.ai);
        this.byId.set(boat.id, hull);
        this.group.add(hull.group);
      }
      hull.sync(boat, time);
    }
    for (const [id, hull] of this.byId) {
      if (seen.has(id)) continue;
      this.group.remove(hull.group);
      hull.dispose();
      this.byId.delete(id);
    }
  }
}
