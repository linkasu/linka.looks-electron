import { describe, expect, it, vi } from "vitest";
import { TelemetryController } from "@/electron/telemetry/controller";

describe("telemetry consent transitions", () => {
  it("does not create telemetry or make network requests while unknown or denied", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const createTelemetry = vi.fn();
    const controller = new TelemetryController({ read: async () => "unknown", write: async () => undefined }, createTelemetry);

    await expect(controller.initialize()).resolves.toBe("unknown");
    expect(controller.record({ stream: "product", kind: "openSet" })).toBe(false);
    await controller.setPreference("disabled");
    expect(controller.record({ stream: "product", kind: "openSet" })).toBe(false);
    expect(createTelemetry).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("creates telemetry only after opt-in and clears it after opt-out", async () => {
    const runtime = { record: vi.fn(() => true), disableAndClear: vi.fn(async () => undefined) };
    const writes: string[] = [];
    const controller = new TelemetryController({ read: async () => "unknown", write: async (preference) => { writes.push(preference); } }, () => runtime as never);

    await controller.initialize();
    await expect(controller.setPreference("enabled")).resolves.toBe("enabled");
    expect(controller.record({ stream: "product", kind: "openSet" })).toBe(true);
    await expect(controller.setPreference("disabled")).resolves.toBe("disabled");

    expect(writes).toEqual(["enabled", "disabled"]);
    expect(runtime.record).toHaveBeenCalledOnce();
    expect(runtime.disableAndClear).toHaveBeenCalledOnce();
  });
});
