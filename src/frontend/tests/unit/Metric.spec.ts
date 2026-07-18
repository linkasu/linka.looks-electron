import chai from "chai";
import axios from "axios";
import { Metric } from "@/frontend/utils/Metric";

const expect = chai.expect;
const post = axios.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("axios", () => ({
  default: {
    post: vi.fn()
  }
}));

describe("Metric", () => {
  beforeEach(() => {
    post.mockReset();
    Metric.setTelemetryConsent("unknown");
  });

  it("does not send events before the user makes a choice", async () => {
    await Metric.registerEvent("00000000-0000-4000-8000-000000000000", "openSet");

    expect(post.mock.calls).to.have.length(0);
  });

  it("does not send events after opt-out", async () => {
    Metric.setTelemetryConsent("disabled");
    await Metric.registerEvent("00000000-0000-4000-8000-000000000000", "openSet");

    expect(post.mock.calls).to.have.length(0);
  });

  it("does not send events for invalid pcHash after opt-in", async () => {
    Metric.setTelemetryConsent("enabled");
    await Metric.registerEvent("bad-hash", "openSet");

    expect(post.mock.calls).to.have.length(0);
  });

  it("sends the event name and current consent proof after opt-in", async () => {
    post.mockResolvedValue({ data: {} });
    Metric.setTelemetryConsent("enabled");

    await Metric.registerEvent("00000000-0000-4000-8000-000000000000", "openSet");

    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/registerEvent",
      {
        hash: "00000000-0000-4000-8000-000000000000",
        eventName: "openSet",
        consent: {
          policy: "technical-events",
          version: 1,
          granted: true
        }
      }
    ]);
  });

  it("does not throw when event registration fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    post.mockRejectedValue(new Error("network down"));
    Metric.setTelemetryConsent("enabled");

    await Metric.registerEvent("00000000-0000-4000-8000-000000000000", "openEditor");

    expect(errorSpy.mock.calls[0][0]).to.equal("Failed to register event:");
    errorSpy.mockRestore();
  });

  it("requests activation email without telemetry consent", async () => {
    post.mockResolvedValue({ data: {} });

    await Metric.sendActivationEmail("user@example.com");

    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/requestActivation",
      { email: "user@example.com" },
      {}
    ]);
  });

  it("returns activation hash after telemetry opt-out", async () => {
    post.mockResolvedValue({ data: { hash: "hash-value" } });
    Metric.setTelemetryConsent("disabled");

    const hash = await Metric.activateAccount("user@example.com", "1234");

    expect(hash).to.equal("hash-value");
    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/activate",
      { email: "user@example.com", code: "1234" }
    ]);
  });

  it("returns undefined when activation fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    post.mockRejectedValue(new Error("network down"));

    const hash = await Metric.activateAccount("user@example.com", "1234");

    expect(hash).to.equal(undefined);
    expect(errorSpy.mock.calls[0][0]).to.equal("Failed to activate account:");
    errorSpy.mockRestore();
  });
});
