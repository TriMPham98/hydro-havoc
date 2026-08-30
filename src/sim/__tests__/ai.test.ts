import { describe, expect, it } from "vitest";
import { copyPose, createBoat } from "../Boat";
import { assignAIBoats, driveAI } from "../AIRacer";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";
import { stepBoat } from "../BoatController";
import { gridPose, queryCourse } from "../Track";

describe("AI theater", () => {
  it("drafts harder when stacked just behind the player", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", true);
    const ai = createBoat("a", "ironwake", false);
    const start = track.main.getFrameAtT(0.2);
    player.x = start.x;
    player.z = start.z;
    player.courseT = 0.2;
    player.lap = 0;
    const back = track.main.getFrameAtT(0.185);
    ai.x = back.x;
    ai.z = back.z;
    ai.courseT = 0.185;
    ai.lap = 0;
    ai.speed = 18;
    ai.boostFuel = 1;
    driveAI(ai, track, player, true);
    expect(ai.throttle).toBeGreaterThan(0.95);
    expect(ai.steer).toBeGreaterThan(-1);
  });

  it("still steers when a rival is stacked close", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", true);
    const ai = createBoat("a", "ironwake", false);
    const f = track.main.getFrameAtT(0.3);
    player.x = f.x;
    player.z = f.z;
    player.courseT = 0.3;
    ai.x = f.x + f.rx * 4;
    ai.z = f.z + f.rz * 4;
    ai.courseT = 0.3;
    ai.speed = 22;
    player.speed = 20;
    ai.yaw = Math.atan2(f.tx, f.tz);
    driveAI(ai, track, player, true, [player, ai]);
    expect(ai.throttle).toBeGreaterThan(0.6);
    expect(Math.abs(ai.steer)).toBeGreaterThan(0);
  });

  it("demo style cruises the main canal without boost or bank hits", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("demo", "skimmer", true);
    const pose = gridPose(track, 0);
    copyPose(boat, pose);
    boat.courseT = pose.t;
    boat.speed = 22;
    boat.vx = Math.sin(boat.yaw) * 22;
    boat.vz = Math.cos(boat.yaw) * 22;
    let hits = 0;
    for (let i = 0; i < 240; i++) {
      driveAI(boat, track, boat, true, [boat], "demo");
      expect(boat.boostHeld).toBe(false);
      const step = stepBoat(boat, track, 1 / 60, i / 60, false);
      if (step.bankHit) hits++;
    }
    const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
    expect(q.onRibbon).toBe(true);
    expect(q.onShortcut).toBe(false);
    expect(Math.abs(q.lateral)).toBeLessThan(q.halfWidth - 2);
    expect(hits).toBeLessThan(8);
    expect(boat.courseT).toBeGreaterThan(pose.t + 0.02);
  });

  it("demo pack stays on the ribbon in split lanes", () => {
    const track = buildRiptideRefinery();
    const hulls = ["skimmer", "ironwake", "vesper", "skimmer"] as const;
    const pack = hulls.map((id, i) => createBoat(i === 0 ? "player" : `ai${i - 1}`, id, i !== 0));
    pack.forEach((boat, i) => {
      const pose = gridPose(track, i);
      copyPose(boat, pose);
      boat.courseT = pose.t;
      boat.speed = 22;
      boat.vx = Math.sin(boat.yaw) * 22;
      boat.vz = Math.cos(boat.yaw) * 22;
    });
    let hits = 0;
    for (let i = 0; i < 200; i++) {
      for (const boat of pack) {
        driveAI(boat, track, pack[0], true, pack, "demo");
        expect(boat.boostHeld).toBe(false);
        const step = stepBoat(boat, track, 1 / 60, i / 60, false);
        if (step.bankHit) hits++;
      }
    }
    const laterals = pack.map((boat) => {
      const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
      expect(q.onRibbon).toBe(true);
      expect(q.onShortcut).toBe(false);
      expect(Math.abs(q.lateral)).toBeLessThan(q.halfWidth - 1.5);
      return q.lateral;
    });
    expect(Math.max(...laterals) - Math.min(...laterals)).toBeGreaterThan(1.4);
    expect(hits).toBeLessThan(24);
  });

  it("fills the field with the other two hulls, not a triple copy", () => {
    const ids = assignAIBoats("skimmer");
    expect(ids).toHaveLength(3);
    expect(ids.includes("ironwake")).toBe(true);
    expect(ids.includes("vesper")).toBe(true);
    expect(ids.every((id) => id !== "skimmer")).toBe(true);
    expect(ids.filter((id) => id === ids[ids.length - 1]).length).toBeLessThan(3);
  });

  it("skimmer brakes earlier than vesper in the mesa band", () => {
    const track = buildRiptideRefinery();
    const f = track.main.getFrameAtT(0.3);
    const pose = (id: "skimmer" | "vesper") => {
      const boat = createBoat(id, id, true);
      boat.x = f.x;
      boat.y = f.y + 0.8;
      boat.z = f.z;
      boat.yaw = Math.atan2(f.tx, f.tz);
      boat.courseT = 0.3;
      boat.speed = 28;
      boat.lap = 1;
      return boat;
    };
    const player = pose("skimmer");
    player.ai = false;
    const skimmer = pose("skimmer");
    const vesper = pose("vesper");
    driveAI(skimmer, track, player, true, [player, skimmer]);
    driveAI(vesper, track, player, true, [player, vesper]);
    expect(skimmer.brake).toBeGreaterThan(vesper.brake);
    expect(skimmer.throttle).toBeLessThanOrEqual(vesper.throttle + 0.02);
  });

  it("closes a gap when behind without towing a nearby leader", () => {
    const track = buildRiptideRefinery();
    const f = track.main.getFrameAtT(0.18);
    const player = createBoat("p", "skimmer", false);
    player.x = f.x;
    player.z = f.z;
    player.courseT = 0.18;
    player.lap = 1;
    const chase = createBoat("a", "ironwake", true);
    const back = track.main.getFrameAtT(0.12);
    chase.x = back.x;
    chase.z = back.z;
    chase.courseT = 0.12;
    chase.lap = 1;
    chase.speed = 20;
    chase.yaw = Math.atan2(back.tx, back.tz);
    driveAI(chase, track, player, true, [player, chase]);
    expect(chase.throttle).toBeGreaterThan(1);

    const lead = createBoat("b", "ironwake", true);
    const ahead = track.main.getFrameAtT(0.195);
    lead.x = ahead.x;
    lead.z = ahead.z;
    lead.courseT = 0.195;
    lead.lap = 1;
    lead.speed = 22;
    lead.yaw = Math.atan2(ahead.tx, ahead.tz);
    driveAI(lead, track, player, true, [player, lead]);
    expect(lead.throttle).toBeGreaterThan(0.9);
    expect(lead.throttle).toBeLessThanOrEqual(1);
  });
});
