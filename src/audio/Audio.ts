import { fillWetSlap } from "./hullSample";
import { Music } from "./Music";
import {
  driveCurve,
  fillEngineLoop,
  fillPink,
  fillReverbIR,
  fillWhite,
  midiHz,
  renderClang,
  renderKick,
  renderRiser,
  renderSplash,
} from "./synth";

export type MusicState = "title" | "race" | "countdown" | "paused" | "results" | "muted";
export type UiSound = "move" | "confirm" | "back";

export interface EngineFrame {
  speed: number;
  maxSpeed: number;
  throttle: number;
  boosting: boolean;
  superOn: boolean;
  airborne: boolean;
  voice: number;
}

export interface RivalFrame {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  maxSpeed: number;
  boosting: boolean;
  voice: number;
}

export interface ListenerFrame {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
}

/** Hull voices: exhaust body (Hz) for the low/high RPM loops, rasp, and RPM scale. */
const VOICES = [
  { lowBody: 104, highBody: 62, bark: 0.38, rate: 1.12, whine: 0.25 }, // Skimmer: peppy small-block
  { lowBody: 76, highBody: 46, bark: 0.2, rate: 0.84, whine: 0.12 }, // Ironwake: big-block rumble
  { lowBody: 122, highBody: 72, bark: 0.6, rate: 1.24, whine: 0.6 }, // Vesper: turbine screamer
];

/** Exaggerated speed of sound, in world units — makes fly-bys read on a TV speaker. */
const SOUND_SPEED = 210;
const FIRINGS = 32;
const BASE_FIRING_HZ = 60;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface EngineBuffers {
  low: AudioBuffer;
  high: AudioBuffer;
}

/** Two RPM-layered exhaust loops through drive + a throttle-opened lowpass. */
class EngineVoice {
  readonly out: GainNode;
  private low: AudioBufferSourceNode;
  private high: AudioBufferSourceNode;
  private lowG: GainNode;
  private highG: GainNode;
  private pre: GainNode;
  private lp: BiquadFilterNode;
  private ctx: AudioContext;

  constructor(ctx: AudioContext, bufs: EngineBuffers, dest: AudioNode, curve: Float32Array) {
    this.ctx = ctx;
    this.low = ctx.createBufferSource();
    this.low.buffer = bufs.low;
    this.low.loop = true;
    this.high = ctx.createBufferSource();
    this.high.buffer = bufs.high;
    this.high.loop = true;
    this.lowG = ctx.createGain();
    this.highG = ctx.createGain();
    this.highG.gain.value = 0;
    this.pre = ctx.createGain();
    this.pre.gain.value = 0.8;
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve as Float32Array<ArrayBuffer>;
    shaper.oversample = "2x";
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.Q.value = 1.4;
    this.lp.frequency.value = 900;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.low.connect(this.lowG).connect(this.pre);
    this.high.connect(this.highG).connect(this.pre);
    this.pre.connect(shaper).connect(this.lp).connect(this.out).connect(dest);
    const offset = Math.random() * bufs.low.duration;
    this.low.start(0, offset);
    this.high.start(0, offset);
  }

  set(rpm: number, load: number, gain: number, tc = 0.06): void {
    const now = this.ctx.currentTime;
    const x = clamp01((rpm - 1.5) / 1.8);
    this.low.playbackRate.setTargetAtTime(rpm, now, tc);
    this.high.playbackRate.setTargetAtTime(rpm, now, tc);
    this.lowG.gain.setTargetAtTime(Math.cos(x * Math.PI * 0.5), now, 0.08);
    this.highG.gain.setTargetAtTime(Math.sin(x * Math.PI * 0.5) * 0.9, now, 0.08);
    this.pre.gain.setTargetAtTime(0.55 + load * 0.9, now, 0.05);
    this.lp.frequency.setTargetAtTime(380 + load * 2600 + rpm * 520, now, 0.06);
    this.out.gain.setTargetAtTime(gain, now, 0.06);
  }

  stop(): void {
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, 0.05);
    this.low.stop(now + 0.3);
    this.high.stop(now + 0.3);
  }
}

class RivalVoice {
  readonly voice: EngineVoice;
  readonly panner: PannerNode;
  rate = 1;

