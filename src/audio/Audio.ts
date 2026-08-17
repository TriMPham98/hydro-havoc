import { fillCabinIR, fillChopLoop, fillFieldLoop, fillHullLoop, fillIntakeLoop, fillSpoolLoop, fillWetSlap } from "./hullSample";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private hissGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private turbineGain: GainNode | null = null;
  private turbineBp: BiquadFilterNode | null = null;
  private crackleGain: GainNode | null = null;
  private sampleGain: GainNode | null = null;
  private hullSrc: AudioBufferSourceNode | null = null;
  private hullGain: GainNode | null = null;
  private hullSrcB: AudioBufferSourceNode | null = null;
  private hullGainB: GainNode | null = null;
  private wetSrc: AudioBufferSourceNode | null = null;
  private wetGain: GainNode | null = null;
  private fieldSrc: AudioBufferSourceNode | null = null;
  private fieldGain: GainNode | null = null;
  private scream: AudioBufferSourceNode | null = null;
  private screamGain: GainNode | null = null;
  private lastSlap = 0;
  private lastBoost = false;
  private lastAir = false;
  private started = false;
  private bus: GainNode | null = null;

  resume(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
    if (this.started) return;
    this.started = true;
    this.startBus();
    this.startHiss();
    this.startRumble();
    this.startTurbine();
    this.startCrackle();
    this.startSampleLoop();
    this.startHullGrain();
    this.startWetSlap();
    this.startField();
    this.startScream();
  }

  private dest(): AudioNode {
    return this.bus ?? this.ctx!.destination;
  }

  private startBus(): void {
    if (!this.ctx) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.92;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.tanh(x * 1.8);
    }
    shaper.curve = curve;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    const ir = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.18), this.ctx.sampleRate);
    fillCabinIR(ir.getChannelData(0), this.ctx.sampleRate);
    const conv = this.ctx.createConvolver();
    conv.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.38;
    const dry = this.ctx.createGain();
    dry.gain.value = 0.7;
    bus.connect(shaper);
    shaper.connect(dry).connect(comp);
    shaper.connect(conv).connect(wet).connect(comp);
    comp.connect(this.ctx.destination);
    this.bus = bus;
  }

  private startHiss(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 1.2), this.ctx.sampleRate);
    fillIntakeLoop(buf.getChannelData(0), this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    src.connect(hp).connect(bp).connect(gain).connect(this.dest());
    src.start();
    this.hissGain = gain;
  }

  private startRumble(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.9), this.ctx.sampleRate);
    fillFieldLoop(buf.getChannelData(0), this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(this.dest());
    src.start();
    this.rumbleGain = gain;
  }

  private startTurbine(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    fillSpoolLoop(buf.getChannelData(0), this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2800;
    bp.Q.value = 1.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.dest());
    src.start();
    this.turbineBp = bp;
    this.turbineGain = gain;
  }

  private startCrackle(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    fillChopLoop(buf.getChannelData(0));
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(gain).connect(this.dest());
    src.start();
    this.crackleGain = gain;
  }

  private startSampleLoop(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.55), sr);
    fillChopLoop(buf.getChannelData(0));
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.55;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.dest());
    src.start();
    this.sampleGain = gain;
  }

  /** Rate-tracked grain — cabinet engines pitch with RPM, not just a beep. */
  private startHullGrain(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 1.8), sr);
    fillHullLoop(buf.getChannelData(0), sr);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 1;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(this.dest());
    src.start();
    this.hullSrc = src;
    this.hullGain = gain;
    const bufB = this.ctx.createBuffer(1, Math.floor(sr * 1.55), sr);
    fillHullLoop(bufB.getChannelData(0), sr);
    const srcB = this.ctx.createBufferSource();
    srcB.buffer = bufB;
    srcB.loop = true;
    srcB.playbackRate.value = 1.07;
    const lpB = this.ctx.createBiquadFilter();
    lpB.type = "bandpass";
    lpB.frequency.value = 780;
    lpB.Q.value = 0.7;
    const gainB = this.ctx.createGain();
    gainB.gain.value = 0;
    srcB.connect(lpB).connect(gainB).connect(this.dest());
    srcB.start();
    this.hullSrcB = srcB;
    this.hullGainB = gainB;
  }

  private startWetSlap(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 1.8), sr);
    fillWetSlap(buf.getChannelData(0), sr);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 1;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(gain).connect(this.dest());
    src.start();
    this.wetSrc = src;
    this.wetGain = gain;
  }

  private startField(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 2.4), sr);
    fillFieldLoop(buf.getChannelData(0), sr);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(this.dest());
    src.start();
    this.fieldSrc = src;
    this.fieldGain = gain;
  }

  private startScream(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.7), sr);
    fillSpoolLoop(buf.getChannelData(0), sr);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 1;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 2.4;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.dest());
    src.start();
    this.scream = src;
    this.screamGain = gain;
  }

  setEngine(speed: number, boosting: boolean, voice = 0, airborne = false): void {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    const rpmBias = voice * 0.06;
    const air = airborne ? 1 : 0;
    this.hissGain?.gain.setTargetAtTime(Math.min(0.055, speed * 0.001 + (boosting ? 0.012 : 0) + air * 0.018), now, 0.08);
    this.rumbleGain?.gain.setTargetAtTime(Math.min(0.038, (0.006 + speed * 0.0007 + (boosting ? 0.016 : 0)) * (1 - air * 0.7)), now, 0.08);
    const wasBoost = this.lastBoost;
    this.lastBoost = boosting;
    this.turbineGain?.gain.setTargetAtTime(Math.min(0.04, speed * 0.00055 + (boosting ? 0.022 : 0)), now, 0.04);
    this.crackleGain?.gain.setTargetAtTime(Math.min(0.03, speed * 0.00035 + (boosting ? 0.016 : 0)) * (1 - air * 0.85), now, 0.05);
    this.sampleGain?.gain.setTargetAtTime(Math.min(0.06, 0.01 + speed * 0.0011 + (boosting ? 0.02 : 0)) * (1 - air * 0.5), now, 0.06);
    const rpm = 0.72 + speed * 0.045 + rpmBias + (boosting ? 0.55 : 0);
    this.hullSrc?.playbackRate.setTargetAtTime(Math.min(2.6, rpm), now, 0.08);
    this.hullGain?.gain.setTargetAtTime(Math.min(0.16, 0.03 + speed * 0.0028 + (boosting ? 0.04 : 0)) * (1 - air * 0.35), now, 0.06);
    this.hullSrcB?.playbackRate.setTargetAtTime(Math.min(2.4, rpm * 0.93 + 0.08), now, 0.1);
    this.hullGainB?.gain.setTargetAtTime(Math.min(0.1, 0.016 + speed * 0.0016 + (boosting ? 0.026 : 0)) * (1 - air * 0.35), now, 0.07);
    this.wetSrc?.playbackRate.setTargetAtTime(Math.min(1.8, 0.85 + speed * 0.018 + (boosting ? 0.22 : 0)), now, 0.09);
    this.wetGain?.gain.setTargetAtTime(airborne ? 0.004 : Math.min(0.085, 0.014 + speed * 0.0014 + (boosting ? 0.026 : 0)), now, 0.05);
    this.fieldSrc?.playbackRate.setTargetAtTime(Math.min(1.25, 0.92 + speed * 0.008 + (boosting ? 0.08 : 0)), now, 0.12);
    this.fieldGain?.gain.setTargetAtTime(airborne ? 0.012 : Math.min(0.11, 0.02 + speed * 0.0017 + (boosting ? 0.024 : 0)), now, 0.08);
    this.turbineBp?.frequency.setTargetAtTime(1800 + speed * 55 + (boosting ? 900 : 0), now, 0.08);
    this.scream?.playbackRate.setTargetAtTime(0.85 + speed * 0.028 + (boosting ? 0.45 : 0), now, 0.05);
    this.screamGain?.gain.setTargetAtTime(boosting ? 0.055 : speed > 22 ? 0.01 : 0, now, 0.03);
    if (boosting && !wasBoost) {
      this.noiseBurst(0.12, 0.12);
    }
    if (this.lastAir && !airborne) {
      this.splash();
    }
    this.lastAir = airborne;
    if (!airborne && speed > 16 && now - this.lastSlap > (boosting ? 0.22 : 0.38)) {
      this.lastSlap = now;
      this.noiseBurst(0.05, 0.035);
    }
  }

  beep(_freq: number, dur = 0.12, _type: OscillatorType = "square", gain = 0.06): void {
    this.noiseBurst(Math.max(0.05, dur), gain * 0.85);
  }

  pickup(kind: string): void {
    if (kind === "super") this.noiseBurst(0.14, 0.08);
    else if (kind === "red") this.noiseBurst(0.1, 0.07);
    else this.noiseBurst(0.08, 0.055);
  }

  ram(): void {
    this.noiseBurst(0.22, 0.13);
  }

  private noiseBurst(dur: number, gain: number): void {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    fillWetSlap(data, this.ctx.sampleRate);
    for (let i = 0; i < len; i++) data[i] *= 1 - i / len;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(lp).connect(g).connect(this.dest());
    src.start();
  }

  splash(): void {
    this.noiseBurst(0.22, 0.12);
    this.noiseBurst(0.1, 0.05);
  }

  mine(): void {
    this.noiseBurst(0.28, 0.1);
  }

  announce(): void {
    this.noiseBurst(0.09, 0.06);
    setTimeout(() => this.noiseBurst(0.11, 0.055), 90);
  }

  announceDown(): void {
    this.noiseBurst(0.14, 0.055);
  }

  countdown(n: string): void {
    this.noiseBurst(n === "GO" ? 0.18 : 0.12, n === "GO" ? 0.09 : 0.06);
  }

  finish(): void {
    this.noiseBurst(0.16, 0.07);
    setTimeout(() => this.noiseBurst(0.2, 0.08), 140);
  }
}
