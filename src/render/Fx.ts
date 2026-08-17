import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";

export class Fx {
  readonly group = new THREE.Group();
  private spray: THREE.Points;
  private sprayVel: Float32Array;
  private trails = new Map<string, THREE.Mesh>();
  private wakes = new Map<string, THREE.Mesh>();
  private roosters = new Map<string, { l: THREE.Mesh; r: THREE.Mesh }>();
  private pickups = new THREE.Group();
  private crates = new THREE.Group();
  private mines = new THREE.Group();
  private minePool: THREE.Mesh[] = [];
  private lightning = 0;
  private hemi: THREE.HemisphereLight;

  constructor(hemi: THREE.HemisphereLight) {
    this.hemi = hemi;
    const count = 1600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.sprayVel = new Float32Array(count * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.spray = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd8fbff,
        size: 0.72,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.group.add(this.spray);
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

    const pos = this.spray.geometry.getAttribute("position") as THREE.BufferAttribute;
    const emitters = boats.filter((b) => b.onWater && b.speed > 4);
    const host = boats.find((b) => !b.ai) ?? boats[0];
    if (host && emitters.length) {
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        y += this.sprayVel[i * 3 + 1] * dt;
        this.sprayVel[i * 3 + 1] -= 22 * dt;
        if (y < host.y - 1.2 || Math.random() < 0.07) {
          const boat = emitters[i % emitters.length];
          const fwd = headingVector(boat.yaw);
          const side = Math.random() < 0.5 ? -1 : 1;
          const lat = 1.15 + Math.random() * 2.1;
          const boostKick = boat.boostHeld ? 9 : 0;
          pos.setXYZ(
            i,
            boat.x + fwd.z * side * lat - fwd.x * (1.2 + Math.random() * 2.4),
            boat.y + 0.2,
            boat.z - fwd.x * side * lat - fwd.z * (1.2 + Math.random() * 2.4),
          );
          const kick = 8.4 + Math.random() * 12 + boat.speed * 0.16 + boostKick;
          this.sprayVel[i * 3] = fwd.z * side * (4 + Math.random() * 8) - fwd.x * (2 + boat.speed * 0.16);
          this.sprayVel[i * 3 + 1] = kick;
          this.sprayVel[i * 3 + 2] = -fwd.x * side * (4 + Math.random() * 8) - fwd.z * (2 + boat.speed * 0.16);
        } else {
          pos.setY(i, y);
          pos.setX(i, pos.getX(i) + this.sprayVel[i * 3] * dt);
          pos.setZ(i, pos.getZ(i) + this.sprayVel[i * 3 + 2] * dt);
        }
      }
      pos.needsUpdate = true;
      const sprayAmt = host.onWater ? Math.min(0.95, 0.22 + host.speed / 20) : 0.05;
      (this.spray.material as THREE.PointsMaterial).opacity = sprayAmt;
      (this.spray.material as THREE.PointsMaterial).size = boosting ? 0.92 : 0.68;
    }

    for (const boat of boats) {
      let trail = this.trails.get(boat.id);
      if (!trail) {
        trail = new THREE.Mesh(
          new THREE.ConeGeometry(0.35, 4.2, 6),
          new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0.55 }),
        );
        trail.rotation.x = Math.PI / 2;
        this.group.add(trail);
        this.trails.set(boat.id, trail);
      }
      let wake = this.wakes.get(boat.id);
      if (!wake) {
        wake = new THREE.Mesh(
          new THREE.PlaneGeometry(7.2, 22, 1, 1),
          new THREE.MeshBasicMaterial({
            color: 0xe8ffff,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        wake.rotation.x = -Math.PI / 2;
        this.group.add(wake);
        this.wakes.set(boat.id, wake);
      }
      let roost = this.roosters.get(boat.id);
      if (!roost) {
        const mk = () =>
          new THREE.Mesh(
            new THREE.PlaneGeometry(3.1, 7.4, 1, 1),
            new THREE.MeshBasicMaterial({
              color: 0xf4ffff,
              transparent: true,
              opacity: 0.42,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
        roost = { l: mk(), r: mk() };
        this.group.add(roost.l, roost.r);
        this.roosters.set(boat.id, roost);
      }
      const fwd = headingVector(boat.yaw);
      const rightX = fwd.z;
      const rightZ = -fwd.x;
      const sprayH = boat.onWater ? Math.min(1, boat.speed / 18) : 0;
      for (const [mesh, side] of [
        [roost.l, -1],
        [roost.r, 1],
      ] as const) {
        mesh.visible = sprayH > 0.12;
        mesh.position.set(
          boat.x + rightX * side * 1.55 - fwd.x * 1.6,
          boat.y + 1.25 + sprayH * 1.1 + (boosting ? 0.55 : 0),
          boat.z + rightZ * side * 1.55 - fwd.z * 1.6,
        );
        mesh.rotation.set(0.4, boat.yaw, side * 0.62);
        mesh.scale.set(1.1 + sprayH * 0.55, 0.7 + sprayH * 1.35 + (boosting ? 0.5 : 0), 1);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.22 + sprayH * 0.5;
      }
      wake.visible = boat.onWater && boat.speed > 5;
      wake.position.set(boat.x - fwd.x * 11, boat.y - 0.3, boat.z - fwd.z * 11);
      wake.rotation.z = -boat.yaw;
      (wake.material as THREE.MeshBasicMaterial).opacity = Math.min(0.66, boat.speed / 36);
      trail.visible = boat.boostHeld && (boat.boostFuel > 0 || boat.superBoostRemaining > 0);
      const superOn = boat.superBoostRemaining > 0 && boat.boostHeld;
      (trail.material as THREE.MeshBasicMaterial).color.set(superOn ? 0xffe14a : 0x7af0ff);
      trail.position.set(boat.x - fwd.x * 3.2, boat.y + 0.4, boat.z - fwd.z * 3.2);
      trail.rotation.y = boat.yaw;
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
