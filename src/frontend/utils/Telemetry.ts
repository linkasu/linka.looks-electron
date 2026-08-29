import { ipcRenderer } from "electron";
import type { OutcomeKind, ProductEventKind } from "@/electron/telemetry/projector";
import type { TelemetryDecision, TelemetryPreference } from "@/electron/telemetry/preference";

export const Telemetry = {
  getPreference(): Promise<TelemetryPreference> {
    return ipcRenderer.invoke("telemetry:preference:get");
  },
  setPreference(preference: TelemetryDecision): Promise<TelemetryPreference> {
    return ipcRenderer.invoke("telemetry:preference:set", preference);
  },
  product(kind: ProductEventKind): void {
    void ipcRenderer.invoke("telemetry:product", { kind });
  },
  outcome(outcome: { kind: OutcomeKind; [key: string]: string }): void {
    void ipcRenderer.invoke("telemetry:outcome", outcome);
  }
};
