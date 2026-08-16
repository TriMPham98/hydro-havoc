import * as THREE from "three";
import type { TrackWorld } from "../sim/Track";
import type { ArcSpline } from "../sim/spline";
import { createWaterMaterial } from "./WaterMaterial";

function ribbonGeometry(spline: ArcSpline, closed: boolean, yLift = 0): THREE.BufferGeometry {
  const segs = Math.max(24, Math.floor(spline.totalLength / 3.2));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const y = f.y + yLift;
    positions.push(f.x - f.rx * hw, y, f.z - f.rz * hw);
    positions.push(f.x + f.rx * hw, y, f.z + f.rz * hw);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, t * spline.totalLength * 0.08, 1, t * spline.totalLength * 0.08);
    if (i < segs) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function wallGeometry(spline: ArcSpline, closed: boolean, side: number): THREE.BufferGeometry {
  const segs = Math.max(24, Math.floor(spline.totalLength / 3.2));
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const x = f.x + f.rx * hw * side;
    const z = f.z + f.rz * hw * side;
    positions.push(x, f.y - 1.2, z, x, f.y + f.bankHeight, z);
    if (i < segs) {
      const a = i * 2;
      if (side > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createTrackGroup(track: TrackWorld): {
  group: THREE.Group;
  waterMat: THREE.ShaderMaterial;
} {
  const group = new THREE.Group();
  const waterMat = createWaterMaterial();
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x6b7680,
    roughness: 0.78,
    metalness: 0.16,
  });
  const lipMat = new THREE.MeshStandardMaterial({
    color: 0xff8a2a,
    emissive: 0xff6a10,
    emissiveIntensity: 0.55,
    roughness: 0.45,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x3ad4e8,
    emissive: 0x1aa8bc,
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });

  const addRibbon = (spline: ArcSpline, closed: boolean, accent: THREE.Material) => {
    const water = new THREE.Mesh(ribbonGeometry(spline, closed, 0.02), waterMat);
    water.renderOrder = 1;
    group.add(water);
    group.add(new THREE.Mesh(wallGeometry(spline, closed, 1), wallMat));
    group.add(new THREE.Mesh(wallGeometry(spline, closed, -1), wallMat));
    const segs = Math.floor(spline.totalLength / 7);
    for (let i = 0; i < segs; i++) {
      const f = spline.getFrameAtT(i / segs);
      for (const side of [-1, 1]) {
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 6.4), accent);
        lip.position.set(f.x + f.rx * (f.width * 0.5) * side, f.y + 0.4, f.z + f.rz * (f.width * 0.5) * side);
        lip.rotation.y = Math.atan2(f.tx, f.tz);
        group.add(lip);
      }
    }
  };

  addRibbon(track.main, true, lipMat);
  addRibbon(track.shortcut, false, railMat);

  const start = track.start;
  const gate = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(1.1, 14, 1.1);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1f24, metalness: 0.4, roughness: 0.45 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(start.x + start.rx * 12 * side, start.y + 7, start.z + start.rz * 12 * side);
    gate.add(post);
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(26, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x0b2c34, emissive: 0x0a3a44 }),
  );
  beam.position.set(start.x, start.y + 13.2, start.z);
  beam.rotation.y = Math.atan2(start.tx, start.tz);
  gate.add(beam);
  group.add(gate);

  dressProps(group, track);
  dressCavern(group, track);
  dressLandmarks(group, track);
  dressSkyline(group, track);
  for (let i = 0; i < 14; i++) {
    const f = track.main.getFrameAtT(i / 14);
    const cavern = i / 14 > 0.52 && i / 14 < 0.78;
    const lamp = new THREE.PointLight(cavern ? 0x3ad4ff : i % 2 ? 0xff9a3a : 0x5ce6ff, cavern ? 28 : 18, cavern ? 52 : 70);
    lamp.position.set(f.x, f.y + (cavern ? 7 : 10), f.z);
    group.add(lamp);
  }
  return { group, waterMat };
}

