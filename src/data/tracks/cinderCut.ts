import {
  makeTrack,
  placeAlong,
  type CrateSlot,
  type PlacedPickup,
  type TrackWorld,
} from "../../sim/Track";
import type { ControlPoint } from "../../sim/spline";

/** Original canyon loop far SE — not stacked on Riptide or Frost. */
const MAIN: ControlPoint[] = [
  { x: 1400, y: 0, z: -400, width: 26, bankHeight: 4.6 },
  { x: 1580, y: 0, z: -220, width: 24, bankHeight: 4.8 },
  { x: 1720, y: 0, z: 40, width: 22, bankHeight: 5 },
  { x: 1780, y: 8.5, z: 280, width: 16, bankHeight: 3.6 },
  { x: 1680, y: 2, z: 520, width: 22, bankHeight: 4.8 },
  { x: 1460, y: 0, z: 640, width: 24, bankHeight: 4.8 },
  { x: 1220, y: 0, z: 580, width: 20, bankHeight: 5 },
  { x: 1100, y: 3.2, z: 340, width: 13, bankHeight: 3.5 },
  { x: 1160, y: 0, z: 80, width: 20, bankHeight: 4.6 },
  { x: 1280, y: 0, z: -180, width: 22, bankHeight: 4.6 },
  { x: 1360, y: 0, z: -380, width: 24, bankHeight: 4.5 },
];

const SHORTCUT: ControlPoint[] = [
  { x: 1780, y: 9.2, z: 280, width: 11, bankHeight: 2.8 },
  { x: 1720, y: 11, z: 400, width: 10, bankHeight: 2.5 },
  { x: 1580, y: 5, z: 560, width: 12, bankHeight: 2.8 },
  { x: 1400, y: 0.6, z: 620, width: 16, bankHeight: 3.4 },
];

export function buildCinderCut(): TrackWorld {
  const track = makeTrack(MAIN, SHORTCUT);
  track.id = "cinder";
  track.name = "Cinder Cut";
  track.sectors = [
    { until: 0.3, name: "WASH" },
    { until: 0.55, name: "RIM" },
    { until: 0.82, name: "CHOKE" },
    { until: 1, name: "WASH" },
  ];
  track.pickups = placePickups(track);
  track.crates = placeCrates(track);
  return track;
}

function placePickups(track: TrackWorld): PlacedPickup[] {
  const specs: { kind: PlacedPickup["kind"]; t: number; lat: number; y: number; cut?: boolean }[] = [
    { kind: "blue", t: 0.08, lat: -4, y: 1.4 },
    { kind: "blue", t: 0.16, lat: 4, y: 1.4 },
    { kind: "red", t: 0.28, lat: 0, y: 1.6 },
    { kind: "blue", t: 0.4, lat: -5, y: 1.4 },
    { kind: "red", t: 0.48, lat: 0, y: 2, cut: true },
    { kind: "super", t: 0.66, lat: 0, y: 1.7 },
    { kind: "blue", t: 0.8, lat: 3, y: 1.4 },
    { kind: "red", t: 0.9, lat: -3, y: 1.5 },
  ];
  return specs.map((s, i) => {
    const p = placeAlong(s.cut ? track.shortcut : track.main, s.t, s.lat, s.y);
    return { id: `kp${i}`, kind: s.kind, ...p, taken: 0 };
  });
}

function placeCrates(track: TrackWorld): CrateSlot[] {
  const slots = [
    { t: 0.74, lat: 7 },
    { t: 0.76, lat: 8 },
    { t: 0.78, lat: 7.2 },
  ];
  return slots.map((s, i) => {
    const p = placeAlong(track.main, s.t, s.lat, 1.4);
    return { id: `kc${i}`, ...p, kind: i % 2 === 0 ? "boost" : "mine", taken: 0 };
  });
}
