import { describe, expect, it } from "vitest";
import { BOATS, boatById, statBars } from "../../data/boats";

describe("hull stats", () => {
  it("spreads the fleet so Speed / Turn / Armor read as different boats", () => {
    const bars = Object.fromEntries(BOATS.map((b) => [b.id, Object.fromEntries(statBars(b).map((s) => [s.label, s.value]))]));
    expect(bars.vesper.Speed).toBeGreaterThan(bars.ironwake.Speed + 0.2);
    expect(bars.ironwake.Speed).toBeGreaterThan(bars.skimmer.Speed + 0.2);
    expect(bars.skimmer.Turn).toBeGreaterThan(bars.ironwake.Turn + 0.2);
    expect(bars.ironwake.Turn).toBeGreaterThan(bars.vesper.Turn + 0.2);
    expect(bars.ironwake.Armor).toBeGreaterThan(bars.skimmer.Armor + 0.2);
    expect(bars.skimmer.Armor).toBeGreaterThan(bars.vesper.Armor + 0.1);
    expect(boatById("skimmer").name).toBe("Skimmer");
  });
});
