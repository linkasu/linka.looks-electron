import chai from "chai";
import { Telemetry, type TelemetryEvent } from "@/frontend/utils/Telemetry";

const expect = chai.expect;

describe("Telemetry", () => {
  const emitted: TelemetryEvent[] = [];

  beforeEach(() => {
    emitted.length = 0;
    Telemetry.resetTransport();
    Telemetry.setConsent("unknown");
    Telemetry.setTransport({ emit: (event) => emitted.push(event) });
  });

  afterEach(() => {
    Telemetry.resetTransport();
    Telemetry.setConsent("unknown");
  });

  it("does not emit before an explicit opt-in or after opt-out", () => {
    Telemetry.emit("utterance_completed");
    Telemetry.setConsent("disabled");
    Telemetry.emit("set_save_succeeded");

    expect(emitted).to.deep.equal([]);
  });

  it("emits only a closed outcome event after opt-in", () => {
    Telemetry.setConsent("enabled");
    Telemetry.emit("gaze_calibration_succeeded");

    expect(emitted).to.deep.equal(["gaze_calibration_succeeded"]);
  });
});
