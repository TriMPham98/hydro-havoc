import { fillChopLoop, fillHullLoop, fillWetSlap } from "./hullSample";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engine2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private hissGain: GainNode | null = null;
  private formantGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private turbineGain: GainNode | null = null;
  private turbineBp: BiquadFilterNode | null = null;
  private tickGain: GainNode | null = null;
  private tickOsc: OscillatorNode | null = null;
  private crackleGain: GainNode | null = null;
  private sampleGain: GainNode | null = null;
  private hullSrc: AudioBufferSourceNode | null = null;
  private hullGain: GainNode | null = null;
  private wetSrc: AudioBufferSourceNode | null = null;
  private wetGain: GainNode | null = null;
  private scream: OscillatorNode | null = null;
  private screamGain: GainNode | null = null;
  private lastSlap = 0;
  private started = false;
  private bus: GainNode | null = null;

  resume(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
    if (this.started) return;
    this.started = true;
    this.startBus();
    this.startEngine();
    this.startHiss();
    this.startFormant();
    this.startRumble();
    this.startBoostPad();
    this.startTurbine();
    this.startTick();
    this.startCrackle();
    this.startSampleLoop();
    this.startHullGrain();
    this.startWetSlap();
    this.startScream();
    this.startBed();
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
    bus.connect(shaper).connect(comp).connect(this.dest());
    this.bus = bus;
  }

  private startEngine(): void {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.dest());
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.018;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.28;
    delay.connect(fb).connect(delay);
    osc.connect(lp).connect(delay).connect(gain);
    lp.connect(gain);
    osc.start();
    const osc2 = this.ctx.createOscillator();
    osc2.type = "square";
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.22;
    osc2.connect(g2).connect(lp);
    osc2.start();
    const real = new Float32Array(16);
    const imag = new Float32Array(16);
    real[1] = 0.55;
    real[2] = 0.28;
    real[3] = 0.16;
    real[5] = 0.09;
    real[7] = 0.05;
    const wave = this.ctx.createPeriodicWave(real, imag);
    const osc3 = this.ctx.createOscillator();
    osc3.setPeriodicWave(wave);
    const g3 = this.ctx.createGain();
    g3.gain.value = 0.18;
    osc3.connect(g3).connect(lp);
    osc3.start();
    this.engine = osc;
    this.engine2 = osc3;
    this.engineGain = gain;
  }

  private startHiss(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.2, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

  private startFormant(): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 95;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 4.2;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(bp).connect(gain).connect(this.dest());
    osc.start();
    this.formantGain = gain;
  }

  private startRumble(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.8, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
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

  private startBoostPad(): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 48;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(this.dest());
    osc.start();
    this.boostGain = gain;
  }

  private startTurbine(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

  private startTick(): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 18;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2100;
    bp.Q.value = 8;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(bp).connect(gain).connect(this.dest());
    osc.start();
    this.tickOsc = osc;
    this.tickGain = gain;
  }

  private startCrackle(): void {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const pop = Math.random() > 0.92 ? Math.random() * 2 - 1 : (Math.random() - 0.5) * 0.15;
      data[i] = pop;
    }
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
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 1.35), sr);
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

  private startScream(): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 420;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(bp).connect(gain).connect(this.dest());
    osc.start();
    this.scream = osc;
    this.screamGain = gain;
  }

  private startBed(): void {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.028;
    gain.connect(this.dest());
    const notes = [55, 82.5, 110, 73.4];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = i % 2 ? "triangle" : "sine";
      osc.frequency.value = freq;
      g.gain.value = 0.16;
      osc.connect(g).connect(gain);
      osc.start();
    });
  }

  setEngine(speed: number, boosting: boolean, voice = 0): void {
    if (!this.engine || !this.engineGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const bias = voice * 7;
    this.engine.frequency.setTargetAtTime(62 + bias + speed * 7.2 + (boosting ? 48 : 0), now, 0.06);
    if (this.engine2) this.engine2.frequency.setTargetAtTime(31 + bias * 0.5 + speed * 3.4 + (boosting ? 22 : 0), now, 0.07);
    this.engineGain.gain.setTargetAtTime(Math.min(0.072, 0.008 + speed * 0.0012 + (boosting ? 0.016 : 0)), now, 0.05);
    this.hissGain?.gain.setTargetAtTime(Math.min(0.055, speed * 0.0013 + (boosting ? 0.016 : 0)), now, 0.08);
    this.formantGain?.gain.setTargetAtTime(Math.min(0.028, 0.006 + speed * 0.00045 + (boosting ? 0.01 : 0)), now, 0.07);
    this.rumbleGain?.gain.setTargetAtTime(Math.min(0.05, 0.008 + speed * 0.0009 + (boosting ? 0.022 : 0)), now, 0.08);
    const wasBoost = (this.boostGain?.gain.value ?? 0) > 0.02;
    this.boostGain?.gain.setTargetAtTime(boosting ? 0.05 : 0.0, now, 0.03);
    this.turbineGain?.gain.setTargetAtTime(Math.min(0.048, speed * 0.0007 + (boosting ? 0.028 : 0)), now, 0.04);
    this.tickOsc?.frequency.setTargetAtTime(12 + speed * 0.85 + (boosting ? 8 : 0), now, 0.05);
    this.tickGain?.gain.setTargetAtTime(Math.min(0.022, speed * 0.00035 + (boosting ? 0.01 : 0)), now, 0.06);
    this.crackleGain?.gain.setTargetAtTime(Math.min(0.034, speed * 0.0004 + (boosting ? 0.018 : 0)), now, 0.05);
    this.sampleGain?.gain.setTargetAtTime(Math.min(0.055, 0.008 + speed * 0.001 + (boosting ? 0.018 : 0)), now, 0.06);
    const rpm = 0.72 + speed * 0.045 + (boosting ? 0.55 : 0);
    this.hullSrc?.playbackRate.setTargetAtTime(Math.min(2.6, rpm), now, 0.08);
    this.hullGain?.gain.setTargetAtTime(Math.min(0.13, 0.022 + speed * 0.0024 + (boosting ? 0.032 : 0)), now, 0.06);
    this.wetSrc?.playbackRate.setTargetAtTime(Math.min(1.8, 0.85 + speed * 0.018 + (boosting ? 0.22 : 0)), now, 0.09);
    this.wetGain?.gain.setTargetAtTime(Math.min(0.07, 0.01 + speed * 0.0012 + (boosting ? 0.022 : 0)), now, 0.07);
    this.turbineBp?.frequency.setTargetAtTime(1800 + speed * 55 + (boosting ? 900 : 0), now, 0.08);
    this.scream?.frequency.setTargetAtTime(380 + speed * 18 + (boosting ? 220 : 0), now, 0.07);
    this.screamGain?.gain.setTargetAtTime(boosting ? 0.04 : speed > 22 ? 0.008 : 0, now, 0.035);
    if (boosting && !wasBoost) {
      this.noiseBurst(0.08, 0.09);
      this.beep(210, 0.07, "sawtooth", 0.028);
      this.beep(88, 0.11, "sine", 0.04);
    }
    if (speed > 16 && now - this.lastSlap > (boosting ? 0.22 : 0.38)) {
      this.lastSlap = now;
      this.noiseBurst(0.05, 0.035);
    }
  }

  beep(freq: number, dur = 0.12, type: OscillatorType = "square", gain = 0.06): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(g).connect(this.dest());
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  pickup(kind: string): void {
    if (kind === "super") this.beep(880, 0.18, "triangle", 0.07);
    else if (kind === "red") this.beep(660, 0.12, "square", 0.06);
    else this.beep(520, 0.1, "square", 0.05);
  }

  ram(): void {
    this.beep(78, 0.16, "sawtooth", 0.09);
    this.noiseBurst(0.22, 0.11);
  }

  private noiseBurst(dur: number, gain: number): void {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
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
    this.beep(160, 0.1, "triangle", 0.035);
    this.beep(90, 0.14, "sine", 0.04);
  }

  mine(): void {
    this.beep(140, 0.28, "sawtooth", 0.09);
  }

  announce(): void {
    this.beep(620, 0.1, "square", 0.055);
    setTimeout(() => this.beep(780, 0.12, "square", 0.05), 90);
  }

  announceDown(): void {
    this.beep(280, 0.14, "sawtooth", 0.05);
  }

  countdown(n: string): void {
    this.beep(n === "GO" ? 520 : 330, 0.16, "square", 0.07);
  }

  finish(): void {
    this.beep(392, 0.18);
    setTimeout(() => this.beep(523, 0.22), 140);
  }
}
