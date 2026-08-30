import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createBoat } from "../sim/Boat";
import { gerstnerHeight } from "../sim/waterHeight";
import { ribbonLength, WakeField } from "./Wake";

function namedMesh(root: THREE.Object3D, name: string): THREE.Mesh {
  const obj = root.getObjectByName(name);
  if (!(obj instanceof THREE.Mesh)) throw new Error(`missing ${name}`);
  return obj;
}

function minZ(mesh: THREE.Mesh): number {
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) min = Math.min(min, pos.getZ(i));
  return min;
}

describe("transom wake", () => {
  it("stretches with speed and boost, more for the player", () => {
    expect(ribbonLength(36, false, true)).toBeGreaterThan(ribbonLength(12, false, true));
    expect(ribbonLength(36, true, true)).toBeGreaterThan(ribbonLength(36, false, true) + 2);
    expect(ribbonLength(36, true, true)).toBeGreaterThan(ribbonLength(36, true, false));
    expect(ribbonLength(80, true, true)).toBeLessThanOrEqual(19);
  });

  it("places a short aft ribbon on Gerstner water for every live hull", () => {
    const field = new WakeField();
    const player = createBoat("p", "skimmer", false);
    const ai = createBoat("a", "ironwake", true);
    player.x = 10;
    player.y = 5;
    player.z = 20;
    player.speed = 24;
    player.onWater = true;
    ai.x = 4;
    ai.y = 5;
    ai.z = 8;
    ai.speed = 24;
    ai.onWater = true;
    ai.ai = true;
    field.sync([player, ai], 1.5);

    expect(field.group.children.length).toBe(2);
    const pGroup = field.group.children.find((c) => c.userData.boatId === "p");
    const aGroup = field.group.children.find((c) => c.userData.boatId === "a");
    expect(pGroup && aGroup).toBeTruthy();
    const ribbon = namedMesh(pGroup!, "wakeRibbon");
    const skirt = namedMesh(pGroup!, "wakeSkirt");
    const aiRibbon = namedMesh(aGroup!, "wakeRibbon");
    expect(ribbon.geometry.getAttribute("position").count).toBeGreaterThan(
      aiRibbon.geometry.getAttribute("position").count,
    );

    const pos = ribbon.geometry.getAttribute("position") as THREE.BufferAttribute;
    const wave0 = gerstnerHeight(player.x, player.z, 1.5);
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeLessThan(player.z - player.def.hullLength * 0.28);
      const py = pos.getY(i);
      const water =
        player.y - 0.52 + (gerstnerHeight(pos.getX(i), pos.getZ(i), 1.5) - wave0);
      expect(Math.abs(py - water)).toBeLessThan(0.16);
    }
    expect(skirt.visible).toBe(true);
    expect(ribbon.visible).toBe(true);

    const mid = Math.floor(pos.count / 2);
    const tail = pos.count - 3;
    const widthAt = (start: number, cols: number) => {
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < cols; i++) {
        minX = Math.min(minX, pos.getX(start + i));
        maxX = Math.max(maxX, pos.getX(start + i));
      }
      return maxX - minX;
    };
    const cols = 9;
    expect(widthAt(tail - (tail % cols), cols)).toBeLessThan(widthAt(mid - (mid % cols), cols) * 0.55);

    const rest = minZ(ribbon);
    player.boostHeld = true;
    player.boostFuel = 3;
    field.sync([player, ai], 1.5);
    expect(minZ(ribbon)).toBeLessThan(rest - 1.5);

    player.airborne = true;
    player.onWater = false;
    field.sync([player, ai], 1.5);
    expect(ribbon.visible).toBe(false);
    expect(skirt.visible).toBe(false);

    field.sync([], 0);
    expect(field.group.children.length).toBe(0);
  });
});
