import { describe, expect, it } from "vitest";
import { fillCabinIR, fillFieldLoop, fillHullLoop, fillIntakeLoop, fillSpoolLoop, fillWetSlap, hullRms } from "../../audio/hullSample";

describe("hull grain", () => {
  it("fills a non-silent loop with energy", () => {
    const data = new Float32Array(4096);
    fillHullLoop(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.04);
    expect(hullRms(data)).toBeLessThan(0.6);
    let peaks = 0;
    for (let i = 1; i < data.length; i++) if (data[i] > 0.12 && data[i - 1] <= 0.12) peaks++;
    expect(peaks).toBeGreaterThan(4);
  });

  it("wet slap has irregular energy", () => {
    const data = new Float32Array(8000);
    fillWetSlap(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.02);
    expect(hullRms(data)).toBeLessThan(0.7);
  });

  it("cabin IR decays", () => {
    const data = new Float32Array(4096);
    fillCabinIR(data, 22050);
    const head = hullRms(data.subarray(0, 256));
    const tail = hullRms(data.subarray(data.length - 256));
    expect(head).toBeGreaterThan(tail);
    expect(head).toBeGreaterThan(0.01);
  });

  it("field loop has body", () => {
    const data = new Float32Array(6000);
    fillFieldLoop(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.03);
    expect(hullRms(data)).toBeLessThan(0.55);
  });

  it("intake loop has energy", () => {
    const data = new Float32Array(4096);
    fillIntakeLoop(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.03);
    expect(hullRms(data)).toBeLessThan(0.6);
  });

  it("spool loop has energy", () => {
    const data = new Float32Array(4096);
    fillSpoolLoop(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.04);
    expect(hullRms(data)).toBeLessThan(0.6);
  });
});
