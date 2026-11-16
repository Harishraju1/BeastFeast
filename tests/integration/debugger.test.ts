import { describe, expect, it } from "vitest";
import { referenceSumo, reference2WD } from "@/lib/robot/reference";
import { CODE_TEMPLATES } from "@/lib/code/templates";
import { SimSession } from "@/lib/sim/session";
import { getExampleTrack } from "@/lib/track/examples";

const tpl = (id: string) => CODE_TEMPLATES.find((t) => t.id === id)!.code;

describe("debugging assistant", () => {
  it("does not flag 'motors not responding' while the sketch waits in its start delay", () => {
    const s = new SimSession({ project: { ...referenceSumo(), code: tpl("sumo") }, track: getExampleTrack("example-sumo-standard-dohyo")!, mode: "code" });
    s.advance(4.8, 6000);
    expect(s.debug.findings.map((f) => f.code)).not.toContain("MOTOR_NOT_RESPONDING");
  });
  it("flags it — with verified causes — when the code drives ENA but the driver has no motor supply", () => {
    let p = { ...reference2WD(), code: tpl("motor-test") };
    const sw = p.parts.find((x) => x.label === "SW1")!.uid;
    const drv = p.parts.find((x) => x.label === "DRV1")!.uid;
    p = { ...p, wires: p.wires.filter((w) => !(w.from.part === sw && w.to.part === drv && w.to.pin === "VS")) };
    const s = new SimSession({ project: p, track: getExampleTrack("example-race-beginner-oval")!, mode: "code" });
    s.advance(4, 6000);
    const f = s.debug.findings.find((x) => x.code === "MOTOR_NOT_RESPONDING");
    expect(f).toBeTruthy();
    expect(f!.verified.join(" ")).toMatch(/VS/);
  });
});
