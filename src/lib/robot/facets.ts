/**
 * Facets of a robot project derived from its actual parts — used by the Garage library cards and filters.
 * Nothing is typed in by hand, so a card can never disagree with the robot it describes.
 */
import { getComponent } from "@/lib/catalogue";
import type { ComponentRecord, Project, SensorSimParams } from "@/lib/types";

export type SensorType = "Line (IR reflectance)" | "Ultrasonic" | "IR / ToF distance" | "Encoder" | "IMU" | "Bumper" | "None";
export type ControlType = "Bluetooth (HC-05)" | "Wi-Fi" | "Autonomous";

export interface RobotFacets {
  controller: string;
  driver: string;
  motors: string;
  motorCount: number;
  sensorTypes: SensorType[];
  control: ControlType;
  battery: string;
}

export function sensorType(kind: SensorSimParams["kind"] | undefined): SensorType {
  if (!kind) return "None";
  if (kind.startsWith("reflectance")) return "Line (IR reflectance)";
  if (kind === "ultrasonic") return "Ultrasonic";
  if (kind === "ir-distance-analog" || kind === "ir-obstacle-digital" || kind === "tof") return "IR / ToF distance";
  if (kind === "encoder") return "Encoder";
  if (kind === "imu") return "IMU";
  return "Bumper";
}

const countBy = (items: string[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(" + ");
};

/** `wifiControl`: the template drives the robot over Wi-Fi (an ESP32 with no Bluetooth module). */
export function robotFacets(project: Project, opts: { wifiControl?: boolean; keyboardControl?: boolean } = {}): RobotFacets {
  const comps = project.parts.map((p) => getComponent(p.componentId)).filter((c): c is ComponentRecord => !!c);
  const of = (k: ComponentRecord["kind"]) => comps.filter((c) => c.kind === k);
  const motors = of("dc-motor");
  const sensors = [...new Set(of("sensor").map((c) => sensorType(c.sensor?.kind)))];
  const hasBt = of("wireless").some((c) => /HC-0|Bluetooth|HM-10/i.test(c.name));
  return {
    controller: of("controller")[0]?.name ?? "—",
    driver: countBy(of("motor-driver").map((c) => c.name)) || "—",
    motors: countBy(motors.map((c) => c.name)) || "—",
    motorCount: motors.length,
    sensorTypes: sensors.length ? sensors : ["None"],
    control: hasBt ? "Bluetooth (HC-05)" : opts.wifiControl || (opts.keyboardControl && of("controller").some((c) => /ESP32/.test(c.name))) ? "Wi-Fi" : "Autonomous",
    battery: of("battery")[0]?.name ?? "—",
  };
}
