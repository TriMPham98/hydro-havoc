import * as THREE from "three";
import type { BoatDef } from "../data/boats";
import { JET_IGNITE } from "../sim/constants";

export type JetState = {
  boosting: boolean;
  superOn: boolean;
  ignite: number;
  hasFuel: boolean;
  speed: number;
  dt: number;
  time: number;
};

type Petal = { obj: THREE.Object3D; rest: THREE.Quaternion };
type Door = { obj: THREE.Object3D; rest: THREE.Quaternion; sign: number };
type Sled = {
  obj: THREE.Object3D;
  rest: THREE.Vector3;
  out: THREE.Vector3;
  restQ: THREE.Quaternion;
  outQ: THREE.Quaternion;
};
type Plume = {
  group: THREE.Group;
  core: THREE.Mesh;
  wash: THREE.Mesh;
  flash: THREE.Mesh;
  light: THREE.PointLight;
};

export type JetRig = {
  fans: THREE.Object3D[];
  petals: Petal[];
  doors: Door[];
  sleds: Sled[];
  cores: THREE.Mesh[];
  glows: THREE.Mesh[];
  plumes: Plume[];
  prop: THREE.Object3D | undefined;
  petal: number;
  power: number;
  deploy: number;
  spin: number;
  spinRate: number;
  prevIgnite: number;
};

const jetRigs = new WeakMap<THREE.Object3D, JetRig>();

const CYAN = new THREE.Color(0x7af0ff);
const WHITE = new THREE.Color(0xf5fdff);
const GOLD = new THREE.Color(0xffe14a);
const GOLD_WHITE = new THREE.Color(0xfff4c8);
const OPEN = new THREE.Quaternion();
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const DEPLOY_POS = new THREE.Vector3();
const DEPLOY_Q = new THREE.Quaternion();
const YAW_Q = new THREE.Quaternion();

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function stowFold(id: string): number {
  if (id === "ironwake") return 0.96;
  if (id === "vesper") return 0.907;
  return 1.012;
}

function jetConeMaterial(core: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: CYAN.clone() },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uCore: { value: core },
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
      uniform float uTime;
      uniform float uCore;
      varying vec2 vUv;
      void main() {
        float along = vUv.y;
        float across = abs(vUv.x * 2.0 - 1.0);
        float radial = 1.0 - across;
        float body = pow(max(radial, 0.0), mix(1.05, 2.6, along)) * pow(1.0 - along, 0.42);
        float flicker = 0.78 + 0.22 * sin(uTime * 47.0 + along * 18.0) * sin(uTime * 31.0);
        float a = body * uOpacity * flicker;
        if (a < 0.018) discard;
        vec3 col = mix(uColor, vec3(1.0), uCore * (1.0 - along) * radial);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

function flashMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: WHITE.clone() },
      uOpacity: { value: 0 },
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
        float a = pow(1.0 - clamp(r, 0.0, 1.0), 1.65) * uOpacity;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function jetSockets(root: THREE.Object3D): THREE.Object3D[] {
  const numbered: THREE.Object3D[] = [];
  let primary: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (obj.name === "turbine") primary = obj;
    else if (/^turbine_\d+$/.test(obj.name)) numbered.push(obj);
  });
  numbered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (numbered.length) return numbered;
  return primary ? [primary] : [];
}

function makePlume(index: number, radius: number, accent: number): Plume {
  const group = new THREE.Group();
  group.name = `jetPlume_${index}`;
  const coreGeo = new THREE.ConeGeometry(radius * 0.55, 3.4, 10, 1, true);
  const washGeo = new THREE.ConeGeometry(radius * 1.35, 2.35, 10, 1, true);
  const core = new THREE.Mesh(coreGeo, jetConeMaterial(0.85));
  const wash = new THREE.Mesh(washGeo, jetConeMaterial(0.22));
  core.name = `jetCorePlume_${index}`;
  wash.name = `jetWashPlume_${index}`;
  core.rotation.x = -Math.PI / 2;
  wash.rotation.x = -Math.PI / 2;
  core.position.z = -1.7;
  wash.position.z = -1.15;
  core.frustumCulled = false;
  wash.frustumCulled = false;
  core.renderOrder = 4;
  wash.renderOrder = 3;
  const flash = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.15, 14), flashMaterial());
  flash.name = `jetFlash_${index}`;
  flash.frustumCulled = false;
  flash.renderOrder = 5;
  const light = new THREE.PointLight(accent, 0, 9, 2);
  light.name = `jetLight_${index}`;
  group.add(core, wash, flash, light);
  group.visible = false;
  return { group, core, wash, flash, light };
}

function collectNamed(root: THREE.Object3D, re: RegExp): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (re.test(obj.name)) out.push(obj);
  });
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
}

