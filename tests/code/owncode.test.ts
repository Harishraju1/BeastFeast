import { describe, expect, it } from "vitest";
import { buildFromTemplate, getTemplate } from "@/lib/garage";
import { generateFirmware } from "@/lib/code/generate";
import { checkOwnCode } from "@/lib/code/ownCode";

describe("generated code earns no own-code XP", () => {
  it.each(["RR-04", "LF-02", "RW-04"])("%s: code from the generator is recognised as generated", (id) => {
    const p = buildFromTemplate(getTemplate(id)!, "s", "copy");
    const fw = generateFirmware(p);
    expect(fw.ok).toBe(true);
    const r = checkOwnCode(fw.code, p);
    expect(r.original).toBe(false);
    expect(r.closest).toMatch(/code generator|Garage project/);
  });

  it("a student's own short program is still judged on its own", () => {
    const p = buildFromTemplate(getTemplate("RR-04")!, "s", "copy");
    const own = `
      int speedA = 0;
      int counter = 0;
      void setup() { pinMode(3, OUTPUT); pinMode(2, OUTPUT); Serial.begin(9600); }
      void loop() {
        counter = counter + 1;
        if (counter > 100) { counter = 0; speedA = speedA + 10; }
        if (speedA > 250) speedA = 0;
        analogWrite(3, speedA);
        digitalWrite(2, counter % 2);
        Serial.println(speedA);
        delay(20);
      }`;
    expect(checkOwnCode(own, p).original).toBe(true);
  });
});
