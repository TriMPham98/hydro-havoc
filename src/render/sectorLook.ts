import { lerp, wrap01 } from "../sim/math";

export type SectorId = "HARBOR" | "MESA" | "NEON" | "REEF";

/** Riptide bands: harbor <0.22 or >0.92, mesa 0.22–0.42, neon 0.42–0.68, reef 0.68–0.92. */
export const DEFAULT_SECTORS: { until: number; name: SectorId }[] = [
  { until: 0.22, name: "HARBOR" },
  { until: 0.42, name: "MESA" },
  { until: 0.68, name: "NEON" },
  { until: 0.92, name: "REEF" },
  { until: 1, name: "HARBOR" },
];

const BLEND = 0.045;

export type SectorLook = {
  id: SectorId;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  sunColor: number;
  sunInt: number;
  fillColor: number;
  fillInt: number;
  rimColor: number;
  rimInt: number;
  ambColor: number;
  ambInt: number;
  exposure: number;
  bloom: number;
  horizon: number;
  zenith: number;
  nadir: number;
  waterDeep: number;
  waterShallow: number;
  waterSky: number;
  hazeFar: number;
  hazeLow: number;
  hazeFarOp: number;
  hazeLowOp: number;
};

const LOOKS: Record<SectorId, SectorLook> = {
  HARBOR: {
    id: "HARBOR",
    fog: 0x8ab0c4,
    fogNear: 120,
    fogFar: 780,
    hemiSky: 0xffe2c0,
    hemiGround: 0x1a3040,
    hemiInt: 1.12,
    sunColor: 0xffd4a0,
    sunInt: 1.85,
    fillColor: 0x8ec8d8,
    fillInt: 0.95,
    rimColor: 0xffc878,
    rimInt: 0.5,
    ambColor: 0x6a8894,
    ambInt: 0.55,
    exposure: 1.16,
    bloom: 0.2,
    horizon: 0xe8b888,
    zenith: 0x3a6a9a,
    nadir: 0x1a2430,
    waterDeep: 0x042a38,
    waterShallow: 0x0b6170,
    waterSky: 0xead2a8,
    hazeFar: 0xc49a72,
    hazeLow: 0x8ab0c4,
    hazeFarOp: 0.038,
    hazeLowOp: 0.032,
  },
  MESA: {
    id: "MESA",
    fog: 0xc4a070,
    fogNear: 88,
    fogFar: 560,
    hemiSky: 0xffd4a8,
    hemiGround: 0x3a2414,
    hemiInt: 1.05,
    sunColor: 0xffb060,
    sunInt: 2.05,
    fillColor: 0xd8b080,
    fillInt: 0.72,
    rimColor: 0xffa050,
    rimInt: 0.62,
    ambColor: 0x8a6a50,
    ambInt: 0.62,
    exposure: 1.22,
    bloom: 0.18,
    horizon: 0xf0a060,
    zenith: 0x6a5040,
    nadir: 0x2a1c10,
    waterDeep: 0x1a2820,
    waterShallow: 0x3a5840,
    waterSky: 0xe8c090,
    hazeFar: 0xd4a060,
    hazeLow: 0xc4a078,
    hazeFarOp: 0.07,
    hazeLowOp: 0.055,
  },
  NEON: {
    id: "NEON",
    fog: 0x14182c,
    fogNear: 55,
    fogFar: 380,
    hemiSky: 0x6080ff,
    hemiGround: 0x080c18,
    hemiInt: 0.78,
    sunColor: 0x8090ff,
    sunInt: 0.72,
    fillColor: 0xff3da8,
    fillInt: 1.15,
    rimColor: 0x40f0ff,
    rimInt: 1.05,
    ambColor: 0x283060,
    ambInt: 0.48,
    exposure: 0.98,
    bloom: 0.3,
    horizon: 0x3a1868,
    zenith: 0x0a1028,
    nadir: 0x05070e,
    waterDeep: 0x040818,
    waterShallow: 0x142848,
    waterSky: 0x6a80ff,
    hazeFar: 0x4a2080,
    hazeLow: 0x1a2040,
    hazeFarOp: 0.08,
    hazeLowOp: 0.06,
  },
  REEF: {
    id: "REEF",
    fog: 0x7eccc4,
    fogNear: 150,
    fogFar: 980,
    hemiSky: 0xd0fff0,
    hemiGround: 0x0a3030,
    hemiInt: 1.18,
    sunColor: 0xe8ffe8,
    sunInt: 1.7,
    fillColor: 0x60e0d0,
    fillInt: 1.05,
    rimColor: 0xa0ffe0,
    rimInt: 0.55,
    ambColor: 0x4a8890,
    ambInt: 0.58,
    exposure: 1.2,
    bloom: 0.17,
    horizon: 0x80d8c8,
    zenith: 0x1a6878,
    nadir: 0x0a2430,
    waterDeep: 0x033c38,
    waterShallow: 0x0a8878,
    waterSky: 0xb8f0e8,
    hazeFar: 0x50c0b0,
    hazeLow: 0x6ec8c0,
    hazeFarOp: 0.025,
    hazeLowOp: 0.022,
  },
};

