import type { ProjectTemplate } from "./types";
import { LINE_TEMPLATES } from "./projects/line";
import { RACE_TEMPLATES } from "./projects/race";
import { SUMO_TEMPLATES } from "./projects/sumo";

/** Every BEAST PROJECT GARAGE reference project, grouped line → race → sumo. */
export const GARAGE_TEMPLATES: ProjectTemplate[] = [...LINE_TEMPLATES, ...RACE_TEMPLATES, ...SUMO_TEMPLATES];
export const getTemplate = (id: string) => GARAGE_TEMPLATES.find((t) => t.metadata.id === id);
export { buildFromTemplate, REFERENCE_MUTABLE_FIELDS } from "./build";
export * from "./types";
