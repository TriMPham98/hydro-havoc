import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";

function discMaterial(color: number, size: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      uniform float uSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (90.0 / max(1.0, -mv.z));
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
        float a = smoothstep(0.5, 0.08, d) * uOpacity;
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
  private pickups = new THREE.Group();
  private crates = new THREE.Group();
  private mines = new THREE.Group();
  private minePool: THREE.Mesh[] = [];
  private lightning = 0;
  private hemi: THREE.HemisphereLight;

  constructor(hemi: THREE.HemisphereLight) {
    this.hemi = hemi;
    this.sprayMat = discMaterial(0xd8f6ff, 18, 0.55);
    this.mistMat = discMaterial(0xa8d8e8, 42, 0.18);
    this.trailMat = discMaterial(0x6ef0ff, 14, 0.7);
    const spray = makeCloud(2400, this.sprayMat);
    const mist = makeCloud(900, this.mistMat);
    const trail = makeCloud(700, this.trailMat);
    this.spray = spray.pts;
    this.sprayVel = spray.vel;
    this.mist = mist.pts;
    this.mistVel = mist.vel;
    this.trail = trail.pts;
    this.trailVel = trail.vel;
    this.group.add(this.spray, this.mist, this.trail);
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
  ): void {
    if (!emitters.length) return;
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      y += vel[i * 3 + 1] * dt;
      vel[i * 3 + 1] -= 22 * dt * kickScale;
      if (y < host.y - 1.2 || Math.random() < recycle) {
        const boat = emitters[i % emitters.length];
        const fwd = headingVector(boat.yaw);
        const side = Math.random() < 0.5 ? -1 : 1;
        const lat = 1.15 + Math.random() * 2.1;
        const boostKick = boat.boostHeld ? 9 : 0;
        const aft = 0.6 + Math.random() * 2.8 + aftPad;
        pos.setXYZ(
          i,
          boat.x + fwd.z * side * lat - fwd.x * aft,
          boat.y + 0.08 + Math.random() * 0.35,
          boat.z - fwd.x * side * lat - fwd.z * aft,
        );
        const kick = (5.4 + Math.random() * 8 + boat.speed * 0.12 + boostKick * 0.55) * kickScale;
        vel[i * 3] = fwd.z * side * (1.6 + Math.random() * 3.2) - fwd.x * (3 + boat.speed * 0.22);
        vel[i * 3 + 1] = kick;
        vel[i * 3 + 2] = -fwd.x * side * (1.6 + Math.random() * 3.2) - fwd.z * (3 + boat.speed * 0.22);
      } else {
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + vel[i * 3] * dt);
        pos.setZ(i, pos.getZ(i) + vel[i * 3 + 2] * dt);
      }
    }
    pos.needsUpdate = true;
  }

  flash(): void {
    this.lightning = 0.18;
  }

  slam(x: number, y: number, z: number): void {
    this.lightning = 0.22;
    const pos = this.spray.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 48; i++) {
      const n = Math.floor(Math.random() * pos.count);
      pos.setXYZ(n, x + (Math.random() - 0.5) * 4, y + Math.random() * 2, z + (Math.random() - 0.5) * 4);
      this.sprayVel[n * 3] = (Math.random() - 0.5) * 18;
      this.sprayVel[n * 3 + 1] = 12 + Math.random() * 16;
      this.sprayVel[n * 3 + 2] = (Math.random() - 0.5) * 18;
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
      this.stepCloud(this.spray, this.sprayVel, emitters, host, dt, 1, 0.07);
      this.stepCloud(this.mist, this.mistVel, emitters, host, dt, 0.45, 0.04, 2.4);
      this.stepCloud(this.trail, this.trailVel, emitters.filter((b) => b.boostHeld), host, dt, 0.35, 0.12, 0.4);
      this.sprayMat.uniforms.uOpacity.value = host.onWater ? Math.min(0.62, 0.16 + host.speed / 48) : 0.03;
      this.sprayMat.uniforms.uSize.value = boosting ? 22 : 16;
      this.mistMat.uniforms.uOpacity.value = host.onWater ? 0.14 + host.speed / 220 : 0.02;
      this.trailMat.uniforms.uOpacity.value = boosting ? 0.72 : 0.08;
    }

    if (this.lightning > 0) {
      this.lightning -= dt;
      this.hemi.intensity = 1.8;
    } else {
      this.hemi.intensity = 0.55;
      if (Math.random() < (boosting ? 0.006 : 0.003)) this.flash();
    }
  }
}
