import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Boat } from "../sim/Boat";
import { queryCourse, type TrackWorld } from "../sim/Track";
import { gerstnerHeight } from "../sim/waterHeight";
import { BOATS } from "../data/boats";
import { applyHullHeat, createBoatMesh, getBoatTemplate, preloadBoatMeshes } from "./BoatMesh";
import { updateJet } from "./JetBoost";
import { boostLive } from "../sim/BoostSystem";
import { CameraRig, type CameraMode } from "./CameraRig";
import { ContactField } from "./Contact";
import { Fx } from "./Fx";
import { createSkyDome } from "./SkyDome";
import { createOceanMaterial } from "./WaterMaterial";
import { createTrackGroup } from "./TrackMesh";
import { WakeField } from "./Wake";

type Quality = "low" | "med" | "high";

function readQuality(): Quality {
  const q = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const raw = (q.get("quality") ?? "").toLowerCase();
  if (raw === "low" || q.get("low") === "1") return "low";
  if (raw === "high") return "high";
  return "med";
}

function disposeTrackGpu(root: THREE.Object3D, preserve: THREE.Material[]): void {
  const keep = new Set(preserve);
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    else if (obj instanceof THREE.Light) obj.dispose();
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geos.add(mesh.geometry);
    const material = mesh.material;
    if (!material) return;
    if (Array.isArray(material)) {
      for (const m of material) if (m) mats.add(m);
    } else if (material instanceof THREE.Material) {
      mats.add(material);
    }
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    if (!keep.has(m)) m.dispose();
  }
}

