/**
 * Pure buffer renderers for the audio engine. Everything here writes into
 * Float32Arrays so it can be unit tested without an AudioContext.
 */

/** Deterministic PRNG so loops render the same every boot (and in tests). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Per-cylinder character for a cross-plane V8: uneven bank pulses = burble. */
const V8_PATTERN = [1, 0.74, 0.93, 0.68, 0.97, 0.81, 0.88, 0.71];
const V8_JITTER = [0, 0.06, -0.03, 0.08, -0.02, 0.05, -0.06, 0.04];

/**
 * One seamless loop of exhaust pulses. `firings` pulses fill the buffer exactly,
 * so looping never clicks and playbackRate maps linearly to RPM.
 * `body` is the exhaust pipe resonance in Hz; `bark` adds mid-band rasp.
 */
export function fillEngineLoop(data: Float32Array, sr: number, firings: number, body: number, bark: number, seed = 7): void {
  const rand = rng(seed);
  const period = data.length / firings;
  data.fill(0);
  let noiseLp = 0;
  for (let f = 0; f < firings; f++) {
    const cyl = f % V8_PATTERN.length;
    const amp = V8_PATTERN[cyl] * (0.9 + rand() * 0.1);
    const start = Math.floor(f * period + V8_JITTER[cyl] * period);
    const len = Math.floor(period * 2.2);
    const decay = 5.2 / period;
    const phase0 = rand() * 0.4;
    for (let i = 0; i < len; i++) {
      const idx = (start + i + data.length) % data.length;
      const t = i / sr;
      const env = Math.exp(-i * decay) * Math.min(1, i / 6);
      noiseLp = noiseLp * 0.7 + rand() * 0.3;
      const thump = Math.sin(2 * Math.PI * body * t + phase0);
      const rasp = Math.sin(2 * Math.PI * body * 2.73 * t) * bark;
      const grit = noiseLp * (0.35 + bark * 0.6);
      data[idx] += amp * env * (thump * 0.8 + rasp * 0.45 + grit);
    }
  }
  normalize(data, 0.8);
  softClip(data, 1.6);
}

/** Pink-ish noise (Paul Kellet economy filter), seamless when looped. */
export function fillPink(data: Float32Array, seed = 3): void {
  seamless(data, 512, (tmp) => {
    const rand = rng(seed);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < tmp.length; i++) {
      const w = rand();
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      tmp[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  });
}

export function fillWhite(data: Float32Array, seed = 5): void {
  seamless(data, 256, (tmp) => {
    const rand = rng(seed);
    for (let i = 0; i < tmp.length; i++) tmp[i] = rand() * 0.6;
  });
}

/**
 * Stereo hall IR: early reflections + decorrelated exponential tail. `bright`
 * 0..1 controls how fast highs die (0 = dark cavern, 1 = glassy plate).
 */
export function fillReverbIR(left: Float32Array, right: Float32Array, sr: number, seconds: number, bright: number, seed = 11): void {
  const randL = rng(seed);
  const randR = rng(seed * 3 + 1);
  const len = left.length;
  const k = 6.9 / (seconds * sr);
  let lpL = 0;
  let lpR = 0;
  const early = [0.011, 0.019, 0.027, 0.041, 0.053, 0.067, 0.083];
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i * k);
    const damp = 0.15 + bright * 0.75 * Math.exp(-i / (sr * seconds * 0.4));
    lpL += (randL() - lpL) * damp;
    lpR += (randR() - lpR) * damp;
    const fadeIn = Math.min(1, i / (sr * 0.006));
    left[i] = lpL * env * fadeIn;
    right[i] = lpR * env * fadeIn;
  }
  early.forEach((t, n) => {
    const at = Math.floor(t * sr);
    if (at < len) {
      const g = 0.6 * Math.pow(0.82, n);
      left[at] += n % 2 ? g * 0.6 : g;
      right[Math.min(len - 1, at + Math.floor(sr * 0.0023))] += n % 2 ? g : g * 0.6;
    }
  });
  normalize(left, 0.5);
  normalize(right, 0.5);
}

/** 808-flavoured kick: pitch-dropping sine with a clicky transient. */
export function renderKick(data: Float32Array, sr: number, punch = 1): void {
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const f = 44 + 150 * Math.exp(-t * 32) * punch;
    phase += (2 * Math.PI * f) / sr;
    const env = Math.exp(-t * 7.5);
    const click = i < sr * 0.004 ? (1 - i / (sr * 0.004)) * 0.6 : 0;
    data[i] = Math.tanh((Math.sin(phase) * env + click) * 1.6);
  }
}

export function renderSnare(data: Float32Array, sr: number, seed = 21): void {
  const rand = rng(seed);
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const n = rand();
    hp = 0.86 * (hp + n - prev);
    prev = n;
    const tone = Math.sin(2 * Math.PI * (190 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 22);
    const rattle = hp * Math.exp(-t * 13);
    data[i] = Math.tanh((tone * 0.7 + rattle * 0.9) * 1.3);
  }
}

