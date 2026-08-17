import type { BoatId } from "../data/boats";
import { BOATS } from "../data/boats";
import { buildCourse, type CourseId } from "../data/tracks/catalog";
import { rollCrateKinds } from "../data/tracks/riptideRefinery";
import { GameAudio } from "../audio/Audio";
import { Input } from "../input/Input";
import { GameRenderer } from "../render/Scene";
import { createBoat, type Boat } from "../sim/Boat";
import { assignAIBoats, driveAI } from "../sim/AIRacer";
import { stepBoat } from "../sim/BoatController";
import { resetRamTable, resolveHulls } from "../sim/Collision";
import { AI_COUNT, FIXED_DT, MAX_FRAME_DT } from "../sim/constants";
import { stepPickups } from "../sim/Pickups";
import {
  countdownLabel,
  createDirector,
  startCountdown,
  stepDirector,
  type RaceDirector,
} from "../sim/RaceDirector";
import { gridPose } from "../sim/Track";
import type { TrackWorld } from "../sim/Track";
import { Overlay } from "../ui/overlay";

type Mode = "title" | "select" | "race" | "pause" | "results";

export class Game {
  private overlay: Overlay;
  private input: Input;
  private audio: GameAudio;
  private renderer: GameRenderer;
  private track: TrackWorld;
  private boats: Boat[] = [];
  private player!: Boat;
  private director: RaceDirector = createDirector();
  private mode: Mode = "title";
  private acc = 0;
  private time = 0;
  private last = performance.now();
  private lastCount = "";
  private lastPlace = 1;
  private playerBoat: BoatId = "skimmer";
  private courseId: CourseId = "riptide";

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.overlay = new Overlay(root);
    this.overlay.showDebug = new URLSearchParams(location.search).has("debug");
    this.input = new Input();
    this.audio = new GameAudio();
    this.renderer = new GameRenderer(canvas);
    this.track = buildCourse(this.courseId);
    this.renderer.loadTrack(this.track);
    this.spawnIdle();

