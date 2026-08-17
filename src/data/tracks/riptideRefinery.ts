import {
  makeTrack,
  placeAlong,
  type CrateSlot,
  type PlacedPickup,
  type TrackWorld,
} from "../../sim/Track";
import type { ControlPoint } from "../../sim/spline";

/** Distant-t world tour: harbor → mesa → jump → neon city → reef. Never fold. */
const MAIN: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 28, bankHeight: 4.6 },
  { x: 8, y: 0, z: 220, width: 26, bankHeight: 4.8 },
  { x: 70, y: 0, z: 420, width: 22, bankHeight: 5.1 },
  { x: 40, y: 0, z: 640, width: 22, bankHeight: 5.2 },
  { x: 90, y: 0, z: 880, width: 22, bankHeight: 4.8 },
  { x: 180, y: 11.8, z: 1080, width: 22, bankHeight: 3.8 },
  { x: 360, y: 3.6, z: 1180, width: 24, bankHeight: 4.6 },
  { x: 580, y: 0, z: 1160, width: 26, bankHeight: 4.8 },
  { x: 780, y: 0, z: 980, width: 24, bankHeight: 5 },
  { x: 860, y: 0, z: 740, width: 24, bankHeight: 5 },
  { x: 880, y: 2.2, z: 500, width: 22, bankHeight: 4.2 },
  { x: 840, y: 3.2, z: 280, width: 22, bankHeight: 4.0 },
  { x: 700, y: 0, z: 120, width: 22, bankHeight: 4.4 },
  { x: 500, y: 0, z: 20, width: 22, bankHeight: 4.6 },
  { x: 280, y: 0, z: -80, width: 22, bankHeight: 4.6 },
  { x: 90, y: 0, z: -140, width: 22, bankHeight: 5 },
  { x: -40, y: 0, z: -90, width: 22, bankHeight: 5.1 },
  { x: -20, y: 0, z: -30, width: 24, bankHeight: 4.8 },
  { x: 0, y: 0, z: -14, width: 26, bankHeight: 4.6 },
];

const SHORTCUT: ControlPoint[] = [
  { x: 180, y: 12.6, z: 1080, width: 16, bankHeight: 3 },
  { x: 340, y: 13.8, z: 1120, width: 16, bankHeight: 2.6 },
  { x: 520, y: 8.2, z: 1080, width: 16, bankHeight: 2.8 },
  { x: 700, y: 1.4, z: 900, width: 18, bankHeight: 3.6 },
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
  const specs: { kind: PlacedPickup["kind"]; t: number; lat: number; y: number; cut?: boolean }[] = [
    { kind: "blue", t: 0.08, lat: -5, y: 1.4 },
    { kind: "blue", t: 0.12, lat: 4.5, y: 1.4 },
    { kind: "blue", t: 0.18, lat: -4, y: 1.4 },
    { kind: "red", t: 0.3, lat: 0, y: 1.5 },
    { kind: "blue", t: 0.34, lat: 5, y: 1.4 },
    { kind: "red", t: 0.42, lat: 0, y: 2.2, cut: true },
    { kind: "blue", t: 0.48, lat: -4, y: 1.4 },
    { kind: "blue", t: 0.55, lat: 4, y: 1.4 },
    { kind: "super", t: 0.66, lat: 0, y: 1.7 },
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
