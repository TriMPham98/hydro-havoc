import * as THREE from "three";
import type { BoatDef } from "../data/boats";

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

export function createBoatMesh(def: BoatDef): THREE.Group {
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

  const hull = new THREE.Mesh(hullGeometry(def), hullMat);
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

  if (def.id === "ironwake") {
    for (const x of [-def.hullWidth * 0.55, def.hullWidth * 0.55]) {
      const sponson = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, def.hullLength * 0.42, 4, 8), hullMat);
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
  return g;
}