  constructor(ctx: AudioContext, bufs: EngineBuffers, dest: AudioNode, curve: Float32Array) {
    this.panner = ctx.createPanner();
    this.panner.panningModel = "HRTF";
    this.panner.distanceModel = "inverse";
    this.panner.refDistance = 9;
    this.panner.rolloffFactor = 1.35;
    this.panner.maxDistance = 600;
    this.panner.connect(dest);
    this.voice = new EngineVoice(ctx, bufs, this.panner, curve);
  }

  dispose(): void {
    this.voice.stop();
    setTimeout(() => this.panner.disconnect(), 400);
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private started = false;
  private muted = false;
  private master!: GainNode;
  private analyser!: AnalyserNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private musicDuck!: GainNode;
  private sfxBus!: GainNode;
  private engineBus!: GainNode;
  private ambBus!: GainNode;
  private reverbIn!: GainNode;
  private reverbOut!: GainNode;
  private delayIn!: GainNode;
  private delayL!: DelayNode;
  private delayR!: DelayNode;
  private music!: Music;
  private curve!: Float32Array;
  private engineBufs: EngineBuffers[] = [];
  private engine: EngineVoice | null = null;
  private engineVoiceId = -1;
  private rivals = new Map<string, RivalVoice>();

  private whineA!: OscillatorNode;
  private whineB!: OscillatorNode;
  private whineG!: GainNode;
  private roarBp!: BiquadFilterNode;
  private roarG!: GainNode;
  private rushL!: GainNode;
  private rushR!: GainNode;
  private rushLp!: BiquadFilterNode;
  private hissG!: GainNode;
  private chopSrc!: AudioBufferSourceNode;
  private chopG!: GainNode;
  private windBp!: BiquadFilterNode;
  private windG!: GainNode;

  private bufs: Record<string, AudioBuffer> = {};
  private spool = 0;
  private rpm = 0.9;
  private lastThrottle = 0;
  private lastBoost = false;
  private airTime = 0;
  private musicState: MusicState = "muted";
  private lastListener: ListenerFrame | null = null;
  private lastListenerT = 0;
  private cavern = false;
  private voice: SpeechSynthesisVoice | null = null;
  private announcer = true;

  constructor() {
    try {
      this.muted = localStorage.getItem("hh-muted") === "1";
      this.announcer = localStorage.getItem("hh-announcer") !== "0";
    } catch {
      /* storage blocked */
    }
    if (typeof window !== "undefined" && new URLSearchParams(location.search).get("announcer") === "0") {
      this.announcer = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get ready(): boolean {
    return this.started && this.ctx?.state === "running";
  }

  resume(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: "interactive" });
      } catch {
        return;
      }
    }
    void this.ctx.resume();
    if (this.started) return;
    this.started = true;
    this.buildMixer();
    this.buildBuffers();
    this.buildBeds();
    this.music = new Music(this.ctx, { out: this.musicBus, reverb: this.reverbIn, delay: this.delayIn });
    this.pickVoice();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem("hh-muted", this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    if (this.muted && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    return this.muted;
  }

  /** Byte spectrum for the title visualiser; empty before audio starts. */
  spectrum(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }

  /** Debug/test hook: a MediaStream of the final mix (used by capture tooling). */
  tap(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.master.connect(dest);
    return dest.stream;
  }

  beatPulse(): number {
    return this.music ? this.music.beatPulse() : 0;
  }

  // ───────────────────────────── mixer ─────────────────────────────

  private buildMixer(): void {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.ratio.value = 3;
    glue.knee.value = 8;
    glue.attack.value = 0.01;
    glue.release.value = 0.18;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.78;
    const sum = ctx.createGain();
    sum.gain.value = 0.78;
    // Master tone: clear sub mud that eats limiter headroom, add a little air on top.
    const subCut = ctx.createBiquadFilter();
    subCut.type = "highpass";
    subCut.frequency.value = 32;
    subCut.Q.value = 0.7;
    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 5500;
    air.gain.value = 4;
    const mudCut = ctx.createBiquadFilter();
    mudCut.type = "peaking";
    mudCut.frequency.value = 240;
    mudCut.Q.value = 0.9;
    mudCut.gain.value = -3;
    sum.connect(subCut).connect(mudCut).connect(air).connect(glue).connect(limiter).connect(this.master);
    this.master.connect(ctx.destination);
    this.master.connect(this.analyser);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.9;
    this.musicDuck = ctx.createGain();
    this.musicBus.connect(this.musicFilter).connect(this.musicDuck).connect(sum);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(sum);
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0.8;
    // Engines: thin the boom, push the bark so they cut through the music.
    const engHp = ctx.createBiquadFilter();
    engHp.type = "highpass";
    engHp.frequency.value = 55;
    const engLow = ctx.createBiquadFilter();
    engLow.type = "lowshelf";
    engLow.frequency.value = 160;
    engLow.gain.value = -5;
    const engBite = ctx.createBiquadFilter();
    engBite.type = "peaking";
    engBite.frequency.value = 1900;
    engBite.Q.value = 0.8;
    engBite.gain.value = 5;
    this.engineBus.connect(engHp).connect(engLow).connect(engBite).connect(sum);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.75;
    const ambHp = ctx.createBiquadFilter();
    ambHp.type = "highpass";
    ambHp.frequency.value = 180;
    this.ambBus.connect(ambHp).connect(sum);

    const ir = ctx.createBuffer(2, Math.floor(sr * 2.6), sr);
    fillReverbIR(ir.getChannelData(0), ir.getChannelData(1), sr, 2.4, 0.55);
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.reverbIn = ctx.createGain();
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    const verbHp = ctx.createBiquadFilter();
    verbHp.type = "highpass";
    verbHp.frequency.value = 220;
    this.reverbIn.connect(verbHp).connect(conv).connect(this.reverbOut).connect(sum);
    this.sfxBus.connect(this.sendTo(0.18));
    this.engineBus.connect(this.sendTo(0.06));

    // Ping-pong delay for arps and the lead.
    this.delayIn = ctx.createGain();
    this.delayL = ctx.createDelay(2);
    this.delayR = ctx.createDelay(2);
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.42;
    fbR.gain.value = 0.42;
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -0.85;
    panR.pan.value = 0.85;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.delayIn.connect(tone).connect(this.delayL);
    this.delayL.connect(panL).connect(wet);
    this.delayL.connect(fbL).connect(this.delayR);
    this.delayR.connect(panR).connect(wet);
    this.delayR.connect(fbR).connect(this.delayL);
    wet.connect(this.musicBus);
  }

  private sendTo(amount: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = amount;
    g.connect(this.reverbIn);
    return g;
  }

  private buildBuffers(): void {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    this.curve = driveCurve(2.2);
    const loopLen = Math.round((sr * FIRINGS) / BASE_FIRING_HZ);
    this.engineBufs = VOICES.map((v, i) => {
      const low = ctx.createBuffer(1, loopLen, sr);
      fillEngineLoop(low.getChannelData(0), sr, FIRINGS, v.lowBody, v.bark, 7 + i);
      const high = ctx.createBuffer(1, loopLen, sr);
      fillEngineLoop(high.getChannelData(0), sr, FIRINGS, v.highBody, v.bark + 0.25, 17 + i);
      return { low, high };
    });
    const mono = (sec: number, fn: (d: Float32Array) => void): AudioBuffer => {
      const b = ctx.createBuffer(1, Math.max(1, Math.floor(sr * sec)), sr);
      fn(b.getChannelData(0));
      return b;
    };
    this.bufs.pinkA = mono(3.1, (d) => fillPink(d, 3));
    this.bufs.pinkB = mono(2.7, (d) => fillPink(d, 9));
    this.bufs.white = mono(1.9, (d) => fillWhite(d, 5));
    this.bufs.chop = mono(1.8, (d) => fillWetSlap(d, sr));
    this.bufs.splash = mono(0.9, (d) => renderSplash(d, sr));
    this.bufs.clang = mono(0.9, (d) => renderClang(d, sr, 170));
    this.bufs.ting = mono(0.5, (d) => renderClang(d, sr, 820, 83));
    this.bufs.boom = mono(1.4, (d) => renderKick(d, sr, 0.5));
    this.bufs.thump = mono(0.5, (d) => renderKick(d, sr, 1.4));
    this.bufs.riser = mono(3.05, (d) => renderRiser(d, sr));
    this.bufs.whoosh = mono(0.7, (d) => {
      renderRiser(d, sr, 63);
      d.reverse();
    });
  }

  private loop(buf: AudioBuffer, dest: AudioNode): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(dest);
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  /** Always-running beds whose gains the engine model rides. */
  private buildBeds(): void {
    const ctx = this.ctx!;
    // Boost turbine whine + jet roar.
    this.whineG = ctx.createGain();
    this.whineG.gain.value = 0;
    this.whineG.connect(this.engineBus);
    this.whineA = ctx.createOscillator();
    this.whineA.type = "sine";
    this.whineB = ctx.createOscillator();
    this.whineB.type = "triangle";
    const wbG = ctx.createGain();
    wbG.gain.value = 0.35;
    this.whineA.connect(this.whineG);
    this.whineB.connect(wbG).connect(this.whineG);
    this.whineA.start();
    this.whineB.start();
    this.roarBp = ctx.createBiquadFilter();
    this.roarBp.type = "bandpass";
    this.roarBp.Q.value = 0.8;
    this.roarG = ctx.createGain();
    this.roarG.gain.value = 0;
    this.loop(this.bufs.pinkB, this.roarBp);
    this.roarBp.connect(this.roarG).connect(this.engineBus);

    // Water rush, stereo-wide.
    this.rushLp = ctx.createBiquadFilter();
    this.rushLp.type = "lowpass";
    this.rushLp.frequency.value = 600;
    this.rushL = ctx.createGain();
    this.rushR = ctx.createGain();
    this.rushL.gain.value = 0;
    this.rushR.gain.value = 0;
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -0.75;
    panR.pan.value = 0.75;
    this.loop(this.bufs.pinkA, this.rushL);
    this.rushL.connect(panL).connect(this.rushLp);
    this.loop(this.bufs.pinkB, this.rushR);
    this.rushR.connect(panR).connect(this.rushLp);
    this.rushLp.connect(this.ambBus);

    // Spray hiss.
    const hissHp = ctx.createBiquadFilter();
    hissHp.type = "highpass";
    hissHp.frequency.value = 3800;
    this.hissG = ctx.createGain();
    this.hissG.gain.value = 0;
    this.loop(this.bufs.white, hissHp);
    hissHp.connect(this.hissG).connect(this.ambBus);

    // Hull chop.
    const chopBp = ctx.createBiquadFilter();
    chopBp.type = "bandpass";
    chopBp.frequency.value = 420;
    chopBp.Q.value = 0.7;
    this.chopG = ctx.createGain();
    this.chopG.gain.value = 0;
    this.chopSrc = this.loop(this.bufs.chop, chopBp);
    chopBp.connect(this.chopG).connect(this.ambBus);

    // Wind.
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = "bandpass";
    this.windBp.frequency.value = 700;
    this.windBp.Q.value = 1.6;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    this.loop(this.bufs.white, this.windBp);
    this.windBp.connect(this.windG).connect(this.ambBus);
  }

  // ───────────────────────────── engine model ─────────────────────────────

  /** Player engine + water. Call every sim tick. */
  setEngine(f: EngineFrame): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (f.voice !== this.engineVoiceId) {
      this.engine?.stop();
      this.engine = new EngineVoice(ctx, this.engineBufs[f.voice] ?? this.engineBufs[0], this.engineBus, this.curve);
      this.engineVoiceId = f.voice;
    }
    const v = VOICES[f.voice] ?? VOICES[0];
    const speedK = clamp01(f.speed / Math.max(1, f.maxSpeed));
    const air = f.airborne ? 1 : 0;
    this.airTime = f.airborne ? this.airTime + 1 / 60 : 0;

    // RPM: speed sets the floor, throttle loads it, airborne lets the prop over-rev.
    let target = 0.82 + speedK * 2.25 + f.throttle * 0.42 + (f.boosting ? 0.55 : 0) + (f.superOn ? 0.35 : 0);
    if (f.airborne) target += 0.9 * f.throttle + 0.3;
    target *= v.rate;
    const rise = target > this.rpm ? (f.airborne ? 0.16 : 0.07) : 0.045;
    this.rpm += (target - this.rpm) * rise;
    const load = clamp01(f.throttle * 0.8 + (f.boosting ? 0.4 : 0));
    this.engine?.set(this.rpm, load, 0.32 + load * 0.2 + speedK * 0.08);

    // Lift-off crackle: exhaust pops when you snap off the throttle at speed.
    if (this.lastThrottle > 0.6 && f.throttle < 0.2 && this.rpm > 1.7) this.pops(4 + Math.floor(Math.random() * 4));
    this.lastThrottle = f.throttle;

    // Turbine spool.
    const spoolTarget = f.boosting ? (f.superOn ? 1 : 0.8) : 0;
    this.spool += (spoolTarget - this.spool) * (spoolTarget > this.spool ? 0.09 : 0.025);
    const whineHz = 700 + this.spool * 2600 + speedK * 300;
    this.whineA.frequency.setTargetAtTime(whineHz, now, 0.05);
    this.whineB.frequency.setTargetAtTime(whineHz * 1.498, now, 0.05);
    this.whineG.gain.setTargetAtTime(this.spool * 0.05 + v.whine * speedK * 0.012, now, 0.05);
    this.roarBp.frequency.setTargetAtTime(500 + this.spool * 1800, now, 0.08);
    this.roarG.gain.setTargetAtTime(this.spool * 0.55, now, 0.06);
    if (f.boosting && !this.lastBoost) this.boostIgnite(f.superOn);
    this.lastBoost = f.boosting;

    // Water beds duck out in the air.
    const wet = 1 - air;
    const rush = (0.05 + speedK * 0.32) * wet;
    this.rushL.gain.setTargetAtTime(rush, now, 0.05);
    this.rushR.gain.setTargetAtTime(rush, now, 0.05);
    this.rushLp.frequency.setTargetAtTime(380 + speedK * 1500 + (f.boosting ? 600 : 0), now, 0.1);
    this.hissG.gain.setTargetAtTime((0.01 + speedK * 0.09 + (f.boosting ? 0.04 : 0)) * wet, now, 0.05);
    this.chopSrc.playbackRate.setTargetAtTime(0.8 + speedK * 0.9, now, 0.1);
    this.chopG.gain.setTargetAtTime((0.02 + speedK * 0.22) * wet, now, 0.05);
    this.windBp.frequency.setTargetAtTime(500 + speedK * 900 + air * 400, now, 0.1);
    this.windG.gain.setTargetAtTime(speedK * speedK * 0.1 + air * 0.12 + this.spool * 0.04, now, 0.08);

    if (f.airborne) this.airTimeAtLanding = this.airTime;
  }

