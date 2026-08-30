import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";

const SPRAY_COUNT = 400;
const MIST_COUNT = 64;
const TRAIL_COUNT = 120;
const SPARK_COUNT = 360;
/** Player-only: transom, two chines, two upright fans. AI stays on discs. */
const PLAYER_SHEETS = 5;
const SLAM_RINGS = 2;
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

function sheetMaterial(foam = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: foam ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(foam ? 0xeaf7ff : 0xd4eef8) },
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
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float fade = pow(1.0 - vUv.y, 1.65);
        float a = edge * fade * uOpacity;
        if (a < 0.012) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function ringMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xdef4fb) },
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
        float r = length(vUv - 0.5);
        float ring = smoothstep(0.5, 0.36, r) * smoothstep(0.22, 0.34, r);
        float a = ring * uOpacity;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function metal(
  color: number,
  metalness: number,
  roughness: number,
  emissive = 0,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
  });
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const SPIKE_DIR = new THREE.Vector3();
const SPIKE_AXIS = new THREE.Vector3(1, 0, 0);

function addSpike(parent: THREE.Group, x: number, y: number, z: number, mat: THREE.Material): void {
  SPIKE_DIR.set(x, y, z).normalize();
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 5), mat);
  if (SPIKE_DIR.y < -0.99) spike.quaternion.setFromAxisAngle(SPIKE_AXIS, Math.PI);
  else spike.quaternion.setFromUnitVectors(Y_UP, SPIKE_DIR);
  spike.position.copy(SPIKE_DIR).multiplyScalar(0.7);
  parent.add(spike);
}

function beaconBuoy(kind: "blue" | "red" | "super"): THREE.Group {
  const g = new THREE.Group();
  const accent = kind === "super" ? 0xffe14a : kind === "red" ? 0xff3d6e : 0x2ee6ff;
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 8), metal(0x3a454c, 0.74, 0.26));
  hull.scale.set(1, 0.7, 1);
  g.add(hull);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 12), metal(0x8a6a3a, 0.48, 0.38));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.1;
  g.add(collar);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 1.05, 8), metal(0x2a3238, 0.82, 0.2));
  mast.position.y = 0.68;
  g.add(mast);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.15,
      roughness: 0.22,
      metalness: 0.18,
    }),
  );
  lamp.position.y = 1.24;
  lamp.name = "beaconLamp";
  g.add(lamp);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8, 1, true), metal(0x4a545c, 0.7, 0.3, accent, 0.35));
  cage.position.y = 1.08;
  g.add(cage);
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = true;
  });
  return g;
}

function scrapCrate(kind: "boost" | "mine"): THREE.Group {
  const g = new THREE.Group();
  const rust = metal(kind === "mine" ? 0x5a2a12 : 0x8a6a22, 0.55, 0.48);
  const steel = metal(0x3d4750, 0.72, 0.3);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.45, 1.65), rust));
  const bandA = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.11, 1.74), steel);
  bandA.position.y = 0.32;
  g.add(bandA);
  const bandB = bandA.clone();
  bandB.position.y = -0.32;
  g.add(bandB);
  for (const x of [-0.78, 0.78]) {
    for (const z of [-0.78, 0.78]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), steel);
      cap.position.set(x, 0, z);
      g.add(cap);
    }
  }
  const accent = kind === "mine" ? 0xff6a22 : 0x2ee6ff;
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, metalness: 0.25, roughness: 0.35 }),
  );
  lamp.position.y = 0.78;
  lamp.name = "crateLamp";
  g.add(lamp);
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = true;
  });
  return g;
}

