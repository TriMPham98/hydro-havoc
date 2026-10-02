import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bindBoostLights, updateBoostLights, type BoostLightState } from "./BoostLights";

function hull(): { root: THREE.Group; strip: THREE.Mesh } {
  const root = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.05, 0.01, 4);
  const strip = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  strip.name = "BoostStrip_L";
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.01), new THREE.MeshBasicMaterial());
  bar.name = "BoostStrip_T";
  root.add(strip, bar);
  return { root, strip };
}

const base: BoostLightState = {
  boostFuel: 0,
  pendingBoost: 0,
  superRemaining: 0,
  pendingSuper: 0,
  boosting: false,
  sputter: 0,
  dt: 1 / 60,
  time: 0,
};

const u = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms;

describe("hull boost lights", () => {
  it("swaps strip materials and maps the strip along the hull", () => {
    const { root, strip } = hull();
    bindBoostLights(root, 0x2ee6ff);
    expect(strip.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(u(strip).uLo.value).toBeCloseTo(-2);
    expect(u(strip).uHi.value).toBeCloseTo(2);
  });

  it("sweeps on pickup, fills behind the head, then holds the fuel level", () => {
    const { root, strip } = hull();
    bindBoostLights(root, 0x2ee6ff);
    updateBoostLights(root, base);
    const hit = updateBoostLights(root, { ...base, boostFuel: 1.5 });
    expect(hit.pickup).toBe(true);
    expect(u(strip).uSweep.value).toBeGreaterThanOrEqual(0);
    // Gauge never runs ahead of the sweep head.
    expect(u(strip).uFuel.value).toBeLessThanOrEqual(u(strip).uSweep.value + 1e-6);
    for (let i = 0; i < 90; i++) updateBoostLights(root, { ...base, boostFuel: 1.5 });
    expect(u(strip).uSweep.value).toBe(-1);
    expect(u(strip).uFuel.value).toBeCloseTo(1.5 / 5, 2);
  });

  it("goes gold on super, chases while boosting, and stutters when the tank runs dry", () => {
    const { root, strip } = hull();
    bindBoostLights(root, 0x2ee6ff);
    updateBoostLights(root, base);
    updateBoostLights(root, { ...base, superRemaining: 2 });
    expect((u(strip).uColor.value as THREE.Color).getHex()).toBe(0xffd23a);
    const fire = updateBoostLights(root, { ...base, superRemaining: 2, boosting: true });
    expect(fire.ignite).toBe(true);
    for (let i = 0; i < 20; i++) updateBoostLights(root, { ...base, superRemaining: 2, boosting: true });
    expect(u(strip).uBoost.value).toBeGreaterThan(0.9);
    updateBoostLights(root, { ...base, sputter: 0.35 });
    expect(u(strip).uDie.value).toBeCloseTo(0.5, 2);
  });
});
