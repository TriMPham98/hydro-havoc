import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";

/** Frames of history per trail (~0.7 s at 60 fps). */
const LEN = 42;
const SUPER = new THREE.Color(0xffd23a);
const BOOST = new THREE.Color(0x2ee6ff);

function trailMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: BOOST.clone() } },
    vertexShader: `
      attribute float aAlpha;
      attribute float aAcross;
      varying float vAlpha;
      varying float vAcross;
      void main() {
        vAlpha = aAlpha;
        vAcross = aAcross;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      varying float vAcross;
      void main() {
        float core = 1.0 - abs(vAcross);
        float a = vAlpha * (core * core);
        if (a < 0.004) discard;
        vec3 col = mix(uColor, vec3(1.0), core * core * core * 0.7);
        gl_FragColor = vec4(col * a * 2.2, a);
      }
    `,
  });
}

class BoatTrails {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private pts: Float32Array;
  private power: Float32Array;
  private head = 0;
  private filled = 0;
  private pos: THREE.BufferAttribute;
  private alpha: THREE.BufferAttribute;
  private intensity = 0;

  constructor() {
    this.mat = trailMaterial();
    const verts = 2 * LEN * 2;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(verts), 1).setUsage(THREE.DynamicDrawUsage);
    const across = new Float32Array(verts);
    const index: number[] = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < LEN; i++) {
        const v = (t * LEN + i) * 2;
        across[v] = -1;
        across[v + 1] = 1;
        if (i < LEN - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    geo.setAttribute("position", this.pos);
    geo.setAttribute("aAlpha", this.alpha);
    geo.setAttribute("aAcross", new THREE.BufferAttribute(across, 1));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = "lightTrail";
    this.pts = new Float32Array(2 * LEN * 3);
    this.power = new Float32Array(LEN);
  }

  sync(boat: Boat, boosting: boolean, superOn: boolean, cam: THREE.Vector3, dt: number): void {
    this.intensity += ((boosting ? 1 : 0) - this.intensity) * (1 - Math.exp(-(boosting ? 14 : 5) * dt));
    (this.mat.uniforms.uColor.value as THREE.Color).copy(superOn ? SUPER : BOOST);
    const fwd = headingVector(boat.yaw);
    const rx = fwd.z;
    const rz = -fwd.x;
    const lat = boat.def.hullWidth * 0.46;
    const aft = boat.def.hullLength * 0.46;
    const y = boat.y + 0.42;
    this.head = (this.head + 1) % LEN;
    this.filled = Math.min(LEN, this.filled + 1);
    for (let t = 0; t < 2; t++) {
      const side = t === 0 ? -1 : 1;
      const o = (t * LEN + this.head) * 3;
      this.pts[o] = boat.x + rx * lat * side - fwd.x * aft;
      this.pts[o + 1] = y;
      this.pts[o + 2] = boat.z + rz * lat * side - fwd.z * aft;
    }
    this.power[this.head] = this.intensity * (boat.airborne ? 1.2 : 1);
    this.mesh.visible = this.intensity > 0.01 || this.power.some((p) => p > 0.01);
    if (!this.mesh.visible) return;

    const P = this.pos.array as Float32Array;
    const A = this.alpha.array as Float32Array;
    const width = superOn ? 0.36 : 0.26;
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < LEN; i++) {
        // i = 0 newest. Walk back through the ring.
        const k = (this.head - i + LEN) % LEN;
        const kPrev = (k - 1 + LEN) % LEN;
        const o = (t * LEN + k) * 3;
        const op = (t * LEN + (i < LEN - 1 ? kPrev : k)) * 3;
        const px = this.pts[o];
        const py = this.pts[o + 1];
        const pz = this.pts[o + 2];
        let dx = px - this.pts[op];
        let dy = py - this.pts[op + 1];
        let dz = pz - this.pts[op + 2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl;
        dy /= dl;
        dz /= dl;
        // Camera-facing ribbon: across = dir × toCam.
        const cx = cam.x - px;
        const cy = cam.y - py;
        const cz = cam.z - pz;
        let sx = dy * cz - dz * cy;
        let sy = dz * cx - dx * cz;
        let sz = dx * cy - dy * cx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const age = i / (LEN - 1);
        const w = width * (1 - age * 0.65) * 0.5;
        sx = (sx / sl) * w;
        sy = (sy / sl) * w;
        sz = (sz / sl) * w;
        const v = (t * LEN + i) * 2;
        P[v * 3] = px - sx;
        P[v * 3 + 1] = py - sy;
        P[v * 3 + 2] = pz - sz;
        P[v * 3 + 3] = px + sx;
        P[v * 3 + 4] = py + sy;
        P[v * 3 + 5] = pz + sz;
        const alive = i < this.filled ? 1 : 0;
        const a = this.power[k] * (1 - age) * (1 - age) * alive;
        A[v] = a;
        A[v + 1] = a;
      }
    }
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Neon ribbons streaming off each sponson's stern corner while a hull boosts. */
export class LightTrails {
  readonly group = new THREE.Group();
  private byId = new Map<string, BoatTrails>();

  constructor() {
    this.group.name = "lightTrails";
  }

  sync(boat: Boat, boosting: boolean, superOn: boolean, cam: THREE.Vector3, dt: number): void {
    let t = this.byId.get(boat.id);
    if (!t) {
      t = new BoatTrails();
      this.byId.set(boat.id, t);
      this.group.add(t.mesh);
    }
    t.sync(boat, boosting, superOn, cam, dt);
  }

  prune(live: Set<string>): void {
    for (const [id, t] of this.byId) {
      if (live.has(id)) continue;
      this.group.remove(t.mesh);
      t.dispose();
      this.byId.delete(id);
    }
  }
}
