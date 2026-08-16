import { CHECKPOINT_COUNT, LAP_COUNT } from "./constants";
import type { Boat } from "./Boat";
import { wrap01 } from "./math";

export interface ProgressSample {
  lap: number;
  t: number;
  finished: boolean;
  finishTime: number;
}

export function raceMetric(sample: ProgressSample): number {
  if (sample.finished) return 10_000 + (1000 - sample.finishTime);
  return sample.lap * 1000 + wrap01(sample.t) * 1000;
}

export function compareProgress(a: ProgressSample, b: ProgressSample): number {
  return raceMetric(b) - raceMetric(a);
}

export function crossedStart(prevT: number, nextT: number): boolean {
  return prevT > 0.78 && nextT < 0.22;
}

export function updateLapAndCheckpoints(
  boat: Boat,
  prevT: number,
  nextT: number,
  raceTime: number,
): void {
  if (boat.finished) return;
  if (crossedStart(prevT, nextT) && boat.lastCheckpoint >= CHECKPOINT_COUNT - 2) {
    boat.lap += 1;
    boat.lastCheckpoint = 0;
    if (boat.lap >= LAP_COUNT) {
      boat.finished = true;
      boat.finishTime = raceTime;
      boat.lap = LAP_COUNT;
    }
    return;
  }
  const nextCp = Math.floor(wrap01(nextT) * CHECKPOINT_COUNT);
  const delta = (nextCp - boat.lastCheckpoint + CHECKPOINT_COUNT) % CHECKPOINT_COUNT;
  if (delta > 0 && delta <= 3) boat.lastCheckpoint = nextCp;
}

export function placeBoats(boats: Boat[]): void {
  const ranked = [...boats].sort((a, b) =>
    compareProgress(
      { lap: a.lap, t: a.courseT, finished: a.finished, finishTime: a.finishTime },
      { lap: b.lap, t: b.courseT, finished: b.finished, finishTime: b.finishTime },
    ),
  );
  ranked.forEach((boat, i) => {
    boat.place = i + 1;
  });
}
