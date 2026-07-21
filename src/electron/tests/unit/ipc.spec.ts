import { describe, expect, it } from "vitest";
import { registerTelemetryIpc } from "@/electron/telemetry/ipc";

describe("telemetry IPC boundary", () => {
  it("accepts only explicit preferences and projected contracts", async () => {
    const handlers = new Map<string, (event: unknown, input?: unknown) => unknown>();
    const controller = {
      getPreference: () => "unknown",
      setPreference: async (preference: "enabled" | "disabled") => preference,
      record: (record: unknown) => record !== undefined
    };
    registerTelemetryIpc(controller as never, { handle: (channel, handler) => handlers.set(channel, handler as never) });

    await expect(handlers.get("telemetry:preference:set")?.({}, "enabled")).resolves.toBe("enabled");
    expect(() => handlers.get("telemetry:preference:set")?.({}, "unknown")).toThrow("invalid telemetry preference");
    expect(handlers.get("telemetry:product")?.({}, { kind: "openSet" })).toBe(true);
    expect(handlers.get("telemetry:product")?.({}, { kind: "openSet", text: "private" })).toBe(false);
    expect(handlers.get("telemetry:outcome")?.({}, { kind: "set_saved", result: "completed", source: "created", count_bucket: "one" })).toBe(true);
    expect(handlers.get("telemetry:outcome")?.({}, { kind: "set_saved", result: "completed", source: "created", count_bucket: "one", path: "/private" })).toBe(false);
  });
});
