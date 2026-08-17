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

/** Continuous bank-lip rail — one strip, not a chain of boxes/buoys. */
function railGeometry(spline: ArcSpline, closed: boolean, side: number): THREE.BufferGeometry {
  const segs = Math.max(24, Math.floor(spline.totalLength / 2.4));
  const positions: number[] = [];
  const indices: number[] = [];
  const thick = 0.55;
  const lift = 0.42;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const f = spline.getFrameAtT(closed ? t : Math.min(t, 0.999));
    const hw = f.width * 0.5;
    const ox = f.x + f.rx * hw * side;
    const oz = f.z + f.rz * hw * side;
    const ix = ox - f.rx * thick * side;
    const iz = oz - f.rz * thick * side;
    positions.push(ix, f.y + lift, iz, ox, f.y + lift + 0.12, oz);
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
    group.add(new THREE.Mesh(railGeometry(spline, closed, 1), accent));
    group.add(new THREE.Mesh(railGeometry(spline, closed, -1), accent));
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
  dressReef(group, track);
  dressShipyard(group, track);
  dressBeacons(group, track);
  dressSilos(group, track);
  dressCampus(group);
  dressTourBiomes(group, track);
  dressHorizon(group);
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

  const palm = new THREE.MeshStandardMaterial({ color: 0x1c4a32, roughness: 0.85 });
  for (let i = 0; i < 8; i++) {
    const f = track.main.getFrameAtT(0.86 + i * 0.012);
    const side = i % 2 ? 1 : -1;
    const tree = new THREE.Mesh(new THREE.ConeGeometry(3.2, 11, 6), palm);
    tree.position.set(f.x + f.rx * (f.width * 0.5 + 16) * side, f.y + 6, f.z + f.rz * (f.width * 0.5 + 16) * side);
    group.add(tree);
  }
}

/** Second environment: reef cliffs beside the ribbon, never on it. */
function dressReef(group: THREE.Group, track: TrackWorld): void {
  const coral = new THREE.MeshStandardMaterial({ color: 0x8a3a48, roughness: 0.8, metalness: 0.08 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a4a42, roughness: 0.92, metalness: 0.05 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x2a6a48, roughness: 0.88 });
  for (let i = 0; i < 12; i++) {
    const t = 0.78 + i * 0.014;
    const f = track.main.getFrameAtT(t);
    const side = -1;
    const lat = f.width * 0.5 + 22 + (i % 3) * 5;
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(10 + (i % 3) * 4, 18 + (i % 4) * 5, 14), i % 2 ? stone : coral);
    cliff.position.set(f.x + f.rx * lat * side, f.y + 8, f.z + f.rz * lat * side);
    cliff.rotation.y = Math.atan2(f.tx, f.tz) + 0.2 * (i % 2 ? 1 : -1);
    group.add(cliff);
    if (i % 3 === 0) {
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2), moss);
      cap.position.copy(cliff.position);
      cap.position.y += 12;
      group.add(cap);
    }
  }
  const archF = track.main.getFrameAtT(0.9);
  const reefArch = new THREE.Mesh(new THREE.TorusGeometry(archF.width * 0.7 + 8, 2.4, 8, 16, Math.PI), stone);
  reefArch.position.set(archF.x + archF.rx * 18, archF.y + 6, archF.z + archF.rz * 18);
  reefArch.rotation.y = Math.atan2(archF.tx, archF.tz);
  reefArch.rotation.z = Math.PI;
  group.add(reefArch);
}

/** Huge drydock frame over the canal — visual only, banks stay the playable walls. */
function dressShipyard(group: THREE.Group, track: TrackWorld): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a444c, metalness: 0.62, roughness: 0.38 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a4028, roughness: 0.78, metalness: 0.22 });
  const f = track.main.getFrameAtT(0.2);
  const yaw = Math.atan2(f.tx, f.tz);
  const yard = new THREE.Group();
  const span = f.width + 36;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(4.2, 42, 6), steel);
    leg.position.set(f.rx * (span * 0.5) * side, 21, f.rz * (span * 0.5) * side);
    yard.add(leg);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(span + 8, 3.2, 5), rust);
  cross.position.y = 40;
  yard.add(cross);
  const hoist = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 10), steel);
  hoist.position.set(0, 36, 0);
  yard.add(hoist);
  for (let i = -2; i <= 2; i++) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 18, 5), rust);
    cable.position.set(i * 3.2, 28, 0);
    yard.add(cable);
  }
  yard.position.set(f.x, f.y, f.z);
  yard.rotation.y = yaw;
  group.add(yard);
  const flood = new THREE.PointLight(0xffd8a0, 36, 90);
  flood.position.set(f.x, f.y + 38, f.z);
  group.add(flood);
}

