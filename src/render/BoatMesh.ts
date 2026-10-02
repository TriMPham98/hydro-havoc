import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bindBoostLights, STRIP_PREFIX } from "./BoostLights";
import { bindStackFlames } from "./StackFlames";
import type { BoatDef } from "../data/boats";
import { addProceduralJet, bindJet } from "./JetBoost";

function planform(len: number, width: number): THREE.Shape {
  const hw = width * 0.5;
  const hl = len * 0.5;
  const s = new THREE.Shape();
  s.moveTo(0, hl);
  s.quadraticCurveTo(hw * 0.28, hl * 0.82, hw * 0.72, hl * 0.22);
  s.quadraticCurveTo(hw, hl * 0.02, hw * 0.82, -hl * 0.55);
  s.lineTo(hw * 0.62, -hl);
  s.lineTo(-hw * 0.62, -hl);
  s.lineTo(-hw * 0.82, -hl * 0.55);
  s.quadraticCurveTo(-hw, hl * 0.02, -hw * 0.72, hl * 0.22);
  s.quadraticCurveTo(-hw * 0.28, hl * 0.82, 0, hl);
  return s;
}

function hullGeometry(def: BoatDef): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(planform(def.hullLength, def.hullWidth), {
    depth: 0.55,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.16,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.translate(0, 0.28, 0);
  geo.computeVertexNormals();
  return geo;
}

export function createProceduralBoatMesh(def: BoatDef): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: def.color,
    metalness: 0.42,
    roughness: 0.22,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: def.accent,
    emissive: def.accent,
    emissiveIntensity: 0.55,
    metalness: 0.38,
    roughness: 0.28,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
  });
  const cabinMat = new THREE.MeshPhysicalMaterial({
    color: def.cabin,
    metalness: 0.82,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd8e4ec,
    metalness: 1,
    roughness: 0.12,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
  });

  hullMat.userData.heats = true;
  const hull = new THREE.Mesh(hullGeometry(def), hullMat);
  hull.name = "hull";
  g.add(hull);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(def.hullWidth * 0.42, 0.08, def.hullLength * 0.55),
    accentMat,
  );
  deck.position.set(0, 0.58, -def.hullLength * 0.04);
  g.add(deck);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(def.hullWidth * 0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cabinMat);
  canopy.scale.set(1.15, 0.7, 1.45);
  canopy.position.set(0, 0.72, def.hullLength * 0.02);
  g.add(canopy);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(def.hullWidth * 0.38, 0.06, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x9ad4ee, metalness: 0.85, roughness: 0.08, transparent: true, opacity: 0.55 }),
  );
  windshield.position.set(0, 0.92, def.hullLength * 0.08);
  windshield.rotation.x = -0.35;
  g.add(windshield);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(def.hullWidth * 0.08, 0.04, def.hullLength * 0.72), accentMat);
  stripe.position.set(0, 0.62, -def.hullLength * 0.02);
  g.add(stripe);

  const gunwale = new THREE.Mesh(new THREE.BoxGeometry(def.hullWidth * 0.92, 0.05, def.hullLength * 0.88), chrome);
  gunwale.position.set(0, 0.52, 0);
  g.add(gunwale);
  const port = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2040 }),
  );
  port.position.set(-def.hullWidth * 0.38, 0.58, def.hullLength * 0.22);
  g.add(port);
  const starboard = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x20ff88 }),
  );
  starboard.position.set(def.hullWidth * 0.38, 0.58, def.hullLength * 0.22);
  g.add(starboard);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.9), accentMat);
  fin.position.set(0, 0.85, -def.hullLength * 0.28);
  g.add(fin);

  const transom = def.hullLength * 0.46;
  for (const x of [-def.hullWidth * 0.22, def.hullWidth * 0.22]) {
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), chrome);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(x, 0.42, -transom);
    g.add(motor);
  }

  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.9, 8),
    new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.0 }),
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, 0.42, -transom - 0.45);
  glow.name = "turbineGlow";
  g.add(glow);
  const dummy = new THREE.Object3D();
  dummy.name = "turbine";
  dummy.position.set(0, 0.42, -transom);
  g.add(dummy);
  addProceduralJet(g, def);

  if (def.id === "ironwake") {
    for (const x of [-def.hullWidth * 0.55, def.hullWidth * 0.55]) {
      const sponson = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, def.hullLength * 0.42, 4, 8), hullMat);
      sponson.name = x < 0 ? "Sponson_L" : "Sponson_R";
      sponson.rotation.x = Math.PI / 2;
      sponson.position.set(x, 0.22, -0.15);
      g.add(sponson);
    }
  }
  if (def.id === "vesper") {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 6), accentMat);
    spike.rotation.x = -Math.PI / 2;
    spike.position.set(0, 0.4, def.hullLength * 0.48);
    g.add(spike);
  }

  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  g.userData.procedural = true;
  g.userData.hullId = def.id;
  finishWetHull(g, def);
  bindJet(g, def);
  return g;
}

