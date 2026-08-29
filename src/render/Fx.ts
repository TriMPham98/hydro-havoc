import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";

function discMaterial(color: number, size: number, opacity: number, additive: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      uniform float uSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (110.0 / max(4.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float d = length(p);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.12, d) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function makeCloud(count: number, mat: THREE.ShaderMaterial): { pts: THREE.Points; vel: Float32Array } {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
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
  private pickups = new THREE.Group();
  private crates = new THREE.Group();
  private mines = new THREE.Group();
  private minePool: THREE.Mesh[] = [];

  constructor(_hemi: THREE.HemisphereLight) {
    this.sprayMat = discMaterial(0xe8f7ff, 52, 0.7, false);
    this.mistMat = discMaterial(0xc5e6f0, 88, 0.22, false);
    this.trailMat = discMaterial(0x7af0ff, 22, 0.7, true);
    const spray = makeCloud(2200, this.sprayMat);
    const mist = makeCloud(900, this.mistMat);
    const trail = makeCloud(700, this.trailMat);
    this.spray = spray.pts;
    this.sprayVel = spray.vel;
    this.mist = mist.pts;
    this.mistVel = mist.vel;
    this.trail = trail.pts;
    this.trailVel = trail.vel;
    this.sparksMat = discMaterial(0xffb060, 22, 0.95, true);
    const sparks = makeCloud(360, this.sparksMat);
    this.sparksPts = sparks.pts;
    this.sparksVel = sparks.vel;
    this.sparksLife = new Float32Array(360);
    this.group.add(this.spray, this.mist, this.trail, this.sparksPts);
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
    recycle: number,
    aftPad = 0,
    playerBias = 0.78,
  ): void {
    if (!emitters.length) return;
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      y += vel[i * 3 + 1] * dt;
      vel[i * 3 + 1] -= 28 * dt * kickScale;
      const boat = Math.random() < playerBias ? host : emitters[i % emitters.length];
      if (y < boat.y - 0.4 || Math.random() < recycle) {
        const fwd = headingVector(boat.yaw);
        const side = Math.random() < 0.5 ? -1 : 1;
        const lat = 0.45 + Math.random() * 1.15;
        const boostKick = boat.boostHeld ? 12 : 0;
        const aft = boat.def.hullLength * 0.38 + Math.random() * 2.2 + aftPad;
        pos.setXYZ(
          i,
          boat.x + fwd.z * side * lat - fwd.x * aft,
          boat.y + 0.12 + Math.random() * 0.45,
          boat.z - fwd.x * side * lat - fwd.z * aft,
        );
        const outward = 5.5 + Math.random() * 7 + boat.speed * 0.28;
        const back = 4 + boat.speed * 0.32 + boostKick * 0.4;
        const kick = (8 + Math.random() * 14 + boat.speed * 0.38 + boostKick * 0.7) * kickScale;
        vel[i * 3] = fwd.z * side * outward - fwd.x * back;
        vel[i * 3 + 1] = kick;
        vel[i * 3 + 2] = -fwd.x * side * outward - fwd.z * back;
      } else {
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + vel[i * 3] * dt);
        pos.setZ(i, pos.getZ(i) + vel[i * 3 + 2] * dt);
      }
    }
    pos.needsUpdate = true;
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
      this.stepCloud(this.spray, this.sprayVel, emitters, host, dt, 1, 0.032, 0, 0.9);
      this.stepCloud(this.mist, this.mistVel, emitters, host, dt, 0.38, 0.022, 3.6, 0.88);
      this.stepCloud(this.trail, this.trailVel, emitters.filter((b) => b.boostHeld), host, dt, 0.4, 0.08, 0.6, 0.9);
      const wet = host.onWater && host.speed > 5;
      this.sprayMat.uniforms.uOpacity.value = wet ? Math.min(0.72, 0.32 + host.speed / 50) : 0.04;
      this.sprayMat.uniforms.uSize.value = (boosting ? 58 : 42) + host.speed * 0.28;
      this.mistMat.uniforms.uOpacity.value = wet ? 0.1 + host.speed / 260 : 0.02;
      this.mistMat.uniforms.uSize.value = 54 + host.speed * 0.22;
      this.trailMat.uniforms.uOpacity.value = boosting ? 0.72 : 0.08;
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
