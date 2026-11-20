"use client";
/**
 * Model registry: picks the procedural model for a part from its model key (see src/lib/models/modelKey.ts).
 * All models are drawn in the part's local frame, centred on the part position, inside its partDims() box.
 */
import { useContext } from "react";
import { MotorModel, ServoModel } from "./motors";
import { ControllerModel, DriverModel } from "./boards";
import { SensorModel } from "./sensors";
import { WheelModel } from "./wheels";
import { BatteryModel, CasterModel } from "./power";
import { EmissiveContext, MM } from "./prims";
import type { ModelProps } from "./types";
import type { ComponentRecord } from "@/lib/types";

export { EmissiveContext } from "./prims";
export type { ModelProps } from "./types";

/** Block representation for every other kind (regulators, wireless modules, switches…), as before. */
function GenericModel({ part, comp, d }: ModelProps) {
  const emissive = useContext(EmissiveContext);
  const [x, y, z] = [d.x * MM, d.z * MM, d.y * MM];
  const palette: Partial<Record<ComponentRecord["kind"], string>> = { regulator: "#1a5fb4", wireless: "#1c7a5a", switch: "#222", display: "#0a0a0a", servo: "#1f4fbf", mechanical: "#8b95a3", "rc-input": "#333" };
  if (/Wedge|Blade/.test(comp.name))
    return (
      <mesh rotation={[0, 0, -0.35]} castShadow>
        <boxGeometry args={[30 * MM, 2 * MM, ((part.config.width as number) ?? 100) * MM]} />
        <meshStandardMaterial color="#aeb6bf" metalness={0.9} roughness={0.25} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
      </mesh>
    );
  return (
    <mesh castShadow>
      <boxGeometry args={[x, y, z]} />
      <meshStandardMaterial color={palette[comp.kind] ?? "#555c66"} metalness={0.1} roughness={0.6} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.5 : 0} />
    </mesh>
  );
}

export function PartModel(props: ModelProps & { wheelAngle?: number }) {
  switch (props.comp.kind) {
    case "dc-motor":
      return <MotorModel {...props} />;
    case "servo":
      return <ServoModel {...props} />;
    case "motor-driver":
      return <DriverModel {...props} />;
    case "controller":
      return <ControllerModel {...props} />;
    case "sensor":
      return <SensorModel {...props} />;
    case "wheel":
      return <WheelModel {...props} />;
    case "battery":
      return <BatteryModel {...props} />;
    case "caster":
      return <CasterModel {...props} />;
    default:
      return <GenericModel {...props} />;
  }
}
