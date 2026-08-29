import chai from "chai";
import { ipcRenderer } from "electron";
import { Telemetry } from "@/frontend/utils/Telemetry";

const expect = chai.expect;
const invoke = ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>;

describe("Telemetry", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("delegates telemetry preferences to the main process", async () => {
    invoke.mockResolvedValue("enabled");

    await Telemetry.getPreference();
    await Telemetry.setPreference("enabled");

    expect(invoke.mock.calls).to.deep.equal([
      ["telemetry:preference:get"],
      ["telemetry:preference:set", "enabled"]
    ]);
  });

  it("forwards projected product and outcome events to the main process", () => {
    Telemetry.product("openSet");
    Telemetry.outcome({
      kind: "set_saved",
      result: "completed",
      source: "created",
      count_bucket: "one"
    });

    expect(invoke.mock.calls).to.deep.equal([
      ["telemetry:product", { kind: "openSet" }],
      [
        "telemetry:outcome",
        { kind: "set_saved", result: "completed", source: "created", count_bucket: "one" }
      ]
    ]);
  });
});
