"use client";
import type { ComponentRecord, PinDef, PinFunction } from "@/lib/types";

export const PIN_COLOR: Partial<Record<PinFunction, string>> = {
  vin: "#ff3b4e", vout: "#ff6b1a", "bat+": "#ff3b4e", gnd: "#9aa3ad", "bat-": "#9aa3ad",
  gpio: "#00d9ff", "in-pwm": "#f5b301", "in-digital": "#f5b301", "in-analog": "#f5b301",
  "out-digital": "#22c55e", "out-analog": "#22c55e", "out-pwm": "#22c55e",
  "motor-out": "#c084fc", "motor-term": "#c084fc", "i2c-sda": "#3b82f6", "i2c-scl": "#3b82f6",
  "spi-mosi": "#3b82f6", "spi-miso": "#3b82f6", "spi-sck": "#3b82f6", "spi-cs": "#3b82f6", "uart-tx": "#3b82f6", "uart-rx": "#3b82f6",
};

export function pinColor(p: PinDef) {
  return PIN_COLOR[p.fn] ?? "#5f6b80";
}

export function pinFunctionText(p: PinDef): string {
  const caps = (p.caps ?? []).filter((c) => c !== "digital");
  const base: Record<string, string> = {
    vin: "Power input", vout: "Power output", gnd: "Ground", "bat+": "Battery +", "bat-": "Battery −", gpio: "GPIO", "in-digital": "Digital input", "in-pwm": "PWM input", "in-analog": "Analog input",
    "out-digital": "Digital output", "out-analog": "Analog output", "out-pwm": "PWM output", "motor-out": "Motor output", "motor-term": "Motor terminal", "i2c-sda": "I²C SDA", "i2c-scl": "I²C SCL",
    "spi-mosi": "SPI MOSI", "spi-miso": "SPI MISO", "spi-sck": "SPI SCK", "spi-cs": "SPI CS", "uart-tx": "UART TX", "uart-rx": "UART RX", switch: "Switch contact", passive: "Terminal", anode: "Anode", cathode: "Cathode", reset: "Reset", nc: "Not connected / reference",
  };
  const parts = [base[p.fn] ?? p.fn];
  if (caps.length) parts.push(caps.map((c) => c.toUpperCase()).join(" · "));
  if (p.vRange) parts.push(`${p.vRange[0]}–${p.vRange[1]} V`);
  if (p.vOut !== undefined) parts.push(`${p.vOut} V`);
  if (p.iMax_mA) parts.push(`≤${p.iMax_mA} mA`);
  if (p.arduinoPin !== undefined) parts.push(`code pin ${p.arduinoPin}`);
  return parts.join(" · ");
}

/** Generated pinout view: drawn from the pin table, so it always matches the data the validator uses. */
export function PinoutDiagram({ comp, highlight, compact }: { comp: ComponentRecord; highlight?: string[]; compact?: boolean }) {
  const sides = { L: comp.pins.filter((p) => p.side === "L"), R: comp.pins.filter((p) => p.side === "R"), T: comp.pins.filter((p) => p.side === "T"), B: comp.pins.filter((p) => p.side === "B") };
  // fold top/bottom into left/right columns for readability
  const left = [...sides.L, ...sides.T];
  const right = [...sides.R, ...sides.B];
  const rows = Math.max(left.length, right.length, 2);
  const pitch = compact ? 14 : 18;
  const h = rows * pitch + 30;
  const w = compact ? 300 : 360;
  const bx = w / 2 - 55;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${comp.name} pinout`}>
      <rect x={bx} y={10} width={110} height={h - 20} rx={6} fill="#10141d" stroke="#33405a" />
      <text x={w / 2} y={h / 2} textAnchor="middle" fill="#95a1b5" fontSize={10} fontFamily="JetBrains Mono" transform={`rotate(-90 ${w / 2} ${h / 2})`}>
        {(comp.model ?? comp.name).slice(0, 34)}
      </text>
      {left.map((p, i) => {
        const y = 22 + i * pitch;
        const hl = highlight?.includes(p.id);
        return (
          <g key={p.id}>
            <line x1={bx - 26} y1={y} x2={bx} y2={y} stroke={pinColor(p)} strokeWidth={hl ? 3 : 1.5} />
            <circle cx={bx - 26} cy={y} r={hl ? 4 : 2.5} fill={pinColor(p)} />
            <text x={bx - 32} y={y + 3} textAnchor="end" fill={hl ? "#ff6b1a" : "#f4f7fb"} fontSize={compact ? 8.5 : 10} fontFamily="JetBrains Mono">
              {p.label}
            </text>
          </g>
        );
      })}
      {right.map((p, i) => {
        const y = 22 + i * pitch;
        const hl = highlight?.includes(p.id);
        return (
          <g key={p.id}>
            <line x1={bx + 110} y1={y} x2={bx + 136} y2={y} stroke={pinColor(p)} strokeWidth={hl ? 3 : 1.5} />
            <circle cx={bx + 136} cy={y} r={hl ? 4 : 2.5} fill={pinColor(p)} />
            <text x={bx + 142} y={y + 3} fill={hl ? "#ff6b1a" : "#f4f7fb"} fontSize={compact ? 8.5 : 10} fontFamily="JetBrains Mono">
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
