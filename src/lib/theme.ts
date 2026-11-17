/**
 * BEAST FEAST 5.0 brand colours for places that cannot read CSS variables:
 * three.js materials and lights, SVG drawings and the Monaco editor theme.
 * Keep in step with the tokens at the top of src/app/globals.css.
 *
 * Hierarchy: Forest Sage dominant · Warm Ivory foreground · Signal Red for attention.
 */
export const BRAND = {
  forestSage: "#4B5A50",
  warmIvory: "#F1EEE3",
  signalRed: "#F20B0B",
} as const;

export const THEME = {
  // Forest Sage surfaces (dominant)
  sage: BRAND.forestSage,
  sageDeep: "#18201B", // canvases, 3D viewports (dark theme)
  sageDeeper: "#1E2721",
  sageLight: "#5B6B60",
  // Warm Ivory foreground on sage
  ivory: BRAND.warmIvory,
  ivoryMuted: "#DBD9CE",
  ivoryDim: "#C6CABF",
  hairline: "rgba(241,238,227,0.14)",
  hairline2: "rgba(241,238,227,0.28)",
  // Warm Ivory cards drawn on sage (schematic parts, diagram nodes)
  card: BRAND.warmIvory,
  cardWell: "#FBFAF5",
  cardLine: "#B9BEB2",
  cardInk: "#1C241F",
  cardMuted: "#4F5C53",
  // Signal Red
  accent: BRAND.signalRed,
  accentText: "#FF4D42", // red text/icons on the dark theme
  accentInk: "#C40808", // red text on ivory
  // status (on sage)
  ok: "#8FD3A5",
  warn: "#F2C46B",
  info: "#A9D1E6",
  // 3D scene
  sceneBg: "#18201B",
  gridMinor: "#253029",
  gridMajor: "#3A483F",
  keyLight: "#FFF4E2",
  fillLight: "#DCE6DE",
  hemiSky: "#F7F3E8",
  hemiGround: "#0E1310",
} as const;

/**
 * Wire colours. They stand for the physical wire colours students choose
 * (red = supply, black = ground …), so they stay recognisable rather than on-brand,
 * tuned to read on the deep-sage schematic canvas.
 */
export const WIRE_HEX = {
  red: "#FF5247",
  black: "#151A17",
  yellow: "#F2C230",
  blue: "#6FA8FF",
  green: "#6FD39A",
  orange: "#FF9A4D",
  white: "#F8F6EF",
  purple: "#C79BFF",
} as const;

/** Pin-function colours for pinout and schematic drawings (legible on ivory part cards). */
export const PIN_HEX = {
  power: "#D42A2A",
  powerOut: "#D9661A",
  ground: "#4F5A63",
  gpio: "#2F6383",
  input: "#9A5D08",
  output: "#1E7A44",
  motor: "#7A35C8",
  bus: "#2357C9",
  other: "#5F6B62",
} as const;
