import { clamp, wrap01 } from "./math";

export interface ControlPoint {
  x: number;
  y: number;
  z: number;
  width: number;
  bankHeight: number;
}

export interface Frame {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  rz: number;
  width: number;
  bankHeight: number;
  s: number;
  t: number;
}

interface Sample {
  x: number;
  y: number;
  z: number;
  width: number;
  bankHeight: number;
  s: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export class ArcSpline {
  readonly points: ControlPoint[];
  readonly totalLength: number;
  readonly closed: boolean;
  private readonly samples: Sample[];

  constructor(points: ControlPoint[], closed = true, sampleStep = 2.2) {
    this.points = points;
    this.closed = closed;
    const raw: Sample[] = [];
    const n = points.length;
    const segs = closed ? n : n - 1;
    const stepsPer = 12;

    for (let i = 0; i < segs; i++) {
      const p0 = points[wrapIndex(i - 1, n)];
      const p1 = points[i];
      const p2 = points[wrapIndex(i + 1, n)];
      const p3 = points[wrapIndex(i + 2, n)];
      for (let s = 0; s < stepsPer; s++) {
        const t = s / stepsPer;
        raw.push({
          x: catmull(p0.x, p1.x, p2.x, p3.x, t),
          y: catmull(p0.y, p1.y, p2.y, p3.y, t),
          z: catmull(p0.z, p1.z, p2.z, p3.z, t),
          width: catmull(p0.width, p1.width, p2.width, p3.width, t),
          bankHeight: catmull(p0.bankHeight, p1.bankHeight, p2.bankHeight, p3.bankHeight, t),
          s: 0,
        });
      }
    }

    const spaced: Sample[] = [];
    let acc = 0;
    spaced.push({ ...raw[0], s: 0 });
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1];
      const b = raw[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      acc += d;
      if (acc >= sampleStep || i === raw.length - 1) {
        spaced.push({ ...b, s: 0 });
        acc = 0;
      }
    }

    let length = 0;
    spaced[0].s = 0;
    for (let i = 1; i < spaced.length; i++) {
      const a = spaced[i - 1];
      const b = spaced[i];
      length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      b.s = length;
    }
    if (closed && spaced.length > 1) {
      const a = spaced[spaced.length - 1];
      const b = spaced[0];
      length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }

    this.samples = spaced;
    this.totalLength = Math.max(length, 1);
  }

  getFrameAtT(t: number): Frame {
    const u = this.closed ? wrap01(t) : clamp(t, 0, 0.9999);
    return this.getFrameAtS(u * this.totalLength);
  }

