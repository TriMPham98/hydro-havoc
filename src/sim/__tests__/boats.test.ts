import { describe, expect, it } from "vitest";
import { BOATS, boatById, statBars } from "../../data/boats";
import { createBoat } from "../Boat";
import { stepBoat } from "../BoatController";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";

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

  it("lets each hull hold its listed top speed and turn in that order", () => {
    const track = buildRiptideRefinery();
    const start = track.main.getFrameAtT(0.05);
    const cruise = (id: "skimmer" | "ironwake" | "vesper") => {
      const boat = createBoat(id, id, false);
      boat.x = start.x;
      boat.y = start.y + 0.8;
      boat.z = start.z;
      boat.yaw = Math.atan2(start.tx, start.tz);
      boat.courseT = 0.05;
      boat.throttle = 1;
      for (let i = 0; i < 240; i++) stepBoat(boat, track, 1 / 60, i / 60, false);
      return boat;
    };
    const skimmer = cruise("skimmer");
    const ironwake = cruise("ironwake");
    const vesper = cruise("vesper");
    expect(skimmer.speed).toBeGreaterThan(skimmer.def.maxSpeed * 0.9);
    expect(ironwake.speed).toBeGreaterThan(skimmer.speed + 1.2);
    expect(vesper.speed).toBeGreaterThan(ironwake.speed + 1.5);
    expect(vesper.speed).toBeGreaterThan(vesper.def.maxSpeed * 0.9);

    const yawAt = (id: "skimmer" | "ironwake" | "vesper") => {
      const boat = createBoat(id, id, false);
      boat.x = start.x;
      boat.y = start.y + 0.8;
      boat.z = start.z;
      boat.yaw = 0;
      boat.speed = 22;
      boat.throttle = 1;
      boat.steer = 1;
      const before = boat.yaw;
      stepBoat(boat, track, 1 / 60, 0, false);
      return Math.abs(boat.yaw - before);
    };
    expect(yawAt("skimmer")).toBeGreaterThan(yawAt("ironwake") * 1.08);
    expect(yawAt("ironwake")).toBeGreaterThan(yawAt("vesper") * 1.08);
  });
});
