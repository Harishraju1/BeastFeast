import { describe, expect, it } from "vitest";
import { checkOriginality } from "@/lib/code/originality";
import { CODE_TEMPLATES } from "@/lib/code/templates";
import { GARAGE_TEMPLATES } from "@/lib/garage";

const OWN = `// my own line follower
const int L = A1, R = A3;
int fast = 200, slow = 60;
void drive(int a, int b) { analogWrite(5, a); analogWrite(6, b); }
void setup() {
  pinMode(L, INPUT); pinMode(R, INPUT);
  pinMode(5, OUTPUT); pinMode(6, OUTPUT);
  pinMode(7, OUTPUT); pinMode(9, OUTPUT);
  digitalWrite(7, HIGH); digitalWrite(9, HIGH);
}
void loop() {
  bool l = digitalRead(L), r = digitalRead(R);
  if (l && !r) drive(slow, fast);
  else if (r && !l) drive(fast, slow);
  else drive(fast, fast);
}`;

describe("code originality (XP only for the student's own code)", () => {
  it("every starter template counts as template code", () => {
    for (const t of CODE_TEMPLATES) expect(checkOriginality(t.code).original, t.id).toBe(false);
  });
  it("every Garage firmware counts as template code", () => {
    for (const t of GARAGE_TEMPLATES) expect(checkOriginality(t.firmware.source).original, t.metadata.id).toBe(false);
  });
  it("a template with retuned numbers and changed comments is still template code", () => {
    const tpl = CODE_TEMPLATES.find((t) => t.id === "line-pid")!.code.replace(/40\.0/g, "52.5").replace(/150/g, "175").replace(/\/\/[^\n]*/g, "// my tweak");
    expect(checkOriginality(tpl).original).toBe(false);
  });
  it("hand-written code counts as original", () => {
    const r = checkOriginality(OWN);
    expect(r.original).toBe(true);
    expect(r.similarity).toBeLessThan(0.6);
  });
  it("empty or tiny programs do not count", () => {
    expect(checkOriginality("").original).toBe(false);
    expect(checkOriginality("void setup(){}\nvoid loop(){}").original).toBe(false);
  });
});