const loader = new GLTFLoader();
const templates = new Map<string, THREE.Group>();
const inflight = new Map<string, Promise<THREE.Group | null>>();

/** Blender export lives in public/boats — Vite serves that folder at `/boats/`. */
export const BOAT_GLB_URL: Record<BoatDef["id"], string> = {
  skimmer: "/boats/skimmer.glb",
  ironwake: "/boats/ironwake.glb",
  vesper: "/boats/vesper.glb",
};

const HIDDEN_HELPERS = new Set(["bowMarker", "sternMarker", "starboardMarker"]);
const HIDDEN_PREFIX = /^JetSledOut/;

const LOWER_HULL = new Set([
  "Sponson_L",
  "Sponson_R",
  "Afterplane",
  "SplashPlate",
  "TrimTab_L",
  "TrimTab_R",
  "RamPlate_L",
  "RamPlate_R",
  "TransomPlate",
  "SkidFin",
  "SkidFinRoot",
  "ShaftSkeg",
  "Rudder",
]);

const WET_SKIP = new Set(["turbineGlow", "waterline", "chineSprayL", "chineSprayR", "JetCore"]);

const ANIMATED_PREFIX = /^(JetPetal|TurbineFan|TurbineBlade|TurbineHub|TurbineSpinner|JetCore|turbineGlow|jetPlume|jetCore|jetWash|jetFlash|jetLight|PropBlade|PropHub|PropSpinner|JetDoor|JetSled)/;

const MERGE_KEEP = new Set<string>([
  "turbine",
  "turbineGlow",
  "SprayRail_L",
  "SprayRail_R",
  ...LOWER_HULL,
  ...WET_SKIP,
  ...HIDDEN_HELPERS,
]);

const WET_DARK = new THREE.Color(0x081018);

const HEAT_GLOW: Record<string, number> = { skimmer: 0x2ee6ff, ironwake: 0xffa020, vesper: 0xff2e74 };

type HullHeatSlot = {
  mat: THREE.MeshPhysicalMaterial;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  emissive: THREE.Color;
  emissiveIntensity: number;
  glow: THREE.Color;
};

const hullHeat = new WeakMap<THREE.Object3D, HullHeatSlot[]>();

function asPhysical(mat: THREE.Material): THREE.MeshPhysicalMaterial {
  if (mat instanceof THREE.MeshPhysicalMaterial) return mat.clone();
  if (mat instanceof THREE.MeshStandardMaterial) {
    const p = new THREE.MeshPhysicalMaterial({
      name: mat.name,
      color: mat.color,
      map: mat.map,
      metalness: mat.metalness,
      roughness: mat.roughness,
      emissive: mat.emissive,
      emissiveIntensity: mat.emissiveIntensity,
      envMap: mat.envMap,
      envMapIntensity: mat.envMapIntensity,
      transparent: mat.transparent,
      opacity: mat.opacity,
      side: mat.side,
    });
    p.userData = { ...mat.userData };
    p.clearcoat = 0.85;
    p.clearcoatRoughness = 0.12;
    return p;
  }
  return new THREE.MeshPhysicalMaterial({
    color: 0x1a2830,
    metalness: 0.3,
    roughness: 0.28,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
  });
}

function wetStripMaterial(color: number, roughness: number): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.28,
    roughness,
    clearcoat: 0.92,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return mat;
}

function stainPhysical(mat: THREE.Material, toward: number, roughMul: number): THREE.MeshPhysicalMaterial {
  if (mat instanceof THREE.MeshPhysicalMaterial && mat.userData.wetStain) return mat;
  const p = asPhysical(mat);
  p.color.lerp(WET_DARK, toward);
  p.roughness = Math.min(0.52, p.roughness * roughMul);
  p.clearcoat = Math.max(p.clearcoat, 0.9);
  p.clearcoatRoughness = Math.min(0.26, p.clearcoatRoughness + 0.05);
  p.userData.wetStain = true;
  return p;
}

