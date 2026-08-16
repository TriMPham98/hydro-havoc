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
    const count = 900;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.sprayVel = new Float32Array(count * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.spray = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd8fbff,
        size: 0.58,
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
    const player = boats.find((b) => !b.ai) ?? boats[0];
    if (player) {
      const fwd = headingVector(player.yaw);
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        y += this.sprayVel[i * 3 + 1] * dt;
        this.sprayVel[i * 3 + 1] -= 18 * dt;
        if (y < player.y - 0.55 || Math.random() < 0.05) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const lat = 1.05 + Math.random() * 1.6;
          pos.setXYZ(
            i,
            player.x + fwd.z * side * lat - fwd.x * (1.1 + Math.random() * 1.8),
            player.y + 0.15,
            player.z - fwd.x * side * lat - fwd.z * (1.1 + Math.random() * 1.8),
          );
          const kick = 7.2 + Math.random() * 10 + player.speed * 0.12 + (boosting ? 6 : 0);
          this.sprayVel[i * 3] = fwd.z * side * (3 + Math.random() * 7) - fwd.x * (2 + player.speed * 0.12);
          this.sprayVel[i * 3 + 1] = kick;
          this.sprayVel[i * 3 + 2] = -fwd.x * side * (3 + Math.random() * 7) - fwd.z * (2 + player.speed * 0.12);
        } else {
          pos.setY(i, y);
          pos.setX(i, pos.getX(i) + this.sprayVel[i * 3] * dt);
          pos.setZ(i, pos.getZ(i) + this.sprayVel[i * 3 + 2] * dt);
        }
      }
      pos.needsUpdate = true;
      const sprayAmt = player.onWater ? Math.min(0.92, 0.18 + player.speed / 22) : 0.04;
      (this.spray.material as THREE.PointsMaterial).opacity = sprayAmt;
      (this.spray.material as THREE.PointsMaterial).size = boosting ? 0.78 : 0.56;
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
          new THREE.PlaneGeometry(5.4, 16, 1, 1),
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
            new THREE.PlaneGeometry(2.4, 5.2, 1, 1),
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
          boat.x + rightX * side * 1.35 - fwd.x * 1.4,
          boat.y + 1.1 + sprayH * 0.8 + (boosting ? 0.4 : 0),
          boat.z + rightZ * side * 1.35 - fwd.z * 1.4,
        );
        mesh.rotation.set(0.35, boat.yaw, side * 0.55);
        mesh.scale.set(1 + sprayH * 0.4, 0.55 + sprayH * 1.1 + (boosting ? 0.35 : 0), 1);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.18 + sprayH * 0.45;
      }
      wake.visible = boat.onWater && boat.speed > 6;
      wake.position.set(boat.x - fwd.x * 8.2, boat.y - 0.32, boat.z - fwd.z * 8.2);
      wake.rotation.z = -boat.yaw;
      (wake.material as THREE.MeshBasicMaterial).opacity = Math.min(0.58, boat.speed / 42);
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
