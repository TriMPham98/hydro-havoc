import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { lerp } from "../sim/math";

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.2, 1800);
    this.camera.position.set(0, 8, -14);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  follow(boat: Boat, dt: number, boosting: boolean, superBoost: boolean): void {
    const fwd = headingVector(boat.yaw);
    const back = 14.2 + boat.speed * 0.09 + (superBoost ? 2.4 : boosting ? 1.2 : 0);
    const height = 6.9 + boat.speed * 0.045 + (boat.airborne ? 1.1 : 0);
    this.desired.set(boat.x - fwd.x * back, boat.y + height, boat.z - fwd.z * back);
    const k = 1 - Math.pow(0.0008, dt);
    this.camera.position.lerp(this.desired, k);
    if (boat.camShake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * boat.camShake * 0.7;
      this.camera.position.y += (Math.random() - 0.5) * boat.camShake * 0.4;
    }
    this.look.set(boat.x + fwd.x * 16, boat.y + 1.15 + boat.speed * 0.02, boat.z + fwd.z * 16);
    this.camera.lookAt(this.look);
    const targetFov = superBoost ? 78 : boosting ? 70 : 62;
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.pow(0.01, dt));
    this.camera.updateProjectionMatrix();
  }
}
