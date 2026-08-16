import * as THREE from "three";
import type { BoatDef } from "../data/boats";

export function createBoatMesh(def: BoatDef): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: 0.35,
    roughness: 0.38,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: def.accent,
    emissive: def.accent,
    emissiveIntensity: 0.35,
    metalness: 0.2,
    roughness: 0.45,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: def.cabin,
    metalness: 0.6,
    roughness: 0.2,
  });

  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(def.hullWidth, 0.85, def.hullLength),
    hullMat,
  );
  hull.position.y = 0.35;
  g.add(hull);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(def.hullWidth * 0.48, 1.8, 6), hullMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.38, def.hullLength * 0.5);
  g.add(nose);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.hullWidth * 0.55, 0.7, def.hullLength * 0.28), cabinMat);
  cabin.position.set(0, 0.95, -def.hullLength * 0.05);
  g.add(cabin);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(def.hullWidth * 1.02, 0.08, def.hullLength * 0.7), accentMat);
  stripe.position.y = 0.62;
  g.add(stripe);

  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.1, 8), accentMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0.55, -def.hullLength * 0.48);
  g.add(engine);

  for (const x of [-def.hullWidth * 0.38, def.hullWidth * 0.38]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 1.2), cabinMat);
    intake.position.set(x, 0.55, def.hullLength * 0.12);
    g.add(intake);
  }

  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return g;
}