export function renderClap(data: Float32Array, sr: number, seed = 31): void {
  const rand = rng(seed);
  let bp = 0;
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const n = rand();
    bp = 0.7 * (bp + n - prev);
    prev = n;
    // Three smeared hand hits then a room tail.
    const burst = [0, 0.011, 0.022].reduce((a, o) => a + (t >= o ? Math.exp(-(t - o) * 180) : 0), 0);
    const tail = Math.exp(-t * 16) * 0.5;
    data[i] = bp * (burst + tail);
  }
  normalize(data, 0.9);
}

export function renderHat(data: Float32Array, sr: number, open: boolean, seed = 41): void {
  const rand = rng(seed);
  let prev = 0;
  let hp = 0;
  const decay = open ? 9 : 55;
  // Metallic: six square partials (classic 808 ratios) + noise.
  const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.7);
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    let metal = 0;
    for (const f of freqs) metal += Math.sign(Math.sin(2 * Math.PI * f * t));
    const n = rand() * 2 + metal * 0.18;
    hp = 0.75 * (hp + n - prev);
    prev = n;
    data[i] = hp * Math.exp(-t * decay) * 0.5;
  }
}

export function renderCrash(data: Float32Array, sr: number, seed = 51): void {
  const rand = rng(seed);
  let prev = 0;
  let hp = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const n = rand();
    hp = 0.9 * (hp + n - prev);
    prev = n;
    const shimmer = 0.75 + 0.25 * Math.sin(2 * Math.PI * 6.3 * t);
    data[i] = hp * Math.exp(-t * 1.9) * shimmer * 0.7;
  }
}

/** Noise swell that rises in brightness — for countdowns and boost spool. */
export function renderRiser(data: Float32Array, sr: number, seed = 61): void {
  const rand = rng(seed);
  let lp = 0;
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const k = 0.02 + u * u * 0.8;
    lp += (rand() - lp) * k;
    const wobble = 1 + 0.3 * Math.sin(2 * Math.PI * (4 + u * 18) * (i / sr));
    data[i] = lp * Math.pow(u, 1.6) * wobble;
  }
  normalize(data, 0.8);
}

/** Water impact: low thud, then a fizz of droplets. */
export function renderSplash(data: Float32Array, sr: number, seed = 71): void {
  const rand = rng(seed);
  let lp = 0;
  let bp = 0;
  let prev = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const n = rand();
    lp += (n - lp) * 0.04;
    bp = 0.8 * (bp + n - prev);
    prev = n;
    const thud = lp * Math.exp(-t * 9) * 3;
    const fizz = bp * Math.exp(-t * 5) * (0.4 + 0.6 * Math.max(0, Math.sin(t * 90 + n)));
    // Bubbles: a few tiny chirps rising in pitch.
    let bubble = 0;
    for (let b = 0; b < 5; b++) {
      const at = 0.05 + b * 0.07;
      if (t > at) {
        const bt = t - at;
        bubble += Math.sin(2 * Math.PI * (600 + b * 210 + bt * 3000) * bt) * Math.exp(-bt * 60) * 0.25;
      }
    }
    data[i] = thud + fizz * 0.6 + bubble;
  }
  normalize(data, 0.9);
}

/** Struck steel: inharmonic partials with fast-dying highs, for rams and wall hits. */
export function renderClang(data: Float32Array, sr: number, base: number, seed = 81): void {
  const rand = rng(seed);
  const ratios = [1, 2.32, 4.25, 6.63, 9.38];
  const decays = [3.5, 5, 8, 13, 19];
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let p = 0; p < ratios.length; p++) {
      s += Math.sin(2 * Math.PI * base * ratios[p] * t) * Math.exp(-t * decays[p]) / (p + 1);
    }
    const hit = i < sr * 0.01 ? rand() * (1 - i / (sr * 0.01)) : 0;
    data[i] = s * 0.8 + hit;
  }
  normalize(data, 0.85);
}

export function normalize(data: Float32Array, peak: number): void {
  let m = 0;
  for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
  if (m < 1e-9) return;
  const g = peak / m;
  for (let i = 0; i < data.length; i++) data[i] *= g;
}

export function softClip(data: Float32Array, drive: number): void {
  const n = Math.tanh(drive);
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] * drive) / n;
}

/**
 * Render `fade` extra samples, then crossfade that overhang into the head so
 * data[len-1] runs straight into data[0] when the buffer loops.
 */
export function seamless(data: Float32Array, fade: number, gen: (tmp: Float32Array) => void): void {
  const n = data.length;
  const f = Math.min(fade, Math.floor(n / 4));
  const tmp = new Float32Array(n + f);
  gen(tmp);
  for (let i = 0; i < n; i++) {
    if (i < f) {
      const w = i / f;
      data[i] = tmp[i] * w + tmp[n + i] * (1 - w);
    } else {
      data[i] = tmp[i];
    }
  }
}

/** Soft saturation curve for WaveShaperNodes. */
export function driveCurve(amount: number, size = 1024): Float32Array {
  const curve = new Float32Array(size);
  const norm = Math.tanh(amount);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  return curve;
}

export function midiHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function rms(data: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / Math.max(1, data.length));
}