function stainNamedMeshes(root: THREE.Group, names: string[], toward: number, roughMul: number): void {
  const stained = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
  for (const name of names) {
    const obj = root.getObjectByName(name);
    if (!(obj instanceof THREE.Mesh)) continue;
    const src = obj.material as THREE.Material;
    let dst = stained.get(src);
    if (!dst) {
      dst = stainPhysical(src, toward, roughMul);
      stained.set(src, dst);
    }
    obj.material = dst;
  }
}

function addChineSpray(root: THREE.Group, def: BoatDef): void {
  const railL = root.getObjectByName("SprayRail_L");
  const railR = root.getObjectByName("SprayRail_R");
  if (railL instanceof THREE.Mesh && railR instanceof THREE.Mesh) {
    stainNamedMeshes(root, ["SprayRail_L", "SprayRail_R"], 0.62, 0.85);
    return;
  }
  if (root.getObjectByName("chineSprayL")) return;
  const mat = wetStripMaterial(0x152028, 0.32);
  for (const [name, side] of [
    ["chineSprayL", -1],
    ["chineSprayR", 1],
  ] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, def.hullLength * 0.74), mat);
    strip.name = name;
    strip.position.set(side * def.hullWidth * 0.5, 0.22, -def.hullLength * 0.03);
    strip.castShadow = false;
    strip.receiveShadow = true;
    root.add(strip);
  }
}

function stainLowerHull(root: THREE.Group): void {
  const stained = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !LOWER_HULL.has(obj.name)) return;
    const src = obj.material as THREE.Material;
    let dst = stained.get(src);
    if (!dst) {
      dst = stainPhysical(src, 0.36, 0.8);
      stained.set(src, dst);
    }
    obj.material = dst;
  });
}

function shouldHeat(mat: THREE.MeshPhysicalMaterial): boolean {
  if (mat.userData.heats || mat.userData.wetStain) return true;
  return /_(Paint|Chrome|Gunmetal|Accent)$/i.test(mat.name);
}

function bindHullHeat(root: THREE.Group, def: BoatDef): void {
  const remap = new Map<THREE.Material, THREE.Material>();
  const slots: HullHeatSlot[] = [];
  // Boost heat glows in the hull's jet colour, never washing a pale accent over the paint.
  const glow = new THREE.Color(HEAT_GLOW[def.id] ?? def.accent);
  const apply = (obj: THREE.Mesh, mat: THREE.Material): THREE.Material => {
    const hit = remap.get(mat);
    if (hit) return hit;
    if (
      WET_SKIP.has(obj.name) ||
      mat.transparent ||
      /Glass|Glow|NavPort|NavStbd|HeatTint/i.test(mat.name) ||
      ANIMATED_PREFIX.test(obj.name)
    ) {
      remap.set(mat, mat);
      return mat;
    }
    if (!(mat instanceof THREE.MeshPhysicalMaterial) && !(mat instanceof THREE.MeshStandardMaterial)) {
      remap.set(mat, mat);
      return mat;
    }
    const phys = mat instanceof THREE.MeshPhysicalMaterial ? mat.clone() : asPhysical(mat);
    if (phys.transmission > 0.08) {
      remap.set(mat, mat);
      return mat;
    }
    remap.set(mat, phys);
    if (shouldHeat(phys)) {
      slots.push({
        mat: phys,
        roughness: phys.roughness,
        clearcoat: phys.clearcoat,
        clearcoatRoughness: phys.clearcoatRoughness,
        emissive: phys.emissive.clone(),
        emissiveIntensity: phys.emissiveIntensity,
        glow: glow.clone(),
      });
    }
    return phys;
  };
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (Array.isArray(obj.material)) obj.material = obj.material.map((m) => apply(obj, m));
    else obj.material = apply(obj, obj.material);
  });
  hullHeat.set(root, slots);
}

function finishWetHull(root: THREE.Group, def: BoatDef): void {
  addChineSpray(root, def);
  stainLowerHull(root);
  bindHullHeat(root, def);
}

