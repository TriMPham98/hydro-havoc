import { describe, expect, it } from "vitest";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";
import { queryCourse, resolveBank, respawnPose } from "../Track";
import { pairKey } from "../Collision";
import { createBoat } from "../Boat";
import { resolveHulls, resetRamTable } from "../Collision";

describe("track", () => {
  it("builds a closed main ribbon with a shortcut", () => {
    const track = buildRiptideRefinery();
    expect(track.main.totalLength).toBeGreaterThan(400);
    expect(track.shortcut.totalLength).toBeGreaterThan(20);
    expect(track.pickups.some((p) => p.kind === "super")).toBe(true);
    expect(track.crates.length).toBe(4);
    const start = track.main.getFrameAtT(0);
    const q = queryCourse(track, start.x, start.y, start.z);
    expect(q.onRibbon).toBe(true);
    expect(q.courseT).toBeLessThan(0.05);
    expect(Math.abs(Math.atan2(start.tx, start.tz))).toBeLessThan(0.45);
  });

  it("pushes boats back inside the bank", () => {
    const track = buildRiptideRefinery();
    const f = track.main.getFrameAtT(0.1);
    const q = queryCourse(track, f.x + f.rx * 40, f.y, f.z + f.rz * 40);
    const hit = resolveBank(q, f.x + f.rx * 40, f.z + f.rz * 40, f.rx * 10, f.rz * 10);
    expect(hit.hit).toBe(true);
    const after = queryCourse(track, hit.x, f.y, hit.z);
    expect(Math.abs(after.lateral)).toBeLessThan(Math.abs(q.lateral));
  });

  it("respawns on a checkpoint", () => {
    const track = buildRiptideRefinery();
    const pose = respawnPose(track, 0);
    expect(Number.isFinite(pose.yaw)).toBe(true);
  });

  it("does not fold distant-t ribbons on top of each other", () => {
    const track = buildRiptideRefinery();
    const n = 56;
    const clashes: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = track.main.getFrameAtT(i / n);
      for (let j = i + 1; j < n; j++) {
        const wrap = Math.min(Math.abs(i - j) / n, 1 - Math.abs(i - j) / n);
        if (wrap < 0.14) continue;
        const b = track.main.getFrameAtT(j / n);
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        const need = (a.width + b.width) * 0.5 + 10;
        if (d < need) clashes.push(`t${(i / n).toFixed(2)}↔${(j / n).toFixed(2)} d=${d.toFixed(1)}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("spans a world-tour footprint, not a pocket canal", () => {
    const track = buildRiptideRefinery();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < 32; i++) {
      const f = track.main.getFrameAtT(i / 32);
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x);
      minZ = Math.min(minZ, f.z);
      maxZ = Math.max(maxZ, f.z);
    }
    expect(maxX - minX).toBeGreaterThan(700);
    expect(maxZ - minZ).toBeGreaterThan(900);
    expect(track.main.totalLength).toBeGreaterThan(2200);
  });

  it("keeps the main canal at least 20m wide", () => {
    const track = buildRiptideRefinery();
    for (let i = 0; i < 40; i++) {
      expect(track.main.getFrameAtT(i / 40).width).toBeGreaterThanOrEqual(20);
    }
  });

  it("does not snap a surface boat onto the elevated shortcut", () => {
    const track = buildRiptideRefinery();
    const mid = track.shortcut.getFrameAtT(0.5);
    const q = queryCourse(track, mid.x, 0.8, mid.z, 0.3);
    expect(q.onShortcut).toBe(false);
  });
});

describe("mighty hull", () => {
  it("awards boost only when speed delta is large", () => {
    resetRamTable();
    const a = createBoat("a", "ironwake", false);
    const b = createBoat("b", "skimmer", true);
    a.x = 0;
    a.z = 0;
    b.x = 1;
    b.z = 0;
    a.speed = 30;
    b.speed = 10;
    a.vx = 20;
    const events = resolveHulls([a, b], 1);
    expect(events.some((e) => e.awarded)).toBe(true);
    expect(a.boostFuel).toBeGreaterThan(0);
  });

  it("stable pair keys", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
});
