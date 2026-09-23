import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRiptideRefinery } from "../data/tracks/riptideRefinery";
import { createBoat } from "../sim/Boat";
import { Fx } from "./Fx";

function named(root: THREE.Object3D, name: string): THREE.Mesh {
  const obj = root.getObjectByName(name);
  if (!(obj instanceof THREE.Mesh)) throw new Error(`missing ${name}`);
  return obj;
}

describe("player spray sheets", () => {
  it("puts transom and chine sheets on the player and keeps slam rings", () => {
    const fx = new Fx(new THREE.HemisphereLight());
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", false);
    const ai = createBoat("a", "ironwake", true);
    const start = track.main.getFrameAtT(0.1);
    player.x = start.x;
    player.y = start.y + 0.8;
    player.z = start.z;
    player.speed = 28;
    player.onWater = true;
    ai.x = start.x + 6;
    ai.y = start.y + 0.8;
    ai.z = start.z;
    ai.speed = 28;
    ai.onWater = true;
    fx.update(track, [player, ai], 0.016, 1, false);

    const transom = named(fx.group, "sprayTransom");
    const chineL = named(fx.group, "sprayChineL");
    const chineR = named(fx.group, "sprayChineR");
    expect(transom.visible).toBe(true);
    expect(chineL.visible).toBe(true);
    expect(chineR.visible).toBe(true);
    expect(transom.scale.z).toBeGreaterThan(chineL.scale.z);
    expect(transom.scale.z).toBeGreaterThan(8);
    expect((transom.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0.2);

    player.speed = 0;
    player.onWater = false;
    fx.update(track, [player, ai], 0.016, 1, false);
    expect(transom.visible).toBe(false);

    fx.slam(player.x, player.y, player.z);
    const ring = named(fx.group, "slamRing0");
    expect(ring.visible).toBe(true);

    player.speed = 28;
    player.onWater = true;
    fx.jetBurst(player);
    const trail = fx.group.getObjectByName("fxParticles")?.children.find((c) => c.type === "Points");
    expect(trail).toBeTruthy();
  });

  it("streams pickup energy into the hull and rings it in the pickup color", () => {
    const fx = new Fx(new THREE.HemisphereLight());
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", false);
    fx.absorb(player, 12, 0, 0, "red");
    const ring = named(fx.group, "slamRing0");
    for (let i = 0; i < 20; i++) fx.update(track, [player], 1 / 60, i / 60, false);
    expect(ring.visible).toBe(false);
    for (let i = 0; i < 12; i++) fx.update(track, [player], 1 / 60, 1, false);
    expect(ring.visible).toBe(true);
    const col = (ring.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color;
    expect(col.getHex()).toBe(0xff3d6e);
  });
});