function spikedMine(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = metal(0x22110a, 0.68, 0.36, 0x331100, 0.45);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), bodyMat);
  body.name = "mineBody";
  g.add(body);
  const spikeMat = metal(0x3a2a22, 0.72, 0.3);
  const dirs: [number, number, number][] = [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0.7, 0.7, 0],
    [-0.7, 0.7, 0],
    [0.7, -0.7, 0],
    [-0.7, -0.7, 0],
    [0, 0.55, 0.8],
    [0, 0.55, -0.8],
  ];
  for (const [x, y, z] of dirs) addSpike(g, x, y, z, spikeMat);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0x331100, emissiveIntensity: 0.6, roughness: 0.28 }),
  );
  glow.name = "mineGlow";
  glow.position.y = 0.12;
  g.add(glow);
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = true;
  });
  return g;
}

function taperSheetGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.1, 1, 0, 0.1, 1, 0], 3),
  );
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 1, 2, 1, 3, 2]);
  return geo;
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
  readonly particles = new THREE.Group();
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
  private slamRings: { mesh: THREE.Mesh; life: number }[] = [];
  private pickups = new THREE.Group();
  private crates = new THREE.Group();
  private mines = new THREE.Group();
  private minePool: THREE.Group[] = [];

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
    this.particles.name = "fxParticles";
    this.particles.add(this.spray, this.mist, this.trail, this.sparksPts);
    const sheetGeo = taperSheetGeometry();
    sheetGeo.rotateX(-Math.PI / 2);
    const names = ["sprayTransom", "sprayChineL", "sprayChineR", "sprayFanL", "sprayFanR"];
    for (let i = 0; i < PLAYER_SHEETS; i++) {
      const foam = i >= 3;
      const mesh = new THREE.Mesh(sheetGeo, sheetMaterial(foam));
      mesh.name = names[i];
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.sheets.push(mesh);
      this.particles.add(mesh);
    }
    const ringGeo = new THREE.CircleGeometry(1, 16);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < SLAM_RINGS; i++) {
      const mesh = new THREE.Mesh(ringGeo, ringMaterial());
      mesh.name = `slamRing${i}`;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.slamRings.push({ mesh, life: 0 });
      this.particles.add(mesh);
    }
    this.group.add(this.particles);
    this.group.add(this.pickups);
    this.group.add(this.crates);
    this.group.add(this.mines);
    for (let i = 0; i < 8; i++) {
      const m = spikedMine();
      m.visible = false;
      this.minePool.push(m);
      this.mines.add(m);
    }
  }

  rebuildPickups(track: TrackWorld): void {
    this.pickups.clear();
    for (const p of track.pickups) {
      const mesh = beaconBuoy(p.kind);
      mesh.name = "pickupBeacon";
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData.id = p.id;
      mesh.userData.kind = p.kind;
      this.pickups.add(mesh);
    }
    this.crates.clear();
    for (const c of track.crates) {
      const mesh = scrapCrate(c.kind);
      mesh.name = "scrapCrate";
      mesh.position.set(c.x, c.y, c.z);
      mesh.userData.id = c.id;
      mesh.userData.kind = c.kind;
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

  private placeSheet(
    mesh: THREE.Mesh,
    boat: Boat,
    lat: number,
    aft: number,
    yOff: number,
    wid: number,
    len: number,
    pitch: number,
    roll: number,
    opacity: number,
  ): void {
    const fwd = headingVector(boat.yaw);
    const rx = fwd.z;
    const rz = -fwd.x;
    const mat = mesh.material as THREE.ShaderMaterial;
    mesh.visible = true;
    mesh.position.set(
      boat.x + rx * lat - fwd.x * aft,
      boat.y + yOff,
      boat.z + rz * lat - fwd.z * aft,
    );
    mesh.rotation.set(pitch, boat.yaw, roll);
    mesh.scale.set(wid, 1, len);
    mat.uniforms.uOpacity.value = opacity;
  }

  private updateSheets(host: Boat | undefined): void {
    if (!host || !host.onWater || host.speed < 5) {
      for (const mesh of this.sheets) {
        mesh.visible = false;
        (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0;
      }
      return;
    }
    const speed = host.speed;
    const boost = host.boostHeld && (host.boostFuel > 0 || host.superBoostRemaining > 0) ? 1 : 0;
    const hullW = host.def.hullWidth;
    const hullL = host.def.hullLength;
    const wet = Math.min(0.38, 0.1 + speed / 140 + boost * 0.08);
    const transomLen = 4.2 + speed * 0.12 + boost * 2.1;
    const transomWid = hullW * 1.35 + boost * 0.4;
    this.placeSheet(
      this.sheets[0],
      host,
      0,
      hullL * 0.48 + transomLen * 0.5,
      0.06,
      transomWid,
      transomLen,
      0.08,
      0,
      wet,
    );
    const chineLen = 2.6 + speed * 0.08 + boost * 0.7;
    const chineWid = 1.15 + speed * 0.03;
    const chineLat = hullW * 0.46;
    const chineAft = hullL * 0.12;
    this.placeSheet(this.sheets[1], host, -chineLat, chineAft, 0.1, chineWid, chineLen, 0.32, -0.55, wet * 0.85);
    this.placeSheet(this.sheets[2], host, chineLat, chineAft, 0.1, chineWid, chineLen, 0.32, 0.55, wet * 0.85);
    const fanLen = 1.8 + speed * 0.055 + boost * 0.9;
    const fanWid = 0.85 + speed * 0.02;
    const fanAft = hullL * 0.46;
    this.placeSheet(this.sheets[3], host, -hullW * 0.4, fanAft, 0.18, fanWid, fanLen, 1.05, -0.35, wet * 0.7);
    this.placeSheet(this.sheets[4], host, hullW * 0.4, fanAft, 0.18, fanWid, fanLen, 1.05, 0.35, wet * 0.7);
  }

  slam(x: number, y: number, z: number): void {
    this.burst(x, y, z, 72, 22, 18);
    const slot = this.slamRings.find((r) => r.life <= 0) ?? this.slamRings[0];
    slot.life = 0.42;
    slot.mesh.visible = true;
    slot.mesh.position.set(x, y + 0.04, z);
    slot.mesh.scale.setScalar(1.4);
    (slot.mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.55;
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
      mesh.rotation.y += dt * 1.6;
      const glow = mesh.getObjectByName("mineGlow");
      if (glow instanceof THREE.Mesh && glow.material instanceof THREE.MeshStandardMaterial) {
        const hot = mine.age > 0.7;
        glow.material.emissive.setHex(hot ? 0xff2a2a : 0x331100);
        glow.material.emissiveIntensity = hot ? 1.45 : 0.45;
      }
    });

    const emitters = boats.filter((b) => b.onWater && b.speed > 4);
    const host = boats.find((b) => !b.ai) ?? boats[0];
    if (host && emitters.length) {
      this.stepCloud(this.spray, this.sprayVel, emitters, host, dt, 1, 2.8, 0.42);
      this.stepCloud(this.mist, this.mistVel, emitters, host, dt, 0.38, 6.4, 0.38);
      this.stepCloud(this.trail, this.trailVel, emitters.filter((b) => b.boostHeld), host, dt, 0.28, 1.6, 0.55);
      const wet = host.onWater && host.speed > 5;
      this.sprayMat.uniforms.uOpacity.value = wet ? Math.min(0.7, 0.28 + host.speed / 62) : 0.04;
      this.sprayMat.uniforms.uSize.value = (boosting ? 72 : 58) + host.speed * 0.32;
      this.mistMat.uniforms.uOpacity.value = wet ? 0.05 + host.speed / 900 : 0.01;
      this.mistMat.uniforms.uSize.value = 22 + host.speed * 0.08;
      this.trailMat.uniforms.uOpacity.value = boosting ? 0.72 : 0.08;
    }
    this.updateSheets(host);
    for (const ring of this.slamRings) {
      if (ring.life <= 0) {
        ring.mesh.visible = false;
        continue;
      }
      ring.life -= dt;
      const k = 1 - ring.life / 0.42;
      ring.mesh.scale.setScalar(1.4 + k * 7.5);
      (ring.mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = Math.max(0, 0.55 * (1 - k));
      if (ring.life <= 0) ring.mesh.visible = false;
    }
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
