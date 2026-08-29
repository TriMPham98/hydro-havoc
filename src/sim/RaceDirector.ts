import { LAP_COUNT } from "./constants";
import type { Boat } from "./Boat";
import { placeBoats } from "./progress";

export type RacePhase = "idle" | "countdown" | "racing" | "closing" | "finish";

export interface RaceDirector {
  phase: RacePhase;
  time: number;
  countdown: number;
  closeIn: number;
  results: Boat[];
}

export function createDirector(): RaceDirector {
  return { phase: "idle", time: 0, countdown: 3, closeIn: 0, results: [] };
}

export function startCountdown(dir: RaceDirector): void {
  dir.phase = "countdown";
  dir.time = 0;
  dir.countdown = 3;
  dir.closeIn = 0;
  dir.results = [];
}

export function stepDirector(dir: RaceDirector, boats: Boat[], dt: number): void {
  if (dir.phase === "countdown") {
    dir.countdown -= dt;
    if (dir.countdown <= -0.4) {
      dir.phase = "racing";
      dir.time = 0;
    }
    return;
  }
  if (dir.phase === "closing") {
    dir.time += dt;
    placeBoats(boats);
    dir.closeIn -= dt;
    const allDone = boats.every((b) => b.finished);
    if (dir.closeIn <= 0 || allDone) stampField(dir, boats);
    return;
  }
  if (dir.phase !== "racing") return;
  dir.time += dt;
  placeBoats(boats);
  const player = boats.find((b) => !b.ai);
  const allDone = boats.every((b) => b.finished);
  if (allDone || dir.time > 240) {
    stampField(dir, boats);
    return;
  }
  if (player?.finished) {
    dir.phase = "closing";
    dir.closeIn = 3.2;
  }
}

function stampField(dir: RaceDirector, boats: Boat[]): void {
  const remaining = boats.filter((b) => !b.finished);
  remaining.sort((a, b) => b.lap + b.courseT - (a.lap + a.courseT));
  for (const boat of remaining) {
    boat.finished = true;
    boat.finishTime = dir.time + 30 + boat.place;
  }
  placeBoats(boats);
  dir.results = [...boats].sort((a, b) => a.place - b.place);
  dir.phase = "finish";
}

export function countdownLabel(dir: RaceDirector): string | null {
  if (dir.phase !== "countdown") return null;
  if (dir.countdown > 2) return "3";
  if (dir.countdown > 1) return "2";
  if (dir.countdown > 0) return "1";
  return "GO";
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export { LAP_COUNT };
