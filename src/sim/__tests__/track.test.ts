import { describe, expect, it } from "vitest";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";
import {
  attractPose,
  buoyGateKiss,
  gridPose,
  mapShortcutToCourseT,
  queryCourse,
  resolveBank,
  respawnPose,
  showcasePose,
} from "../Track";
import { hullOverlap, pairKey, resolveHulls, resetRamTable, type CrushEvent } from "../Collision";
import { createBoat } from "../Boat";
import { stepBoat } from "../BoatController";
import { RAM_BOOST, RAM_SIPHON, RAM_SIPHON_SUPER } from "../constants";
import { wrapAngle } from "../math";

describe("track", () => {
  it("builds a closed main ribbon with a shortcut", () => {
    const track = buildRiptideRefinery();
    expect(track.main.totalLength).toBeGreaterThan(400);
    expect(track.shortcut.totalLength).toBeGreaterThan(20);
    expect(track.pickups.some((p) => p.kind === "super")).toBe(true);
    expect(track.crates.length).toBe(7);
    expect(track.crates.filter((c) => c.kind === "crusher")).toHaveLength(1);
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

  it("keeps a floor of forward speed on a fast bank scrape", () => {
    const track = buildRiptideRefinery();
    const f = track.main.getFrameAtT(0.1);
    const lat = f.width * 0.5 + 3;
    const q = queryCourse(track, f.x + f.rx * lat, f.y, f.z + f.rz * lat);
    const incoming = 28;
    const vx = f.tx * incoming + f.rx * 7;
    const vz = f.tz * incoming + f.rz * 7;
    const hit = resolveBank(q, f.x + f.rx * lat, f.z + f.rz * lat, vx, vz);
    expect(hit.hit).toBe(true);
    expect(Math.hypot(hit.vx, hit.vz)).toBeGreaterThan(incoming * 0.7);
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

  it("closes the loop without a bank wall across the canal", () => {
    const track = buildRiptideRefinery();
    let maxJump = 0;
    let prev = track.main.getFrameAtT(0.94);
    for (let i = 1; i <= 80; i++) {
      const t = 0.94 + (i / 80) * 0.06;
      const f = track.main.getFrameAtT(t >= 1 ? t - 1 : t);
      const jump = Math.abs(wrapAngle(Math.atan2(f.tx, f.tz) - Math.atan2(prev.tx, prev.tz)));
      maxJump = Math.max(maxJump, jump);
      prev = f;
    }
    expect(maxJump).toBeLessThan(0.55);
  });

  it("parks the title attract hull on the canal center", () => {
    const track = buildRiptideRefinery();
    const host = attractPose(track, 0);
    const q = queryCourse(track, host.x, host.y, host.z, host.t);
    expect(q.onRibbon).toBe(true);
    expect(Math.abs(q.lateral)).toBeLessThan(2);
  });

  it("parks the hull-select pose in the canal center", () => {
    const track = buildRiptideRefinery();
    const pose = showcasePose(track);
    const q = queryCourse(track, pose.x, pose.y, pose.z);
    expect(q.onRibbon).toBe(true);
    expect(Math.abs(q.lateral)).toBeLessThan(2);
  });

  it("spaces the start grid on the water, not in the banks", () => {
    const track = buildRiptideRefinery();
    const a = gridPose(track, 0);
    const b = gridPose(track, 1);
    const c = gridPose(track, 2);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(6);
    expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeGreaterThan(6);
    for (let i = 0; i < 4; i++) {
      const pose = gridPose(track, i);
      const q = queryCourse(track, pose.x, pose.y, pose.z, pose.t);
      expect(q.onRibbon).toBe(true);
      expect(Math.abs(q.lateral)).toBeLessThan(q.halfWidth - 3.5);
    }
    const behind = 17;
    const camX = a.x - Math.sin(a.yaw) * behind;
    const camZ = a.z - Math.cos(a.yaw) * behind;
    for (let i = 0; i < 4; i++) {
      const pose = gridPose(track, i);
      const along = (pose.x - camX) * Math.sin(a.yaw) + (pose.z - camZ) * Math.cos(a.yaw);
      expect(along).toBeGreaterThan(3);
    }
  });

  it("bends enough that a lap is not a highway", () => {
    const track = buildRiptideRefinery();
    let turn = 0;
    let prev = 0;
    for (let i = 0; i <= 80; i++) {
      const f = track.main.getFrameAtT(i / 80);
      const yaw = Math.atan2(f.tx, f.tz);
      if (i) turn += Math.abs(wrapAngle(yaw - prev));
      prev = yaw;
    }
    expect(turn).toBeGreaterThan(10);
  });

  it("authors harbor / mesa / neon / reef width rhythm", () => {
    const track = buildRiptideRefinery();
    expect(track.main.points.some((p) => Math.abs(p.width - 32) < 0.05)).toBe(true);
    expect(track.main.points.some((p) => Math.abs(p.width - 14) < 0.05)).toBe(true);
    expect(track.main.points.some((p) => Math.abs(p.width - 18) < 0.05)).toBe(true);
    expect(track.main.points.some((p) => Math.abs(p.width - 26) < 0.05)).toBe(true);
    expect(track.main.getFrameAtT(0.06).width).toBeGreaterThan(28);
    expect(track.main.getFrameAtT(0.06).width).toBeLessThan(36);
    const choke = track.main.getFrameAtT(0.3).width;
    expect(choke).toBeGreaterThan(11);
    expect(choke).toBeLessThan(16.5);
    const neon = track.main.getFrameAtT(0.6).width;
    expect(neon).toBeGreaterThan(16);
    expect(neon).toBeLessThan(21);
    const reef = track.main.getFrameAtT(0.84).width;
    expect(reef).toBeGreaterThan(23);
    expect(reef).toBeLessThan(29);
  });

  it("does not snap a surface boat onto the elevated shortcut", () => {
    const track = buildRiptideRefinery();
    const mid = track.shortcut.getFrameAtT(0.5);
    const q = queryCourse(track, mid.x, 0.8, mid.z, 0.3);
    expect(q.onShortcut).toBe(false);
  });

  it("queries onShortcut for a boat on the cut, not the main at the same T", () => {
    const track = buildRiptideRefinery();
    const mid = track.shortcut.getFrameAtT(0.5);
    const onCut = queryCourse(track, mid.x, mid.y + 0.8, mid.z, 0.42);
    expect(onCut.onShortcut).toBe(true);
    expect(onCut.onRibbon).toBe(true);
    expect(onCut.courseT).toBeGreaterThan(track.shortcutEnterT);
    expect(onCut.courseT).toBeLessThan(track.shortcutExitT);
    const courseT = mapShortcutToCourseT(track, 0.5);
    const main = track.main.getFrameAtT(courseT);
    const onMain = queryCourse(track, main.x, main.y + 0.8, main.z, courseT);
    expect(onMain.onShortcut).toBe(false);
    expect(onMain.onRibbon).toBe(true);
  });

  it("maps shortcut arc onto main courseT between enter and exit", () => {
    const track = buildRiptideRefinery();
    const a = track.shortcut.getFrameAtT(0.2);
    const b = track.shortcut.getFrameAtT(0.8);
    const qa = queryCourse(track, a.x, a.y + 0.8, a.z, track.shortcutEnterT);
    const qb = queryCourse(track, b.x, b.y + 0.8, b.z, track.shortcutExitT);
    expect(qa.onShortcut).toBe(true);
    expect(qb.onShortcut).toBe(true);
    expect(qb.courseT).toBeGreaterThan(qa.courseT);
    expect(qa.courseT).toBeGreaterThanOrEqual(track.shortcutEnterT - 0.02);
    expect(qb.courseT).toBeLessThanOrEqual(track.shortcutExitT + 0.02);
  });

  it("launches a full-throttle boat airborne off the mesa downslope", () => {
    const track = buildRiptideRefinery();
    expect(airTimeOnSpan(track, 0.28, 0.38)).toBeGreaterThan(0.55);
  });

  it("launches a full-throttle boat airborne off the reef drop", () => {
    const track = buildRiptideRefinery();
    expect(airTimeOnSpan(track, 0.74, 0.86)).toBeGreaterThan(0.55);
  });

  it("kisses speed when a hull splits a harbor buoy pair", () => {
    const track = buildRiptideRefinery();
    const gate = track.buoyGates[1];
    expect(gate).toBeTruthy();
    const f = track.main.getFrameAtT(gate.t);
    expect(buoyGateKiss(track, gate.t - 0.002, gate.t + 0.002, 0)).toBeGreaterThan(1);
    expect(buoyGateKiss(track, gate.t - 0.002, gate.t + 0.002, f.width * 0.4)).toBe(0);
    const boat = createBoat("p", "skimmer", false);
    const before = track.main.getFrameAtT(gate.t - 0.01);
    boat.x = before.x;
    boat.y = before.y + 0.8;
    boat.z = before.z;
    boat.yaw = Math.atan2(before.tx, before.tz);
    boat.courseT = gate.t - 0.01;
    boat.speed = 22;
    boat.throttle = 1;
    boat.vx = before.tx * 22;
    boat.vz = before.tz * 22;
    const start = boat.speed;
    for (let i = 0; i < 90; i++) {
      boat.steer = 0;
      stepBoat(boat, track, 1 / 60, i / 60, false);
      if (boat.courseT >= gate.t) break;
    }
    expect(boat.speed).toBeGreaterThan(start + 0.8);
  });

  it("plants a crate on the racing line", () => {
    const track = buildRiptideRefinery();
    const onLine = track.crates.some((c) => {
      const q = queryCourse(track, c.x, c.y, c.z);
      return q.onRibbon && Math.abs(q.lateral) < 3;
    });
    expect(onLine).toBe(true);
  });
});

function airTimeOnSpan(track: ReturnType<typeof buildRiptideRefinery>, t0: number, t1: number): number {
  const boat = createBoat("p", "skimmer", false);
  const f = track.main.getFrameAtT(t0);
  boat.x = f.x;
  boat.y = f.y + 0.8;
  boat.z = f.z;
  boat.yaw = Math.atan2(f.tx, f.tz);
  boat.courseT = t0;
  boat.speed = boat.def.maxSpeed;
  boat.throttle = 1;
  boat.vx = f.tx * boat.speed;
  boat.vz = f.tz * boat.speed;
  let maxAir = 0;
  for (let i = 0; i < 420; i++) {
    const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
    boat.yaw = Math.atan2(q.frame.tx, q.frame.tz);
    boat.steer = 0;
    boat.throttle = 1;
    stepBoat(boat, track, 1 / 60, i / 60, false);
    if (boat.airborne) maxAir = Math.max(maxAir, boat.airTime);
    if (boat.courseT > t1 && boat.courseT < 0.95) break;
  }
  return maxAir;
}

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
    a.yaw = Math.PI / 2;
    a.boostHeld = true;
    a.boostFuel = 1;
    const events = resolveHulls([a, b], 1);
    expect(events.some((e) => e.awarded)).toBe(true);
    expect(a.boostFuel).toBeGreaterThan(0);
  });

  it("does not ram unless the attacker is boosting", () => {
    resetRamTable();
    const a = createBoat("a", "ironwake", false);
    const b = createBoat("b", "skimmer", true);
    a.x = 0;
    a.z = 0;
    a.yaw = Math.PI / 2;
    a.speed = 30;
    a.vx = 20;
    a.boostHeld = false;
    a.boostFuel = 3;
    b.x = 1;
    b.z = 0;
    b.speed = 10;
    expect(resolveHulls([a, b], 1).some((e) => e.awarded)).toBe(false);
  });

  it("stable pair keys", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });

  it("lets two close boats keep forward speed", () => {
    resetRamTable();
    const a = createBoat("a", "skimmer", false);
    const b = createBoat("b", "vesper", true);
    a.x = 0;
    a.z = 0;
    a.yaw = 0;
    a.speed = 28;
    a.vx = 0;
    a.vz = 28;
    b.x = 0.4;
    b.z = 0.2;
    b.yaw = 0;
    b.speed = 27;
    b.vx = 0;
    b.vz = 27;
    resolveHulls([a, b], 1);
    expect(a.speed).toBeGreaterThan(20);
    expect(b.speed).toBeGreaterThan(18);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.5);
  });

  it("keeps visual hull boxes from nesting side-by-side", () => {
    resetRamTable();
    const a = createBoat("a", "ironwake", false);
    const b = createBoat("b", "vesper", true);
    a.x = 0;
    a.z = 0;
    a.yaw = 0;
    b.x = 1.2;
    b.z = 0.4;
    b.yaw = 0;
    expect(hullOverlap(a, b)).not.toBeNull();
    resolveHulls([a, b], 1);
    expect(hullOverlap(a, b)).toBeNull();
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(a.def.hullWidth * 0.45 + b.def.hullWidth * 0.45);
  });

  it("splits two nested hulls so their collision boxes no longer overlap", () => {
    resetRamTable();
    const a = createBoat("a", "skimmer", false);
    const b = createBoat("b", "ironwake", true);
    a.x = 0;
    a.z = 0;
    a.yaw = 0.1;
    b.x = 0.8;
    b.z = 1.2;
    b.yaw = -0.05;
    expect(hullOverlap(a, b)).not.toBeNull();
    resolveHulls([a, b], 1);
    expect(hullOverlap(a, b)).toBeNull();
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3);
  });
});

