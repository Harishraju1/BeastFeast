import type { Topic } from "../types";
import { RACE_01 } from "./race-01";
import { RACE_04 } from "./race-04";
import { RACE_07 } from "./race-07";
import { RACE_10 } from "./race-10";
import { RACE_13 } from "./race-13";

/** Robo Race path, topics 1–14. */
export const RACE_PART1: Topic[] = [...RACE_01, ...RACE_04, ...RACE_07, ...RACE_10, ...RACE_13];
