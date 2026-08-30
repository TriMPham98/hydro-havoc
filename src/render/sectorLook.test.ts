import { describe, expect, it } from "vitest";
import { sectorIdAt, sectorPalette } from "./sectorLook";

describe("sector palette", () => {
  it("is a pure t lookup for riptide bands", () => {
    expect(sectorPalette(0.1).id).toBe("HARBOR");
    expect(sectorPalette(0.5).id).toBe("NEON");
    expect(sectorPalette(0.8).id).toBe("REEF");
    expect(sectorIdAt(0.1)).toBe("HARBOR");
    expect(sectorIdAt(0.3)).toBe("MESA");
    expect(sectorIdAt(0.5)).toBe("NEON");
    expect(sectorIdAt(0.8)).toBe("REEF");
    expect(sectorPalette(0.1)).toEqual(sectorPalette(0.1));
    expect(sectorPalette(0.1).fog).toBe(0x8ab0c4);
    expect(sectorPalette(0.5).bloom).toBeGreaterThan(sectorPalette(0.1).bloom);
    expect(sectorPalette(0.3).sunInt).toBeGreaterThan(sectorPalette(0.1).sunInt);
    expect(sectorPalette(0.8).fogFar).toBeGreaterThan(sectorPalette(0.5).fogFar);
  });
});
