import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { lerp, wrapAngle } from "../sim/math";
import { queryCourse, type TrackWorld } from "../sim/Track";

export type CameraMode = "chase" | "showcase" | "finish";

function follow(dt: number, rate: number): number {
  return 1 - Math.exp(-rate * Math.min(Math.max(dt, 1 / 240), 0.05));
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private look = new THREE.Vector3();
  private lookWant = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private yaw = 0;
  private rideY = 1;
  private orbit = 0.55;
  private primed = false;
  private fovDirty = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.35, 4200);
    this.camera.position.set(0, 8, -14);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  reset(): void {
    this.primed = false;
  }

  snap(boat: Boat, track?: TrackWorld): void {
    this.yaw = boat.yaw;
    this.rideY = boat.y;
    this.primed = true;
    this.chaseTarget(boat, false, false, track);
    this.camera.position.copy(this.desired);
    this.look.copy(this.lookWant);
    this.camera.lookAt(this.look);
    this.setFov(56);
  }

  follow(boat: Boat, dt: number, boosting: boolean, superBoost: boolean, track?: TrackWorld): void {
    if (!this.primed) {
      this.snap(boat, track);
      return;
    }
    this.yaw += wrapAngle(boat.yaw - this.yaw) * follow(dt, 3.6);
    this.rideY = lerp(this.rideY, boat.y, follow(dt, 4.4));
    this.chaseTarget(boat, boosting, superBoost, track);
    const k = follow(dt, 7.6);
    this.camera.position.lerp(this.desired, k);
    this.look.lerp(this.lookWant, k);
    this.camera.lookAt(this.look);
    this.setFov(lerp(this.camera.fov, superBoost ? 64 : boosting ? 59 : 56, follow(dt, 5)));
  }

  /**
   * Heading chase, pulled toward the canal center. Extra back/height at low
   * speed so the start grid is in front of the lens, not inside it.
   */
  private chaseTarget(boat: Boat, boosting: boolean, superBoost: boolean, track?: TrackWorld): void {
    const speedK = Math.min(1, boat.speed / 32);
    const hull = boat.def.hullLength;
    const back = hull * 0.42 + 9.2 + (1 - speedK) * 1.4 + (superBoost ? 1.1 : boosting ? 0.45 : 0);
    const height = 4.6 + hull * 0.08 + (1 - speedK) * 0.55 + boat.speed * 0.006 + (boat.airborne ? 0.35 : 0);
    const fwd = headingVector(this.yaw);
    let x = boat.x - fwd.x * back;
    let z = boat.z - fwd.z * back;
    if (track) {
      const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
      const pull = 0.7 * speedK;
      x -= q.frame.rx * q.lateral * pull;
      z -= q.frame.rz * q.lateral * pull;
    }
    this.desired.set(x, this.rideY + height, z);
    const lookAhead = 5.5 + 8.5 * speedK;
    this.lookWant.set(boat.x + fwd.x * lookAhead, this.rideY + 1.05, boat.z + fwd.z * lookAhead);
  }

  showcase(boat: Boat, _time: number, dt: number): void {
    this.primed = false;
    this.orbit += dt * 0.38;
    this.placeShowcase(boat);
    const k = follow(dt, 5.5);
    this.camera.position.lerp(this.desired, k);
    this.look.lerp(this.lookWant, k);
    this.camera.lookAt(this.look);
    this.setFov(lerp(this.camera.fov, 34, follow(dt, 6)));
  }

  snapShowcase(boat: Boat): void {
    this.primed = false;
    this.placeShowcase(boat);
    this.camera.position.copy(this.desired);
    this.look.copy(this.lookWant);
    this.camera.lookAt(this.look);
    this.setFov(34);
  }

  /** Orbit over the water: side-to-bow swing, never a world-space circle into the banks. */
  private placeShowcase(boat: Boat): void {
    const fwd = headingVector(boat.yaw);
    const rightX = fwd.z;
    const rightZ = -fwd.x;
    const dist = 10.5;
    const swing = Math.sin(this.orbit) * 0.58;
    const back = 0.62 + Math.cos(this.orbit) * 0.22;
    this.desired.set(
      boat.x - fwd.x * dist * back + rightX * dist * swing,
      boat.y + 6.4,
      boat.z - fwd.z * dist * back + rightZ * dist * swing,
    );
    this.lookWant.set(boat.x + fwd.x * 1.2, boat.y + 0.9, boat.z + fwd.z * 1.2);
  }

  finish(boat: Boat, dt: number, track?: TrackWorld): void {
    this.primed = false;
    this.rideY = lerp(this.rideY, boat.y, follow(dt, 4));
    this.yaw += wrapAngle(boat.yaw - this.yaw) * follow(dt, 2.4);
    this.chaseTarget(boat, false, false, track);
    this.desired.y += 1.4;
    const k = follow(dt, 5);
    this.camera.position.lerp(this.desired, k);
    this.look.lerp(this.lookWant, k);
    this.camera.lookAt(this.look);
    this.setFov(lerp(this.camera.fov, 50, follow(dt, 5)));
  }

  private setFov(next: number): void {
    if (Math.abs(this.camera.fov - next) < 0.04 && !this.fovDirty) return;
    this.camera.fov = next;
    this.camera.updateProjectionMatrix();
    this.fovDirty = false;
  }
}
