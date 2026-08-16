import {
  makeTrack,
  placeAlong,
  type CrateSlot,
  type PlacedPickup,
  type TrackWorld,
} from "../../sim/Track";
import type { ControlPoint } from "../../sim/spline";

const MAIN: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 28, bankHeight: 4.6 },
  { x: 0, y: 0, z: 140, width: 26, bankHeight: 4.8 },
  { x: 36, y: 0, z: 230, width: 20, bankHeight: 5.2 },
  { x: -48, y: 0, z: 320, width: 20, bankHeight: 5.2 },
  { x: 18, y: 0, z: 410, width: 22, bankHeight: 4.8 },
  { x: 24, y: 0, z: 580, width: 28, bankHeight: 4.2 },
  { x: 28, y: 12.5, z: 670, width: 18, bankHeight: 3.6 },
  { x: 110, y: 4.2, z: 740, width: 22, bankHeight: 4.8 },
  { x: 250, y: 0, z: 760, width: 20, bankHeight: 5 },
  { x: 340, y: 0, z: 680, width: 20, bankHeight: 5 },
  { x: 370, y: 0, z: 540, width: 22, bankHeight: 4.6 },
  { x: 390, y: 2.4, z: 420, width: 13, bankHeight: 3.8 },
  { x: 395, y: 3.6, z: 300, width: 12, bankHeight: 3.4 },
  { x: 360, y: 0, z: 190, width: 22, bankHeight: 4.4 },
  { x: 250, y: 0, z: 80, width: 22, bankHeight: 4.6 },
  { x: 140, y: 0, z: -40, width: 22, bankHeight: 4.6 },
  { x: 40, y: 0, z: -130, width: 20, bankHeight: 5 },
  { x: -70, y: 0, z: -150, width: 18, bankHeight: 5.2 },
  { x: -110, y: 0, z: -70, width: 18, bankHeight: 5.2 },
  { x: -40, y: 0, z: -28, width: 24, bankHeight: 4.8 },
  { x: 0, y: 0, z: -16, width: 26, bankHeight: 4.6 },
];

const SHORTCUT: ControlPoint[] = [
  { x: 28, y: 13.4, z: 670, width: 12, bankHeight: 3 },
  { x: 150, y: 14.2, z: 690, width: 11, bankHeight: 2.6 },
  { x: 280, y: 8.5, z: 620, width: 12, bankHeight: 2.8 },
  { x: 360, y: 1.2, z: 560, width: 16, bankHeight: 3.6 },
];

export function buildRiptideRefinery(): TrackWorld {
  const track = makeTrack(MAIN, SHORTCUT);
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
