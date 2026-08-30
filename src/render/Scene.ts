import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Boat } from "../sim/Boat";
import type { TrackWorld } from "../sim/Track";
import { BOATS } from "../data/boats";
import { applyHullHeat, createBoatMesh, getBoatTemplate, preloadBoatMeshes } from "./BoatMesh";
import { CameraRig, type CameraMode } from "./CameraRig";
import { Fx } from "./Fx";
import { createSkyDome } from "./SkyDome";
import { createOceanMaterial } from "./WaterMaterial";
import { createTrackGroup } from "./TrackMesh";
import { WakeField } from "./Wake";

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: CameraRig;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private waterMats: THREE.ShaderMaterial[] = [];
  private boats = new Map<string, THREE.Group>();
  private fx: Fx;
  private wakes: WakeField;
  private hemi: THREE.HemisphereLight;
  private dir: THREE.DirectionalLight;
  private trackGroup: THREE.Group | null = null;
  private fogDay = new THREE.Color(0x8ab0c4);
  private fogDusk = new THREE.Color(0xc49a72);
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private cubeCam: THREE.CubeCamera;
  private cubeTick = 0;
  private waterMeshes: THREE.Object3D[] = [];
  private oceanMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private boatsReady: Promise<void>;
  private punch = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new CameraRig(window.innerWidth / window.innerHeight);
    this.scene.background = new THREE.Color(0x8ab0c4);
    this.scene.fog = new THREE.Fog(0x8ab0c4, 110, 780);

    this.hemi = new THREE.HemisphereLight(0xffe2c0, 0x1a3040, 1.12);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffd4a0, 1.85);
    this.dir.position.set(-80, 32, 48);
    this.dir.castShadow = true;
    this.dir.shadow.mapSize.set(2048, 2048);
    this.dir.shadow.camera.near = 10;
    this.dir.shadow.camera.far = 280;
    this.dir.shadow.camera.left = -90;
    this.dir.shadow.camera.right = 90;
    this.dir.shadow.camera.top = 90;
    this.dir.shadow.camera.bottom = -90;
    this.dir.shadow.bias = -0.00025;
    this.scene.add(this.dir);
    const fill = new THREE.DirectionalLight(0x8ec8d8, 0.95);
    fill.position.set(55, 40, -25);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffc878, 0.5);
    rim.position.set(-20, 18, 70);
    this.scene.add(rim);
    const ambient = new THREE.AmbientLight(0x6a8894, 0.55);
    this.scene.add(ambient);

    this.oceanMat = createOceanMaterial();
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 48, 48), this.oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -1.6;
    ocean.name = "waterSurface";
    this.scene.add(ocean);
    this.waterMats.push(this.oceanMat);
    this.waterMeshes.push(ocean);

    this.cubeRT = new THREE.WebGLCubeRenderTarget(64, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(2, 1600, this.cubeRT);
    this.scene.add(this.cubeCam);

    const sky = createSkyDome();
    this.sky = sky.mesh;
    this.skyMat = sky.material;
    this.scene.add(this.sky);

    this.fx = new Fx(this.hemi);
    this.scene.add(this.fx.group);
    this.wakes = new WakeField();
    this.scene.add(this.wakes.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.4, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.boatsReady = preloadBoatMeshes(BOATS);
  }

  whenBoatsReady(): Promise<void> {
    return this.boatsReady;
  }

  slam(x: number, y: number, z: number): void {
    this.fx.slam(x, y, z);
  }

  bankSpray(x: number, y: number, z: number): void {
    this.fx.bankSpray(x, y, z);
  }

  sparks(x: number, y: number, z: number): void {
    this.fx.sparks(x, y, z);
  }

  hitPunch(amount = 1): void {
    this.punch = Math.max(this.punch, amount);
  }

  loadTrack(track: TrackWorld): void {
    if (this.trackGroup) this.scene.remove(this.trackGroup);
    const built = createTrackGroup(track);
    this.trackGroup = built.group;
    this.waterMats = [this.oceanMat, built.waterMat];
    this.scene.add(built.group);
    this.waterMeshes = this.waterMeshes.filter((m) => m.name === "waterSurface");
    built.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material === built.waterMat) this.waterMeshes.push(obj);
    });
    this.fx.rebuildPickups(track);
  }

  syncBoats(boats: Boat[], time = 0): void {
    const seen = new Set<string>();
    for (const boat of boats) {
      seen.add(boat.id);
      let mesh = this.boats.get(boat.id);
      const ready = getBoatTemplate(boat.def.id);
      const wrongHull = mesh && mesh.userData.hullId !== boat.def.id;
      const upgrade = mesh && mesh.userData.procedural && ready;
      if (mesh && (wrongHull || upgrade)) {
        this.scene.remove(mesh);
        mesh = undefined;
      }
      if (!mesh) {
        mesh = createBoatMesh(boat.def);
        mesh.userData.hullId = boat.def.id;
        this.bindBoatEnv(mesh);
        this.boats.set(boat.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(boat.x, boat.y, boat.z);
      mesh.rotation.set(boat.pitch, boat.yaw, boat.roll);
      const hot = boat.boostHeld && (boat.boostFuel > 0 || boat.superBoostRemaining > 0);
      const turbine = mesh.getObjectByName("turbine");
      if (turbine) turbine.scale.setScalar(hot ? 1.28 : 1);
      const glow = mesh.getObjectByName("turbineGlow") as THREE.Mesh | undefined;
      if (glow) {
        glow.scale.set(hot ? 0.7 : 0.2, hot ? 1.1 : 0.2, hot ? 0.7 : 0.2);
        const gm = glow.material as THREE.MeshBasicMaterial;
        gm.opacity = hot ? (boat.superBoostRemaining > 0 ? 0.35 : 0.22) : 0;
        gm.color.set(boat.superBoostRemaining > 0 && hot ? 0xffe14a : 0x7af0ff);
      }
      applyHullHeat(mesh, hot ? (boat.superBoostRemaining > 0 ? 1 : 0.6) : 0);
    }
    for (const [id, mesh] of this.boats) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.boats.delete(id);
      }
    }
    this.wakes.sync(boats, time);
  }

  render(
    track: TrackWorld,
    boats: Boat[],
    player: Boat | undefined,
    dt: number,
    time: number,
    cam: CameraMode = "chase",
  ): void {
    const camPos = this.camera.camera.position;
    for (const mat of this.waterMats) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uCam.value.copy(camPos);
    }
    const boosting = !!player && player.boostHeld && (player.boostFuel > 0 || player.superBoostRemaining > 0);
    const superOn = !!player && player.superBoostRemaining > 0 && player.boostHeld;
    this.fx.update(track, boats, dt, time, boosting);
    this.syncBoats(boats, time);
    if (player) {
      this.tintWorld(player.courseT);
      if (cam === "showcase") this.camera.showcase(player, time, dt);
      else if (cam === "finish") this.camera.finish(player, dt, track);
      else this.camera.follow(player, dt, boosting, superOn, track);
      this.sky.position.copy(this.camera.camera.position);
      if (cam !== "showcase") {
        this.cubeTick++;
        if (this.cubeTick % 6 === 0) this.captureEnv(player.x, player.y + 8, player.z);
      }
    }
    if (this.punch > 0) {
      this.hemi.intensity += this.punch * 0.7;
      this.dir.intensity += this.punch * 0.55;
      this.renderer.toneMappingExposure += this.punch * 0.14;
      this.punch = Math.max(0, this.punch - dt * 4.2);
    }
    this.bloom.strength = (superOn ? 0.38 : boosting ? 0.28 : 0.2) + this.punch * 0.35;
    this.composer.render();
  }

  private bindBoatEnv(root: THREE.Object3D): void {
    const env = this.cubeRT.texture;
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshPhysicalMaterial) {
        if (obj.material.envMap === env) return;
        obj.material.envMap = env;
        obj.material.envMapIntensity = 1.15;
        obj.material.needsUpdate = true;
      }
    });
  }

  private captureEnv(x: number, y: number, z: number): void {
    this.cubeCam.position.set(x, y, z);
    this.wakes.group.visible = false;
    for (const m of this.waterMeshes) m.visible = false;
    const track = this.trackGroup;
    const trackVisible = track ? track.visible : true;
    if (track) track.visible = false;
    this.cubeCam.update(this.renderer, this.scene);
    for (const m of this.waterMeshes) m.visible = true;
    if (track) track.visible = trackVisible;
    this.wakes.group.visible = true;
    const env = this.cubeRT.texture;
    for (const mat of this.waterMats) {
      mat.uniforms.uEnv.value = env;
      mat.uniforms.uHasEnv.value = 1;
    }
  }

  /** One dusk harbor — sector warmth only, never a blackout tour. */
  private tintWorld(t: number): void {
    const cavern = t >= 0.52 && t < 0.78;
    const warmth = t >= 0.22 && t < 0.48 ? 0.45 : 0.18;
    const fog = this.fogDay.clone().lerp(this.fogDusk, warmth);
    if (cavern) fog.lerp(new THREE.Color(0x1c3040), 0.35);
    this.scene.background = fog;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.near = cavern ? 70 : 120;
      this.scene.fog.far = cavern ? 520 : 820;
    }
    this.hemi.intensity = cavern ? 0.92 : 1.12;
    this.dir.intensity = cavern ? 1.15 : 1.85;
    this.dir.color.setHex(0xffd4a0);
    this.renderer.toneMappingExposure = cavern ? 1.05 : 1.16;
    const sun = this.dir.position.clone().normalize();
    this.skyMat.uniforms.uSunDir.value.copy(sun);
    this.skyMat.uniforms.uHorizon.value.setHex(cavern ? 0x8aa0b0 : 0xe8b888);
    this.skyMat.uniforms.uZenith.value.setHex(cavern ? 0x243850 : 0x3a6a9a);
    for (const mat of this.waterMats) {
      if (mat.uniforms.uSunDir) mat.uniforms.uSunDir.value.copy(sun);
      if (mat.uniforms.uSky) mat.uniforms.uSky.value.setHex(cavern ? 0x8aa8b8 : 0xead2a8);
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.resize(w, h);
  }
}
