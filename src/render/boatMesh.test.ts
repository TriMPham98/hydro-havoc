import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeMeshesByMaterial } from "./BoatMesh";

function meshCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) n++;
  });
  return n;
}

describe("mergeMeshesByMaterial", () => {
  it("collapses shared-material primitives but keeps named sockets", () => {
    const root = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ name: "hull_Paint" });
    const chrome = new THREE.MeshStandardMaterial({ name: "hull_Chrome" });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.4), paint);
      m.position.set(i * 0.05, 0, 0);
      root.add(m);
    }
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), chrome);
      m.position.set(0, 0.2, i * 0.1);
      root.add(m);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), chrome);
    rail.name = "SprayRail_L";
    root.add(rail);
    const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 2), paint);
    sponson.name = "Sponson_L";
    root.add(sponson);
    const glow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), new THREE.MeshBasicMaterial());
    glow.name = "turbineGlow";
    root.add(glow);
    const dummy = new THREE.Object3D();
    dummy.name = "turbine";
    root.add(dummy);

    const before = meshCount(root);
    mergeMeshesByMaterial(root);
    expect(before).toBe(16);
    expect(meshCount(root)).toBe(5);
    expect(root.getObjectByName("turbine")).toBe(dummy);
    expect(root.getObjectByName("turbineGlow")).toBe(glow);
    expect(root.getObjectByName("SprayRail_L")).toBe(rail);
    expect(root.getObjectByName("Sponson_L")).toBe(sponson);
  });
});
