import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
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
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private waterMats: THREE.ShaderMaterial[] = [];
  private boats = new Map<string, THREE.Group>();
  private fx: Fx;
  private hemi: THREE.HemisphereLight;
  private dir: THREE.DirectionalLight;
  private trackGroup: THREE.Group | null = null;
  private fogDay = new THREE.Color(0x143044);
  private fogNight = new THREE.Color(0x061018);
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private cubeCam: THREE.CubeCamera;
  private cubeTick = 0;
  private waterMeshes: THREE.Object3D[] = [];
  private haze: THREE.Group;
  private hazeMat: THREE.MeshBasicMaterial;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new CameraRig(window.innerWidth / window.innerHeight);
    this.scene.background = new THREE.Color(0x143044);
    this.scene.fog = new THREE.FogExp2(0x143044, 0.0032);

    this.hemi = new THREE.HemisphereLight(0xd4eefc, 0x2a1810, 1.28);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xfff1d2, 2.05);
    this.dir.position.set(-50, 90, 35);
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
    const fill = new THREE.DirectionalLight(0x4ec8e0, 0.62);
    fill.position.set(40, 30, -20);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffc878, 0.42);
    rim.position.set(-20, 18, 70);
    this.scene.add(rim);
    const ambient = new THREE.AmbientLight(0x4a6a78, 0.38);
    this.scene.add(ambient);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 80, 80), createOceanMaterial());
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -7;
    ocean.name = "waterSurface";
    this.scene.add(ocean);
    this.waterMats.push(ocean.material as THREE.ShaderMaterial);
    this.waterMeshes.push(ocean);

    this.cubeRT = new THREE.WebGLCubeRenderTarget(96, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(2, 900, this.cubeRT);
    this.scene.add(this.cubeCam);

    this.hazeMat = new THREE.MeshBasicMaterial({
      color: 0xffc878,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.haze = new THREE.Group();
    this.haze.name = "skyHaze";
    const shaft = new THREE.ConeGeometry(18, 90, 8, 1, true);
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.Mesh(shaft, this.hazeMat);
      cone.position.set((i - 2) * 28, 58, -40 + (i % 2) * 16);
      cone.rotation.z = 0.35;
      cone.rotation.x = 0.15;
      this.haze.add(cone);
    }
    this.scene.add(this.haze);

    this.fx = new Fx(this.hemi);
    this.scene.add(this.fx.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
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
    this.waterMeshes = this.waterMeshes.filter((m) => m.name === "waterSurface");
    built.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material === built.waterMat) this.waterMeshes.push(obj);
    });
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
    if (player) {
      this.tintWorld(player.courseT);
      this.camera.follow(player, dt, boosting, superOn);
      this.cubeTick++;
      if (this.cubeTick % 6 === 0) this.captureEnv(player.x, player.y + 10, player.z);
      this.haze.position.set(player.x, player.y, player.z);
      this.haze.quaternion.copy(this.camera.camera.quaternion);
    }
    this.bloom.strength = superOn ? 0.52 : boosting ? 0.4 : 0.3;
    this.composer.render();
  }

  private captureEnv(x: number, y: number, z: number): void {
    this.cubeCam.position.set(x, y, z);
    for (const m of this.waterMeshes) m.visible = false;
    this.haze.visible = false;
    this.cubeCam.update(this.renderer, this.scene);
    this.haze.visible = true;
    for (const m of this.waterMeshes) m.visible = true;
    const env = this.cubeRT.texture;
    for (const mat of this.waterMats) {
      mat.uniforms.uEnv.value = env;
      mat.uniforms.uHasEnv.value = 1;
    }
    for (const mesh of this.boats.values()) {
      mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshPhysicalMaterial) {
          obj.material.envMap = env;
          obj.material.envMapIntensity = 1.15;
          obj.material.needsUpdate = true;
        }
      });
    }
  }

  /** Tour lighting: harbor day, mesa dusk, city night, reef dawn. */
  private tintWorld(t: number): void {
    const harbor = t < 0.22 || t > 0.92;
    const mesa = t >= 0.22 && t < 0.42;
    const city = t >= 0.42 && t < 0.68;
    const night = city ? 1 : t > 0.38 && t < 0.74 ? 0.55 : 0;
    const dusk = mesa ? 0.7 : 0;
    const fog = this.fogDay.clone().lerp(this.fogNight, night);
    if (dusk) fog.lerp(new THREE.Color(0x4a2818), dusk * 0.45);
    if (harbor) fog.lerp(new THREE.Color(0x1a4058), 0.15);
    this.scene.background = fog;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.density = 0.0028 + night * 0.0044 + dusk * 0.0016;
    }
    this.hemi.intensity = 1.28 - night * 0.52 + (harbor ? 0.1 : 0);
    this.dir.intensity = 2.05 - night * 1.15 + dusk * 0.22;
    this.dir.color.setHex(night > 0.5 ? 0x6aa8c8 : dusk > 0.4 ? 0xffb070 : 0xfff1d2);
    this.hazeMat.color.setHex(night > 0.5 ? 0x6aa8c8 : dusk > 0.4 ? 0xff8a40 : 0xffd8a0);
    this.hazeMat.opacity = 0.035 + dusk * 0.03 + night * 0.02;
    this.renderer.toneMappingExposure = 1.18 + dusk * 0.08 - night * 0.12;
    const sun = this.dir.position.clone().normalize();
    for (const mat of this.waterMats) {
      if (mat.uniforms.uSunDir) mat.uniforms.uSunDir.value.copy(sun);
      if (mat.uniforms.uSky) mat.uniforms.uSky.value.copy(fog).lerp(new THREE.Color(0xc8e8ff), 0.55);
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
