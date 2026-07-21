import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { TelemetryController } from "./controller";
import { isTelemetryDecision } from "./preference";
import { projectRendererOutcome, projectRendererTelemetry } from "./projector";

type Registrar = { handle: (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => void };

export function registerTelemetryIpc (controller: TelemetryController, registrar: Registrar = ipcMain): void {
  registrar.handle("telemetry:preference:get", () => controller.getPreference());
  registrar.handle("telemetry:preference:set", (_event, preference) => {
    if (!isTelemetryDecision(preference)) throw new TypeError("invalid telemetry preference");
    return controller.setPreference(preference);
  });
  registrar.handle("telemetry:product", (_event, input) => {
    const projected = projectRendererTelemetry(input);
    return projected ? controller.record(projected) : false;
  });
  registrar.handle("telemetry:outcome", (_event, input) => {
    const projected = projectRendererOutcome(input);
    return projected ? controller.record(projected) : false;
  });
}
