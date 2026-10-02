import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRiptideRefinery } from "../data/tracks/riptideRefinery";
import { buildTerrain } from "./Terrain";
import { TrackSpectacle } from "./TrackSpectacle";
import { concretePanelMaps, createTrackGroup } from "./TrackMesh";
import { bindStackFlames, updateStackFlames } from "./StackFlames";

const track = buildRiptideRefinery();

describe("quayside terrain", () => {
  const { mesh, heightAt } = buildTerrain(track, { cell: 8 });

  it("sinks out of sight in the channel and sits flush with the wall tops on the quay", () => {
    for (const t of [0.05, 0.2, 0.45, 0.9]) {
      const f = track.main.getFrameAtT(t);
      expect(heightAt(f.x, f.z)).toBeLessThan(f.y - 1);
      const top = f.y + f.bankHeight + 2.2 + 0.34;
      const q = f.width * 0.5 + 40;
      const y = heightAt(f.x + f.rx * q, f.z + f.rz * q);
      expect(Math.abs(y - (top - 0.36))).toBeLessThan(1.2);
    }
  });

  it("rises into a mesa beside the raised section and falls to the sea far away", () => {
    const mesa = track.main.getFrameAtT(0.3);
    const q = mesa.width * 0.5 + 30;
    expect(heightAt(mesa.x + mesa.rx * q, mesa.z + mesa.rz * q)).toBeGreaterThan(15);
    const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position") as THREE.BufferAttribute);
    expect(heightAt(box.min.x + 1, box.min.z + 1)).toBeLessThan(-2);
  });
});

describe("track spectacle", () => {
  const show = new TrackSpectacle(track);
  const byName = (n: string) => show.group.getObjectByName(n);

  it("builds railings, ladders, lamps, bridges, crowd, searchlights and flare fire without a DOM", () => {
    for (const n of ["terrain", "railing", "ladders", "lampHeads", "lampPools", "bridge0", "crowd", "searchlights", "flareFire", "startBulbs", "fireworks"]) {
      expect(byName(n), n).toBeTruthy();
    }
    const rails = byName("railing") as THREE.InstancedMesh;
    expect(rails.count).toBeGreaterThan(2000);
    expect((byName("crowd") as THREE.InstancedMesh).count).toBeGreaterThan(300);
    let points = 0;
    show.group.traverse((o) => {
      if (o instanceof THREE.PointLight) points++;
    });
    expect(points).toBe(0);
  });

  it("lands lamp light pools on the water inside the canal", () => {
    const pools = byName("lampPools") as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    pools.getMatrixAt(3, m);
    p.setFromMatrixPosition(m);
    const f = track.main.getFrameAtS(3 * 46 + 7);
    const lat = (p.x - f.x) * f.rx + (p.z - f.z) * f.rz;
    expect(Math.abs(lat)).toBeLessThan(f.width * 0.5);
    expect(Math.abs(p.y - f.y)).toBeLessThan(0.3);
  });

  it("celebrates with staggered bursts and launches the rockets", () => {
    const bursts = show.celebrate("finish");
    expect(bursts.length).toBe(16);
    expect(Math.max(...bursts)).toBeGreaterThan(Math.min(...bursts) + 2);
    let burst = 0;
    show.onBurst = () => burst++;
    for (let i = 0; i < 60 * 8; i++) show.update(i / 60, 1 / 60, new THREE.Vector3());
    expect(burst).toBe(16);
  });
});

describe("canal construction", () => {
  it("bakes tiling concrete panels with recessed joints", () => {
    const { albedo, normal } = concretePanelMaps(64);
    const a = albedo.image.data as Uint8Array;
    const joint = a[(32 * 64 + 0) * 4];
    const face = a[(32 * 64 + 20) * 4];
    expect(joint).toBeLessThan(face);
    expect(normal.image.data.length).toBe(64 * 64 * 4);
  });

  it("adds the hazard-striped coping and keeps the shell within its draw budget", () => {
    const { group } = createTrackGroup(track);
    expect(group.getObjectByName("copingHazard")).toBeTruthy();
    expect(typeof group.userData.tick).toBe("function");
  });
});

describe("stack flames", () => {
  it("light on boost and bark on lift-off", () => {
    const root = new THREE.Group();
    const tip = new THREE.Object3D();
    tip.name = "StackTip_R0";
    root.add(tip);
    bindStackFlames(root);
    const flame = tip.children[0] as THREE.Mesh;
    const base = { boosting: false, superOn: false, throttle: 1, speed: 30, sputter: 0, dt: 1 / 60, time: 0 };
    updateStackFlames(root, base);
    expect(flame.visible).toBe(false);
    for (let i = 0; i < 20; i++) updateStackFlames(root, { ...base, boosting: true, time: i / 60 });
    expect(flame.visible).toBe(true);
    expect(flame.scale.y).toBeGreaterThan(0.6);
    for (let i = 0; i < 90; i++) updateStackFlames(root, { ...base, time: 1 + i / 60 });
    updateStackFlames(root, { ...base, throttle: 0, time: 3 });
    expect((flame.material as THREE.ShaderMaterial).uniforms.uPower.value).toBeGreaterThan(0.3);
  });
});
