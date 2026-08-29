import { describe, expect, it } from "vitest";
import { projectRendererOutcome, projectRendererTelemetry } from "@/electron/telemetry/projector";

describe("Looks telemetry projector", () => {
  it("projects only registered product event names with no attributes", () => {
    expect(projectRendererTelemetry({ kind: "openSet" })).toEqual({
      stream: "product",
      kind: "openSet"
    });
    expect(projectRendererTelemetry({ kind: "openSet", pcHash: "private" })).toBeUndefined();
  });

  it("projects known completed outcomes into an exact closed contract", () => {
    expect(
      projectRendererOutcome({
        kind: "set_saved",
        result: "completed",
        source: "edited",
        count_bucket: "two_to_five"
      })
    ).toEqual({
      stream: "outcome",
      kind: "set_saved",
      fields: { result: "completed", source: "edited", count_bucket: "two_to_five" }
    });
  });

  it.each([
    {
      kind: "set_saved",
      result: "completed",
      source: "edited",
      count_bucket: "one",
      path: "/private/set.linka"
    },
    { kind: "utterance_completed", result: "completed", mode: "standard", text: "private words" },
    { kind: "transfer_completed", result: "completed", source: "import", cardId: "secret" },
    { kind: "gaze_calibration_completed", result: "completed", setId: "secret" }
  ])("rejects sensitive or unregistered outcome data", (input) => {
    expect(projectRendererOutcome(input)).toBeUndefined();
  });
});
