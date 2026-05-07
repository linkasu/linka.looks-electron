import chai from "chai";
import axios from "axios";
import { tts } from "@/frontend/utils/TTSServer";

const expect = chai.expect;
const post = axios.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("axios", () => ({
  default: {
    post: vi.fn()
  }
}));

describe("tts function", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("requests TTS audio and returns a buffer", async () => {
    post.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });

    const buffer = await tts("hello", "alena");

    expect(post.mock.calls[0]).to.deep.equal([
      "https://tts.linka.su/tts",
      { text: "hello", voice: "alena" },
      { responseType: "arraybuffer" }
    ]);
    expect(buffer).instanceOf(Buffer);
    expect([...buffer]).to.deep.equal([1, 2, 3]);
  });
});
