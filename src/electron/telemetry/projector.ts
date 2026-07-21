export const productEventKinds = [
  "start", "platformDetected", "openSettings", "openSet", "openFolder", "openEditor", "openTobiiCalibration",
  "cardClick", "toggleOutputLine", "toggleGazeLock", "share", "move", "trash", "editorAddImage", "editorAddAudio",
  "settingsToggleEyeExit", "settingsToggleEyeChoose", "settingsToggleEyeActivation", "settingsToggleEyePagination",
  "settingsToggleKeyboardActivation", "settingsToggleJoystickActivation", "settingsToggleTypeSound", "settingsToggleMouseActivation",
  "settingsTogglePageTurnMode", "settingsToggleEyeScale", "settingsSetTimeout", "settingsToggleAnimation",
  "tobiiCalibrationStart", "tobiiCalibrationPoint", "tobiiCalibrationFinish", "tobiiCalibrationCancel", "tobiiCalibrationError",
  "tobiiCalibrationApplySaved", "tobiiCalibrationApplySavedResult", "tobiiCalibrationUnavailable", "updateAvailable",
  "updateDownloaded", "updateError", "updateInstallConfirmed"
] as const;

export type ProductEventKind = typeof productEventKinds[number];
export type OutcomeKind = "utterance_completed" | "exercise_completed" | "set_saved" | "transfer_completed" | "gaze_calibration_completed";
export type ProjectedTelemetry = { stream: "product" | "outcome"; kind: string; fields?: Record<string, string> };

const productEvents = new Set<string>(productEventKinds);
const outcomes: Record<OutcomeKind, Readonly<Record<string, readonly string[]>>> = {
  utterance_completed: { result: ["completed", "failed", "cancelled"], mode: ["standard", "direct", "without-space"], failure_code: ["engine_unavailable", "request_failed", "timeout", "cancelled"] },
  exercise_completed: { result: ["completed", "incomplete", "failed"], source: ["quiz", "match"], count_bucket: ["one", "two_to_five", "six_to_twenty", "more_than_twenty"], failure_code: ["state_invalid", "media_unavailable", "interrupted"] },
  set_saved: { result: ["completed", "failed"], source: ["created", "edited"], count_bucket: ["one", "two_to_five", "six_to_twenty", "more_than_twenty"], failure_code: ["validation_failed", "storage_failed", "permission_denied"] },
  transfer_completed: { result: ["completed", "failed"], source: ["import", "export"], failure_code: ["format_invalid", "media_missing", "storage_failed", "permission_denied"] },
  gaze_calibration_completed: { result: ["completed", "failed", "cancelled"], failure_code: ["device_unavailable", "calibration_failed", "permission_denied"] }
};

const required: Record<OutcomeKind, readonly string[]> = {
  utterance_completed: ["result", "mode"],
  exercise_completed: ["result", "source", "count_bucket"],
  set_saved: ["result", "source", "count_bucket"],
  transfer_completed: ["result", "source"],
  gaze_calibration_completed: ["result"]
};

export function projectRendererTelemetry (input: unknown): ProjectedTelemetry | undefined {
  if (!isRecord(input) || Object.keys(input).length !== 1 || typeof input.kind !== "string") return undefined;
  return productEvents.has(input.kind) ? { stream: "product", kind: input.kind } : undefined;
}

export function projectRendererOutcome (input: unknown): ProjectedTelemetry | undefined {
  if (!isRecord(input) || typeof input.kind !== "string" || !Object.prototype.hasOwnProperty.call(outcomes, input.kind)) return undefined;
  const kind = input.kind as OutcomeKind;
  const rule = outcomes[kind];
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(input)) {
    if (name === "kind") continue;
    if (typeof value !== "string" || !rule[name]?.includes(value)) return undefined;
    fields[name] = value;
  }
  if (required[kind].some((name) => fields[name] === undefined)) return undefined;
  if (fields.result !== "failed" && fields.failure_code !== undefined) return undefined;
  return { stream: "outcome", kind, ...(Object.keys(fields).length ? { fields } : {}) };
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
