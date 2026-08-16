export type BoatId = "skimmer" | "ironwake" | "vesper";

export interface BoatDef {
  id: BoatId;
  name: string;
  role: string;
  blurb: string;
  accel: number;
  maxSpeed: number;
  boostMaxSpeed: number;
  superBoostMaxSpeed: number;
  turnRate: number;
  grip: number;
  mass: number;
  jumpForce: number;
  hullLength: number;
  hullWidth: number;
  color: number;
  accent: number;
  cabin: number;
}

export const BOATS: BoatDef[] = [
  {
    id: "skimmer",
    name: "Skimmer",
    role: "Easy",
    blurb: "Snappy and forgiving. Learn the canal on this hull.",
    accel: 34,
    maxSpeed: 36,
    boostMaxSpeed: 54,
    superBoostMaxSpeed: 72,
    turnRate: 2.55,
    grip: 9.2,
    mass: 1,
    jumpForce: 18,
    hullLength: 5.4,
    hullWidth: 2.3,
    color: 0x1bb8c9,
    accent: 0xe7fbff,
    cabin: 0x08222a,
  },
  {
    id: "ironwake",
    name: "Ironwake",
    role: "Medium",
    blurb: "Heavy hull. Ramming is the point.",
    accel: 30,
    maxSpeed: 39,
    boostMaxSpeed: 58,
    superBoostMaxSpeed: 76,
    turnRate: 2.15,
    grip: 8.1,
    mass: 1.35,
    jumpForce: 16.5,
    hullLength: 6.2,
    hullWidth: 2.6,
    color: 0xc45a1a,
    accent: 0xffb020,
    cabin: 0x2a1208,
  },
  {
    id: "vesper",
    name: "Vesper",
    role: "Hard",
    blurb: "Long, twitchy, and the fastest thing in the flume.",
    accel: 28,
    maxSpeed: 43,
    boostMaxSpeed: 64,
    superBoostMaxSpeed: 84,
    turnRate: 1.85,
    grip: 6.6,
    mass: 0.92,
    jumpForce: 19.5,
    hullLength: 7.1,
    hullWidth: 2.05,
    color: 0x6b3cff,
    accent: 0xff3d6e,
    cabin: 0x12081c,
  },
];

export function boatById(id: BoatId): BoatDef {
  const found = BOATS.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown boat ${id}`);
  return found;
}

export function statBars(def: BoatDef): { label: string; value: number }[] {
  return [
    { label: "Speed", value: def.maxSpeed / 45 },
    { label: "Boost", value: def.boostMaxSpeed / 68 },
    { label: "Turn", value: def.turnRate / 2.7 },
    { label: "Hull", value: def.mass / 1.4 },
  ];
}
