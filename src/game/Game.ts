import type { BoatId } from "../data/boats";
import { buildCourse, type CourseId } from "../data/tracks/catalog";
import { rollCrateKinds } from "../data/tracks/riptideRefinery";
import { GameAudio } from "../audio/Audio";
import { Input } from "../input/Input";
import { GameRenderer } from "../render/Scene";
import type { CameraMode } from "../render/CameraRig";
import { copyPose, createBoat, headingVector, type Boat } from "../sim/Boat";
import { assignAIBoats, driveAI } from "../sim/AIRacer";
import { stepBoat } from "../sim/BoatController";
import { resetRamTable, resolveHulls } from "../sim/Collision";
import { AI_COUNT, FIXED_DT, MAX_FRAME_DT } from "../sim/constants";
import { boostLive, igniteJet } from "../sim/BoostSystem";
import { lerp } from "../sim/math";
import { stepPickups } from "../sim/Pickups";
import {
  countdownLabel,
  createDirector,
  startCountdown,
  stepDirector,
  type RaceDirector,
} from "../sim/RaceDirector";
import { attractPose, gridPose, showcasePose } from "../sim/Track";
import { placeBoats } from "../sim/progress";
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
  private lastPhase = "";
  private lastScrape = 0;
  private playerJumped = false;
  private jumpHintShown = false;
  private playerBoat: BoatId = "skimmer";
  private courseId: CourseId = "riptide";
  private visualCourse: CourseId | null = null;
  private lastAttractBeat = -1;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.overlay = new Overlay(root);
    this.overlay.showDebug = new URLSearchParams(location.search).has("debug");
    this.input = new Input();
    this.audio = new GameAudio();
    this.renderer = new GameRenderer(canvas);
    this.track = buildCourse(this.courseId);
    this.renderer.loadTrack(this.track);
    this.visualCourse = this.courseId;

    this.overlay.on({
      start: () => this.goSelect(),
      select: (id) => this.pickHull(id),
      race: () => this.beginRace(),
      retry: () => this.beginRace(),
      menu: () => this.goTitle(),
      resume: () => this.resume(),
      changeBoat: () => this.goSelect(),
    });
    this.overlay.show("title");
    window.addEventListener("resize", () => this.renderer.resize());
    const unlock = () => {
      this.audio.resume();
      if (this.mode === "title" || this.mode === "select") this.audio.setMusic("title");
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  start(): void {
    void this.renderer.whenBoatsReady().then(() => {
      this.spawnIdle();
      this.last = performance.now();
      const tick = (now: number) => {
        const elapsed = (now - this.last) / 1000;
        const raw = Math.min(MAX_FRAME_DT, elapsed);
        this.last = now;
        this.acc += raw;
        while (this.acc >= FIXED_DT) {
          this.fixed(FIXED_DT);
          this.acc -= FIXED_DT;
        }
        this.time += raw;
        this.renderer.render(this.track, this.boats, this.player, raw, this.time, this.camMode());
        if (this.overlay.showDebug) {
          const stats = this.renderer.frameStats();
          const fps = 1 / Math.max(elapsed, 1e-4);
          this.overlay.setDebug(
            `fps ${fps.toFixed(0)}  ${(elapsed * 1000).toFixed(1)}ms  dpr ${stats.dpr.toFixed(2)}\n` +
              `draw ${stats.calls}  tris ${stats.triangles}\n` +
              `spd ${this.player.speed.toFixed(1)}  t ${this.player.courseT.toFixed(3)}\n` +
              `lap ${this.player.lap} cp ${this.player.lastCheckpoint} air ${this.player.airborne ? "Y" : "n"}  boost ${this.player.boostFuel.toFixed(2)}`,
          );
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private camMode(): CameraMode {
    if (this.mode === "select") return "showcase";
    if (this.mode === "race" && this.director.phase === "closing") return "finish";
    if (this.mode === "results") return "finish";
    return "chase";
  }

  private goTitle(): void {
    this.mode = "title";
    this.overlay.show("title");
    this.audio.setMusic("title");
    this.spawnIdle();
  }

  private goSelect(): void {
    this.audio.resume();
    this.audio.setMusic("title");
    this.mode = "select";
    this.overlay.show("select");
    this.overlay.setSelected(this.playerBoat);
    this.spawnIdle();
  }

  private pickHull(id: BoatId): void {
    this.playerBoat = id;
    if (this.mode !== "select" || !this.player) return;
    this.player = createBoat("player", id, false);
    this.parkShowcase();
    this.boats = [this.player];
  }

  private bindCourse(): void {
    this.track = buildCourse(this.courseId);
    rollCrateKinds(this.track);
    if (this.visualCourse !== this.courseId) {
      this.renderer.loadTrack(this.track);
      this.visualCourse = this.courseId;
    } else {
      this.renderer.syncPickups(this.track);
    }
  }

  private spawnIdle(): void {
    this.bindCourse();
    if (this.mode === "select") {
      this.player = createBoat("player", this.playerBoat, false);
      this.parkShowcase();
      this.boats = [this.player];
      this.director = createDirector();
      this.renderer.camera.snapShowcase(this.player);
      return;
    }
    this.player = createBoat("player", this.playerBoat, false);
    const pose = attractPose(this.track, 0);
    copyPose(this.player, pose);
    this.player.courseT = pose.t;
    this.player.speed = 22;
    const h = headingVector(this.player.yaw);
    this.player.vx = h.x * this.player.speed;
    this.player.vz = h.z * this.player.speed;
    this.player.throttle = 0.8;
    this.boats = [this.player];
    this.director = createDirector();
    this.lastAttractBeat = -1;
    this.renderer.camera.reset();
  }

  private pinGrid(): void {
    this.boats.forEach((boat, i) => {
      const pose = gridPose(this.track, i);
      copyPose(boat, pose);
      boat.courseT = pose.t;
      boat.speed = 0;
      boat.vx = 0;
      boat.vy = 0;
      boat.vz = 0;
      boat.throttle = 0;
      boat.steer = 0;
      boat.brake = 0;
      boat.boostHeld = false;
    });
  }

  private parkShowcase(): void {
    const pose = showcasePose(this.track);
    copyPose(this.player, pose);
    this.player.courseT = 0.06;
    this.player.speed = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.vz = 0;
  }

  private beginRace(): void {
    this.audio.resume();
    this.audio.setMusic("race");
    this.bindCourse();
    resetRamTable();
    this.player = createBoat("player", this.playerBoat, false);
    const aiIds = assignAIBoats(this.playerBoat);
    this.boats = [this.player];
    for (let i = 0; i < AI_COUNT; i++) {
      this.boats.push(createBoat(`ai${i}`, aiIds[i % aiIds.length] ?? "skimmer", true));
    }
    this.boats.forEach((b, i) => {
      const pose = gridPose(this.track, i);
      copyPose(b, pose);
      b.courseT = pose.t;
      b.place = i + 1;
    });
    placeBoats(this.boats);
    this.director = createDirector();
    startCountdown(this.director);
    this.mode = "race";
    this.playerJumped = false;
    this.jumpHintShown = false;
    this.overlay.show("hud");
    this.lastCount = "";
    this.lastPlace = this.player.place;
    this.lastPhase = "countdown";
    this.renderer.camera.snap(this.player, this.track);
  }

  private resume(): void {
    if (this.mode !== "pause") return;
    this.mode = "race";
    this.overlay.show("hud");
    this.audio.setMusic("race");
  }

  private fixed(dt: number): void {
    this.menus();

    const racing = this.mode === "race" && (this.director.phase === "racing" || this.director.phase === "closing");
    const counting = this.mode === "race" && this.director.phase === "countdown";
    const input = this.input.read();

    if (counting) {
      this.pinGrid();
      stepDirector(this.director, this.boats, dt);
      if (this.lastPhase === "countdown" && this.director.phase === "racing") {
        for (const b of this.boats) {
          b.speed = 18;
          const h = headingVector(b.yaw);
          b.vx = h.x * b.speed;
          b.vz = h.z * b.speed;
        }
      }
    } else if (this.mode === "race" && racing) {
      const locked = this.player.finished;
      this.player.throttle = locked ? 0 : input.throttle;
      const wantSteer = locked ? 0 : input.steer;
      this.player.steer = lerp(this.player.steer, wantSteer, 1 - Math.exp(-9 * dt));
      this.player.brake = locked ? 0 : input.brake;
      this.player.boostHeld = locked ? false : input.boost;
      for (const boat of this.boats) {
        if (boat.ai) driveAI(boat, this.track, this.player, true, this.boats);
      }
      for (const boat of this.boats) {
        const step = stepBoat(boat, this.track, dt, this.director.time, false);
        if (boat !== this.player) continue;
        if (step.jumped && !this.playerJumped) {
          this.playerJumped = true;
          this.overlay.flashHit("HYDRO JUMP");
        }
        if (step.landed) {
          this.audio.splash();
          this.renderer.slam(boat.x, boat.y + 0.4, boat.z);
          this.renderer.hitPunch(step.wipeout ? 0.7 : step.stuntAward > 0 ? 0.5 : 0.35);
          if (step.wipeout) this.overlay.flashHit("WIPEOUT");
          else if (step.stuntAward > 0) this.overlay.flashHit(`STUNT +${step.stuntAward}`);
        }
        if (step.bankHit && boat.speed > 8) {
          this.renderer.bankSpray(boat.x, boat.y + 0.5, boat.z);
          boat.camShake = Math.max(boat.camShake, 0.22);
          this.renderer.hitPunch(0.22);
          if (this.time - this.lastScrape > 0.11) {
            this.audio.scrape();
            this.lastScrape = this.time;
          }
        }
        if (step.respawned) {
          this.overlay.flashHit("RETURN TO COURSE", 1200);
          this.audio.respawn();
          this.renderer.camera.snap(boat, this.track);
        }
      }
      if (this.director.phase === "racing") {
        const rams = resolveHulls(this.boats, this.time);
        for (const ram of rams) {
          if (!ram.awarded) continue;
          this.audio.ram();
          this.renderer.slam(ram.defender.x, ram.defender.y + 1, ram.defender.z);
          this.renderer.sparks(ram.defender.x, ram.defender.y + 1.2, ram.defender.z);
          if (ram.attacker === this.player || ram.defender === this.player) {
            this.overlay.flashHit(ram.attacker === this.player ? "RAM +1" : "HIT");
            this.renderer.hitPunch(0.85);
          }
        }
        const ev = stepPickups(this.track, this.boats, dt, this.time);
        for (const e of ev) {
          if (e.kind === "mine") {
            this.audio.mine();
            this.renderer.slam(e.x, e.y + 0.6, e.z);
            this.renderer.hitPunch(e.boat === this.player ? 0.7 : 0.2);
            if (e.boat === this.player) this.overlay.flashHit("MINE");
          } else {
            this.audio.pickup(e.kind);
            if (e.boat === this.player) {
              this.overlay.flashHit(e.kind === "super" ? "SUPER" : "BOOST");
              this.renderer.igniteJet(e.boat);
            }
          }
        }
      }
      stepDirector(this.director, this.boats, dt);
    }

    if (this.mode === "race" && (counting || racing)) {
      if (this.director.phase === "closing" && this.lastPhase !== "closing") {
        this.overlay.flashHit("FINISH", 1600);
        this.audio.finish();
      }
      this.lastPhase = this.director.phase;
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
      if (this.director.phase === "racing" && this.player.place !== this.lastPlace) {
        if (this.director.time > 2.2) {
          if (this.player.place < this.lastPlace) this.overlay.flashHit("PASSED");
          else if (this.player.place > this.lastPlace) this.overlay.flashHit("OVERTAKEN");
        }
        this.lastPlace = this.player.place;
      }
      if (
        this.director.phase === "racing" &&
        this.director.time > 25 &&
        !this.playerJumped &&
        !this.jumpHintShown
      ) {
        this.jumpHintShown = true;
        this.overlay.flashHit("BRAKE then BOOST to jump", 1800);
      }
    }

    if (this.mode === "race" && this.director.phase === "finish") {
      this.mode = "results";
      this.overlay.showResults(this.boats);
      this.overlay.show("results");
      this.audio.setMusic("title");
    } else if (this.mode === "title") {
      for (const boat of this.boats) {
        driveAI(boat, this.track, this.player, true, this.boats, "demo");
        stepBoat(boat, this.track, dt, 0, false);
      }
      const beat = Math.floor(this.time / 2.15);
      if (beat !== this.lastAttractBeat && this.boats.length) {
        this.lastAttractBeat = beat;
        const boat = this.boats[beat % this.boats.length];
        if (boat) {
          igniteJet(boat);
          this.renderer.igniteJet(boat);
        }
      }
    } else if (this.mode === "select") {
      this.parkShowcase();
    }

    const boosting = this.player.boostHeld && boostLive(this.player);
    const voice = this.player.def.id === "ironwake" ? 2 : this.player.def.id === "vesper" ? 1 : 0;
    this.audio.setEngine(this.player.speed, boosting, voice, this.player.airborne);
  }

  private menus(): void {
    if (this.mode === "title") {
      if (this.input.consumeConfirm() || this.input.consumePause()) this.goSelect();
      return;
    }
    if (this.mode === "select") {
      if (this.input.consumeMenuLeft()) this.overlay.cycleHull(-1);
      if (this.input.consumeMenuRight()) this.overlay.cycleHull(1);
      if (this.input.consumeConfirm()) this.beginRace();
      if (this.input.consumePause()) this.goTitle();
      return;
    }
    if (this.mode === "results") {
      if (this.input.consumeConfirm()) this.beginRace();
      if (this.input.consumePause()) this.goTitle();
      return;
    }
    if (this.input.consumePause()) {
      if (this.mode === "race") {
        this.mode = "pause";
        this.overlay.show("pause");
        this.audio.setMusic("muted");
      } else if (this.mode === "pause") {
        this.resume();
      }
    }
    if (this.mode === "pause" && this.input.consumeConfirm()) this.resume();
    if (this.mode === "race") this.input.consumeConfirm();
  }
}
