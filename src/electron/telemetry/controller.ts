import type { LooksTelemetry } from "./index";
import type { TelemetryDecision, TelemetryPreference } from "./preference";

type Store = { read: () => Promise<TelemetryPreference>; write: (preference: TelemetryDecision) => Promise<void> };

export class TelemetryController {
  private preference: TelemetryPreference = "unknown";
  private telemetry?: LooksTelemetry;
  private transition = Promise.resolve();

  constructor (private readonly store: Store, private readonly createTelemetry: () => LooksTelemetry) {}

  initialize (): Promise<TelemetryPreference> {
    return this.enqueue(async () => {
      this.preference = await this.store.read();
      if (this.preference === "enabled") this.telemetry = this.createTelemetry();
      return this.preference;
    });
  }

  getPreference (): TelemetryPreference {
    return this.preference;
  }

  setPreference (preference: TelemetryDecision): Promise<TelemetryDecision> {
    return this.enqueue(async () => {
      if (preference === "disabled") {
        const active = this.telemetry;
        await this.store.write(preference);
        this.preference = preference;
        this.telemetry = undefined;
        await active?.disableAndClear();
        return preference;
      }
      await this.store.write(preference);
      this.preference = preference;
      this.telemetry ??= this.createTelemetry();
      return preference;
    });
  }

  record (record: Parameters<LooksTelemetry["record"]>[0]): boolean {
    return this.preference === "enabled" && this.telemetry?.record(record) === true;
  }

  private enqueue<Result> (operation: () => Promise<Result>): Promise<Result> {
    const result = this.transition.then(operation);
    this.transition = result.then(() => undefined, () => undefined);
    return result;
  }
}
