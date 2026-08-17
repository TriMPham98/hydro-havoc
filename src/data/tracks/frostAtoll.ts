import {
  makeTrack,
  placeAlong,
  type CrateSlot,
  type PlacedPickup,
  type TrackWorld,
} from "../../sim/Track";
import type { ControlPoint } from "../../sim/spline";

/** Original ice-lagoon loop west of origin — never stacked on Riptide. */
const MAIN: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 26, bankHeight: 4.4 },
  { x: -200, y: 0, z: 90, width: 24, bankHeight: 4.6 },
  { x: -420, y: 0, z: 240, width: 22, bankHeight: 5 },
  { x: -560, y: 1.2, z: 460, width: 18, bankHeight: 4.4 },
  { x: -620, y: 10.5, z: 700, width: 16, bankHeight: 3.4 },
  { x: -500, y: 2.4, z: 920, width: 22, bankHeight: 4.8 },
  { x: -280, y: 0, z: 1040, width: 24, bankHeight: 4.8 },
  { x: -40, y: 0, z: 1000, width: 22, bankHeight: 5 },
  { x: 160, y: 0, z: 820, width: 20, bankHeight: 5 },
  { x: 240, y: 2.8, z: 560, width: 13, bankHeight: 3.5 },
  { x: 200, y: 0, z: 300, width: 20, bankHeight: 4.6 },
  { x: 80, y: 0, z: 80, width: 22, bankHeight: 4.6 },
  { x: 10, y: 0, z: -12, width: 24, bankHeight: 4.4 },
];

const SHORTCUT: ControlPoint[] = [
  { x: -620, y: 11.2, z: 700, width: 11, bankHeight: 2.8 },
  { x: -540, y: 12.4, z: 840, width: 10, bankHeight: 2.5 },
  { x: -360, y: 6, z: 980, width: 12, bankHeight: 2.8 },
  { x: -160, y: 0.8, z: 1020, width: 16, bankHeight: 3.4 },
];

export function buildFrostAtoll(): TrackWorld {
  const track = makeTrack(MAIN, SHORTCUT);
  track.id = "frost";
  track.name = "Frost Atoll";
  track.sectors = [
    { until: 0.28, name: "FLOE" },
    { until: 0.52, name: "JUMP" },
    { until: 0.78, name: "Fjord" },
    { until: 1, name: "FLOE" },
  ];
  track.pickups = placePickups(track);
  track.crates = placeCrates(track);
  return track;
}

function placePickups(track: TrackWorld): PlacedPickup[] {
  const specs: { kind: PlacedPickup["kind"]; t: number; lat: number; y: number; cut?: boolean }[] = [
    { kind: "blue", t: 0.1, lat: -4, y: 1.4 },
    { kind: "blue", t: 0.18, lat: 4, y: 1.4 },
    { kind: "red", t: 0.32, lat: 0, y: 1.6 },
    { kind: "blue", t: 0.4, lat: -5, y: 1.4 },
    { kind: "red", t: 0.48, lat: 0, y: 2, cut: true },
    { kind: "blue", t: 0.58, lat: 4, y: 1.4 },
    { kind: "super", t: 0.7, lat: 0, y: 1.7 },
    { kind: "blue", t: 0.84, lat: -3, y: 1.4 },
    { kind: "red", t: 0.92, lat: 3, y: 1.5 },
  ];
  return specs.map((s, i) => {
    const p = placeAlong(s.cut ? track.shortcut : track.main, s.t, s.lat, s.y);
    return { id: `fp${i}`, kind: s.kind, ...p, taken: 0 };
  });
}

function placeCrates(track: TrackWorld): CrateSlot[] {
  const slots = [
    { t: 0.76, lat: 7 },
    { t: 0.78, lat: 8 },
    { t: 0.8, lat: 7.4 },
  ];
  return slots.map((s, i) => {
    const p = placeAlong(track.main, s.t, s.lat, 1.4);
    return { id: `fc${i}`, ...p, kind: i % 2 === 0 ? "boost" : "mine", taken: 0 };
  });
}
