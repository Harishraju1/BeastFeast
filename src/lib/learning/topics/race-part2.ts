import type { Topic } from "../types";
import { RACE_15 } from "./race-15";
import { RACE_18 } from "./race-18";
import { RACE_21 } from "./race-21";
import { RACE_24 } from "./race-24";
import { RACE_27 } from "./race-27";

/** Robo Race path, topics 15-28. */
export const RACE_PART2: Topic[] = [...RACE_15, ...RACE_18, ...RACE_21, ...RACE_24, ...RACE_27];
