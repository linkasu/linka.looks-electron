import chai from "chai";
import axios from "axios";
import { activationService } from "@/frontend/services/ActivationService";

const expect = chai.expect;
const post = axios.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("axios", () => ({
  default: {
    post: vi.fn()
  }
}));

describe("activationService", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("uses the legacy activation endpoint independently from telemetry consent", async () => {
    post.mockResolvedValue({ data: {} });

    await activationService.sendEmail("user@example.com");

    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/requestActivation",
      { email: "user@example.com" }
    ]);
  });

  it("returns the activation hash from the legacy activation endpoint", async () => {
    post.mockResolvedValue({ data: { hash: "hash-value" } });

    const hash = await activationService.activate("user@example.com", "123456");

    expect(hash).to.equal("hash-value");
    expect(post.mock.calls[0]).to.deep.equal([
      "https://metric.linka.su/activate",
      { email: "user@example.com", code: "123456" }
    ]);
  });
});
