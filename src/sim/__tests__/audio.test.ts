import { describe, expect, it } from "vitest";
import { GameAudio } from "../../audio/Audio";
import {
  fillCabinIR,
  fillFieldLoop,
  fillHullLoop,
  fillIntakeLoop,
  fillRaceMusic,
  fillSpoolLoop,
  fillTitleMusic,
  fillWetSlap,
  hullRms,
} from "../../audio/hullSample";

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

  it("title and race beds are audible and not clipping", () => {
    const title = new Float32Array(8000);
    fillTitleMusic(title, 22050);
    expect(hullRms(title)).toBeGreaterThan(0.02);
    expect(hullRms(title)).toBeLessThan(0.4);
    const race = new Float32Array(8000);
    fillRaceMusic(race, 22050);
    expect(hullRms(race)).toBeGreaterThan(0.02);
    expect(hullRms(race)).toBeLessThan(0.45);
  });
});

describe("announcer", () => {
  it("accepts cabinet cues as a no-op before resume", () => {
    const audio = new GameAudio();
    expect(() => {
      audio.announce("HYDRO JUMP");
      audio.announce("HYPER JUMP");
      audio.announce("HYPER SLIDE");
      audio.announce("STUNT");
      audio.announce("HULL CRUSHER");
      audio.announce("WIPEOUT");
      audio.announce("FINISH");
      audio.announce("SUPER");
      audio.announce("HARBOR");
    }).not.toThrow();
  });
});