function dressProps(group: THREE.Group, track: TrackWorld): void {
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.9, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3d4750, metalness: 0.55, roughness: 0.4 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x147d8c, emissiveIntensity: 1.4 });
  const tankGeo = new THREE.CylinderGeometry(6, 6, 16, 12);
  const pipeGeo = new THREE.CylinderGeometry(0.7, 0.7, 18, 8);
  const lightGeo = new THREE.BoxGeometry(0.3, 0.3, 3.5);

  const tankTs = [0.14, 0.19, 0.38, 0.46, 0.52];
  for (const t of tankTs) {
    const f = track.main.getFrameAtT(t);
    const tank = new THREE.Mesh(tankGeo, rust);
    const side = t > 0.3 ? 1 : -1;
    tank.position.set(f.x + f.rx * (f.width * 0.5 + 10) * side, f.y + 8, f.z + f.rz * (f.width * 0.5 + 10) * side);
    group.add(tank);
  }

  for (let i = 0; i < 18; i++) {
    const f = track.main.getFrameAtT(0.58 + i * 0.008);
    const side = f.width * 0.5 + 5;
    const pipe = new THREE.Mesh(pipeGeo, steel);
    pipe.position.set(f.x + f.rx * side, f.y + 6.2, f.z + f.rz * side);
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = Math.atan2(f.tx, f.tz);
    group.add(pipe);
    const lamp = new THREE.Mesh(lightGeo, neon);
    lamp.position.set(f.x, f.y + 5.6, f.z);
    lamp.rotation.y = Math.atan2(f.tx, f.tz);
    group.add(lamp);
  }

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 16, 10), rust);
  const hf = track.main.getFrameAtT(0.9);
  tower.position.set(hf.x + hf.rx * -28, hf.y + 8, hf.z + hf.rz * -28);
  group.add(tower);

  const gantry = new THREE.Mesh(new THREE.BoxGeometry(28, 1.4, 4), steel);
  const g = track.main.getFrameAtT(0.04);
  gantry.position.set(g.x, g.y + 11, g.z);
  gantry.rotation.y = Math.atan2(g.tx, g.tz);
  group.add(gantry);

  const archT = [0.27, 0.71];
  for (const t of archT) {
    const f = track.main.getFrameAtT(t);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(f.width * 0.42, 0.55, 8, 18, Math.PI), steel);
    arch.position.set(f.x, f.y + 2.2, f.z);
    arch.rotation.y = Math.atan2(f.tx, f.tz);
    arch.rotation.z = Math.PI;
    group.add(arch);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(10, 3.2, 0.4), neon);
    sign.position.set(f.x + f.rx * (f.width * 0.5 + 8), f.y + 7, f.z + f.rz * (f.width * 0.5 + 8));
    sign.rotation.y = Math.atan2(f.tx, f.tz);
    group.add(sign);
  }

  const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x2a3238, metalness: 0.35, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const f = track.main.getFrameAtT(0.6 + i * 0.012);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(f.width * 0.52, 0.85, 6, 16), tunnelMat);
    ring.position.set(f.x, f.y + 1.4, f.z);
    ring.rotation.y = Math.atan2(f.tx, f.tz);
    group.add(ring);
  }

  const wf = track.main.getFrameAtT(0.83);
  const flareTs = [0.11, 0.33, 0.49];
  const flareGeo = new THREE.CylinderGeometry(1.4, 2.2, 28, 8);
  const fire = new THREE.MeshBasicMaterial({ color: 0xff6a22 });
  for (const t of flareTs) {
    const f = track.main.getFrameAtT(t);
    const stack = new THREE.Mesh(flareGeo, rust);
    stack.position.set(f.x + f.rx * (f.width * 0.5 + 14), f.y + 14, f.z + f.rz * (f.width * 0.5 + 14));
    group.add(stack);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5.5, 6), fire);
    flame.position.copy(stack.position);
    flame.position.y += 17;
    group.add(flame);
  }

  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 22),
    new THREE.MeshBasicMaterial({ color: 0xaeefff, transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
  );
  fall.position.set(wf.x + wf.rx * (wf.width * 0.5 + 6), wf.y + 10, wf.z + wf.rz * (wf.width * 0.5 + 6));
  fall.rotation.y = Math.atan2(wf.tx, wf.tz);
  group.add(fall);
}

