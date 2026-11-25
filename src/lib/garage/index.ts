import type { ProjectTemplate } from "./types";
import { LINE_TEMPLATES } from "./projects/line";
import { RACE_TEMPLATES } from "./projects/race";
import { SUMO_TEMPLATES } from "./projects/sumo";
import { FOURWD_RACE_TEMPLATES, FOURWD_SUMO_TEMPLATES } from "./projects/fourwd";
import { familyTemplates } from "./projects/families";

/**
 * Every BEAST PROJECT GARAGE reference project, grouped line → race → sumo. Within race and sumo the 4WD
 * robots (the club standard) come first; the legacy 2WD robots stay available (student copies reference
 * their template ids) and are shown in a secondary "Legacy 2WD" group.
 */
const legacyLast = (ts: ProjectTemplate[]) => [...ts.filter((t) => !t.metadata.legacy), ...ts.filter((t) => t.metadata.legacy)];
/** The hand-tuned reference robots (LF / RR / RW). */
export const REFERENCE_TEMPLATES: ProjectTemplate[] = [...LINE_TEMPLATES, ...legacyLast([...FOURWD_RACE_TEMPLATES, ...RACE_TEMPLATES]), ...legacyLast([...FOURWD_SUMO_TEMPLATES, ...SUMO_TEMPLATES])];
/** Spec-driven template families (T-RACE-…, T-LINE-…, …): parts, wiring, pin map and firmware from one configuration. */
export const FAMILY_TEMPLATES: ProjectTemplate[] = familyTemplates();
export const GARAGE_TEMPLATES: ProjectTemplate[] = [...REFERENCE_TEMPLATES, ...FAMILY_TEMPLATES];
export const getTemplate = (id: string) => GARAGE_TEMPLATES.find((t) => t.metadata.id === id);
export { buildFromTemplate, REFERENCE_MUTABLE_FIELDS } from "./build";
export * from "./types";
