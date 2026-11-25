import { describe, expect, it } from "vitest";
import { buildFromTemplate, getTemplate } from "@/lib/garage";
import { resetToTemplate } from "@/lib/projectReset";
import type { Project } from "@/lib/types";

describe("reset a Garage copy to its original template", () => {
  const original = buildFromTemplate(getTemplate("RR-04")!, "student-1", "copy");
  const edited: Project = {
    ...original,
    id: "prj_mine",
    name: "My fast car",
    code: "// my own code\nvoid setup(){}\nvoid loop(){}",
    parts: original.parts.slice(0, -1),
    wires: original.wires.slice(0, 3),
    versions: [{ id: "v1", at: "2026-11-20T00:00:00Z", note: "kept", snapshot: "{}" }],
    simulations: [{ id: "s1" } as unknown as Project["simulations"][number]],
  };

  it("restores design, wiring and code from the template", () => {
    const r = resetToTemplate(edited)!;
    expect(r.parts.map((p) => p.componentId)).toEqual(original.parts.map((p) => p.componentId));
    expect(r.wires.length).toBe(original.wires.length);
    expect(r.code).toBe(original.code);
    expect(r.origin?.templateId).toBe("RR-04");
    expect(r.origin?.mode).toBe("copy");
  });

  it("keeps the student's id, name, owner, versions and simulation results", () => {
    const r = resetToTemplate(edited)!;
    expect(r.id).toBe("prj_mine");
    expect(r.name).toBe("My fast car");
    expect(r.ownerId).toBe("student-1");
    expect(r.versions).toEqual(edited.versions);
    expect(r.simulations).toEqual(edited.simulations);
  });

  it("only applies to template copies", () => {
    expect(resetToTemplate({ ...edited, origin: undefined })).toBeNull();
    expect(resetToTemplate({ ...edited, origin: { ...edited.origin!, mode: "original" } })).toBeNull();
    expect(resetToTemplate({ ...edited, origin: { ...edited.origin!, templateId: "NOPE" } })).toBeNull();
  });
});

describe("reset keeps the modules unlocked", () => {
  it("stores a passing circuit validation and code check", () => {
    const base = buildFromTemplate(getTemplate("RR-04")!, "student-1", "copy");
    const r = resetToTemplate({ ...base, code: "garbage(", validation: null, codeCheck: null })!;
    expect(r.validation?.passed).toBe(true);
    expect(r.codeCheck?.ok).toBe(true);
  });
});