export function getJetRig(root: THREE.Object3D): JetRig | undefined {
  return jetRigs.get(root);
}

export function bindJet(root: THREE.Group, def: BoatDef): JetRig {
  const hit = jetRigs.get(root);
  if (hit) return hit;

  let sockets = jetSockets(root);
  if (!sockets.length) {
    const dummy = new THREE.Object3D();
    dummy.name = "turbine";
    dummy.position.set(0, 0.42, -def.hullLength * 0.46);
    root.add(dummy);
    sockets = [dummy];
  }

  const radius = def.id === "ironwake" ? 0.16 : def.id === "vesper" ? 0.055 : 0.075;
  const plumes: Plume[] = [];
  sockets.forEach((socket, i) => {
    let group = socket.getObjectByName(`jetPlume_${i}`) as THREE.Group | undefined;
    let plume: Plume;
    if (group) {
      const core = group.getObjectByName(`jetCorePlume_${i}`) as THREE.Mesh;
      const wash = group.getObjectByName(`jetWashPlume_${i}`) as THREE.Mesh;
      const flash = group.getObjectByName(`jetFlash_${i}`) as THREE.Mesh;
      const light = group.getObjectByName(`jetLight_${i}`) as THREE.PointLight;
      if (core && wash && flash && light) {
        core.material = jetConeMaterial(0.85);
        wash.material = jetConeMaterial(0.22);
        flash.material = flashMaterial();
        plume = { group, core, wash, flash, light };
      } else {
        group.removeFromParent();
        plume = makePlume(i, radius, def.accent);
        socket.add(plume.group);
      }
    } else {
      plume = makePlume(i, radius, def.accent);
      socket.add(plume.group);
    }
    plumes.push(plume);
  });

  const petals: Petal[] = [];
  for (const obj of collectNamed(root, /^JetPetal/)) {
    const rest = obj.quaternion.clone();
    obj.userData.petalRest = rest;
    petals.push({ obj, rest });
  }

  const doors: Door[] = [];
  for (const obj of collectNamed(root, /^JetDoor/)) {
    const rest = obj.quaternion.clone();
    const m = obj.name.match(/_(\d+)$/);
    const sign = m && parseInt(m[1], 10) % 2 === 1 ? -1 : 1;
    doors.push({ obj, rest, sign });
  }

  const lock = def.id === "ironwake" ? 0.26 : def.id === "vesper" ? 0.2 : 0.22;
  const sleds: Sled[] = [];
  for (const obj of collectNamed(root, /^JetSled(?:_\d+)?$/)) {
    const rest = obj.position.clone();
    const restQ = obj.quaternion.clone();
    const marker = root.getObjectByName(obj.name.replace("JetSled", "JetSledOut"));
    const out = marker ? marker.position.clone() : rest.clone();
    const outQ = marker ? marker.quaternion.clone() : restQ.clone();
    if (restQ.angleTo(outQ) < 0.2) {
      restQ.setFromAxisAngle(AXIS_X, stowFold(def.id));
      if (def.id === "vesper") {
        YAW_Q.setFromAxisAngle(AXIS_Y, obj.position.x >= 0 ? -0.244 : 0.244);
        restQ.multiply(YAW_Q);
      }
    }
    if (out.distanceTo(rest) < 0.08) {
      const dir = out.distanceTo(rest) > 1e-4 ? out.clone().sub(rest).normalize() : new THREE.Vector3(0, 0, -1);
      out.copy(rest).addScaledVector(dir, lock);
    }
    obj.position.copy(rest);
    obj.quaternion.copy(restQ);
    sleds.push({ obj, rest, out, restQ, outQ });
  }

  const cores: THREE.Mesh[] = [];
  for (const obj of collectNamed(root, /^JetCore/)) {
    if (!(obj instanceof THREE.Mesh)) continue;
    obj.material = (obj.material as THREE.Material).clone();
    cores.push(obj);
  }

  const glows: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && /^turbineGlow/.test(obj.name)) glows.push(obj);
  });

  const fans = collectNamed(root, /^TurbineFan/);
  const prop = root.getObjectByName("propeller") ?? undefined;

  const rig: JetRig = {
    fans,
    petals,
    doors,
    sleds,
    cores,
    glows,
    plumes,
    prop,
    petal: 0,
    power: 0,
    deploy: 0,
    spin: 0,
    spinRate: 2,
    prevIgnite: 0,
  };
  jetRigs.set(root, rig);
  return rig;
}

