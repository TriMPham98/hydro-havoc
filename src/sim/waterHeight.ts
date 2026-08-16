export interface Wave {
  dx: number;
  dz: number;
  amp: number;
  len: number;
  speed: number;
}

export const WAVES: Wave[] = [
  { dx: 0.94, dz: 0.34, amp: 0.32, len: 22, speed: 1.15 },
  { dx: -0.55, dz: 0.83, amp: 0.18, len: 13, speed: 1.55 },
  { dx: 0.22, dz: 0.97, amp: 0.1, len: 7, speed: 2.05 },
];

export function gerstnerHeight(x: number, z: number, time: number, scale = 1): number {
  let h = 0;
  for (const w of WAVES) {
    const k = (Math.PI * 2) / w.len;
    const d = w.dx * x + w.dz * z;
    h += w.amp * scale * Math.sin(d * k + time * w.speed);
  }
  return h;
}

export function gerstnerNormal(x: number, z: number, time: number, scale = 1): { x: number; y: number; z: number } {
  let dx = 0;
  let dz = 0;
  for (const w of WAVES) {
    const k = (Math.PI * 2) / w.len;
    const d = w.dx * x + w.dz * z;
    const c = w.amp * scale * k * Math.cos(d * k + time * w.speed);
    dx += w.dx * c;
    dz += w.dz * c;
  }
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}
