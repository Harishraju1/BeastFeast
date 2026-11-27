/**
 * Wire colour on the circuit canvas — three colours only, derived from the electrical role of the net (never from
 * the pin name, and never used by the simulation):
 *
 *   RED   positive: battery +, 5 V, 3.3 V, every other supply rail, and a motor-driver output that is driven HIGH
 *   BLACK negative: battery −, GND, common ground, and a motor-driver output that is driven LOW
 *   BLUE  every signal: GPIO, PWM, analog, I²C, I²S, UART, SPI, sensor outputs, control lines
 *
 * Motor-driver outputs change polarity with the H-bridge state, so their colour comes from the live simulation:
 * driven HIGH = red, driven LOW = black, off / coasting = "undriven" (grey, dashed). Without a running simulation
 * their polarity is unknown and they are drawn as undriven too.
 */
import type { CircuitGraph, Net } from "./nets";

export type WireRole = "positive" | "negative" | "signal" | "undriven";

export const WIRE_COLOUR: Record<WireRole, string> = {
  positive: "#D32F2F",
  negative: "#1C1C1C",
  signal: "#2878B5",
  undriven: "#7D8590",
};

export const ROLE_INFO: Record<Exclude<WireRole, "undriven">, { label: string; hex: string }> = {
  positive: { label: "Positive", hex: WIRE_COLOUR.positive },
  negative: { label: "Negative / GND", hex: WIRE_COLOUR.negative },
  signal: { label: "Signal", hex: WIRE_COLOUR.signal },
};

/** Live state of each motor-driver output pin (pin key → high / low / off), from RobotElectrical.outState. */
export type OutputStates = Map<string, "high" | "low" | "off">;

export function netRole(g: CircuitGraph, net: Net | undefined, outs?: OutputStates | null): WireRole {
  if (!net) return "signal";
  if (net.isGround || net.members.some((m) => m.pin.fn === "gnd" || m.pin.fn === "bat-")) return "negative";
  const driverOut = net.members.find((m) => m.pin.fn === "motor-out");
  if (driverOut) {
    const st = outs?.get(driverOut.key);
    return st === "high" ? "positive" : st === "low" ? "negative" : "undriven";
  }
  if (net.members.some((m) => m.pin.fn === "motor-term")) {
    // motor wired straight to a supply: the supply decides; otherwise floating
    return net.voltage !== null ? "positive" : "undriven";
  }
  // supply rails, and supply pins (a VCC wire is a positive connection even before it carries a voltage)
  if (net.voltage !== null || net.members.some((m) => m.pin.fn === "bat+" || m.pin.fn === "vin" || (m.pin.fn === "vout" && m.pin.vOut !== undefined))) return "positive";
  return "signal";
}