export function applyHullHeat(root: THREE.Object3D, heat: number): void {
  const slots = hullHeat.get(root);
  if (!slots) return;
  const t = heat < 0 ? 0 : heat > 1 ? 1 : heat;
  for (const s of slots) {
    s.mat.roughness = s.roughness * (1 - 0.42 * t);
    s.mat.clearcoat = s.clearcoat + (1 - s.clearcoat) * 0.55 * t;
    s.mat.clearcoatRoughness = s.clearcoatRoughness * (1 - 0.5 * t);
    s.mat.emissive.lerpColors(s.emissive, s.glow, 0.2 * t);
    s.mat.emissiveIntensity = s.emissiveIntensity + 0.22 * t;
  }
}

function geometriesForMerge(meshes: THREE.Mesh[], rootInv: THREE.Matrix4): THREE.BufferGeometry[] | null {
  const rel = new THREE.Matrix4();
  const baked: THREE.BufferGeometry[] = [];
  for (const mesh of meshes) {
    const geo = mesh.geometry.clone();
    rel.multiplyMatrices(rootInv, mesh.matrixWorld);
    geo.applyMatrix4(rel);
    geo.morphAttributes = {};
    baked.push(geo);
  }
  const names = new Set(Object.keys(baked[0].attributes));
  for (const g of baked) {
    for (const name of [...names]) {
      if (!g.hasAttribute(name)) names.delete(name);
    }
  }
  if (!names.has("position")) {
    for (const g of baked) g.dispose();
    return null;
  }
  const anyIndexed = baked.some((g) => g.index !== null);
  const allIndexed = baked.every((g) => g.index !== null);
  const out: THREE.BufferGeometry[] = [];
  for (const g of baked) {
    for (const name of Object.keys(g.attributes)) {
      if (!names.has(name)) g.deleteAttribute(name);
    }
    if (anyIndexed && !allIndexed && g.index) {
      const ni = g.toNonIndexed();
      g.dispose();
      out.push(ni);
    } else {
      out.push(g);
    }
  }
  return out;
}

function underAnimatedParent(obj: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = obj.parent;
  while (p) {
    if (/^JetSled(?:_\d+)?$/.test(p.name) || p.name === "propeller" || /^TurbineFan/.test(p.name)) return true;
    p = p.parent;
  }
  return false;
}

export function mergeMeshesByMaterial(root: THREE.Object3D): void {
  if (root.userData.mergedByMaterial) return;
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh) return;
    if (
      MERGE_KEEP.has(obj.name) ||
      ANIMATED_PREFIX.test(obj.name) ||
      STRIP_PREFIX.test(obj.name) ||
      underAnimatedParent(obj) ||
      Array.isArray(obj.material) ||
      !obj.geometry
    )
      return;
    const material = obj.material as THREE.Material;
    let bucket = buckets.get(material.uuid);
    if (!bucket) {
      bucket = { material, meshes: [] };
      buckets.set(material.uuid, bucket);
    }
    bucket.meshes.push(obj);
  });
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    const prepared = geometriesForMerge(bucket.meshes, rootInv);
    if (!prepared) continue;
    const merged = mergeGeometries(prepared, false) as THREE.BufferGeometry | null;
    for (const g of prepared) g.dispose();
    if (!merged) continue;
    const out = new THREE.Mesh(merged, bucket.material);
    out.name = bucket.material.name ? `${bucket.material.name}_merged` : "merged";
    out.castShadow = true;
    out.receiveShadow = true;
    root.add(out);
    const drop = new Set(bucket.meshes);
    const stillUsed = new Set<THREE.BufferGeometry>();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !drop.has(obj) && obj.geometry) stillUsed.add(obj.geometry);
    });
    for (const mesh of bucket.meshes) {
      if (!stillUsed.has(mesh.geometry)) mesh.geometry.dispose();
      mesh.removeFromParent();
    }
  }
  root.userData.mergedByMaterial = true;
}

const RIG_CONTAINER = /^(JetSled(?:_\d+)?|TurbineFan.*|propeller)$/;
/** Parts the jet rig animates one by one — these keep their own nodes. */
const RIG_SOLO = /^(JetPetal|JetDoor|JetCore|turbineGlow|jetPlume|jetCore|jetWash|jetFlash|jetLight|TurbineFan|JetSled)/;

/**
 * Merge static parts that ride an animated container (turbine blades on a fan, rack
 * hardware on a sled) into one mesh per material in the container's local space.
 * The rig still moves the container, so animation is untouched; draw calls drop a lot.
 */
