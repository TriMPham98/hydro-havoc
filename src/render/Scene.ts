import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";
import { createBoatMesh } from "./BoatMesh";
import { CameraRig } from "./CameraRig";
import { Fx } from "./Fx";
import { createOceanMaterial } from "./WaterMaterial";
import { createTrackGroup } from "./TrackMesh";

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: CameraRig;
  private waterMats: THREE.ShaderMaterial[] = [];
  private boats = new Map<string, THREE.Group>();
  private fx: Fx;
  private hemi: THREE.HemisphereLight;
  private trackGroup: THREE.Group | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.camera = new CameraRig(window.innerWidth / window.innerHeight);
    this.scene.background = new THREE.Color(0x143044);
    this.scene.fog = new THREE.FogExp2(0x143044, 0.0036);

    this.hemi = new THREE.HemisphereLight(0xc8e8ff, 0x3a2414, 1.15);
    this.scene.add(this.hemi);
    const dir = new THREE.DirectionalLight(0xfff2d8, 1.85);
    dir.position.set(-50, 90, 35);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0x4ec8e0, 0.55);
    fill.position.set(40, 30, -20);
    this.scene.add(fill);
    const ambient = new THREE.AmbientLight(0x4a6a78, 0.45);
    this.scene.add(ambient);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 80, 80), createOceanMaterial());
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -7;
    this.scene.add(ocean);
    this.waterMats.push(ocean.material as THREE.ShaderMaterial);

    this.fx = new Fx(this.hemi);
    this.scene.add(this.fx.group);
  }

  slam(x: number, y: number, z: number): void {
    this.fx.slam(x, y, z);
  }

  loadTrack(track: TrackWorld): void {
    if (this.trackGroup) this.scene.remove(this.trackGroup);
    const built = createTrackGroup(track);
    this.trackGroup = built.group;
    this.waterMats = this.waterMats.filter((m) => m !== built.waterMat);
    this.waterMats.push(built.waterMat);
    this.scene.add(built.group);
    this.fx.rebuildPickups(track);
  }

  syncBoats(boats: Boat[]): void {
    const seen = new Set<string>();
    for (const boat of boats) {
      seen.add(boat.id);
      let mesh = this.boats.get(boat.id);
      if (!mesh) {
        mesh = createBoatMesh(boat.def);
        this.boats.set(boat.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(boat.x, boat.y, boat.z);
      mesh.rotation.set(boat.pitch, boat.yaw, boat.roll);
    }
    for (const [id, mesh] of this.boats) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.boats.delete(id);
      }
    }
  }

  render(track: TrackWorld, boats: Boat[], player: Boat | undefined, dt: number, time: number): void {
    const camPos = this.camera.camera.position;
    for (const mat of this.waterMats) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uCam.value.copy(camPos);
    }
    const boosting = !!player && player.boostHeld && (player.boostFuel > 0 || player.superBoostRemaining > 0);
    const superOn = !!player && player.superBoostRemaining > 0 && player.boostHeld;
    this.fx.update(track, boats, dt, time, boosting);
    this.syncBoats(boats);
    if (player) this.camera.follow(player, dt, boosting, superOn);
    this.renderer.render(this.scene, this.camera.camera);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.resize(w, h);
  }
}
