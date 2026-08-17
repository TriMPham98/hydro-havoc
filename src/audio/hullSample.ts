/** Original marine grain — impeller + wet hull, not a Midway dump. */

export function fillHullLoop(data: Float32Array, sr: number): void {
  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  let lp = 0;
  const combA = Math.max(12, Math.floor(sr / 168));
  const combB = Math.max(18, Math.floor(sr / 97));
  const combC = Math.max(10, Math.floor(sr / 242));
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const cycle = (t * 78) % 1;
    const blade = (t * 312) % 1;
    const fire = cycle < 0.11 ? Math.sin((cycle / 0.11) * Math.PI) : 0;
    const impeller = blade < 0.08 ? 1 - blade / 0.08 : 0;
    const diesel = Math.sin(t * 56 * Math.PI * 2) * 0.22 + Math.sin(t * 112 * Math.PI * 2) * 0.1;
    const grit = Math.random() * 2 - 1;
    n1 = n1 * 0.94 + grit * 0.06;
    n2 = n2 * 0.8 + grit * 0.2;
    n3 = n3 * 0.55 + grit * 0.45;
    const cav = n3 * (0.12 + impeller * 0.55);
    const slap = n2 * fire * 0.35;
    const body = n1 * 0.28 + diesel;
    const whoosh = Math.sin(t * 9 * Math.PI * 2) * 0.07;
    const echoA = i >= combA ? data[i - combA] * 0.38 : 0;
    const echoB = i >= combB ? data[i - combB] * 0.22 : 0;
    const echoC = i >= combC ? data[i - combC] * 0.16 : 0;
    const hash = ((i * 1103515245 + 12345) >>> 0) / 4294967295;
    const slapEvt = hash > 0.993 ? n2 * 1.8 : 0;
    const raw = fire * 0.52 + impeller * 0.26 + body + slap + cav + whoosh + slapEvt + echoA + echoB + echoC;
    lp = lp * 0.62 + raw * 0.38;
    data[i] = lp * 0.33;
  }
  const fade = Math.min(320, Math.floor(data.length / 14));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] *= w;
    data[data.length - 1 - i] *= w;
  }
}

/** Irregular wet slaps — breaks the metronome so it reads less “oscillator”. */
export function fillWetSlap(data: Float32Array, sr: number): void {
  let n = 0;
  let next = Math.floor(sr * 0.07);
  for (let i = 0; i < data.length; i++) {
    const grit = Math.random() * 2 - 1;
    n = n * 0.86 + grit * 0.14;
    let hit = 0;
    if (i === next) {
      hit = 0.7 + Math.random() * 0.3;
      next = i + Math.floor(sr * (0.05 + Math.random() * 0.16));
    }
    const decay = i > 0 ? Math.abs(data[i - 1]) * 0.91 : 0;
    data[i] = (n * 0.28 + hit * 1.15 + decay * Math.sign(grit || 1)) * 0.48;
  }
  const fade = Math.min(220, Math.floor(data.length / 18));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] *= w;
    data[data.length - 1 - i] *= w;
  }
}

export function fillChopLoop(data: Float32Array): void {
  for (let i = 0; i < data.length; i++) {
    const burst = Math.random() > 0.88 ? Math.random() * 2 - 1 : (Math.random() - 0.5) * 0.12;
    data[i] = burst * (0.4 + 0.6 * ((i * 17) % 97) / 97);
  }
}

export function hullRms(data: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / data.length);
}
