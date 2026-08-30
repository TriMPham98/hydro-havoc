import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRiptideRefinery } from "../data/tracks/riptideRefinery";
import { createBoat } from "../sim/Boat";
import { gerstnerHeight } from "../sim/waterHeight";
import { ContactField, HULL_WATERLINE } from "./Contact";
import { Fx } from "./Fx";
import { createSkyDome } from "./SkyDome";
import { createTrackGroup } from "./TrackMesh";
import { createOceanMaterial, createWaterMaterial } from "./WaterMaterial";

describe("canal water", () => {
  it("exposes planar reflection uniforms without raising the cube path", () => {
    const canal = createWaterMaterial("canal");
    const ocean = createOceanMaterial();
    expect(canal.uniforms.uPlanar).toBeDefined();
    expect(canal.uniforms.uHasPlanar.value).toBe(0);
    expect(canal.uniforms.uReflectMatrix.value).toBeInstanceOf(THREE.Matrix4);
    expect(ocean.uniforms.uHasPlanar.value).toBe(0);
    expect(canal.fragmentShader).toContain("uPlanar");
    expect(canal.fragmentShader).toContain("uReflectMatrix");
    expect(canal.fragmentShader).toContain("glitterAmt");
    expect(canal.fragmentShader).toContain("wetLip");
    expect(canal.fragmentShader).toContain("pow(1.0 - ndv, 2.0)");
  });

  it("keeps canal water darker than the old milky teal", () => {
    const canal = createWaterMaterial("canal");
    const ocean = createOceanMaterial();
    const deep = canal.uniforms.uColorDeep.value as THREE.Color;
    const shallow = canal.uniforms.uColorShallow.value as THREE.Color;
    expect(deep.g).toBeLessThan(0.22);
    expect(deep.b).toBeLessThan(0.28);
    expect(shallow.g).toBeLessThan(0.5);
    expect(deep.getHex()).not.toBe(shallow.getHex());
    expect((ocean.uniforms.uColorDeep.value as THREE.Color).g).toBeLessThan(0.24);
  });
});

describe("dusk sky", () => {
  it("keeps a shader sphere with a lowered sun disc", () => {
    const { mesh, material } = createSkyDome();
    expect(mesh.name).toBe("skyDome");
    expect(material.fragmentShader).toContain("uSunDir.y * 0.58");
    expect(material.fragmentShader).toContain("band");
  });
});

describe("hull contact", () => {
  it("pins a dark disc to Gerstner water under every live hull", () => {
    const field = new ContactField();
    const player = createBoat("p", "skimmer", false);
    const ai = createBoat("a", "ironwake", true);
    player.x = 10;
    player.y = 5;
    player.z = 20;
    player.onWater = true;
    ai.x = 4;
    ai.y = 5;
    ai.z = 8;
    ai.onWater = true;
    field.sync([player, ai], 1.5);

    expect(field.group.children.length).toBe(2);
    const pMesh = field.group.children.find((c) => c.userData.boatId === "p");
    expect(pMesh).toBeInstanceOf(THREE.Mesh);
    const mesh = pMesh as THREE.Mesh;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const wave0 = gerstnerHeight(player.x, player.z, 1.5);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i);
      const water =
        player.y - HULL_WATERLINE + (gerstnerHeight(pos.getX(i), pos.getZ(i), 1.5) - wave0);
      expect(Math.abs(py - water)).toBeLessThan(0.08);
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    expect(maxX - minX).toBeGreaterThan(player.def.hullWidth * 0.8);

    player.airborne = true;
    player.onWater = false;
    field.sync([player, ai], 1.5);
    expect(mesh.visible).toBe(false);

    field.sync([], 0);
    expect(field.group.children.length).toBe(0);
  });
});

describe("pickup art", () => {
  it("rebuilds authored buoys, scrap crates, and spiked mines", () => {
    const fx = new Fx(new THREE.HemisphereLight());
    const track = buildRiptideRefinery();
    fx.rebuildPickups(track);

    expect(fx.group.getObjectByName("fxParticles")).toBeTruthy();
    expect(fx.particles.parent).toBe(fx.group);

    const beacons = track.pickups.map((p) =>
      fx.group.children
        .flatMap((c) => c.children)
        .find((c) => c.userData.id === p.id),
    );
    expect(beacons.every(Boolean)).toBe(true);
    for (const b of beacons) {
      expect(b!.name).toBe("pickupBeacon");
      expect(b!.children.length).toBeGreaterThan(3);
      expect(b!.getObjectByName("beaconLamp")).toBeTruthy();
    }

    for (const c of track.crates) {
      const crate = fx.group.children.flatMap((g) => g.children).find((o) => o.userData.id === c.id);
      expect(crate?.name).toBe("scrapCrate");
      expect(crate?.children.length).toBeGreaterThan(4);
    }

    const mine = fx.group.getObjectByName("mineGlow");
    expect(mine).toBeTruthy();
    const body = fx.group.getObjectByName("mineBody");
    expect(body).toBeTruthy();
    expect(body!.parent!.children.length).toBeGreaterThan(8);
  });
});

describe("canal walls", () => {
  it("tiles rusted concrete on the main ribbon only", () => {
    const track = buildRiptideRefinery();
    const { group } = createTrackGroup(track);
    const walls: THREE.Mesh[] = [];
    const copes: THREE.Mesh[] = [];
    const waters: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === "canalWall") walls.push(obj);
      if (obj.name === "canalCoping") copes.push(obj);
      if (obj.name === "canalWater") waters.push(obj);
    });
    expect(waters.length).toBe(1);
    expect(walls.length).toBe(2);
    expect(copes.length).toBe(2);
    for (const wall of walls) {
      const mat = wall.material as THREE.MeshStandardMaterial;
      expect(mat.map).toBeInstanceOf(THREE.DataTexture);
      expect(mat.side).toBe(THREE.FrontSide);
      expect(wall.geometry.getAttribute("uv")).toBeTruthy();
    }
    for (const cope of copes) {
      const mat = cope.material as THREE.MeshStandardMaterial;
      expect(mat.map).toBeInstanceOf(THREE.DataTexture);
    }
    const foam = group.getObjectByName("canalWaterline") as THREE.Mesh;
    expect(foam.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const foamMat = foam.material as THREE.MeshStandardMaterial;
    expect(foamMat.opacity).toBeLessThan(0.55);
    expect(foamMat.metalness).toBeGreaterThan(0.45);
    expect(foamMat.color.getHex()).toBeLessThan(0x4a6570);
  });
});
