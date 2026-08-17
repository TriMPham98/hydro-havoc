import { describe, expect, it } from "vitest";
import { fillHullLoop, fillWetSlap, hullRms } from "../../audio/hullSample";

describe("hull grain", () => {
  it("fills a non-silent loop with energy", () => {
    const data = new Float32Array(4096);
    fillHullLoop(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.04);
    expect(hullRms(data)).toBeLessThan(0.6);
    let peaks = 0;
    for (let i = 1; i < data.length; i++) if (data[i] > 0.2 && data[i - 1] <= 0.2) peaks++;
    expect(peaks).toBeGreaterThan(5);
  });

  it("wet slap has irregular energy", () => {
    const data = new Float32Array(8000);
    fillWetSlap(data, 22050);
    expect(hullRms(data)).toBeGreaterThan(0.02);
    expect(hullRms(data)).toBeLessThan(0.7);
  });
});
