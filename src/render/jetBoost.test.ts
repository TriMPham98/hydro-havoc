import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { boatById } from "../data/boats";
import { JET_IGNITE } from "../sim/constants";
import { addProceduralJet, bindJet, getJetRig, updateJet } from "./JetBoost";

function step(root: THREE.Group, over: Partial<Parameters<typeof updateJet>[1]> = {}): void {
  updateJet(root, {
    boosting: false,
    superOn: false,
    ignite: 0,
    hasFuel: false,
    speed: 12,
    dt: 1 / 60,
    time: 1,
    ...over,
  });
}

function rigRoot(): { root: THREE.Group; sled: THREE.Object3D } {
  const def = boatById("skimmer");
  const root = new THREE.Group();
  const sled = new THREE.Object3D();
  sled.name = "JetSled_0";
  sled.position.set(0, 0.34, -2.7);
  sled.quaternion.identity();
  root.add(sled);
  const marker = new THREE.Object3D();
  marker.name = "JetSledOut_0";
  marker.position.set(0, 0.34, -2.92);
  marker.quaternion.identity();
  root.add(marker);
  const turbine = new THREE.Object3D();
  turbine.name = "turbine_0";
  sled.add(turbine);
  const fan = new THREE.Object3D();
  fan.name = "TurbineFan_0";
  sled.add(fan);
  const petal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.04));
  petal.name = "JetPetal_0_0";
  petal.quaternion.identity();
  sled.add(petal);
  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0 }),
  );
  glow.name = "turbineGlow";
  sled.add(glow);
  bindJet(root, def);
  return { root, sled };
}

describe("jet boost rig", () => {
  it("hinges the booster on pickup instead of snapping it out", () => {
    const { root, sled } = rigRoot();
    const restQ = sled.quaternion.clone();
    const restZ = sled.position.z;
    const rig = getJetRig(root)!;

    step(root, { ignite: JET_IGNITE, hasFuel: true });
    expect(rig.deploy).toBeLessThan(0.45);
    expect(root.getObjectByName("jetPlume_0")?.visible).toBe(false);

    for (let i = 0; i < 5; i++) step(root, { ignite: JET_IGNITE - i / 60, hasFuel: true, time: 1 + i / 60 });
    expect(sled.quaternion.angleTo(restQ)).toBeGreaterThan(0.2);

    for (let i = 0; i < 36; i++) step(root, { ignite: JET_IGNITE - 0.2, hasFuel: true, time: 2 + i / 60 });
    expect(rig.deploy).toBeGreaterThan(0.85);
    expect(sled.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(0.2);
    expect(sled.position.z).toBeLessThan(restZ - 0.08);
    expect(root.getObjectByName("jetPlume_0")?.visible).toBe(true);
  });

  it("does not slam deploy or fire the plume on the pickup frame", () => {
    const { root, sled } = rigRoot();
    const restQ = sled.quaternion.clone();
    const rig = getJetRig(root)!;
    step(root, { ignite: JET_IGNITE, hasFuel: true });
    expect(rig.deploy).toBeLessThan(0.4);
    expect(rig.power).toBeLessThan(0.8);
    expect(sled.quaternion.angleTo(restQ)).toBeLessThan(0.35);
    expect(root.getObjectByName("jetPlume_0")?.visible).toBe(false);
  });

  it("spins the fan, opens petals, and lights the plume on pickup ignite", () => {
    const def = boatById("skimmer");
    const root = new THREE.Group();
    const turbine = new THREE.Object3D();
    turbine.name = "turbine_0";
    root.add(turbine);
    const fan = new THREE.Object3D();
    fan.name = "TurbineFan_0";
    root.add(fan);
    const petal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.04));
    petal.name = "JetPetal_0_0";
    petal.quaternion.identity();
    root.add(petal);
    const glow = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.4, 6),
      new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0 }),
    );
    glow.name = "turbineGlow";
    root.add(glow);

    bindJet(root, def);
    expect(root.getObjectByName("jetPlume_0")).toBeTruthy();

    const restZ = petal.quaternion.z;
    step(root, { ignite: JET_IGNITE, hasFuel: true });
    for (let i = 0; i < 24; i++) step(root, { ignite: JET_IGNITE - i / 60, hasFuel: true, time: 1 + i / 60 });

    expect(fan.rotation.z).toBeGreaterThan(0.4);
    expect(petal.quaternion.z).not.toBeCloseTo(restZ, 3);
    expect(getJetRig(root)?.power ?? 0).toBeGreaterThan(0.6);
    const plume = root.getObjectByName("jetPlume_0") as THREE.Group;
    expect(plume.visible).toBe(true);
    const wash = root.getObjectByName("jetWashPlume_0") as THREE.Mesh;
    expect((wash.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0.4);
  });

  it("goes full afterburner while boosting and gold on super", () => {
    const def = boatById("ironwake");
    const root = new THREE.Group();
    addProceduralJet(root, def);
    const dummy = new THREE.Object3D();
    dummy.name = "turbine";
    dummy.position.set(0, 0.42, -def.hullLength * 0.46);
    root.add(dummy);
    const rig = bindJet(root, def);
    for (let i = 0; i < 28; i++) step(root, { boosting: true, superOn: true, hasFuel: true, speed: 50, time: i / 60 });
    expect(rig.petal).toBeGreaterThan(0.85);
    expect(rig.power).toBeGreaterThan(0.85);
    const wash = root.getObjectByName("jetWashPlume_0") as THREE.Mesh;
    const col = (wash.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color;
    expect(col.g).toBeGreaterThan(0.7);
    expect(col.r).toBeGreaterThan(col.b);
  });
});