/** Indoor night beat — vault over the existing tunnel, not a second overlapping ribbon. */
function dressCavern(group: THREE.Group, track: TrackWorld): void {
  const rock = new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.92, metalness: 0.08 });
  const rib = new THREE.MeshStandardMaterial({ color: 0x2ee0ff, emissive: 0x0a6a78, emissiveIntensity: 1.8 });
  const sodium = new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xaa5010, emissiveIntensity: 1.1 });
  for (let i = 0; i < 10; i++) {
    const t = 0.56 + i * 0.018;
    const f = track.main.getFrameAtT(t);
    const yaw = Math.atan2(f.tx, f.tz);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(f.width * 0.72, f.width * 0.78, 9, 10, 1, true), rock);
    shell.position.set(f.x, f.y + 5.4, f.z);
    shell.rotation.z = Math.PI / 2;
    shell.rotation.y = yaw;
    group.add(shell);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(f.width * 0.58, 0.22, 6, 18), i % 2 ? rib : sodium);
    hoop.position.set(f.x, f.y + 3.2, f.z);
    hoop.rotation.y = yaw;
    group.add(hoop);
    const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), sodium);
    pendant.position.set(f.x, f.y + 7.2, f.z);
    group.add(pendant);
  }
  for (const t of [0.555, 0.735]) {
    const f = track.main.getFrameAtT(t);
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(f.width * 0.82, 1.1, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x12181c, metalness: 0.4, roughness: 0.55 }),
    );
    mouth.position.set(f.x, f.y + 4.4, f.z);
    mouth.rotation.y = Math.atan2(f.tx, f.tz);
    group.add(mouth);
  }
}

/** Original-IP landmarks well off the ribbon so distant-t never stacks. */
function dressLandmarks(group: THREE.Group, track: TrackWorld): void {
  const hull = new THREE.MeshStandardMaterial({ color: 0x4a3a32, roughness: 0.72, metalness: 0.28 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.9, metalness: 0.2 });
  const lava = new THREE.MeshBasicMaterial({ color: 0xff4a18 });
  const f0 = track.main.getFrameAtT(0.08);
  const tanker = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(22, 14, 88), hull);
  body.position.y = 10;
  tanker.add(body);
  const superstruct = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 16), rust);
  superstruct.position.set(0, 22, -28);
  tanker.add(superstruct);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 16, 8), rust);
  stack.position.set(0, 34, -28);
  tanker.add(stack);
  tanker.position.set(f0.x + f0.rx * (f0.width * 0.5 + 62), f0.y, f0.z + f0.rz * (f0.width * 0.5 + 62));
  tanker.rotation.y = Math.atan2(f0.tx, f0.tz) + 0.35;
  group.add(tanker);

  const fn = track.main.getFrameAtT(0.36);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(48, 72, 10), rust);
  cone.position.set(fn.x + fn.rx * (fn.width * 0.5 + 95), fn.y + 28, fn.z + fn.rz * (fn.width * 0.5 + 95));
  group.add(cone);
  const glow = new THREE.Mesh(new THREE.ConeGeometry(14, 22, 8), lava);
  glow.position.copy(cone.position);
  glow.position.y += 38;
  group.add(glow);
  const plume = new THREE.PointLight(0xff5520, 42, 160);
  plume.position.copy(glow.position);
  group.add(plume);
}

function dressSkyline(group: THREE.Group, track: TrackWorld): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c343c, metalness: 0.55, roughness: 0.42 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.88, metalness: 0.18 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x0a6a78, emissiveIntensity: 1.6 });
  const sites = [0.16, 0.24, 0.44, 0.82, 0.91];
  for (let i = 0; i < sites.length; i++) {
    const f = track.main.getFrameAtT(sites[i]);
    const side = i % 2 === 0 ? -1 : 1;
    const lat = f.width * 0.5 + 48 + i * 6;
    const x = f.x + f.rx * lat * side;
    const z = f.z + f.rz * lat * side;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 38 + i * 4, 6), steel);
    tower.position.set(x, f.y + 19 + i * 2, z);
    group.add(tower);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 1.4), rust);
    boom.position.set(x + 10 * side, f.y + 36 + i * 2, z);
    group.add(boom);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 3.2), neon);
    cab.position.set(x, f.y + 38 + i * 2, z);
    group.add(cab);
  }
}