function igniteCurve(remaining: number): number {
  if (remaining <= 0) return 0;
  const elapsed = JET_IGNITE - Math.min(remaining, JET_IGNITE);
  if (elapsed < 0.16) return 1.35;
  const t = (elapsed - 0.16) / Math.max(0.001, JET_IGNITE - 0.16);
  return 0.22 + 1.13 * (1 - t);
}

export function updateJet(root: THREE.Object3D, state: JetState): void {
  const rig = jetRigs.get(root);
  if (!rig) return;

  const pickupSlam = state.ignite > rig.prevIgnite + 0.02;
  rig.prevIgnite = state.ignite;

  let targetPetal = 0;
  let targetPower = 0;
  let targetDeploy = 0;
  let spinTarget = 3.5;
  if (state.boosting) {
    targetPetal = 1;
    targetPower = state.superOn ? 1 : 0.84;
    targetDeploy = 1;
    spinTarget = 34;
  } else if (state.ignite > 0) {
    const flash = igniteCurve(state.ignite);
    targetPetal = Math.min(1, 0.45 + flash * 0.55);
    targetPower = flash;
    targetDeploy = 1;
    spinTarget = 22 + flash * 14;
  } else if (state.hasFuel) {
    targetPetal = 0.32;
    targetPower = 0.18;
    targetDeploy = 1;
    spinTarget = 12;
  } else {
    spinTarget = 2.2 + Math.min(6, state.speed * 0.12);
  }

  if (pickupSlam) {
    rig.deploy = Math.max(rig.deploy, 0.1);
    rig.spinRate = Math.max(rig.spinRate, 12);
  }
  const kOut = 1 - Math.exp(-10 * state.dt);
  const kIn = 1 - Math.exp(-5.5 * state.dt);
  const kPower = 1 - Math.exp(-18 * state.dt);
  const kPetal = 1 - Math.exp(-(state.boosting || state.ignite > 0 ? 18 : 10) * state.dt);
  rig.petal += (targetPetal - rig.petal) * kPetal;
  rig.power += (targetPower - rig.power) * kPower;
  const kDeploy = targetDeploy >= rig.deploy ? kOut : kIn;
  rig.deploy += (targetDeploy - rig.deploy) * kDeploy;
  rig.spinRate += (spinTarget - rig.spinRate) * (1 - Math.exp(-10 * state.dt));
  rig.spin += rig.spinRate * state.dt;
  const open = rig.petal * 0.48;
  const deployT = Math.min(1, rig.deploy);
  const doorT = Math.min(1, deployT / 0.28);
  const hingeT = smootherstep((deployT - 0.06) / 0.86);
  const fireGate = smootherstep((hingeT - 0.45) / 0.4);

  for (const fan of rig.fans) fan.rotation.z = rig.spin;
  if (rig.prop) rig.prop.rotation.z += (state.speed * 2.2 + (state.boosting ? 9 : 0)) * state.dt;

  for (const petal of rig.petals) {
    OPEN.setFromAxisAngle(AXIS_Z, open);
    petal.obj.quaternion.copy(petal.rest).multiply(OPEN);
  }

  for (const door of rig.doors) {
    OPEN.setFromAxisAngle(AXIS_X, doorT * 1.35 * door.sign);
    door.obj.quaternion.copy(door.rest).multiply(OPEN);
  }

  for (const sled of rig.sleds) {
    DEPLOY_POS.lerpVectors(sled.rest, sled.out, hingeT);
    sled.obj.position.copy(DEPLOY_POS);
    DEPLOY_Q.copy(sled.restQ).slerp(sled.outQ, hingeT);
    sled.obj.quaternion.copy(DEPLOY_Q);
  }

  const hot = rig.power > 0.04 && fireGate > 0.04;
  const superCol = state.superOn && (state.boosting || state.ignite > 0.15);
  const plumeCol = superCol ? GOLD : CYAN;
  const coreCol = superCol ? GOLD_WHITE : WHITE;
  const coreEmissive = 1.2 + rig.power * 6.5;

  for (const core of rig.cores) {
    const mat = core.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
    if ("emissiveIntensity" in mat) {
      mat.emissiveIntensity = coreEmissive;
      if ("emissive" in mat) mat.emissive.copy(coreCol);
    }
    if ("opacity" in mat) {
      mat.transparent = true;
      mat.opacity = hot ? 0.35 + rig.power * 0.55 : 0.08;
    }
  }

  for (const glow of rig.glows) {
    const gm = glow.material as THREE.MeshBasicMaterial;
    gm.opacity = hot ? (superCol ? 0.42 : 0.28) * Math.min(1, rig.power) : 0;
    gm.color.copy(superCol ? GOLD : CYAN);
    const s = hot ? 0.45 + rig.power * 0.85 : 0.18;
    glow.scale.set(s * 0.7, s * 1.15, s * 0.7);
  }

  for (const plume of rig.plumes) {
    plume.group.visible = hot;
    const coreMat = plume.core.material as THREE.ShaderMaterial;
    const washMat = plume.wash.material as THREE.ShaderMaterial;
    const flashMat = plume.flash.material as THREE.ShaderMaterial;
    coreMat.uniforms.uTime.value = state.time;
    washMat.uniforms.uTime.value = state.time;
    coreMat.uniforms.uColor.value.copy(coreCol);
    washMat.uniforms.uColor.value.copy(plumeCol);
    flashMat.uniforms.uColor.value.copy(coreCol);
    coreMat.uniforms.uOpacity.value = rig.power * 0.95;
    washMat.uniforms.uOpacity.value = rig.power * 0.72;
    flashMat.uniforms.uOpacity.value = rig.power * 0.8;
    const len = 0.35 + rig.power * 1.15;
    const fat = 0.4 + rig.power * 0.95;
    plume.core.scale.set(fat * 0.72, len * 1.15, fat * 0.72);
    plume.wash.scale.set(fat * 1.25, len * 0.85, fat * 1.25);
    const flashS = 0.45 + rig.power * 1.4;
    plume.flash.scale.setScalar(flashS);
    plume.light.color.copy(plumeCol);
    plume.light.intensity = rig.power * (superCol ? 4.2 : 2.8);
  }
}

