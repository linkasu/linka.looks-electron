export type TelemetryConsent = "unknown" | "enabled" | "disabled";

export function normalizeTelemetryConsent(value: unknown): TelemetryConsent {
  if (value === "enabled" || value === "disabled") return value;
  return "unknown";
}
