import type { Topic } from "../types";
import { LINE_01 } from "./line-01";
import { LINE_04 } from "./line-04";
import { LINE_07 } from "./line-07";
import { LINE_10 } from "./line-10";
import { LINE_13 } from "./line-13";

/** Line-following path, topics 1–15. */
export const LINE_PART1: Topic[] = [...LINE_01, ...LINE_04, ...LINE_07, ...LINE_10, ...LINE_13];
