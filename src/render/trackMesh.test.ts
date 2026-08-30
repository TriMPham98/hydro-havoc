import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCourse } from "../data/tracks/catalog";
import { buildRiptideRefinery } from "../data/tracks/riptideRefinery";
import { WATER_ALONG, WATER_WIDTH_SEGS, createTrackGroup } from "./TrackMesh";

function census(root: THREE.Object3D) {
  let meshes = 0;
  let instanced = 0;
  let points = 0;
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((obj) => {
    if (obj instanceof THREE.PointLight) points++;
    if (obj instanceof THREE.InstancedMesh) {
      instanced++;
      meshes++;
      geos.add(obj.geometry);
    } else if (obj instanceof THREE.Mesh) {
      meshes++;
      geos.add(obj.geometry);
    }
  });
  return { meshes, instanced, points, geos: geos.size };
}

function meshByName(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name === name) out.push(obj);
  });
  return out;
}

function triangleCount(mesh: THREE.Mesh): number {
  const idx = mesh.geometry.getIndex();
  if (idx) return idx.count / 3;
  return mesh.geometry.getAttribute("position").count / 3;
}

describe("createTrackGroup", () => {
  it("has no point lights and instances repeated scenery", () => {
    const { group } = createTrackGroup(buildCourse());
    const stats = census(group);
    expect(stats.points).toBe(0);
    expect(stats.instanced).toBeGreaterThan(20);
    expect(stats.meshes).toBeLessThan(90);
    expect(stats.geos).toBeLessThan(80);
  });
});

describe("canal ribbon budget", () => {
  it("samples water at 6–8m with 4–6 width segs", () => {
    expect(WATER_ALONG).toBeGreaterThanOrEqual(6);
    expect(WATER_ALONG).toBeLessThanOrEqual(8);
    expect(WATER_WIDTH_SEGS).toBeGreaterThanOrEqual(4);
    expect(WATER_WIDTH_SEGS).toBeLessThanOrEqual(6);
  });

  it("builds one main water ribbon with far fewer tris than the old 2.2m×12 mesh", () => {
    const track = buildRiptideRefinery();
    const { group } = createTrackGroup(track);
    const waters = meshByName(group, "canalWater");
    expect(waters).toHaveLength(1);
    const water = waters[0];
    expect(water.receiveShadow).toBe(true);
    const tris = triangleCount(water);
    const oldTris = Math.floor(track.main.totalLength / 2.2) * 12 * 2;
    const segs = Math.max(24, Math.floor(track.main.totalLength / WATER_ALONG));
    expect(tris).toBe(segs * WATER_WIDTH_SEGS * 2);
    expect(tris).toBeLessThan(oldTris * 0.35);
    expect(tris).toBeGreaterThan(2000);
  });
});