    this.overlay.on({
      start: () => {
        this.audio.resume();
        this.mode = "select";
        this.overlay.show("select");
      },
      select: (id) => {
        this.playerBoat = id;
      },
      race: () => this.beginRace(),
      retry: () => this.beginRace(),
      menu: () => {
        this.mode = "title";
        this.overlay.show("title");
        this.spawnIdle();
      },
      resume: () => this.resume(),
    });
    this.overlay.show("title");
    window.addEventListener("resize", () => this.renderer.resize());
  }

  start(): void {
    const tick = (now: number) => {
      const raw = Math.min(MAX_FRAME_DT, (now - this.last) / 1000);
      this.last = now;
      this.acc += raw;
      while (this.acc >= FIXED_DT) {
        this.fixed(FIXED_DT);
        this.acc -= FIXED_DT;
      }
      this.time += raw;
      this.renderer.render(this.track, this.boats, this.player, raw, this.time);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private spawnIdle(): void {
    this.track = buildCourse(this.courseId);
    rollCrateKinds(this.track);
    this.renderer.loadTrack(this.track);
    this.player = createBoat("player", this.playerBoat, false);
    const pose = gridPose(this.track, 0);
    this.player.x = pose.x;
    this.player.y = pose.y;
    this.player.z = pose.z;
    this.player.yaw = pose.yaw;
    this.boats = [this.player];
    this.director = createDirector();
  }

  private beginRace(): void {
    this.audio.resume();
    this.track = buildCourse(this.courseId);
    rollCrateKinds(this.track);
    this.renderer.loadTrack(this.track);
    resetRamTable();
    this.player = createBoat("player", this.playerBoat, false);
    const aiIds = assignAIBoats(this.playerBoat);
    const extras = BOATS.map((b) => b.id).filter((id) => id !== this.playerBoat);
    this.boats = [this.player];
    for (let i = 0; i < AI_COUNT; i++) {
      this.boats.push(createBoat(`ai${i}`, aiIds[i % aiIds.length] ?? extras[i % extras.length], true));
    }
    this.boats.forEach((b, i) => {
      const pose = gridPose(this.track, i);
      b.x = pose.x;
      b.y = pose.y;
      b.z = pose.z;
      b.yaw = pose.yaw;
    });
    this.director = createDirector();
    startCountdown(this.director);
    this.mode = "race";
    this.overlay.show("hud");
    this.lastCount = "";
    this.lastPlace = this.player.place;
  }

  private resume(): void {
    if (this.mode !== "pause") return;
    this.mode = "race";
    this.overlay.show("hud");
  }

  private fixed(dt: number): void {
    if (this.input.consumePause()) {
      if (this.mode === "race") {
        this.mode = "pause";
        this.overlay.show("pause");
      } else if (this.mode === "pause") {
        this.resume();
      }
    }

    const racing = this.mode === "race" && this.director.phase === "racing";
    const input = this.input.read();

    if (this.mode === "race" && (this.director.phase === "countdown" || this.director.phase === "racing")) {
      this.player.throttle = input.throttle;
      this.player.steer = input.steer;
      this.player.brake = input.brake;
      this.player.boostHeld = input.boost;
      for (const boat of this.boats) {
        if (boat.ai) driveAI(boat, this.track, this.player, racing, this.boats);
      }
      for (const boat of this.boats) {
        const step = stepBoat(boat, this.track, dt, this.director.time, !racing);
        if (boat === this.player && step.landed) this.audio.splash();
      }
      if (racing) {
        const rams = resolveHulls(this.boats, this.time);
        for (const ram of rams) {
          if (!ram.awarded) continue;
          this.audio.ram();
          this.renderer.slam(ram.defender.x, ram.defender.y + 1, ram.defender.z);
          if (ram.attacker === this.player || ram.defender === this.player) {
            this.overlay.flashHit(ram.attacker === this.player ? "RAM +1" : "HIT");
          }
        }
        const ev = stepPickups(this.track, this.boats, dt, this.time);
        for (const e of ev) {
          if (e.kind === "mine") this.audio.mine();
          else this.audio.pickup(e.kind);
        }
      }
      stepDirector(this.director, this.boats, dt);
      const label = countdownLabel(this.director);
      if (label && label !== this.lastCount) {
        this.audio.countdown(label);
        this.lastCount = label;
      }
      this.overlay.updateHud(
        this.player,
        this.director,
        this.director.phase === "countdown" ? label : null,
        this.boats,
      );
      if (racing && this.player.place !== this.lastPlace) {
        if (this.player.place < this.lastPlace) {
          this.overlay.flashHit("PASSED");
          this.audio.announce();
        } else if (this.player.place > this.lastPlace) {
          this.overlay.flashHit("OVERTAKEN");
          this.audio.announceDown();
        }
        this.lastPlace = this.player.place;
      }
    }

    if (this.mode === "race" && this.director.phase === "finish") {
      this.mode = "results";
      this.overlay.showResults(this.boats);
      this.overlay.show("results");
      this.audio.finish();
    } else if (this.mode === "title" || this.mode === "select") {
      this.player.throttle = 0.82;
      this.player.steer = Math.sin(this.time * 0.2) * 0.12;
      stepBoat(this.player, this.track, dt, 0, false);
    }

    const boosting = this.player.boostHeld && (this.player.boostFuel > 0 || this.player.superBoostRemaining > 0);
    const voice = this.player.def.id === "ironwake" ? 2 : this.player.def.id === "vesper" ? 1 : 0;
    this.audio.setEngine(this.player.speed, boosting, voice);
    if (this.overlay.showDebug) {
      this.overlay.setDebug(
        `fps ${(1 / dt).toFixed(0)}  spd ${this.player.speed.toFixed(1)}  t ${this.player.courseT.toFixed(3)}\nlap ${this.player.lap} cp ${this.player.lastCheckpoint} air ${this.player.airborne ? "Y" : "n"}  boost ${this.player.boostFuel.toFixed(2)}`,
      );
    }
  }
}
