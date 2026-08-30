import {
  makeTrack,
  placeAlong,
  type BuoyGate,
  type CrateKind,
  type CrateSlot,
  type PlacedPickup,
  type TrackWorld,
} from "../../sim/Track";
import type { ControlPoint } from "../../sim/spline";

/** Distant-t world tour: harbor basin → mesa jump / cut → neon vault → reef drop. Never fold. */
const MAIN: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 32, bankHeight: 4.4 },
  { x: 38, y: 0, z: 170, width: 32, bankHeight: 4.6 },
  { x: -44, y: 0, z: 340, width: 30, bankHeight: 4.8 },
  { x: 72, y: 0, z: 510, width: 28, bankHeight: 5.0 },
  { x: -28, y: 0, z: 670, width: 24, bankHeight: 5.1 },
  { x: 96, y: 0, z: 830, width: 18, bankHeight: 4.6 },
  { x: 36, y: 1.2, z: 950, width: 16, bankHeight: 3.6 },
  { x: 149, y: 2.0, z: 1039, width: 15, bankHeight: 3.2 },
  { x: 190, y: 3.0, z: 1070, width: 14, bankHeight: 2.8 },
  { x: 200, y: 11.0, z: 1078, width: 14, bankHeight: 2.6 },
  { x: 208, y: 15.6, z: 1085, width: 14, bankHeight: 2.4 },
  { x: 216, y: 16.2, z: 1092, width: 14, bankHeight: 2.4 },
  { x: 226, y: 16.0, z: 1100, width: 14, bankHeight: 2.4 },
  { x: 236, y: 7.0, z: 1108, width: 16, bankHeight: 3.2 },
  { x: 250, y: 0.2, z: 1118, width: 18, bankHeight: 4.0 },
  { x: 280, y: 0, z: 1136, width: 18, bankHeight: 4.4 },
  { x: 430, y: 0, z: 1170, width: 20, bankHeight: 4.6 },
  { x: 640, y: 0, z: 1048, width: 20, bankHeight: 4.8 },
  { x: 808, y: 0, z: 880, width: 18, bankHeight: 5.0 },
  { x: 688, y: 0, z: 700, width: 18, bankHeight: 5.0 },
  { x: 918, y: 0.6, z: 530, width: 18, bankHeight: 4.4 },
  { x: 742, y: 0.8, z: 350, width: 18, bankHeight: 4.2 },
  { x: 930, y: 0, z: 170, width: 24, bankHeight: 4.4 },
  { x: 860, y: 0.6, z: 128, width: 26, bankHeight: 4.2 },
  { x: 818, y: 2.0, z: 103, width: 26, bankHeight: 3.6 },
  { x: 796, y: 9.6, z: 93, width: 24, bankHeight: 2.8 },
  { x: 787, y: 14.8, z: 89, width: 22, bankHeight: 2.4 },
  { x: 782, y: 15.2, z: 86, width: 22, bankHeight: 2.4 },
  { x: 775, y: 6.4, z: 82, width: 24, bankHeight: 3.2 },
  { x: 762, y: 0.3, z: 76, width: 26, bankHeight: 4.0 },
  { x: 610, y: 0, z: 16, width: 26, bankHeight: 4.6 },
  { x: 348, y: 0, z: -150, width: 26, bankHeight: 4.6 },
  { x: 140, y: 0, z: -100, width: 26, bankHeight: 4.6 },
  { x: 40, y: 0, z: -85, width: 28, bankHeight: 4.6 },
  { x: -6, y: 0, z: -52, width: 30, bankHeight: 4.5 },
  { x: -8, y: 0, z: -28, width: 32, bankHeight: 4.4 },
];

/** Higher, narrower canal peeling off the mesa lip. */
const SHORTCUT: ControlPoint[] = [
  { x: 220, y: 16.4, z: 1104, width: 12, bankHeight: 2.4 },
  { x: 255, y: 16.8, z: 1158, width: 11, bankHeight: 2.2 },
  { x: 370, y: 16.4, z: 1218, width: 11, bankHeight: 2.2 },
  { x: 510, y: 13.2, z: 1190, width: 12, bankHeight: 2.4 },
  { x: 600, y: 7.2, z: 1110, width: 13, bankHeight: 2.6 },
  { x: 700, y: 2.4, z: 1010, width: 15, bankHeight: 3.0 },
  { x: 761, y: 0.4, z: 944, width: 16, bankHeight: 3.2 },
];