function dressBeacons(group: THREE.Group, track: TrackWorld): void {
  const white = new THREE.MeshStandardMaterial({ color: 0xd8e0e6, roughness: 0.45, metalness: 0.25 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc43a28, roughness: 0.5 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x148898, emissiveIntensity: 1.5 });
  const lf = track.main.getFrameAtT(0.5);
  const lat = lf.width * 0.5 + 34;
  const lx = lf.x + lf.rx * lat;
  const lz = lf.z + lf.rz * lat;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 46, 10), white);
  shaft.position.set(lx, lf.y + 23, lz);
  group.add(shaft);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 4, 10), stripe);
  band.position.set(lx, lf.y + 36, lz);
  group.add(band);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), neon);
  lamp.position.set(lx, lf.y + 47, lz);
  group.add(lamp);
  group.add(new THREE.PointLight(0xfff2c8, 40, 120).translateX(lx).translateY(lf.y + 48).translateZ(lz));

  for (const t of [0.31, 0.47, 0.73]) {
    const f = track.main.getFrameAtT(t);
    const board = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.6), neon);
    board.position.set(f.x + f.rx * (f.width * 0.5 + 20), f.y + 10, f.z + f.rz * (f.width * 0.5 + 20));
    board.rotation.y = Math.atan2(f.tx, f.tz);
    group.add(board);
  }
}

function dressSilos(group: THREE.Group, track: TrackWorld): void {
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3e28, roughness: 0.86, metalness: 0.18 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a545c, metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    const t = 0.37 + i * 0.012;
    const f = track.main.getFrameAtT(t);
    for (const side of [-1, 1] as const) {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.8, 26, 10), i % 2 ? rust : steel);
      silo.position.set(
        f.x + f.rx * (f.width * 0.5 + 16) * side,
        f.y + 13,
        f.z + f.rz * (f.width * 0.5 + 16) * side,
      );
      group.add(silo);
    }
  }
}

/** Interior campus — world mass in the loop hole, never on the ribbon. */
function dressCampus(group: THREE.Group): void {
  const brick = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.88, metalness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1a3a48,
    metalness: 0.7,
    roughness: 0.25,
    emissive: 0x0a2030,
    emissiveIntensity: 0.4,
  });
  const amber = new THREE.MeshStandardMaterial({ color: 0xff9a30, emissive: 0xaa4010, emissiveIntensity: 0.9 });
  const ox = 440;
  const oz = 560;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      if (Math.abs(gx) + Math.abs(gz) < 1) continue;
      const h = 18 + ((gx * 3 + gz * 7 + 20) % 28);
      const mat = (gx + gz) % 2 === 0 ? brick : glass;
      const b = new THREE.Mesh(new THREE.BoxGeometry(14, h, 14), mat);
      b.position.set(ox + gx * 22, h * 0.5, oz + gz * 22);
      group.add(b);
    }
  }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 64, 10), brick);
  stack.position.set(ox, 32, oz);
  group.add(stack);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(3, 10, 6), amber);
  flame.position.set(ox, 68, oz);
  group.add(flame);
  group.add(new THREE.PointLight(0xff6a20, 50, 180).translateX(ox).translateY(70).translateZ(oz));
}

/** Off-ribbon worlds: rust mesa, neon blocks, ice bergs. Never on the water. */
function dressTourBiomes(group: THREE.Group, track: TrackWorld): void {
  const sand = new THREE.MeshStandardMaterial({ color: 0xc48a48, roughness: 0.95, metalness: 0.02 });
  const neon = new THREE.MeshStandardMaterial({ color: 0xff2a88, emissive: 0x880830, emissiveIntensity: 1.4 });
  const ice = new THREE.MeshStandardMaterial({ color: 0xc8e8f4, roughness: 0.22, metalness: 0.35 });
  for (let i = 0; i < 7; i++) {
    const f = track.main.getFrameAtT(0.24 + i * 0.018);
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(18 + (i % 3) * 6, 10 + i * 2, 22), sand);
    mesa.position.set(f.x + f.rx * (f.width * 0.5 + 36), f.y + 6 + i, f.z + f.rz * (f.width * 0.5 + 36));
    group.add(mesa);
  }
  for (let i = 0; i < 6; i++) {
    const f = track.main.getFrameAtT(0.48 + i * 0.02);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(10, 28 + i * 5, 10), neon);
    slab.position.set(f.x + f.rx * -(f.width * 0.5 + 42), f.y + 16 + i * 2, f.z + f.rz * -(f.width * 0.5 + 42));
    group.add(slab);
  }
  for (let i = 0; i < 5; i++) {
    const f = track.main.getFrameAtT(0.72 + i * 0.03);
    const berg = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 6), ice);
    berg.position.set(f.x + f.rx * (f.width * 0.5 + 48), f.y + 8, f.z + f.rz * (f.width * 0.5 + 48));
    group.add(berg);
  }
}

function dressHorizon(group: THREE.Group): void {
  const rock = new THREE.MeshStandardMaterial({ color: 0x1a2830, roughness: 1, metalness: 0 });
  const snow = new THREE.MeshStandardMaterial({ color: 0x8aa0a8, roughness: 0.7 });
  const peaks: [number, number, number, number][] = [
    [-380, -180, 110, 1],
    [1100, 200, 130, 0],
    [80, 1480, 150, 1],
    [-420, 900, 95, 0],
    [1280, 1320, 120, 1],
  ];
  for (const [x, z, h, icy] of peaks) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.55, h, 7), icy ? snow : rock);
    m.position.set(x, h * 0.35, z);
    group.add(m);
  }
}