export function mergeWithinRig(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const containers: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (RIG_CONTAINER.test(o.name)) containers.push(o);
  });
  for (const box of containers) {
    const inv = new THREE.Matrix4().copy(box.matrixWorld).invert();
    const buckets = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
    const visit = (o: THREE.Object3D) => {
      for (const child of o.children) {
        if (RIG_CONTAINER.test(child.name) || RIG_SOLO.test(child.name) || STRIP_PREFIX.test(child.name)) continue;
        if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && !Array.isArray(child.material) && child.geometry) {
          const m = child.material as THREE.Material;
          let b = buckets.get(m.uuid);
          if (!b) buckets.set(m.uuid, (b = { material: m, meshes: [] }));
          b.meshes.push(child);
        }
        visit(child);
      }
    };
    visit(box);
    for (const bucket of buckets.values()) {
      if (bucket.meshes.length < 2) continue;
      // Only leaf meshes: anything with children would orphan them.
      const leaves = bucket.meshes.filter((m) => m.children.length === 0);
      if (leaves.length < 2) continue;
      const prepared = geometriesForMerge(leaves, inv);
      if (!prepared) continue;
      const merged = mergeGeometries(prepared, false) as THREE.BufferGeometry | null;
      for (const g of prepared) g.dispose();
      if (!merged) continue;
      const out = new THREE.Mesh(merged, bucket.material);
      out.name = `${bucket.material.name || "rig"}_rigMerged`;
      out.castShadow = true;
      out.receiveShadow = true;
      box.add(out);
      for (const mesh of leaves) mesh.removeFromParent();
    }
  }
}

function wireLoadedBoat(root: THREE.Group, def: BoatDef): void {
  root.traverse((obj) => {
    if (HIDDEN_HELPERS.has(obj.name) || HIDDEN_PREFIX.test(obj.name)) obj.visible = false;
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  let glow = root.getObjectByName("turbineGlow") as THREE.Mesh | undefined;
  if (glow) {
    glow.material = new THREE.MeshBasicMaterial({
      color: def.accent,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  } else {
    glow = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0, 0.42, -def.hullLength * 0.46 - 0.45);
    glow.name = "turbineGlow";
    root.add(glow);
  }
  if (!root.getObjectByName("turbine")) {
    const dummy = new THREE.Object3D();
    dummy.name = "turbine";
    dummy.position.set(0, 0.42, -def.hullLength * 0.46);
    root.add(dummy);
  }
  root.userData.procedural = false;
  root.userData.hullId = def.id;
  finishWetHull(root, def);
}

function loadBoatTemplate(def: BoatDef): Promise<THREE.Group | null> {
  const hit = templates.get(def.id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(def.id);
  if (pending) return pending;
  const job = loader
    .loadAsync(BOAT_GLB_URL[def.id])
    .then((gltf) => {
      const scene = gltf.scene;
      scene.name = def.id;
      mergeMeshesByMaterial(scene);
      mergeWithinRig(scene);
      wireLoadedBoat(scene, def);
      templates.set(def.id, scene);
      inflight.delete(def.id);
      return scene;
    })
    .catch((err: unknown) => {
      console.warn(`Boat GLB missing for ${def.id}, using procedural hull`, err);
      inflight.delete(def.id);
      return null;
    });
  inflight.set(def.id, job);
  return job;
}

export function getBoatTemplate(id: string): THREE.Group | undefined {
  return templates.get(id);
}

export async function preloadBoatMeshes(defs: BoatDef[]): Promise<void> {
  await Promise.all(defs.map((d) => loadBoatTemplate(d)));
}

const NATIVE_HULL: Record<BoatDef["id"], { length: number; width: number }> = {
  skimmer: { length: 5.4, width: 2.3 },
  ironwake: { length: 6.2, width: 2.6 },
  vesper: { length: 7.1, width: 2.05 },
};

export function createBoatMesh(def: BoatDef): THREE.Group {
  const tmpl = templates.get(def.id);
  const native = NATIVE_HULL[def.id];
  const visual = (def.hullLength / native.length + def.hullWidth / native.width) * 0.5;
  if (tmpl) {
    const clone = tmpl.clone(true);
    wireLoadedBoat(clone, { ...def, hullLength: native.length, hullWidth: native.width });
    clone.scale.setScalar(visual);
    clone.userData.hullId = def.id;
    bindJet(clone, def);
    bindBoostLights(clone, HEAT_GLOW[def.id] ?? def.accent);
    bindStackFlames(clone);
    return clone;
  }
  void loadBoatTemplate(def);
  return createProceduralBoatMesh(def);
}