function asSectorId(name: string): SectorId | null {
  const n = name.trim().toUpperCase();
  if (n === "HARBOR" || n === "MESA" || n === "NEON" || n === "REEF") return n;
  return null;
}

function sectorStops(sectors?: { until: number; name: string }[]): { until: number; name: SectorId }[] {
  if (sectors?.length) {
    const mapped: { until: number; name: SectorId }[] = [];
    for (const s of sectors) {
      const id = asSectorId(s.name);
      if (!id) {
        mapped.length = 0;
        break;
      }
      mapped.push({ until: s.until, name: id });
    }
    if (mapped.length) return mapped;
  }
  return DEFAULT_SECTORS;
}

export function sectorIdAt(t: number, sectors?: { until: number; name: string }[]): SectorId {
  const u = wrap01(t);
  const list = sectorStops(sectors);
  for (const s of list) {
    if (u < s.until) return s.name;
  }
  return list[list.length - 1]?.name ?? "HARBOR";
}

function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function mixLook(a: SectorLook, b: SectorLook, t: number, id: SectorId): SectorLook {
  if (t <= 0) return { ...a, id };
  if (t >= 1) return { ...b, id };
  return {
    id,
    fog: mixHex(a.fog, b.fog, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiInt: lerp(a.hemiInt, b.hemiInt, t),
    sunColor: mixHex(a.sunColor, b.sunColor, t),
    sunInt: lerp(a.sunInt, b.sunInt, t),
    fillColor: mixHex(a.fillColor, b.fillColor, t),
    fillInt: lerp(a.fillInt, b.fillInt, t),
    rimColor: mixHex(a.rimColor, b.rimColor, t),
    rimInt: lerp(a.rimInt, b.rimInt, t),
    ambColor: mixHex(a.ambColor, b.ambColor, t),
    ambInt: lerp(a.ambInt, b.ambInt, t),
    exposure: lerp(a.exposure, b.exposure, t),
    bloom: lerp(a.bloom, b.bloom, t),
    horizon: mixHex(a.horizon, b.horizon, t),
    zenith: mixHex(a.zenith, b.zenith, t),
    nadir: mixHex(a.nadir, b.nadir, t),
    waterDeep: mixHex(a.waterDeep, b.waterDeep, t),
    waterShallow: mixHex(a.waterShallow, b.waterShallow, t),
    waterSky: mixHex(a.waterSky, b.waterSky, t),
    hazeFar: mixHex(a.hazeFar, b.hazeFar, t),
    hazeLow: mixHex(a.hazeLow, b.hazeLow, t),
    hazeFarOp: lerp(a.hazeFarOp, b.hazeFarOp, t),
    hazeLowOp: lerp(a.hazeLowOp, b.hazeLowOp, t),
  };
}

function edgeMix(local: number, span: number): number {
  const edge = Math.min(0.5, BLEND / Math.max(span, 1e-4));
  if (local <= 1 - edge) return 0;
  const x = (local - (1 - edge)) / edge;
  return x * x * (3 - 2 * x);
}

/** Pure sector grade. Blends a short window before each boundary so the grade does not pop. */
export function sectorPalette(t: number, sectors?: { until: number; name: string }[]): SectorLook {
  const u = wrap01(t);
  const list = sectorStops(sectors);
  const hold = sectorIdAt(u, list);
  let start = 0;
  let end = 1;
  let next: SectorId = hold;
  let prev = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (u < s.until) {
      start = prev;
      end = s.until >= 1 ? 1 : s.until;
      next = (list[i + 1] ?? list[0]).name;
      break;
    }
    prev = s.until;
  }
  const span = Math.max(1e-4, end - start);
  const mix = edgeMix((u - start) / span, span);
  return mixLook(LOOKS[hold], LOOKS[next], mix, hold);
}
