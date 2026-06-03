import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { Bound } from "eyelog/dist/bound";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";
import type { EyeTrackerBound, EyeTrackerProcess } from "./EyeTrackerProcess";

export class EyeLogTrackerProcess extends TobiiProcess implements EyeTrackerProcess {
  constructor () {
    super(resolveExtraResource("bin", "EyeLog.exe"));
  }

  setBounds (bounds: EyeTrackerBound[]) {
    super.setBounds(bounds.map(({ x, y, width, height }) => new Bound(x, y, width, height)));
  }

  destroy () {
    // node-eyelog does not expose process cleanup; keep Windows behavior unchanged.
  }
}
