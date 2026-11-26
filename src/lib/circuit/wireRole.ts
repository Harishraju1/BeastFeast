/**
 * Electrical role of a wire, derived from the net it belongs to (never from the colour the student picked).
 * Used for the function-coloured wiring view, the legend and the wire tooltip.
 */
import type { CircuitGraph, Net } from "./nets";

export type WireRole =
  | "battery" | "rail5" | "rail33" | "supply" | "gnd"
  | "motor" | "pwm" | "analog" | "digital"
  | "sda" | "scl" | "tx" | "rx" | "mosi" | "miso" | "sck" | "cs" | "other";

export const ROLE_INFO: Record<WireRole, { label: string; hex: string }> = {
  battery: { label: "Battery +", hex: "#E53935" },
  rail5: { label: "Regulated 5 V", hex: "#FB8C00" },
  rail33: { label: "3.3 V", hex: "#FDD835" },
  supply: { label: "Other supply", hex: "#C62828" },
  gnd: { label: "Ground (GND)", hex: "#616161" },
  motor: { label: "Motor output", hex: "#F4511E" },
  pwm: { label: "PWM signal", hex: "#8E44AD" },
  analog: { label: "Analog signal", hex: "#2E9D58" },
  digital: { label: "Digital GPIO", hex: "#1976D2" },
  sda: { label: "I²C SDA", hex: "#00A6B2" },
  scl: { label: "I²C SCL", hex: "#00897B" },
  tx: { label: "UART TX", hex: "#D81B60" },
  rx: { label: "UART RX", hex: "#AD1457" },
  mosi: { label: "SPI MOSI", hex: "#3949AB" },
  miso: { label: "SPI MISO", hex: "#039BE5" },
  sck: { label: "SPI SCK", hex: "#673AB7" },
  cs: { label: "SPI CS", hex: "#795548" },
  other: { label: "Other / passive", hex: "#455A64" },
};

export function netRole(g: CircuitGraph, net: Net | undefined): WireRole {
  if (!net) return "other";
  if (net.isGround || net.members.some((m) => m.pin.fn === "gnd" || m.pin.fn === "bat-")) return "gnd";
  if (net.members.some((m) => m.pin.fn === "motor-out" || m.pin.fn === "motor-term")) return "motor";
  if (net.voltage !== null || net.members.some((m) => m.pin.fn === "bat+")) {
    const fromBattery = net.members.some((m) => m.pin.fn === "bat+") || net.sources.some((s) => g.comps.get(s.key.split(".")[0])?.battery);
    if (fromBattery) return "battery";
    if (net.voltage !== null && Math.abs(net.voltage - 5) < 0.4) return "rail5";
    if (net.voltage !== null && Math.abs(net.voltage - 3.3) < 0.3) return "rail33";
    return "supply";
  }
  const fns = new Set(net.members.map((m) => m.pin.fn));
  const caps = new Set(net.members.filter((m) => m.comp.kind === "controller").flatMap((m) => m.pin.caps ?? []));
  if (fns.has("i2c-sda")) return "sda";
  if (fns.has("i2c-scl")) return "scl";
  if (fns.has("spi-mosi")) return "mosi";
  if (fns.has("spi-miso")) return "miso";
  if (fns.has("spi-sck")) return "sck";
  if (fns.has("spi-cs")) return "cs";
  if (fns.has("uart-tx") || fns.has("uart-rx")) {
    // named from the controller's side: the line the controller transmits on is TX
    const ctrlFn = net.members.find((m) => m.comp.kind === "controller" && m.pin.fn === "gpio");
    if (ctrlFn) return (ctrlFn.pin.caps ?? []).includes("uart-tx") ? "tx" : "rx";
    return fns.has("uart-tx") ? "tx" : "rx";
  }
  if (fns.has("out-analog") || fns.has("in-analog")) return "analog";
  if (fns.has("in-pwm") || fns.has("out-pwm")) return "pwm";
  if (fns.has("gpio") || fns.has("in-digital") || fns.has("out-digital") || caps.size) return "digital";
  return "other";
}