function ramPair(): { a: ReturnType<typeof createBoat>; b: ReturnType<typeof createBoat> } {
  const a = createBoat("a", "ironwake", false);
  const b = createBoat("b", "skimmer", true);
  a.x = 0;
  a.z = 0;
  b.x = 1;
  b.z = 0;
  a.speed = 30;
  b.speed = 10;
  a.vx = 20;
  a.yaw = Math.PI / 2;
  a.boostHeld = true;
  return { a, b };
}

describe("mega hull", () => {
  it("siphons defender fuel on a ram on top of RAM_BOOST", () => {
    resetRamTable();
    const { a, b } = ramPair();
    a.boostFuel = 1;
    b.boostFuel = 3;
    const beforeAtk = a.boostFuel;
    const beforeDef = b.boostFuel;
    const events = resolveHulls([a, b], 1);
    expect(events.some((e) => e.awarded)).toBe(true);
    expect(b.boostFuel).toBeCloseTo(beforeDef - RAM_SIPHON);
    expect(a.boostFuel).toBeCloseTo(beforeAtk + RAM_BOOST + RAM_SIPHON);
  });

  it("siphons more fuel during a super ram than a normal ram", () => {
    resetRamTable();
    const normal = ramPair();
    normal.a.boostFuel = 1;
    normal.b.boostFuel = 4;
    resolveHulls([normal.a, normal.b], 1);
    const stolenNormal = 4 - normal.b.boostFuel;

    resetRamTable();
    const mega = ramPair();
    mega.a.boostFuel = 1;
    mega.a.superBoostRemaining = 2;
    mega.b.boostFuel = 4;
    resolveHulls([mega.a, mega.b], 1);
    const stolenSuper = 4 - mega.b.boostFuel;
    expect(stolenNormal).toBeCloseTo(RAM_SIPHON);
    expect(stolenSuper).toBeCloseTo(RAM_SIPHON_SUPER);
    expect(stolenSuper).toBeGreaterThan(stolenNormal);
    expect(mega.a.boostFuel).toBeCloseTo(1 + RAM_BOOST + RAM_SIPHON_SUPER);
  });

  it("fires a hull-crusher shockwave then ignores a second hit for 1s", () => {
    resetRamTable();
    const a = createBoat("a", "ironwake", false);
    const b = createBoat("b", "skimmer", true);
    const far = createBoat("c", "vesper", true);
    a.crusherUntil = 7;
    a.x = 0;
    a.z = 0;
    b.x = 1.2;
    b.z = 0;
    b.speed = 20;
    b.vz = 20;
    far.x = 40;
    far.z = 40;
    far.speed = 20;
    const crushes: CrushEvent[] = [];
    resolveHulls([a, b, far], 1, crushes);
    expect(crushes).toHaveLength(1);
    expect(crushes[0].victims).toContain(b);
    expect(crushes[0].victims).not.toContain(far);
    expect(b.airborne).toBe(true);
    expect(b.speed).toBeLessThan(20);
    expect(far.airborne).toBe(false);
    expect(far.speed).toBe(20);

    a.x = 0;
    a.z = 0;
    b.x = 1.2;
    b.z = 0;
    b.airborne = false;
    b.speed = 20;
    b.vy = 0;
    const again: CrushEvent[] = [];
    resolveHulls([a, b, far], 1.2, again);
    expect(again).toHaveLength(0);
    expect(a.crusherCooldown).toBeGreaterThan(0.5);
  });
});
