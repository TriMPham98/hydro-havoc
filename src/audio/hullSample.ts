/** Original marine grain — impeller + wet hull, not a Midway dump. */

export function fillHullLoop(data: Float32Array, sr: number): void {
  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  let lp = 0;
  let ks = 0;
  const combA = Math.max(12, Math.floor(sr / 168));
  const combB = Math.max(18, Math.floor(sr / 97));
  const combC = Math.max(10, Math.floor(sr / 242));
  const ksLen = Math.max(20, Math.floor(sr / 146));
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const drift = 1 + (((i * 7919) % 97) / 97 - 0.5) * 0.08;
    const cycle = (t * 78 * drift) % 1;
    const blade = (t * 312 * drift) % 1;
    const fire = cycle < 0.11 ? 1 - Math.abs(cycle / 0.055 - 1) : 0;
    const impeller = blade < 0.08 ? 1 - blade / 0.08 : 0;
    const grit = Math.random() * 2 - 1;
    n1 = n1 * 0.94 + grit * 0.06;
    n2 = n2 * 0.8 + grit * 0.2;
    n3 = n3 * 0.55 + grit * 0.45;
    const prev = i >= ksLen ? data[i - ksLen] : grit * 0.2;
    ks = (ks + prev) * 0.48 + fire * n2 * 0.12;
    const cav = n3 * (0.12 + impeller * 0.55);
    const slap = n2 * fire * 0.35;
    const body = n1 * 0.38;
    const flutter = ((i * 48271) % 211) < 40 ? n1 * 0.12 : 0;
    const echoA = i >= combA ? data[i - combA] * 0.38 : 0;
    const echoB = i >= combB ? data[i - combB] * 0.22 : 0;
    const echoC = i >= combC ? data[i - combC] * 0.16 : 0;
    const hash = ((i * 1103515245 + 12345) >>> 0) / 4294967295;
    const slapEvt = hash > 0.993 ? n2 * 1.8 : 0;
    const raw = fire * 0.4 + impeller * 0.26 + body + slap + cav + flutter + slapEvt + echoA + echoB + echoC + ks * 0.55;
    lp = lp * 0.62 + raw * 0.38;
    data[i] = lp * 0.52;
  }
  const fade = Math.min(320, Math.floor(data.length / 14));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] *= w;
    data[data.length - 1 - i] *= w;
  }
  smearAsMic(data);
}

/** Cheap DAT / handheld-cabin: hold-sample + tanh so it isn’t clean DSP. */
export function smearAsMic(data: Float32Array): void {
  let hold = 0;
  let acc = 0;
  for (let i = 0; i < data.length; i++) {
    if ((i & 3) === 0) hold = data[i];
    acc = acc * 0.82 + hold * 0.18;
    data[i] = Math.tanh(acc * 1.55);
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

/** Long wet field — brown water + distant motor, not a pitch oscillator. */
export function fillFieldLoop(data: Float32Array, sr: number): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const white = Math.random() * 2 - 1;
    b0 = 0.998 * b0 + 0.002 * white;
    b1 = 0.97 * b1 + 0.03 * white;
    b2 = 0.88 * b2 + 0.12 * white;
    const swell = 0.55 + 0.45 * (1 - Math.abs(((t * 0.7) % 2) - 1));
    const distant = ((i * 1103515245) >>> 8 & 255) / 255 < 0.04 ? b1 * 0.35 : 0;
    const splash = ((i * 7919) % 1700) < 18 ? b2 * 0.9 : 0;
    data[i] = (b0 * 1.4 + b1 * 0.55 + splash + distant) * swell * 1.15;
  }
  const fade = Math.min(400, Math.floor(data.length / 12));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] *= w;
    data[data.length - 1 - i] *= w;
  }
}

/** Short cabin IR — smears transients like a cheap field recording. */
export function fillCabinIR(data: Float32Array, sr: number): void {
  let n = 0;
  const early = [0.002, 0.007, 0.013, 0.021, 0.034, 0.048];
  const taps = early.map((t) => Math.floor(t * sr));
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 11);
    n = n * 0.72 + (Math.random() * 2 - 1) * 0.28;
    let click = 0;
    for (const tap of taps) if (i === tap) click = 0.55;
    const late = i > 0 ? data[i - 1] * 0.35 : 0;
    data[i] = (n * 0.7 + click + late) * env;
  }
}

/** Intake rush — duct air, not white hiss. */
export function fillIntakeLoop(data: Float32Array, sr: number): void {
  let n = 0;
  let hp = 0;
  const comb = Math.max(8, Math.floor(sr / 310));
  for (let i = 0; i < data.length; i++) {
    const grit = Math.random() * 2 - 1;
    n = n * 0.72 + grit * 0.28;
    const d = n - hp;
    hp = n;
    const echo = i >= comb ? data[i - comb] * 0.22 : 0;
    const puff = ((i * 1103515245) >>> 0) / 4294967295 > 0.991 ? n * 1.2 : 0;
    data[i] = (d * 0.7 + echo + puff) * 0.55;
  }
  const fade = Math.min(200, Math.floor(data.length / 16));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] *= w;
    data[data.length - 1 - i] *= w;
  }
}

/** Boost spool — filtered grit, not a saw beep. */
export function fillSpoolLoop(data: Float32Array, sr: number): void {
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const grit = Math.random() * 2 - 1;
    n = n * 0.62 + grit * 0.38;
    const blade = ((t * 220) % 1) < 0.12 ? n * 0.85 : n * 0.22;
    const gritPop = ((i * 1103515245) >>> 0) / 4294967295 > 0.985 ? n * 1.4 : 0;
    data[i] = (blade + gritPop) * 0.5;
  }
  const fade = Math.min(180, Math.floor(data.length / 20));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    data[i] *= w;
    data[data.length - 1 - i] *= w;
  }
  smearAsMic(data);
}

export function hullRms(data: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / data.length);
}
