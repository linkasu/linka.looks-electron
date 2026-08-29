import { randomUUID } from "crypto";
import { chmod, mkdir, open, readFile, rename } from "fs/promises";
import { join } from "path";

export type TelemetryPreference = "unknown" | "enabled" | "disabled";
export type TelemetryDecision = Exclude<TelemetryPreference, "unknown">;

export function isTelemetryDecision(value: unknown): value is TelemetryDecision {
  return value === "enabled" || value === "disabled";
}

export class TelemetryPreferenceStore {
  private readonly path: string;

  constructor(private readonly userDataPath: string) {
    this.path = join(userDataPath, "telemetry-preference-v3.json");
  }

  async read(): Promise<TelemetryPreference> {
    try {
      const value = JSON.parse(await readFile(this.path, "utf8")) as {
        schemaVersion?: unknown;
        preference?: unknown;
      };
      return value.schemaVersion === 3 && isTelemetryDecision(value.preference)
        ? value.preference
        : "unknown";
    } catch {
      // Legacy Electron Store consent has no V3 policy proof and is intentionally unknown.
      return "unknown";
    }
  }

  async write(preference: TelemetryDecision): Promise<void> {
    await mkdir(this.userDataPath, { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify({ schemaVersion: 3, preference }), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }
}
