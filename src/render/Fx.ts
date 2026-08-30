import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";

const SPRAY_COUNT = 400;
const MIST_COUNT = 64;
const TRAIL_COUNT = 120;
const SPARK_COUNT = 360;
const SHEET_POOL = 8;
const INV_2_32 = 2.3283064365386963e-10;

function hash01(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) * INV_2_32;
}

function discMaterial(
  color: number,
  size: number,
  opacity: number,
  additive: boolean,
  flatten = 1,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uFlatten: { value: flatten },
    },
    vertexShader: `
      uniform float uSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (150.0 / max(4.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFlatten;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        p.y *= uFlatten;
        float d = length(p);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.12, d) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function sheetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xd4eef8) },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
        float fade = pow(1.0 - vUv.y, 1.35);
        float a = edge * fade * uOpacity;
        if (a < 0.012) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function makeCloud(count: number, mat: THREE.ShaderMaterial): { pts: THREE.Points; vel: Float32Array } {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pos[i * 3 + 1] = -24;
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  return { pts: new THREE.Points(geo, mat), vel };
}

export class Fx {
  readonly group = new THREE.Group();
  private spray: THREE.Points;
  private sprayMat: THREE.ShaderMaterial;
  private sprayVel: Float32Array;
  private mist: THREE.Points;
  private mistMat: THREE.ShaderMaterial;
  private mistVel: Float32Array;
  private trail: THREE.Points;
  private trailMat: THREE.ShaderMaterial;
  private trailVel: Float32Array;
  private sparksPts: THREE.Points;
  private sparksMat: THREE.ShaderMaterial;
  private sparksVel: Float32Array;
  private sparksLife: Float32Array;
  private sheets: THREE.Mesh[] = [];
  private pickups = new THREE.Group();
  private crates = new THREE.Group();
  private mines = new THREE.Group();
  private minePool: THREE.Mesh[] = [];

  constructor(_hemi: THREE.HemisphereLight) {
    this.sprayMat = discMaterial(0xe8f7ff, 78, 0.78, false, 1.85);
    this.mistMat = discMaterial(0xc5e6f0, 28, 0.08, false, 1.4);
    this.trailMat = discMaterial(0x7af0ff, 28, 0.7, true, 1.25);
    const spray = makeCloud(SPRAY_COUNT, this.sprayMat);
    const mist = makeCloud(MIST_COUNT, this.mistMat);
    const trail = makeCloud(TRAIL_COUNT, this.trailMat);
    this.spray = spray.pts;
    this.sprayVel = spray.vel;
    this.mist = mist.pts;
    this.mistVel = mist.vel;
    this.trail = trail.pts;
    this.trailVel = trail.vel;
    this.sparksMat = discMaterial(0xffb060, 22, 0.95, true);
    const sparks = makeCloud(SPARK_COUNT, this.sparksMat);
    this.sparksPts = sparks.pts;
    this.sparksVel = sparks.vel;
    this.sparksLife = new Float32Array(SPARK_COUNT);
    this.group.add(this.spray, this.mist, this.trail, this.sparksPts);
    const sheetGeo = new THREE.PlaneGeometry(1, 1);
    sheetGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < SHEET_POOL; i++) {
      const mesh = new THREE.Mesh(sheetGeo, sheetMaterial());
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.sheets.push(mesh);
      this.group.add(mesh);
    }
    this.group.add(this.pickups);
    this.group.add(this.crates);
    this.group.add(this.mines);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x22110a, emissive: 0x331100 }),
      );
      m.visible = false;
      this.minePool.push(m);
      this.mines.add(m);
    }
  }

  rebuildPickups(track: TrackWorld): void {
    this.pickups.clear();
    for (const p of track.pickups) {
      const color = p.kind === "super" ? 0xffe14a : p.kind === "red" ? 0xff3d6e : 0x2ee6ff;
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.15),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
      );
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData.id = p.id;
      this.pickups.add(mesh);
    }
    this.crates.clear();
    for (const c of track.crates) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 2.1, 2.1),
        new THREE.MeshStandardMaterial({ color: c.kind === "mine" ? 0x5a2a12 : 0x8a6a22 }),
      );
      mesh.position.set(c.x, c.y, c.z);
      mesh.userData.id = c.id;
      this.crates.add(mesh);
    }
  }

  private stepCloud(
    pts: THREE.Points,
    vel: Float32Array,
    emitters: Boat[],
    host: Boat,
    dt: number,
    kickScale: number,
    zStretch: number,
    playerBias: number,
  ): void {
    if (!emitters.length) return;
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const nEmit = emitters.length;
    let hostIn = false;
    for (let e = 0; e < nEmit; e++) {
      if (emitters[e] === host) {
        hostIn = true;
        break;
      }
    }
    const biasQ = (playerBias * 1000) | 0;
    const g = 28 * dt * kickScale;
    const count = pos.count;
    for (let i = 0, i3 = 0; i < count; i++, i3 += 3) {
      arr[i3] += vel[i3] * dt;
      arr[i3 + 1] += vel[i3 + 1] * dt;
      arr[i3 + 2] += vel[i3 + 2] * dt;
      vel[i3 + 1] -= g;
      const boat =
        hostIn && (Math.imul(i, 13) >>> 0) % 1000 < biasQ ? host : emitters[i % nEmit];
      if (arr[i3 + 1] >= boat.y - 0.45) continue;
      const fwd = headingVector(boat.yaw);
      const hLat = hash01(i, 1);
      const hAft = hash01(i, 2);
      const hY = hash01(i, 3);
      const hOut = hash01(i, 4);
      const hKick = hash01(i, 5);
      const side = i & 1 ? -1 : 1;
      const lat = boat.def.hullWidth * (0.14 + hLat * 0.32);
      const aft = boat.def.hullLength * 0.48 + hAft * zStretch;
      const boostKick = boat.boostHeld ? 12 : 0;
      arr[i3] = boat.x + fwd.z * side * lat - fwd.x * aft;
      arr[i3 + 1] = boat.y + 0.05 + hY * 0.22;
      arr[i3 + 2] = boat.z - fwd.x * side * lat - fwd.z * aft;
      const outward = 1.15 + hOut * 2.1 + boat.speed * 0.05;
      const back = 7.2 + boat.speed * 0.46 + boostKick * 0.5;
      vel[i3] = fwd.z * side * outward - fwd.x * back;
      vel[i3 + 1] = (2.6 + hKick * 4.4 + boat.speed * 0.1 + boostKick * 0.28) * kickScale;
      vel[i3 + 2] = -fwd.x * side * outward - fwd.z * back;
    }
    pos.needsUpdate = true;
  }

  private updateSheets(boats: Boat[]): void {
    for (let i = 0; i < this.sheets.length; i++) {
      const mesh = this.sheets[i];
      const boat = boats[i];
      const mat = mesh.material as THREE.ShaderMaterial;
      if (!boat || !boat.onWater || boat.speed < 5) {
        mesh.visible = false;
        mat.uniforms.uOpacity.value = 0;
        continue;
      }
      const fwd = headingVector(boat.yaw);
      const player = !boat.ai;
      const len = 3.6 + boat.speed * 0.1 + (boat.boostHeld ? 1.8 : 0) + (player ? 1.1 : 0);
      const wid = boat.def.hullWidth * (player ? 1.28 : 0.95);
      const aft = boat.def.hullLength * 0.48 + len * 0.5;
      mesh.visible = true;
      mesh.position.set(boat.x - fwd.x * aft, boat.y + 0.05, boat.z - fwd.z * aft);
      mesh.rotation.y = boat.yaw;
      mesh.scale.set(wid, 1, len);
      const wet = Math.min(player ? 0.3 : 0.16, 0.07 + boat.speed / (player ? 150 : 220));
      mat.uniforms.uOpacity.value = wet;
    }
  }

  slam(x: number, y: number, z: number): void {
    this.burst(x, y, z, 72, 22, 18);
  }

  bankSpray(x: number, y: number, z: number): void {
    this.burst(x, y, z, 56, 16, 12);
    this.sparks(x, y, z);
  }

  sparks(x: number, y: number, z: number): void {
    const pos = this.sparksPts.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 28; i++) {
      const n = Math.floor(Math.random() * pos.count);
      pos.setXYZ(n, x + (Math.random() - 0.5) * 1.4, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.4);
      this.sparksVel[n * 3] = (Math.random() - 0.5) * 14;
      this.sparksVel[n * 3 + 1] = 4 + Math.random() * 10;
      this.sparksVel[n * 3 + 2] = (Math.random() - 0.5) * 14;
      this.sparksLife[n] = 0.18 + Math.random() * 0.22;
    }
    pos.needsUpdate = true;
  }

  private burst(x: number, y: number, z: number, count: number, spread: number, kick: number): void {
    const pos = this.spray.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const n = Math.floor(Math.random() * pos.count);
      pos.setXYZ(n, x + (Math.random() - 0.5) * 3, y + Math.random() * 1.4, z + (Math.random() - 0.5) * 3);
      this.sprayVel[n * 3] = (Math.random() - 0.5) * spread;
      this.sprayVel[n * 3 + 1] = kick + Math.random() * kick;
      this.sprayVel[n * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    pos.needsUpdate = true;
  }

  update(track: TrackWorld, boats: Boat[], dt: number, time: number, boosting: boolean): void {
    for (const child of this.pickups.children) {
      const id = child.userData.id as string;
      const p = track.pickups.find((x) => x.id === id);
      child.visible = !!p && p.taken <= 0;
      child.rotation.y += dt * 2.4;
      child.position.y = (p?.y ?? child.position.y) + Math.sin(time * 3 + child.position.x) * 0.2;
    }
    for (const child of this.crates.children) {
      const id = child.userData.id as string;
      const c = track.crates.find((x) => x.id === id);
      child.visible = !!c && c.taken <= 0;
    }

    const liveMines = track.mines.filter((m) => m.live);
    this.minePool.forEach((mesh, i) => {
      const mine = liveMines[i];
      if (!mine) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(mine.x, mine.y + 0.4, mine.z);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(mine.age > 0.7 ? 0xff2a2a : 0x331100);
    });

    const emitters = boats.filter((b) => b.onWater && b.speed > 4);
    const host = boats.find((b) => !b.ai) ?? boats[0];
    if (host && emitters.length) {
      this.stepCloud(this.spray, this.sprayVel, emitters, host, dt, 1, 2.8, 0.9);
      this.stepCloud(this.mist, this.mistVel, emitters, host, dt, 0.38, 6.4, 0.88);
      this.stepCloud(this.trail, this.trailVel, emitters.filter((b) => b.boostHeld), host, dt, 0.28, 1.6, 0.9);
      const wet = host.onWater && host.speed > 5;
      this.sprayMat.uniforms.uOpacity.value = wet ? Math.min(0.84, 0.4 + host.speed / 48) : 0.04;
      this.sprayMat.uniforms.uSize.value = (boosting ? 96 : 78) + host.speed * 0.42;
      this.mistMat.uniforms.uOpacity.value = wet ? 0.05 + host.speed / 900 : 0.01;
      this.mistMat.uniforms.uSize.value = 22 + host.speed * 0.08;
      this.trailMat.uniforms.uOpacity.value = boosting ? 0.72 : 0.08;
    }
    this.updateSheets(boats);
    const sparkPos = this.sparksPts.geometry.getAttribute("position") as THREE.BufferAttribute;
    let live = 0;
    for (let i = 0; i < sparkPos.count; i++) {
      if (this.sparksLife[i] <= 0) continue;
      this.sparksLife[i] -= dt;
      live++;
      sparkPos.setXYZ(
        i,
        sparkPos.getX(i) + this.sparksVel[i * 3] * dt,
        sparkPos.getY(i) + this.sparksVel[i * 3 + 1] * dt,
        sparkPos.getZ(i) + this.sparksVel[i * 3 + 2] * dt,
      );
      this.sparksVel[i * 3 + 1] -= 38 * dt;
      if (this.sparksLife[i] <= 0) sparkPos.setY(i, -20);
    }
    if (live) sparkPos.needsUpdate = true;
    this.sparksMat.uniforms.uOpacity.value = live ? 0.9 : 0;
  }
}
