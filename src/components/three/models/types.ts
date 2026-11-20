import type { ComponentRecord, Dimensions, PartInstance } from "@/lib/types";
import type { ModelInfo } from "@/lib/models/modelKey";

/** Props every part model receives. `d` = partDims() in robot-frame millimetres (x length, y width, z height). */
export interface ModelProps {
  part: PartInstance;
  comp: ComponentRecord;
  d: Dimensions;
  info: ModelInfo;
}
