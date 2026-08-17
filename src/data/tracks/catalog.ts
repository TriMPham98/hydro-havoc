import type { TrackWorld } from "../../sim/Track";
import { buildRiptideRefinery } from "./riptideRefinery";

export type CourseId = "riptide";

export const COURSES: { id: CourseId; name: string; blurb: string }[] = [
  { id: "riptide", name: "Riptide Refinery", blurb: "One canal. Learn every line." },
];

export function buildCourse(id: CourseId = "riptide"): TrackWorld {
  void id;
  return buildRiptideRefinery();
}
