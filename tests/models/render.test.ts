/**
 * Render smoke test for the procedural part models. @react-three/test-renderer is not installed, so the
 * three.js JSX tree is rendered with react-dom/server: this runs every model's code (useMemo geometry
 * building, merged geometries, lathe/extrude profiles, battery labels) and fails on any runtime error.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { allComponents } from "@/lib/catalogue";
import { PartMesh, RobotAssembly } from "@/components/three/RobotParts";
import { reference2WD } from "@/lib/robot/reference";
import { addPart, newProject } from "@/lib/robot/assembly";
import type { ComponentRecord, PartInstance } from "@/lib/types";

const KINDS: ComponentRecord["kind"][] = ["dc-motor", "motor-driver", "controller", "sensor", "wheel", "battery", "servo", "caster", "regulator", "wireless"];

function partFor(c: ComponentRecord, config: PartInstance["config"] = {}): PartInstance {
  return { uid: `p_${c.id}`, componentId: c.id, label: c.name, position: { x: 0, y: 30, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, config: { ...Object.fromEntries(c.options.map((o) => [o.key, o.default])), ...config }, schematic: { x: 0, y: 0 }, inCircuit: false };
}

// react-dom warns about three.js intrinsic tags (<mesh>, <boxGeometry>…) — expected when rendering outside a Canvas
let spy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  spy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => spy.mockRestore());

describe("part models render without runtime errors", () => {
  const comps = allComponents().filter((c) => KINDS.includes(c.kind));

  it("every component of the modelled kinds renders (plain, selected, error, spinning)", () => {
    expect(comps.length).toBeGreaterThan(200);
    for (const c of comps) {
      const part = partFor(c);
      for (const props of [{}, { selected: true }, { error: true }, { wheelAngle: 1.3 }]) {
        const html = renderToString(createElement(PartMesh, { part, comp: c, ...props }));
        expect(html, c.id).toContain("<mesh");
      }
    }
  });

  it("cell-count options change the holder models (series 1–4)", () => {
    for (const c of comps.filter((x) => x.kind === "battery" && x.battery?.perCell)) for (const series of [1, 2, 3, 4]) expect(renderToString(createElement(PartMesh, { part: partFor(c, { series }), comp: c }))).toContain("<mesh");
  });

  it("whole robots render: reference 2WD and a 4WD race robot", () => {
    const fourWD = newProject("race", "x", "me");
    const withLipo = addPart(fourWD, "lipo-3s-2100mah").project;
    for (const p of [reference2WD(), fourWD, withLipo]) {
      const html = renderToString(createElement(RobotAssembly, { project: p, wheelAngles: {} }));
      expect(html.split("<mesh").length).toBeGreaterThan(50);
    }
  });
});
