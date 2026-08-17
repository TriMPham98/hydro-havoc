import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { lerp, wrapAngle } from "../sim/math";

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private yaw = 0;
  private roll = 0;
  private primed = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.2, 1800);
    this.camera.position.set(0, 8, -14);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  follow(boat: Boat, dt: number, boosting: boolean, superBoost: boolean): void {
    if (!this.primed) {
      this.yaw = boat.yaw;
      this.primed = true;
    }
    this.yaw += wrapAngle(boat.yaw - this.yaw) * (1 - Math.pow(0.08, dt));
    const fwd = headingVector(this.yaw);
    const back = 13.2 + boat.speed * 0.078 + (superBoost ? 2.1 : boosting ? 1.05 : 0);
    const height = 6.15 + boat.speed * 0.034 + (boat.airborne ? 0.85 : 0);
    this.desired.set(boat.x - fwd.x * back, boat.y + height, boat.z - fwd.z * back);
    this.camera.position.lerp(this.desired, 1 - Math.pow(0.012, dt));
    this.look.set(boat.x + fwd.x * 18, boat.y + 1.2, boat.z + fwd.z * 18);
    this.camera.lookAt(this.look);
    const wantRoll = -boat.steer * (boosting ? 0.035 : 0.018);
    this.roll = lerp(this.roll, wantRoll, 1 - Math.pow(0.05, dt));
    this.camera.rotateZ(this.roll);
    const targetFov = superBoost ? 76 : boosting ? 69 : 60;
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.pow(0.02, dt));
    this.camera.updateProjectionMatrix();
  }
}