function volumeCard(
  z: number,
  y: number,
  sx: number,
  sy: number,
  color: number,
  opacity: number,
): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = pow(1.0 - clamp(r, 0.0, 1.0), 1.55) * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.position.set(0, y, z);
  mesh.scale.set(sx, sy, 1);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.name = "volumeCard";
  return { mesh, mat };
}

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
  private cubeCaptured = false;
  private waterMeshes: THREE.Object3D[] = [];
  private oceanMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private boatsReady: Promise<void>;
  private punch = 0;
  private dprCap: number;
  private dpr: number;
  private dprSlow = 0;
  private dprFast = 0;
  private dprWarmup = 90;
  private sunOffset = new THREE.Vector3(-80, 32, 48);
  private sunDir = new THREE.Vector3(-80, 32, 48).normalize();
  private shadowExtent = 48;
  private contacts: ContactField;
  private canalMat: THREE.ShaderMaterial | null = null;
  private readonly quality: Quality;
  private readonly planarLong: number;
  private readonly cubeInterval: number;
  private planarTick = 0;
  private planarRT: THREE.WebGLRenderTarget;
  private planarCam: THREE.PerspectiveCamera;
  private reflectMatrix = new THREE.Matrix4();
  private clipPlane = new THREE.Plane();
  private clipVec = new THREE.Vector4();
  private clipQ = new THREE.Vector4();
  private reflView = new THREE.Vector3();
  private reflLook = new THREE.Vector3();
  private reflTarget = new THREE.Vector3();
  private camWorld = new THREE.Vector3();
  private planePoint = new THREE.Vector3();
  private reflNormal = new THREE.Vector3(0, 1, 0);
  private rotMat = new THREE.Matrix4();
  private hazeFarMat: THREE.ShaderMaterial;
  private hazeLowMat: THREE.ShaderMaterial;
  private hazeBoostMat: THREE.ShaderMaterial;
  private volumeCards: THREE.Mesh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.quality = readQuality();
    this.planarLong = this.quality === "high" ? 1024 : 512;
    // Option A: cube is hull env only (track stays hidden). Med: 32px / 16 frames. High: 64px / 6. Low: none.
    this.cubeInterval = this.quality === "high" ? 6 : 16;
    this.shadowExtent = this.quality === "high" ? 56 : 48;
    this.dprCap = Math.min(window.devicePixelRatio || 1, 1.25);
    this.dpr = this.dprCap;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = this.quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.camera = new CameraRig(window.innerWidth / window.innerHeight);
    this.scene.add(this.camera.camera);
    this.scene.background = new THREE.Color(0x8ab0c4);
    this.scene.fog = new THREE.Fog(0x8ab0c4, 110, 780);

    this.hemi = new THREE.HemisphereLight(0xffe2c0, 0x1a3040, 1.12);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffd4a0, 1.85);
    this.dir.position.copy(this.sunOffset);
    this.dir.target.position.set(0, 0, 0);
    this.dir.castShadow = this.quality !== "low";
    const shadowRes = this.quality === "high" ? 2048 : 1024;
    this.dir.shadow.mapSize.set(shadowRes, shadowRes);
    this.dir.shadow.camera.near = 18;
    this.dir.shadow.camera.far = 220;
    this.dir.shadow.camera.left = -this.shadowExtent;
    this.dir.shadow.camera.right = this.shadowExtent;
    this.dir.shadow.camera.top = this.shadowExtent;
    this.dir.shadow.camera.bottom = -this.shadowExtent;
    this.dir.shadow.camera.updateProjectionMatrix();
    this.dir.shadow.bias = -0.0005;
    this.dir.shadow.normalBias = 0.42;
    this.scene.add(this.dir);
    this.scene.add(this.dir.target);
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
    ocean.receiveShadow = true;
    this.scene.add(ocean);
    this.waterMats.push(this.oceanMat);
    this.waterMeshes.push(ocean);

    const cubeSize = this.quality === "high" ? 64 : 32;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
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
    this.contacts = new ContactField();
    this.scene.add(this.contacts.group);

    this.planarRT = new THREE.WebGLRenderTarget(this.planarLong, Math.round((this.planarLong * 9) / 16 / 2) * 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.planarRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.planarCam = new THREE.PerspectiveCamera(56, 16 / 9, 0.35, 4200);
    this.sizePlanar(window.innerWidth, window.innerHeight);
    this.oceanMat.uniforms.uPlanar.value = this.planarRT.texture;

    const hazeFar = volumeCard(-10, 1.2, 28, 14, 0xc49a72, 0.045);
    const hazeLow = volumeCard(-5.5, -1.6, 18, 7, 0x8ab0c4, 0.04);
    const hazeBoost = volumeCard(-3.2, 0.2, 12, 7, 0x7af0ff, 0);
    this.hazeFarMat = hazeFar.mat;
    this.hazeLowMat = hazeLow.mat;
    this.hazeBoostMat = hazeBoost.mat;
    this.volumeCards = [hazeFar.mesh, hazeLow.mesh, hazeBoost.mesh];
    this.camera.camera.add(hazeFar.mesh, hazeLow.mesh, hazeBoost.mesh);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.4, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new SMAAPass(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)));
    this.composer.addPass(new OutputPass());
    this.boatsReady = preloadBoatMeshes(BOATS);
  }

  whenBoatsReady(): Promise<void> {
    return this.boatsReady;
  }

  slam(x: number, y: number, z: number): void {
    this.fx.slam(x, y, z);
  }

  igniteJet(boat: Boat): void {
    this.fx.jetBurst(boat);
    this.hitPunch(boat.superBoostRemaining > 0 ? 0.5 : 0.3);
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
    const prev = this.trackGroup;
    const built = createTrackGroup(track);
    this.trackGroup = built.group;
    this.canalMat = built.waterMat;
    this.waterMats = [this.oceanMat, built.waterMat];
    built.waterMat.uniforms.uPlanar.value = this.planarRT.texture;
    this.scene.add(built.group);
    this.waterMeshes = this.waterMeshes.filter((m) => m.name === "waterSurface");
    built.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material === built.waterMat) this.waterMeshes.push(obj);
    });
    this.fx.rebuildPickups(track);
    if (prev) {
      this.scene.remove(prev);
      disposeTrackGpu(prev, [this.oceanMat]);
    }
  }

  syncPickups(track: TrackWorld): void {
    this.fx.rebuildPickups(track);
  }

  syncBoats(boats: Boat[], time = 0, dt = 1 / 60): void {
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
      const hot = boat.boostHeld && boostLive(boat);
      const hasFuel = boat.boostFuel > 0 || boat.superBoostRemaining > 0;
      const superOn = boat.superBoostRemaining > 0 && (hot || boat.jetIgnite > 0.02);
      updateJet(mesh, {
        boosting: hot,
        superOn,
        ignite: boat.jetIgnite,
        hasFuel,
        bay: boat.jetBay,
        speed: boat.speed,
        dt,
        time,
      });
      const heat = superOn ? 1 : hot ? 0.6 : boat.jetIgnite > 0 ? Math.min(1, 0.35 + boat.jetIgnite) : 0;
      applyHullHeat(mesh, heat);
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
    const firing = !!player && player.boostHeld && boostLive(player);
    const igniting = !!player && (player.jetIgnite > 0.02 || player.jetBay > 0.02);
    const boosting = firing || igniting;
    const superOn = !!player && player.superBoostRemaining > 0 && (firing || igniting);
    this.fx.update(track, boats, dt, time, boosting);
    this.syncBoats(boats, time, dt);
    this.contacts.sync(boats, time);
    if (player) {
      this.followSun(player);
      this.tintWorld(player.courseT, boosting, superOn);
      if (cam === "showcase") this.camera.showcase(player, time, dt);
      else if (cam === "finish") this.camera.finish(player, dt, track);
      else this.camera.follow(player, dt, boosting, superOn, track, cam === "attract");
      this.sky.position.copy(this.camera.camera.position);
      if (this.quality !== "low" && !(cam === "showcase" && this.cubeCaptured)) {
        this.cubeTick++;
        if (!this.cubeCaptured || this.cubeTick % this.cubeInterval === 0) {
          this.captureEnv(player.x, player.y + 8, player.z);
          this.cubeCaptured = true;
        }
      }
      const q = queryCourse(track, player.x, player.y, player.z, player.courseT);
      if (this.shouldUpdatePlanar(dt, cam)) {
        this.capturePlanar(q.waterY + gerstnerHeight(player.x, player.z, time));
      }
    }
    if (this.punch > 0) {
      this.hemi.intensity += this.punch * 0.7;
      this.dir.intensity += this.punch * 0.55;
      this.renderer.toneMappingExposure += this.punch * 0.14;
      this.punch = Math.max(0, this.punch - dt * 4.2);
    }
    this.bloom.strength = this.quality === "low" ? 0 : (superOn ? 0.38 : boosting ? 0.28 : 0.2) + this.punch * 0.35;
    this.adaptPixelRatio(dt);
    this.renderer.info.reset();
    this.composer.render();
  }

  frameStats(): { calls: number; triangles: number; dpr: number; planarOn: boolean } {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      dpr: this.dpr,
      planarOn: this.quality !== "low" && (this.canalMat?.uniforms.uHasPlanar.value ?? 0) > 0.5,
    };
  }

  private followSun(player: Boat): void {
    this.dir.target.position.set(player.x, player.y + 0.4, player.z);
    this.dir.position.set(player.x + this.sunOffset.x, player.y + this.sunOffset.y, player.z + this.sunOffset.z);
    this.dir.target.updateMatrixWorld();
    this.dir.updateMatrixWorld();
    this.dir.shadow.camera.updateProjectionMatrix();
  }

  private adaptPixelRatio(dt: number): void {
    if (this.dprWarmup > 0) {
      this.dprWarmup--;
      return;
    }
    if (dt > 0.019) {
      this.dprSlow++;
      this.dprFast = 0;
    } else if (dt < 0.012) {
      this.dprFast++;
      this.dprSlow = 0;
    } else {
      this.dprSlow = Math.max(0, this.dprSlow - 1);
      this.dprFast = Math.max(0, this.dprFast - 1);
    }
    let next = this.dpr;
    if (this.dprSlow > 28) {
      if (this.dpr > 1.02) next = 1;
      else if (this.dpr > 0.86) next = 0.85;
      this.dprSlow = 0;
    } else if (this.dprFast > 50) {
      if (this.dpr < 0.99) next = Math.min(this.dprCap, 1);
      else if (this.dpr < this.dprCap - 0.01) next = this.dprCap;
      this.dprFast = 0;
    }
    if (Math.abs(next - this.dpr) < 0.001) return;
    this.dpr = next;
    this.resize();
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

  private hideForProbe(): { track: THREE.Group | null; trackVisible: boolean } {
    this.wakes.group.visible = false;
    this.fx.particles.visible = false;
    this.contacts.group.visible = false;
    for (const card of this.volumeCards) card.visible = false;
    for (const m of this.waterMeshes) m.visible = false;
    const track = this.trackGroup;
    const trackVisible = track ? track.visible : true;
    if (track) track.visible = false;
    return { track, trackVisible };
  }

  private restoreAfterProbe(track: THREE.Group | null, trackVisible: boolean): void {
    for (const m of this.waterMeshes) m.visible = true;
    if (track) track.visible = trackVisible;
    this.wakes.group.visible = true;
    this.fx.particles.visible = true;
    this.contacts.group.visible = true;
    for (const card of this.volumeCards) card.visible = true;
  }

  private captureEnv(x: number, y: number, z: number): void {
    this.cubeCam.position.set(x, y, z);
    const hid = this.hideForProbe();
    this.cubeCam.update(this.renderer, this.scene);
    this.restoreAfterProbe(hid.track, hid.trackVisible);
    const env = this.cubeRT.texture;
    for (const mat of this.waterMats) {
      mat.uniforms.uEnv.value = env;
      mat.uniforms.uHasEnv.value = 1;
    }
  }

  private tintWorld(t: number, boosting = false, superOn = false): void {
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
    this.skyMat.uniforms.uSunDir.value.copy(this.sunDir);
    this.skyMat.uniforms.uHorizon.value.setHex(cavern ? 0x8aa0b0 : 0xe8b888);
    this.skyMat.uniforms.uZenith.value.setHex(cavern ? 0x243850 : 0x3a6a9a);
    for (const mat of this.waterMats) {
      if (mat.uniforms.uSunDir) mat.uniforms.uSunDir.value.copy(this.sunDir);
      if (mat.uniforms.uSky) mat.uniforms.uSky.value.setHex(cavern ? 0x8aa8b8 : 0xead2a8);
    }
    this.hazeFarMat.uniforms.uColor.value.setHex(cavern ? 0x4a6880 : 0xc49a72);
    this.hazeFarMat.uniforms.uOpacity.value = cavern ? 0.07 : 0.038 + warmth * 0.05;
    this.hazeLowMat.uniforms.uColor.value.setHex(cavern ? 0x2a5060 : 0x8ab0c4);
    this.hazeLowMat.uniforms.uOpacity.value = cavern ? 0.055 : 0.032 + warmth * 0.03;
    this.hazeBoostMat.uniforms.uColor.value.setHex(superOn ? 0xffe14a : 0x7af0ff);
    this.hazeBoostMat.uniforms.uOpacity.value = superOn ? 0.14 : boosting ? 0.09 : 0;
  }

  private shouldUpdatePlanar(dt: number, cam: CameraMode): boolean {
    if (this.quality === "low") return false;
    this.planarTick++;
    // After warmup, hitch-skip with DPR slow streak so reflections don't strobe on/off.
    if (this.dprWarmup <= 0 && (dt > 0.02 || this.dprSlow > 18)) return false;
    if (cam === "showcase") return this.planarTick % 8 === 1;
    if (this.quality === "high") return true;
    return this.planarTick % 2 === 1;
  }

  private sizePlanar(w: number, h: number): void {
    const long = this.planarLong;
    const aspect = w / Math.max(h, 1);
    const rw = aspect >= 1 ? long : Math.max(256, Math.round((long * aspect) / 2) * 2);
    const rh = aspect >= 1 ? Math.max(256, Math.round(long / aspect / 2) * 2) : long;
    if (this.planarRT.width !== rw || this.planarRT.height !== rh) this.planarRT.setSize(rw, rh);
  }

  private capturePlanar(waterY: number): void {
    const cam = this.camera.camera;
    cam.updateMatrixWorld();
    this.camWorld.setFromMatrixPosition(cam.matrixWorld);
    if (this.camWorld.y <= waterY + 0.08) {
      if (this.canalMat) this.canalMat.uniforms.uHasPlanar.value = 0;
      return;
    }

    this.planePoint.set(0, waterY, 0);
    this.reflNormal.set(0, 1, 0);

    this.reflView.subVectors(this.planePoint, this.camWorld);
    this.reflView.reflect(this.reflNormal).negate();
    this.reflView.add(this.planePoint);

    this.rotMat.extractRotation(cam.matrixWorld);
    this.reflLook.set(0, 0, -1).applyMatrix4(this.rotMat).add(this.camWorld);
    this.reflTarget.subVectors(this.planePoint, this.reflLook);
    this.reflTarget.reflect(this.reflNormal).negate();
    this.reflTarget.add(this.planePoint);

    this.planarCam.position.copy(this.reflView);
    this.planarCam.up.set(0, 1, 0).applyMatrix4(this.rotMat).reflect(this.reflNormal);
    this.planarCam.lookAt(this.reflTarget);
    this.planarCam.far = cam.far;
    this.planarCam.updateMatrixWorld();
    this.planarCam.projectionMatrix.copy(cam.projectionMatrix);

    this.reflectMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflectMatrix.multiply(this.planarCam.projectionMatrix);
    this.reflectMatrix.multiply(this.planarCam.matrixWorldInverse);

    this.clipPlane.setFromNormalAndCoplanarPoint(this.reflNormal, this.planePoint);
    this.clipPlane.applyMatrix4(this.planarCam.matrixWorldInverse);
    this.clipVec.set(this.clipPlane.normal.x, this.clipPlane.normal.y, this.clipPlane.normal.z, this.clipPlane.constant);
    const proj = this.planarCam.projectionMatrix;
    this.clipQ.x = (Math.sign(this.clipVec.x) + proj.elements[8]) / proj.elements[0];
    this.clipQ.y = (Math.sign(this.clipVec.y) + proj.elements[9]) / proj.elements[5];
    this.clipQ.z = -1;
    this.clipQ.w = (1 + proj.elements[10]) / proj.elements[14];
    const clipDot = this.clipVec.dot(this.clipQ);
    if (Math.abs(clipDot) < 1e-6) {
      if (this.canalMat) this.canalMat.uniforms.uHasPlanar.value = 0;
      return;
    }
    this.clipVec.multiplyScalar(2 / clipDot);
    proj.elements[2] = this.clipVec.x;
    proj.elements[6] = this.clipVec.y;
    proj.elements[10] = this.clipVec.z + 1 - 0.002;
    proj.elements[14] = this.clipVec.w;

    const hide = [this.wakes.group, this.fx.particles, this.contacts.group, ...this.volumeCards, ...this.waterMeshes];
    const prevVis = hide.map((o) => o.visible);
    const prevTarget = this.renderer.getRenderTarget();
    const prevTone = this.renderer.toneMapping;
    const prevShadowAuto = this.renderer.shadowMap.autoUpdate;
    const prevShadow = this.renderer.shadowMap.enabled;
    for (const o of hide) o.visible = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.enabled = false;
    try {
      this.renderer.setRenderTarget(this.planarRT);
      this.renderer.state.buffers.depth.setMask(true);
      this.renderer.render(this.scene, this.planarCam);
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.toneMapping = prevTone;
      this.renderer.shadowMap.autoUpdate = prevShadowAuto;
      this.renderer.shadowMap.enabled = prevShadow;
      hide.forEach((o, i) => {
        o.visible = prevVis[i];
      });
    }

    if (this.canalMat) {
      this.canalMat.uniforms.uPlanar.value = this.planarRT.texture;
      this.canalMat.uniforms.uHasPlanar.value = 1;
      this.canalMat.uniforms.uReflectMatrix.value.copy(this.reflectMatrix);
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.camera.resize(w, h);
    this.sizePlanar(w, h);
  }
}
