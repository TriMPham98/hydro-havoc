import { midiHz, renderClap, renderCrash, renderHat, renderKick, renderSnare } from "./synth";

export type Song = "title" | "race";

/** One bar per chord. Pad voicings are hand-led so the top note barely moves. */
interface SongDef {
  bpm: number;
  roots: number[];
  pads: number[][];
  swing: number;
}

const RACE: SongDef = {
  bpm: 148,
  roots: [45, 41, 48, 43],
  pads: [
    [57, 60, 64, 69],
    [57, 60, 65, 69],
    [55, 60, 64, 67],
    [55, 59, 62, 67],
  ],
  swing: 0,
};

const TITLE: SongDef = {
  bpm: 96,
  roots: [45, 41, 48, 43],
  pads: [
    [57, 60, 64, 71],
    [57, 60, 64, 65],
    [55, 60, 62, 64],
    [55, 59, 62, 64],
  ],
  swing: 0.12,
};

/** [step, midi, length-in-steps] per bar — the final-lap hook. */
const LEAD: [number, number, number][][] = [
  [[0, 76, 4], [4, 74, 2], [6, 72, 2], [8, 71, 2], [10, 72, 6]],
  [[0, 69, 4], [4, 72, 2], [6, 77, 6], [12, 76, 2], [14, 74, 2]],
  [[0, 76, 4], [4, 79, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4]],
  [[0, 71, 6], [6, 74, 2], [8, 79, 6], [14, 83, 2]],
];

const ARP_SHAPE = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];

export interface MusicBuses {
  out: AudioNode;
  reverb: AudioNode;
  delay: AudioNode;
}

export class Music {
  private ctx: AudioContext;
  private drums: GainNode;
  private synths: GainNode;
  private duck: GainNode;
  private reverbSend: GainNode;
  private delaySend: GainNode;
  private kick: AudioBuffer;
  private snare: AudioBuffer;
  private clap: AudioBuffer;
  private hat: AudioBuffer;
  private openHat: AudioBuffer;
  private crash: AudioBuffer;
  private song: Song | null = null;
  private def: SongDef = RACE;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private kicks: number[] = [];
  private bars = 0;
  /** 0 calm … 3 final-lap frenzy. Applied on the next bar line so layers land on the one. */
  intensity = 1;
  private live = 1;
  private songGain: GainNode;