export function addProceduralJet(root: THREE.Group, def: BoatDef): void {
  if (root.getObjectByName("TurbineFan") || root.getObjectByName("TurbineFan_0")) return;
  const transom = def.hullLength * 0.46;
  const dual = def.id !== "ironwake";
  const xs = dual ? (def.id === "vesper" ? [-0.16, 0.16] : [-0.28, 0.28]) : [0];
  const r = def.id === "ironwake" ? 0.15 : def.id === "vesper" ? 0.05 : 0.07;
  const z = def.id === "ironwake" ? 0.48 : 0.34;
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd8e4ec,
    metalness: 1,
    roughness: 0.14,
    clearcoat: 0.5,
  });
  const heat = new THREE.MeshPhysicalMaterial({
    color: 0x4a2210,
    metalness: 1,
    roughness: 0.22,
  });
  const gun = new THREE.MeshPhysicalMaterial({
    color: 0x1a1d22,
    metalness: 0.9,
    roughness: 0.24,
  });
  xs.forEach((x, i) => {
    const suf = dual ? `_${i}` : "";
    const sled = new THREE.Object3D();
    sled.name = `JetSled${suf}`;
    sled.position.set(x, z, -transom);
    sled.quaternion.setFromAxisAngle(AXIS_X, stowFold(def.id));
    if (def.id === "vesper") {
      sled.rotateY(x >= 0 ? -0.244 : 0.244);
    }
    root.add(sled);
    const marker = new THREE.Object3D();
    marker.name = `JetSledOut${suf}`;
    marker.position.set(x, z, -transom - (def.id === "ironwake" ? 0.26 : 0.22));
    marker.quaternion.identity();
    root.add(marker);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 1.1, 0.55, 12), gun);
    housing.name = `JetHousing${suf}`;
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, 0, -0.12);
    sled.add(housing);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 0.9, 0.14, 12), heat);
    bell.name = `JetBell${suf}`;
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, 0, -0.34);
    sled.add(bell);
    const fan = new THREE.Object3D();
    fan.name = `TurbineFan${suf}`;
    fan.position.set(0, 0, -0.22);
    sled.add(fan);
    for (let b = 0; b < 5; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, 0.01, r * 0.28), chrome);
      const ang = (b / 5) * Math.PI * 2;
      blade.position.set(Math.cos(ang) * r * 0.35, Math.sin(ang) * r * 0.35, 0);
      blade.rotation.z = ang;
      blade.name = `TurbineBlade${suf}_${b}`;
      fan.add(blade);
    }
    const nPetals = dual ? 6 : 8;
    for (let p = 0; p < nPetals; p++) {
      const ang = (p / nPetals) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.BoxGeometry(0.016, r * 0.4, 0.09), chrome);
      petal.name = `JetPetal${suf}_${p}`;
      petal.position.set(Math.cos(ang) * r * 1.05, Math.sin(ang) * r * 1.05, -0.38);
      petal.rotation.z = ang;
      sled.add(petal);
    }
    if (dual) {
      const sock = new THREE.Object3D();
      sock.name = `turbine_${i}`;
      sock.position.set(0, 0, -0.36);
      sled.add(sock);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 1.6, 0.02), gun);
    door.name = `JetDoor${suf}_0`;
    door.position.set(x, z + r * 0.2, -transom - 0.02);
    root.add(door);
  });
}
