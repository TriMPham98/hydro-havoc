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
  private tickGain: GainNode | null = null;
  private tickOsc: OscillatorNode | null = null;
  private crackleGain: GainNode | null = null;
  private started = false;

  resume(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    void this.ctx.resume();
    if (this.started) return;
    this.started = true;
    this.startEngine();
    this.startHiss();
    this.startFormant();
    this.startRumble();
    this.startBoostPad();
    this.startTurbine();
    this.startTick();
    this.startCrackle();
    this.startBed();
  }

  private startEngine(): void {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.ctx.destination);
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    osc.connect(lp).connect(gain);
    osc.start();
    const osc2 = this.ctx.createOscillator();
    osc2.type = "square";
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.22;
    osc2.connect(g2).connect(lp);
    osc2.start();
    this.engine = osc;
    this.engine2 = osc2;
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
    src.connect(hp).connect(bp).connect(gain).connect(this.ctx.destination);
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
    osc.connect(bp).connect(gain).connect(this.ctx.destination);
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
    src.connect(lp).connect(gain).connect(this.ctx.destination);
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
    osc.connect(gain).connect(this.ctx.destination);
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
    src.connect(bp).connect(gain).connect(this.ctx.destination);
    src.start();
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
    osc.connect(bp).connect(gain).connect(this.ctx.destination);
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
    src.connect(hp).connect(gain).connect(this.ctx.destination);
    src.start();
    this.crackleGain = gain;
  }

  private startBed(): void {
    if (!this.ctx) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.028;
    gain.connect(this.ctx.destination);
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

  setEngine(speed: number, boosting: boolean): void {
    if (!this.engine || !this.engineGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(62 + speed * 7.2 + (boosting ? 48 : 0), now, 0.06);
    if (this.engine2) this.engine2.frequency.setTargetAtTime(31 + speed * 3.4 + (boosting ? 22 : 0), now, 0.07);
    this.engineGain.gain.setTargetAtTime(Math.min(0.085, 0.01 + speed * 0.0016 + (boosting ? 0.018 : 0)), now, 0.06);
    this.hissGain?.gain.setTargetAtTime(Math.min(0.055, speed * 0.0013 + (boosting ? 0.016 : 0)), now, 0.08);
    this.formantGain?.gain.setTargetAtTime(Math.min(0.028, 0.006 + speed * 0.00045 + (boosting ? 0.01 : 0)), now, 0.07);
    this.rumbleGain?.gain.setTargetAtTime(Math.min(0.05, 0.008 + speed * 0.0009 + (boosting ? 0.022 : 0)), now, 0.08);
    const wasBoost = (this.boostGain?.gain.value ?? 0) > 0.02;
    this.boostGain?.gain.setTargetAtTime(boosting ? 0.042 : 0.0, now, 0.05);
    this.turbineGain?.gain.setTargetAtTime(Math.min(0.038, speed * 0.0007 + (boosting ? 0.02 : 0)), now, 0.07);
    this.tickOsc?.frequency.setTargetAtTime(12 + speed * 0.85 + (boosting ? 8 : 0), now, 0.05);
    this.tickGain?.gain.setTargetAtTime(Math.min(0.022, speed * 0.00035 + (boosting ? 0.01 : 0)), now, 0.06);
    this.crackleGain?.gain.setTargetAtTime(Math.min(0.034, speed * 0.0004 + (boosting ? 0.018 : 0)), now, 0.05);
    if (boosting && !wasBoost) this.beep(190, 0.09, "sawtooth", 0.04);
  }

  beep(freq: number, dur = 0.12, type: OscillatorType = "square", gain = 0.06): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    osc.connect(g).connect(this.ctx.destination);
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
    src.connect(lp).connect(g).connect(this.ctx.destination);
    src.start();
  }

  mine(): void {
    this.beep(140, 0.28, "sawtooth", 0.09);
  }

  countdown(n: string): void {
    this.beep(n === "GO" ? 520 : 330, 0.16, "square", 0.07);
  }

  finish(): void {
    this.beep(392, 0.18);
    setTimeout(() => this.beep(523, 0.22), 140);
  }
}