  constructor(ctx: AudioContext, buses: MusicBuses) {
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    const mk = (sec: number, fn: (d: Float32Array) => void): AudioBuffer => {
      const b = ctx.createBuffer(1, Math.floor(sr * sec), sr);
      fn(b.getChannelData(0));
      return b;
    };
    this.kick = mk(0.5, (d) => renderKick(d, sr));
    this.snare = mk(0.35, (d) => renderSnare(d, sr));
    this.clap = mk(0.4, (d) => renderClap(d, sr));
    this.hat = mk(0.08, (d) => renderHat(d, sr, false));
    this.openHat = mk(0.4, (d) => renderHat(d, sr, true));
    this.crash = mk(2.2, (d) => renderCrash(d, sr));

    this.songGain = ctx.createGain();
    this.songGain.gain.value = 0;
    this.songGain.connect(buses.out);
    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.songGain);
    this.duck = ctx.createGain();
    this.duck.connect(this.songGain);
    this.synths = ctx.createGain();
    this.synths.gain.value = 0.8;
    this.synths.connect(this.duck);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(buses.reverb);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.45;
    this.delaySend.connect(buses.delay);
  }

  get bpm(): number {
    return this.def.bpm;
  }

  get playing(): Song | null {
    return this.song;
  }

  /** Starts `song` on a fresh bar at `at` (ctx time). Re-calling with the same song is a no-op. */
  play(song: Song, at = this.ctx.currentTime + 0.05): void {
    if (this.song === song) return;
    this.song = song;
    this.def = song === "race" ? RACE : TITLE;
    this.step = 0;
    this.bars = 0;
    this.nextTime = Math.max(at, this.ctx.currentTime + 0.02);
    this.live = song === "race" ? this.intensity : 1;
    const g = this.songGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(song === "race" ? 1 : 0.85, this.nextTime + 0.02);
    if (song === "race") this.hit(this.crash, this.nextTime, 0.5, this.drums, 0.6);
    if (!this.timer) this.timer = setInterval(() => this.pump(), 25);
  }

  stop(fade = 0.4): void {
    this.song = null;
    const now = this.ctx.currentTime;
    const g = this.songGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 1 on each kick, decaying ~120ms — for HUD / bloom pulses. */
  beatPulse(): number {
    const now = this.ctx.currentTime;
    let last = -1;
    for (const k of this.kicks) if (k <= now && k > last) last = k;
    if (last < 0 || !this.song) return 0;
    return Math.exp(-(now - last) * 9);
  }

  /** Short victory or "not quite" sting on top of whatever plays. */
  sting(win: boolean): void {
    const t = this.ctx.currentTime + 0.05;
    const notes = win ? [60, 64, 67, 72, 76, 79, 84] : [69, 67, 64, 62, 57];
    notes.forEach((n, i) => this.lead(n, t + i * 0.085, win && i === notes.length - 1 ? 1.4 : 0.22, 0.16));
    if (win) {
      this.pad([60, 64, 67, 72], t + notes.length * 0.085, 2.2, 0.14);
      this.hit(this.crash, t + notes.length * 0.085, 0.6, this.drums, 0.7);
    }
  }

  private pump(): void {
    if (!this.song) return;
    const ahead = this.ctx.currentTime + 0.14;
    const stepDur = 60 / this.def.bpm / 4;
    while (this.nextTime < ahead) {
      const s = this.step % 16;
      const swing = s % 2 === 1 ? this.def.swing * stepDur : 0;
      if (s === 0 && this.song === "race") {
        this.live = this.intensity;
      }
      if (this.song === "race") this.raceStep(this.step, this.nextTime + swing, stepDur);
      else this.titleStep(this.step, this.nextTime + swing, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step % 16 === 0) this.bars++;
    }
    const now = this.ctx.currentTime;
    this.kicks = this.kicks.filter((k) => k > now - 1);
  }

  private raceStep(step: number, t: number, sd: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = bar % 4;
    const lvl = this.live;
    const root = this.def.roots[chord];
    const fillBar = bar % 8 === 7;

    // Drums
    if (s % 4 === 0 && !(fillBar && s >= 12)) this.kickAt(t, 1);
    if (lvl >= 2 && s === 14 && bar % 2 === 1) this.kickAt(t, 0.7);
    if (s === 4 || s === 12) {
      this.hit(this.snare, t, 0.55, this.drums);
      if (lvl >= 2) this.hit(this.clap, t, 0.45, this.drums, 0.5);
    }
    if (fillBar && s >= 12) this.hit(this.snare, t, 0.25 + (s - 12) * 0.1, this.drums, 0.2, 1 + (s - 12) * 0.04);
    const hatOn = lvl >= 2 ? true : s % 2 === 0;
    if (hatOn) this.hit(this.hat, t, s % 4 === 2 ? 0.5 : 0.26, this.drums, 0, 1 + (s % 2) * 0.05);
    if (lvl >= 3 && s % 4 === 2) this.hit(this.openHat, t, 0.26, this.drums, 0.1);
    if (lvl >= 3 && s === 0 && bar % 4 === 0) this.hit(this.crash, t, 0.38, this.drums, 0.5);

    // Bass: offbeat octave pump, rolling 16ths once the pack is hot.
    if (lvl >= 2) {
      if (s % 4 !== 0) this.bass(root + (s % 4 === 2 ? 12 : 0), t, sd * 0.9, s % 4 === 2 ? 0.34 : 0.24);
    } else if (s % 4 === 2) {
      this.bass(root + 12, t, sd * 1.6, 0.32);
      this.bass(root, t, sd * 1.6, 0.18);
    }

    // Pad on the bar.
    if (s === 0) this.pad(this.def.pads[chord], t, sd * 16, lvl >= 3 ? 0.075 : 0.06);

    // Arp
    if (lvl >= 2) {
      const tones = this.def.pads[chord];
      const idx = ARP_SHAPE[s];
      const n = tones[idx % tones.length] + 12 * (1 + Math.floor(idx / tones.length));
      this.arp(n, t, sd * 0.8, 0.055);
    }

    // Lead
    if (lvl >= 3) {
      for (const [at, note, len] of LEAD[chord]) {
        if (at === s) this.lead(note, t, len * sd * 0.95, 0.075);
      }
    }
  }

  private titleStep(step: number, t: number, sd: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = bar % 4;
    const root = this.def.roots[chord];
    if (s === 0 || (s === 10 && bar % 2 === 1)) this.kickAt(t, 0.55);
    if (s === 8) this.hit(this.clap, t, 0.22, this.drums, 0.9);
    if (s % 2 === 0) this.hit(this.hat, t, s % 4 === 2 ? 0.2 : 0.1, this.drums, 0.05);
    if (s === 0) {
      this.pad(this.def.pads[chord], t, sd * 16.5, 0.075);
      this.bass(root, t, sd * 15, 0.22);
    }
    if (s % 2 === 0) {
      const tones = this.def.pads[chord];
      const idx = ARP_SHAPE[(s / 2 + bar * 3) % ARP_SHAPE.length];
      const n = tones[idx % tones.length] + 12 * (1 + Math.floor(idx / tones.length));
      this.arp(n, t, sd * 1.4, 0.045);
    }
  }

  private kickAt(t: number, gain: number): void {
    this.hit(this.kick, t, 0.9 * gain, this.drums);
    this.kicks.push(t);
    // Sidechain pump on everything tonal.
    const g = this.duck.gain;
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.32, t + 0.008);
    g.setTargetAtTime(1, t + 0.03, 0.07);
  }

  private hit(buf: AudioBuffer, t: number, gain: number, dest: AudioNode, verb = 0, rate = 1): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    if (verb > 0) {
      const v = this.ctx.createGain();
      v.gain.value = verb;
      g.connect(v).connect(this.reverbSend);
    }
    src.start(t);
  }

  private bass(note: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const a = ctx.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = midiHz(note);
    const b = ctx.createOscillator();
    b.type = "square";
    b.frequency.value = midiHz(note - 12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.012);
    lp.frequency.setTargetAtTime(240, t + 0.015, dur * 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.setTargetAtTime(0, t + dur, 0.03);
    const bg = ctx.createGain();
    bg.gain.value = 0.5;
    a.connect(lp);
    b.connect(bg).connect(lp);
    lp.connect(g).connect(this.synths);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.2);
    b.stop(t + dur + 0.2);
  }

  private pad(notes: number[], t: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(2600, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.2));
    g.gain.setValueAtTime(gain, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.3);
    lp.connect(g);
    g.connect(this.synths);
    g.connect(this.reverbSend);
    const pan = [-0.6, 0.6, -0.25, 0.25];
    notes.forEach((n, i) => {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midiHz(n);
        o.detune.value = det + (i - 1.5) * 2;
        const p = ctx.createStereoPanner();
        p.pan.value = pan[i % pan.length] * (det > 0 ? 1 : -1);
        o.connect(p).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    });
  }

  private arp(note: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = midiHz(note);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(lp).connect(g);
    g.connect(this.synths);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private lead(note: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.setTargetAtTime(gain * 0.7, t + 0.05, 0.1);
    g.gain.setTargetAtTime(0, t + dur, 0.06);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.6;
    const vibAmt = ctx.createGain();
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(14, t + Math.min(0.4, dur));
    vib.connect(vibAmt);
    lp.connect(g);
    g.connect(this.synths);
    g.connect(this.delaySend);
    g.connect(this.reverbSend);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midiHz(note);
      o.detune.value = det;
      vibAmt.connect(o.detune);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
    vib.start(t);
    vib.stop(t + dur + 0.4);
  }
}