  getFrameAtS(s: number): Frame {
    const len = this.totalLength;
    const dist = this.closed ? ((s % len) + len) % len : clamp(s, 0, len - 0.0001);
    const samples = this.samples;
    let i1 = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].s >= dist) {
        i1 = i;
        break;
      }
    }
    if (!this.closed && i1 === 0) i1 = Math.min(1, samples.length - 1);
    // At t=0 the first sample matches, but wrapping last→first gives the
    // closing-segment tangent instead of the authored start heading.
    if (this.closed && i1 === 0 && dist <= samples[0].s + 1e-4) {
      i1 = Math.min(1, samples.length - 1);
    }
    const i0 = i1 === 0 ? samples.length - 1 : i1 - 1;
    const a = samples[i0];
    const b = samples[i1];
    let along: number;
    let seg: number;
    if (i1 === 0) {
      seg = len - a.s + b.s;
      along = dist >= a.s ? dist - a.s : len - a.s + dist;
    } else {
      seg = b.s - a.s;
      along = dist - a.s;
    }
    const u = seg > 0.0001 ? along / seg : 0;
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const z = a.z + (b.z - a.z) * u;
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    let tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let rx = tz;
    let rz = -tx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    return {
      x,
      y,
      z,
      tx,
      ty,
      tz,
      rx,
      rz,
      width: a.width + (b.width - a.width) * u,
      bankHeight: a.bankHeight + (b.bankHeight - a.bankHeight) * u,
      s: dist,
      t: dist / len,
    };
  }

  project(
    x: number,
    y: number,
    z: number,
    hintT?: number,
  ): { frame: Frame; lateral: number; height: number; planar: number } {
    const samples = this.samples;
    const len = this.totalLength;
    let best = 0;
    let bestScore = Infinity;
    const stride = 2;
    for (let i = 0; i < samples.length; i += stride) {
      const p = samples[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      let score = d;
      if (hintT !== undefined) {
        const t = p.s / len;
        const dt = Math.abs(t - hintT);
        const wrap = Math.min(dt, 1 - dt);
        // Prefer the ribbon matching current race progress when two
        // distant-t segments occupy the same XZ (folded start/finish).
        if (wrap > 0.1) score += wrap * wrap * 2800;
      }
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const lo = Math.max(0, best - 10);
    const hi = Math.min(samples.length - 1, best + 10);
    for (let i = lo; i <= hi; i++) {
      const p = samples[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      let score = d;
      if (hintT !== undefined) {
        const t = p.s / len;
        const dt = Math.abs(t - hintT);
        const wrap = Math.min(dt, 1 - dt);
        if (wrap > 0.1) score += wrap * wrap * 2800;
      }
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const frame = this.getFrameAtS(samples[best].s);
    const dx = x - frame.x;
    const dz = z - frame.z;
    const lateral = dx * frame.rx + dz * frame.rz;
    const planar = Math.hypot(dx, dz);
    return { frame, lateral, height: y - frame.y, planar };
  }
}

export type TrackSegment =
  | { kind: "straight"; length: number; width?: number; dy?: number; bankHeight?: number }
  | { kind: "curve"; radius: number; degrees: number; width?: number; dy?: number; bankHeight?: number };

export function buildFromSegments(
  segments: TrackSegment[],
  start: { x: number; y: number; z: number; heading: number; width: number; bankHeight: number },
): { points: ControlPoint[]; heading: number } {
  const points: ControlPoint[] = [
    { x: start.x, y: start.y, z: start.z, width: start.width, bankHeight: start.bankHeight },
  ];
  let x = start.x;
  let y = start.y;
  let z = start.z;
  let heading = start.heading;
  let width = start.width;
  let bankHeight = start.bankHeight;

  const push = (nx: number, ny: number, nz: number) => {
    x = nx;
    y = ny;
    z = nz;
    points.push({ x, y, z, width, bankHeight });
  };

  for (const seg of segments) {
    if (seg.width !== undefined) width = seg.width;
    if (seg.bankHeight !== undefined) bankHeight = seg.bankHeight;

    if (seg.kind === "straight") {
      const steps = Math.max(2, Math.round(seg.length / 14));
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const dy = (seg.dy ?? 0) / steps;
      const ds = seg.length / steps;
      for (let i = 0; i < steps; i++) {
        push(x + fx * ds, y + dy, z + fz * ds);
      }
    } else {
      const sign = Math.sign(seg.degrees) || 1;
      const rad = (Math.abs(seg.degrees) * Math.PI) / 180;
      const arcLen = Math.max(rad * seg.radius, 1);
      const steps = Math.max(3, Math.round(arcLen / 12));
      const leftX = -Math.cos(heading);
      const leftZ = Math.sin(heading);
      const cx = x + leftX * seg.radius * sign;
      const cz = z + leftZ * seg.radius * sign;
      const dy = (seg.dy ?? 0) / steps;
      for (let i = 1; i <= steps; i++) {
        heading += (sign * rad) / steps;
        const lx = -Math.cos(heading);
        const lz = Math.sin(heading);
        push(cx - lx * seg.radius * sign, y + dy, cz - lz * seg.radius * sign);
      }
    }
  }

  return { points, heading };
}

export function closeTowardStart(
  points: ControlPoint[],
  heading: number,
  start: ControlPoint,
): ControlPoint[] {
  const last = points[points.length - 1];
  const toX = start.x - last.x;
  const toZ = start.z - last.z;
  const dist = Math.hypot(toX, toZ);
  if (dist < 20) return points;
  const desired = Math.atan2(toX, toZ);
  let delta = desired - heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const closeSegs: TrackSegment[] = [
    { kind: "curve", radius: Math.max(28, dist * 0.28), degrees: (delta * 180) / Math.PI, width: start.width },
    { kind: "straight", length: Math.max(24, dist * 0.45), width: start.width, dy: start.y - last.y },
  ];
  const extra = buildFromSegments(closeSegs, {
    x: last.x,
    y: last.y,
    z: last.z,
    heading,
    width: last.width,
    bankHeight: last.bankHeight,
  });
  return points.concat(extra.points.slice(1));
}