export function buildRiptideRefinery(): TrackWorld {
  const track = makeTrack(MAIN, SHORTCUT);
  track.id = "riptide";
  track.name = "Riptide Refinery";
  track.sectors = [
    { until: 0.22, name: "HARBOR" },
    { until: 0.42, name: "MESA" },
    { until: 0.68, name: "NEON" },
    { until: 0.92, name: "REEF" },
    { until: 1, name: "HARBOR" },
  ];
  track.pickups = placePickups(track);
  track.crates = placeCrates(track);
  track.buoyGates = placeBuoyGates();
  track.slowBands = [
    { t0: 0.33, t1: 0.41, minAbsLat: 2.8, drag: 7 },
    { t0: 0.48, t1: 0.54, minAbsLat: 5.6, drag: 8 },
  ];
  return track;
}

function placePickups(track: TrackWorld): PlacedPickup[] {
  const specs: { kind: PlacedPickup["kind"]; t: number; lat: number; y: number; cut?: boolean }[] = [
    { kind: "blue", t: 0.08, lat: -5, y: 1.4 },
    { kind: "blue", t: 0.12, lat: 4.5, y: 1.4 },
    { kind: "blue", t: 0.18, lat: -4, y: 1.4 },
    { kind: "super", t: 0.08, lat: 0, y: 8.0, cut: true },
    { kind: "blue", t: 0.34, lat: 5, y: 1.4 },
    { kind: "red", t: 0.42, lat: 0, y: 2.2 },
    { kind: "blue", t: 0.48, lat: -4, y: 1.4 },
    { kind: "blue", t: 0.55, lat: 4, y: 1.4 },
    { kind: "red", t: 0.66, lat: 0, y: 1.7 },
    { kind: "red", t: 0.78, lat: -2, y: 1.5 },
    { kind: "blue", t: 0.88, lat: 4, y: 1.4 },
    { kind: "blue", t: 0.94, lat: -3.5, y: 1.4 },
  ];
  return specs.map((s, i) => {
    const p = placeAlong(s.cut ? track.shortcut : track.main, s.t, s.lat, s.y);
    return { id: `p${i}`, kind: s.kind, ...p, taken: 0 };
  });
}

function placeCrates(track: TrackWorld): CrateSlot[] {
  const slots: { t: number; lat: number; kind: CrateKind }[] = [
    { t: 0.1, lat: 0, kind: "boost" },
    { t: 0.16, lat: -1.2, kind: "boost" },
    { t: 0.21, lat: 1.5, kind: "mine" },
    { t: 0.38, lat: 0, kind: "crusher" },
    { t: 0.73, lat: 0, kind: "boost" },
    { t: 0.8, lat: -1.1, kind: "mine" },
    { t: 0.87, lat: 1.0, kind: "boost" },
  ];
  return slots.map((s, i) => {
    const p = placeAlong(track.main, s.t, s.lat, 1.4);
    return {
      id: `c${i}`,
      ...p,
      kind: s.kind,
      taken: 0,
      vx: 0,
      vz: 0,
    };
  });
}

function placeBuoyGates(): BuoyGate[] {
  return [
    { t: 0.036, gap: 10 },
    { t: 0.058, gap: 10 },
    { t: 0.082, gap: 10 },
  ];
}

export function rollCrateKinds(track: TrackWorld, rng: () => number = Math.random): void {
  const pinned = track.crates.find((c) => c.kind === "crusher");
  const crusher = pinned ?? track.crates[Math.floor(rng() * Math.max(1, track.crates.length))];
  for (const crate of track.crates) {
    crate.taken = 0;
    crate.vx = 0;
    crate.vz = 0;
    crate.kind = crate === crusher ? "crusher" : rng() < 0.55 ? "boost" : "mine";
  }
}
