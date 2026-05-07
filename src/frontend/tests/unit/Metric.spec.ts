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
  });

  it("does not send events for invalid pcHash", async () => {
    await Metric.registerEvent("bad-hash", "openSet", { filename: "test.linka" });

    expect(post.mock.calls).to.have.length(0);
  });

  it("sends events for valid pcHash", async () => {
    post.mockResolvedValue({ data: {} });

    await Metric.registerEvent("00000000-0000-4000-8000-000000000000", "openSet", { filename: "test.linka" });

    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/registerEvent",
      {
        hash: "00000000-0000-4000-8000-000000000000",
        eventName: "openSet",
        eventData: { filename: "test.linka" }
      }
    ]);
  });

  it("does not throw when event registration fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    post.mockRejectedValue(new Error("network down"));

    await Metric.registerEvent("00000000-0000-4000-8000-000000000000", "openEditor");

    expect(errorSpy.mock.calls[0][0]).to.equal("Failed to register event:");
    errorSpy.mockRestore();
  });

  it("requests activation email", async () => {
    post.mockResolvedValue({ data: {} });

    await Metric.sendActivationEmail("user@example.com");

    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/requestActivation",
      { email: "user@example.com" },
      {}
    ]);
  });

  it("returns activation hash from server response", async () => {
    post.mockResolvedValue({ data: { hash: "hash-value" } });

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
