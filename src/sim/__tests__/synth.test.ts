import { describe, expect, it } from "vitest";
import {
  driveCurve,
  fillEngineLoop,
  fillPink,
  fillReverbIR,
  midiHz,
  renderClang,
  renderHat,
  renderKick,
  renderSnare,
  renderSplash,
  rms,
} from "../../audio/synth";
import { buildDetailHeight } from "../../render/WaterMaterial";

const SR = 22050;

describe("engine synth", () => {
  it("renders a loud, finite exhaust loop that repeats at the firing rate", () => {
    const firings = 32;
    const data = new Float32Array(Math.round((SR * firings) / 60));
    fillEngineLoop(data, SR, firings, 90, 0.3);
    expect(data.every(Number.isFinite)).toBe(true);
    expect(rms(data)).toBeGreaterThan(0.12);
    expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(1);
    // Autocorrelation at one firing period beats a half-period offset: it really pulses at 60 Hz.
    const period = Math.round(data.length / firings);
    const corr = (lag: number) => {
      let s = 0;
      for (let i = 0; i < data.length - lag; i++) s += data[i] * data[i + lag];
      return s;
    };
    expect(corr(period)).toBeGreaterThan(corr(Math.round(period / 2)));
  });

  it("drive curve is odd-symmetric and bounded", () => {
    const c = driveCurve(2.2, 257);
    expect(c[128]).toBeCloseTo(0, 5);
    expect(c[0]).toBeCloseTo(-1, 5);
    expect(c[256]).toBeCloseTo(1, 5);
  });
});

describe("drums and fx", () => {
  it("kick, snare, hat, splash and clang all decay", () => {
    const renders: [string, (d: Float32Array) => void][] = [
      ["kick", (d) => renderKick(d, SR)],
      ["snare", (d) => renderSnare(d, SR)],
      ["hat", (d) => renderHat(d, SR, true)],
      ["splash", (d) => renderSplash(d, SR)],
      ["clang", (d) => renderClang(d, SR, 170)],
    ];
    for (const [name, fn] of renders) {
      const d = new Float32Array(Math.floor(SR * 0.4));
      fn(d);
      const head = rms(d.subarray(0, 1500));
      const tail = rms(d.subarray(d.length - 1500));
      expect(head, name).toBeGreaterThan(0.01);
      expect(head, name).toBeGreaterThan(tail * 2);
    }
  });

  it("reverb IR is stereo-decorrelated and decays", () => {
    const n = Math.floor(SR * 1.5);
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    fillReverbIR(l, r, SR, 1.2, 0.5);
    expect(rms(l.subarray(0, 4000))).toBeGreaterThan(rms(l.subarray(n - 4000)) * 4);
    let same = 0;
    for (let i = 0; i < n; i++) if (l[i] === r[i]) same++;
    expect(same / n).toBeLessThan(0.05);
  });

  it("pink noise loops without a seam", () => {
    const d = new Float32Array(20000);
    fillPink(d);
    const step = Math.abs(d[d.length - 1] - d[0]);
    let avg = 0;
    for (let i = 1; i < d.length; i++) avg += Math.abs(d[i] - d[i - 1]);
    avg /= d.length - 1;
    expect(step).toBeLessThan(avg * 6);
  });

  it("tunes A4 to 440", () => {
    expect(midiHz(69)).toBeCloseTo(440, 6);
    expect(midiHz(57)).toBeCloseTo(220, 6);
  });
});

describe("water detail field", () => {
  it("tiles seamlessly", () => {
    const size = 64;
    const h = buildDetailHeight(size);
    let edge = 0;
    let inner = 0;
    for (let y = 0; y < size; y++) {
      edge += Math.abs(h[y * size + size - 1] - h[y * size]);
      inner += Math.abs(h[y * size + 1] - h[y * size]);
    }
    expect(edge).toBeLessThan(inner * 2.5);
  });
});