  private airTimeAtLanding = 0;

  /** AI hulls: spatialised engines with Doppler. Pass [] to silence. */
  setRivals(rivals: RivalFrame[], listener: ListenerFrame): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const dt = Math.max(1 / 240, Math.min(0.1, now - this.lastListenerT));
    let lvx = 0;
    let lvy = 0;
    let lvz = 0;
    if (this.lastListener) {
      lvx = (listener.x - this.lastListener.x) / dt;
      lvy = (listener.y - this.lastListener.y) / dt;
      lvz = (listener.z - this.lastListener.z) / dt;
    }
    this.lastListener = { ...listener };
    this.lastListenerT = now;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(listener.x, now, 0.02);
      L.positionY.setTargetAtTime(listener.y, now, 0.02);
      L.positionZ.setTargetAtTime(listener.z, now, 0.02);
      L.forwardX.setTargetAtTime(listener.fx, now, 0.02);
      L.forwardY.setTargetAtTime(listener.fy, now, 0.02);
      L.forwardZ.setTargetAtTime(listener.fz, now, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(listener.x, listener.y, listener.z);
      L.setOrientation(listener.fx, listener.fy, listener.fz, 0, 1, 0);
    }

    const seen = new Set<string>();
    for (const r of rivals) {
      seen.add(r.id);
      let rv = this.rivals.get(r.id);
      if (!rv) {
        rv = new RivalVoice(ctx, this.engineBufs[r.voice] ?? this.engineBufs[0], this.engineBus, this.curve);
        this.rivals.set(r.id, rv);
      }
      const p = rv.panner;
      if (p.positionX) {
        p.positionX.setTargetAtTime(r.x, now, 0.02);
        p.positionY.setTargetAtTime(r.y, now, 0.02);
        p.positionZ.setTargetAtTime(r.z, now, 0.02);
      } else {
        p.setPosition(r.x, r.y, r.z);
      }
      // Doppler: closing speed along the line between hull and lens.
      const dx = listener.x - r.x;
      const dy = listener.y - r.y;
      const dz = listener.z - r.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;
      const vs = r.vx * ux + r.vy * uy + r.vz * uz;
      const vl = -(lvx * ux + lvy * uy + lvz * uz);
      const doppler = Math.min(1.6, Math.max(0.6, (SOUND_SPEED + vl) / Math.max(40, SOUND_SPEED - vs)));
      rv.rate += (doppler - rv.rate) * 0.25;
      const v = VOICES[r.voice] ?? VOICES[0];
      const k = clamp01(r.speed / Math.max(1, r.maxSpeed));
      const rpm = (0.9 + k * 2.3 + (r.boosting ? 0.5 : 0)) * v.rate * rv.rate;
      rv.voice.set(rpm, 0.7 + (r.boosting ? 0.3 : 0), 0.55, 0.05);
    }
    for (const [id, rv] of this.rivals) {
      if (seen.has(id)) continue;
      rv.dispose();
      this.rivals.delete(id);
    }
  }

  /** Cavern sections get a longer, darker tail. */
  setEnvironment(cavern: boolean): void {
    if (!this.ready || cavern === this.cavern) return;
    this.cavern = cavern;
    this.reverbOut.gain.setTargetAtTime(cavern ? 1.25 : 0.55, this.ctx!.currentTime, 0.4);
  }

  /** Music layering: 1 base, 2 pack-hot, 3 final lap. Lands on the next bar. */
  setIntensity(level: number): void {
    if (this.music) this.music.intensity = level;
  }

  setMusic(state: MusicState): void {
    if (!this.ready) {
      this.musicState = state;
      return;
    }
    if (state === this.musicState && state !== "title") return;
    const prev = this.musicState;
    this.musicState = state;
    const now = this.ctx!.currentTime;
    const f = this.musicFilter.frequency;
    f.cancelScheduledValues(now);
    f.setTargetAtTime(state === "paused" ? 520 : 20000, now, state === "paused" ? 0.08 : 0.25);
    this.musicBus.gain.setTargetAtTime(state === "paused" ? 0.35 : 0.55, now, 0.1);
    if (state === "title" || state === "results") {
      if (this.music.playing !== "title") {
        this.music.stop(0.3);
        this.music.play("title", now + (state === "results" ? 2.4 : 0.35));
      }
      this.syncDelay();
      this.silenceEngines();
    } else if (state === "race") {
      if (prev !== "paused") {
        this.music.stop(0.05);
        this.music.play("race", now + 0.01);
      }
      this.syncDelay();
    } else if (state === "countdown") {
      this.music.stop(0.6);
    } else if (state === "muted") {
      this.music.stop(0.4);
    }
  }

  private syncDelay(): void {
    const t = (60 / this.music.bpm) * 0.75;
    const now = this.ctx!.currentTime;
    this.delayL.delayTime.setTargetAtTime(t, now, 0.05);
    this.delayR.delayTime.setTargetAtTime(t, now, 0.05);
  }

  private silenceEngines(): void {
    for (const rv of this.rivals.values()) rv.dispose();
    this.rivals.clear();
  }

  // ───────────────────────────── one-shots ─────────────────────────────

  private play(
    buf: AudioBuffer,
    gain: number,
    opts: { rate?: number; delay?: number; pan?: number; lp?: number; hp?: number; dest?: AudioNode; verb?: number } = {},
  ): AudioBufferSourceNode | null {
    if (!this.ready) return null;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    let node: AudioNode = src;
    if (opts.hp) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = opts.hp;
      node = node.connect(hp);
    }
    if (opts.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = opts.lp;
      node = node.connect(lp);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    node = node.connect(g);
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      node = node.connect(p);
    }
    node.connect(opts.dest ?? this.sfxBus);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      g.connect(s).connect(this.reverbIn);
    }
    src.start(ctx.currentTime + (opts.delay ?? 0));
    return src;
  }

  /** FM bell — pickups, UI and countdown all ring in key. */
  private bell(note: number, t: number, dur: number, gain: number, ratio = 3.5, index = 3, verb = 0.4): void {
    const ctx = this.ctx!;
    const f = midiHz(note);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    car.connect(g).connect(this.sfxBus);
    if (verb > 0) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.reverbIn);
    }
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  private tone(freq: number, t: number, dur: number, gain: number, type: OscillatorType, glideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private duck(depth: number, hold: number): void {
    const now = this.ctx!.currentTime;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1 - depth, now + 0.02);
    g.setTargetAtTime(1, now + hold, 0.25);
  }

  private pops(n: number): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    let t = 0.02;
    for (let i = 0; i < n; i++) {
      t += 0.04 + Math.random() * 0.11;
      this.play(this.bufs.thump, 0.22 + Math.random() * 0.18, { rate: 2.2 + Math.random() * 1.4, delay: t, lp: 1800, pan: (Math.random() - 0.5) * 0.3 });
      this.play(this.bufs.white, 0.12, { rate: 1, delay: t, hp: 1200, lp: 5000 })?.stop(now + t + 0.025);
    }
  }

  boostIgnite(superOn: boolean): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // Air blast sweep.
    const src = ctx.createBufferSource();
    src.buffer = this.bufs.pinkA;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(240, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.38);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(bp).connect(g).connect(this.sfxBus);
    g.connect(this.sendTo(0.3));
    src.start(t, Math.random());
    src.stop(t + 0.8);
    // Sub kick in the chest.
    this.tone(130, t, 0.45, 0.5, "sine", 38);
    this.play(this.bufs.thump, 0.5, { rate: 0.8 });
    this.pops(3);
    if (superOn) {
      [69, 76, 81, 88].forEach((n, i) => this.bell(n, t + i * 0.05, 0.9, 0.07, 2, 1.5, 0.6));
      this.duck(0.35, 0.3);
    } else {
      this.duck(0.2, 0.15);
    }
  }

  pickup(kind: string): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const seq = kind === "super" ? [69, 76, 81, 85, 88, 93] : kind === "red" ? [76, 81, 88] : [81, 88];
    const step = kind === "super" ? 0.045 : 0.06;
    seq.forEach((n, i) => this.bell(n, t + i * step, 0.7, 0.085, 3.01, 2.2, 0.5));
    this.tone(1800, t, 0.12, 0.03, "sine", 4200);
  }

  ram(pan = 0): void {
    if (!this.ready) return;
    this.play(this.bufs.clang, 0.6, { rate: 0.85 + Math.random() * 0.2, pan, verb: 0.35 });
    this.play(this.bufs.thump, 0.85, { rate: 0.7, pan });
    this.play(this.bufs.splash, 0.4, { rate: 1.3, pan, hp: 300 });
    this.duck(0.3, 0.15);
  }

  scrape(pan = 0): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    this.play(this.bufs.white, 0.32, { rate: 0.6 + Math.random() * 0.3, hp: 1400, lp: 4200, pan })?.stop(now + 0.09);
    if (Math.random() < 0.35) this.play(this.bufs.ting, 0.12, { rate: 0.9 + Math.random() * 0.4, pan, verb: 0.2 });
    this.play(this.bufs.splash, 0.18, { rate: 1.6, pan, hp: 500 });
  }

  respawn(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.play(this.bufs.whoosh, 0.4, { rate: 0.7 });
    this.bell(57, t + 0.05, 0.5, 0.08, 1.4, 1);
    this.bell(52, t + 0.18, 0.7, 0.08, 1.4, 1);
  }

  /** Landing slam; with no argument it scales with how long the hull was airborne. */
  splash(intensity?: number): void {
    if (!this.ready) return;
    const k = clamp01(intensity ?? 0.35 + this.airTimeAtLanding * 1.1);
    this.play(this.bufs.splash, 0.35 + k * 0.6, { rate: 1.15 - k * 0.35, verb: 0.15 });
    this.play(this.bufs.thump, 0.25 + k * 0.5, { rate: 0.6, lp: 300 });
    if (k > 0.6) this.duck(0.2, 0.1);
  }

  /** Dry tank: coughs falling in pitch, then a hiss. */
  sputter(): void {
    if (!this.ready) return;
    for (let i = 0; i < 5; i++) {
      this.play(this.bufs.thump, 0.4 - i * 0.06, { rate: 1.6 - i * 0.18, delay: i * 0.11, lp: 900 });
    }
    this.play(this.bufs.whoosh, 0.15, { rate: 1.4, hp: 2000 });
  }

  mine(): void {
    if (!this.ready) return;
    this.play(this.bufs.boom, 1, { rate: 0.55, verb: 0.5 });
    this.play(this.bufs.splash, 0.8, { rate: 0.6, verb: 0.3 });
    this.play(this.bufs.clang, 0.25, { rate: 0.5 });
    this.duck(0.55, 0.35);
  }

  /** A shell bursting `dist` world units from the listener: delayed boom + crackle tail. */
  firework(dist: number): void {
    if (!this.ready) return;
    const delay = Math.min(0.6, dist / 340);
    const near = Math.max(0.15, Math.min(1, 60 / Math.max(20, dist)));
    const pan = (Math.random() - 0.5) * 1.2;
    this.play(this.bufs.boom, 0.55 * near, { rate: 0.42 + Math.random() * 0.12, delay, verb: 0.9, pan });
    this.play(this.bufs.thump, 0.3 * near, { rate: 0.5, delay, lp: 600, pan });
    for (let i = 0; i < 14; i++) {
      const t = delay + 0.25 + Math.random() * 1.2;
      this.play(this.bufs.white, 0.1 * near * Math.random(), { rate: 0.7 + Math.random(), delay: t, hp: 2500, pan: pan + (Math.random() - 0.5) * 0.6 })?.stop(this.ctx!.currentTime + t + 0.02);
    }
  }

  /** Rocket whistle climbing into the sky. */
  fireworkLaunch(dist: number): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const near = Math.max(0.1, Math.min(1, 50 / Math.max(20, dist)));
    this.tone(900 + Math.random() * 300, t, 1.0, 0.025 * near, "sine", 2400 + Math.random() * 600);
  }

  jump(): void {
    if (!this.ready) return;
    this.play(this.bufs.whoosh, 0.45, { rate: 1.1 });
    this.play(this.bufs.splash, 0.3, { rate: 1.4, hp: 600 });
  }

  countdown(label: string): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    if (label === "3") {
      this.play(this.bufs.riser, 0.32, { verb: 0.3 });
      this.say("Three");
    }
    if (label === "GO") {
      [57, 64, 69, 76].forEach((n) => this.bell(n, t, 1.4, 0.07, 1, 1.2, 0.6));
      this.tone(220, t, 0.4, 0.12, "sawtooth", 440);
      this.play(this.bufs.boom, 0.7, { rate: 0.9 });
      this.say("Go!", 1.15);
      this.setMusic("race");
    } else {
      const n = label === "1" ? 69 : 57;
      this.bell(n, t, 0.5, 0.11, 1, 0.8, 0.3);
      this.tone(midiHz(n), t, 0.18, 0.06, "square");
      if (label !== "3") this.say(label === "2" ? "Two" : "One");
    }
  }

  lap(n: number, final: boolean): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [69, 73, 76].forEach((m, i) => this.bell(m + (final ? 12 : 0), t + i * 0.07, 0.6, 0.07, 2, 1.4, 0.5));
    if (final) {
      this.play(this.bufs.riser, 0.25, { rate: 2.4 });
      this.say("Final lap!");
      this.setIntensity(3);
    } else {
      this.say(`Lap ${n}`);
    }
  }

  place(gained: boolean, place: number): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    if (gained) {
      this.bell(76, t, 0.3, 0.05, 2, 1);
      this.bell(81, t + 0.06, 0.4, 0.05, 2, 1);
      if (place === 1) this.say("You've got the lead!", 1.05);
    } else {
      this.bell(69, t, 0.3, 0.04, 2, 1);
      this.bell(64, t + 0.07, 0.4, 0.04, 2, 1);
    }
  }

  finish(win: boolean): void {
    if (!this.ready) return;
    this.music.sting(win);
    this.play(this.bufs.boom, 0.6, { rate: 1.1 });
    this.duck(0.7, 1.4);
    this.say(win ? "Winner!" : "Finish!", 1.1);
  }

  ui(kind: UiSound): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    if (kind === "move") {
      this.bell(88, t, 0.12, 0.04, 2, 0.6, 0.15);
    } else if (kind === "confirm") {
      this.bell(76, t, 0.35, 0.06, 2, 1);
      this.bell(81, t + 0.06, 0.5, 0.06, 2, 1);
      this.play(this.bufs.whoosh, 0.25, { rate: 1.3, hp: 800 });
    } else {
      this.bell(76, t, 0.25, 0.05, 2, 1);
      this.bell(69, t + 0.06, 0.35, 0.05, 2, 1);
    }
  }

  // ───────────────────────────── announcer ─────────────────────────────

  private pickVoice(): void {
    if (typeof speechSynthesis === "undefined") return;
    const choose = () => {
      const voices = speechSynthesis.getVoices();
      const pref = ["Daniel", "Google UK English Male", "Alex", "Fred", "Google US English", "Microsoft Guy", "Microsoft David"];
      this.voice =
        pref.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        null;
    };
    choose();
    speechSynthesis.addEventListener?.("voiceschanged", choose);
  }

  private say(text: string, rate = 1): void {
    if (!this.announcer || this.muted || typeof speechSynthesis === "undefined") return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = rate;
      u.pitch = 0.7;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {
      /* no TTS */
    }
  }

  toggleAnnouncer(): boolean {
    this.announcer = !this.announcer;
    try {
      localStorage.setItem("hh-announcer", this.announcer ? "1" : "0");
    } catch {
      /* ignore */
    }
    return this.announcer;
  }
}
