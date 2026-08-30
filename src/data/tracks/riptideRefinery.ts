import {
  makeTrack,
  placeAlong,
  type CrateSlot,
  type PlacedPickup,
  type TrackWorld,
} from "../../sim/Track";
import type { ControlPoint } from "../../sim/spline";

/** Distant-t world tour: harbor esses → mesa jump → neon chicane → reef hook. Never fold. */
const MAIN: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 28, bankHeight: 4.6 },
  { x: 38, y: 0, z: 170, width: 24, bankHeight: 4.8 },
  { x: -44, y: 0, z: 340, width: 22, bankHeight: 5.0 },
  { x: 72, y: 0, z: 510, width: 22, bankHeight: 5.1 },
  { x: -28, y: 0, z: 670, width: 22, bankHeight: 5.2 },
  { x: 96, y: 0, z: 830, width: 22, bankHeight: 4.8 },
  { x: 36, y: 8.4, z: 950, width: 22, bankHeight: 3.8 },
  { x: 210, y: 12.2, z: 1088, width: 22, bankHeight: 3.6 },
  { x: 430, y: 4.2, z: 1170, width: 24, bankHeight: 4.6 },
  { x: 640, y: 0, z: 1048, width: 24, bankHeight: 4.8 },
  { x: 808, y: 0, z: 880, width: 22, bankHeight: 5.0 },
  { x: 688, y: 0, z: 700, width: 22, bankHeight: 5.0 },
  { x: 918, y: 2.0, z: 530, width: 22, bankHeight: 4.2 },
  { x: 742, y: 3.1, z: 350, width: 22, bankHeight: 4.0 },
  { x: 930, y: 0, z: 170, width: 22, bankHeight: 4.4 },
  { x: 610, y: 0, z: 16, width: 22, bankHeight: 4.6 },
  { x: 348, y: 0, z: -150, width: 22, bankHeight: 4.6 },
  { x: 84, y: 0, z: -86, width: 22, bankHeight: 5.0 },
  { x: -28, y: 0, z: -22, width: 24, bankHeight: 4.8 },
  { x: 0, y: 0, z: -14, width: 26, bankHeight: 4.6 },
];

/** Parked hidden cut — spline kept, not meshed or queried. */
const SHORTCUT: ControlPoint[] = [
  { x: 210, y: 12.8, z: 1088, width: 16, bankHeight: 3 },
  { x: 400, y: 14.0, z: 1155, width: 16, bankHeight: 2.6 },
  { x: 575, y: 8.0, z: 1070, width: 16, bankHeight: 2.8 },
  { x: 730, y: 1.4, z: 890, width: 18, bankHeight: 3.6 },
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
  return track;
}

function placePickups(track: TrackWorld): PlacedPickup[] {
  const specs: { kind: PlacedPickup["kind"]; t: number; lat: number; y: number }[] = [
    { kind: "blue", t: 0.08, lat: -5, y: 1.4 },
    { kind: "blue", t: 0.12, lat: 4.5, y: 1.4 },
    { kind: "blue", t: 0.18, lat: -4, y: 1.4 },
    { kind: "red", t: 0.3, lat: 0, y: 1.5 },
    { kind: "blue", t: 0.34, lat: 5, y: 1.4 },
    { kind: "red", t: 0.42, lat: 0, y: 2.2 },
    { kind: "blue", t: 0.48, lat: -4, y: 1.4 },
    { kind: "blue", t: 0.55, lat: 4, y: 1.4 },
    { kind: "super", t: 0.66, lat: 0, y: 1.7 },
    { kind: "red", t: 0.78, lat: -2, y: 1.5 },
    { kind: "blue", t: 0.88, lat: 4, y: 1.4 },
    { kind: "blue", t: 0.94, lat: -3.5, y: 1.4 },
  ];
  return specs.map((s, i) => {
    const p = placeAlong(track.main, s.t, s.lat, s.y);
    return { id: `p${i}`, kind: s.kind, ...p, taken: 0 };
  });
}

function placeCrates(track: TrackWorld): CrateSlot[] {
  const slots = [
    { t: 0.8, lat: 8 },
    { t: 0.815, lat: 9 },
    { t: 0.83, lat: 8.2 },
    { t: 0.845, lat: 9.2 },
  ];
  return slots.map((s, i) => {
    const p = placeAlong(track.main, s.t, s.lat, 1.4);
    return {
      id: `c${i}`,
      ...p,
      kind: i % 2 === 0 ? "boost" : "mine",
      taken: 0,
    };
  });
}

export function rollCrateKinds(track: TrackWorld, rng: () => number = Math.random): void {
  for (const crate of track.crates) {
    crate.kind = rng() < 0.55 ? "boost" : "mine";
    crate.taken = 0;
  }
}
