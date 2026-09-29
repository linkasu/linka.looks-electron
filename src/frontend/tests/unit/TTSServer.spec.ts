import chai from "chai";
import axios from "axios";
import { ipcRenderer } from "electron";
import { tts } from "@/frontend/utils/TTSServer";

const expect = chai.expect;
const post = axios.post as unknown as ReturnType<typeof vi.fn>;
const invoke = ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>;
const installationTokensEnabled = process.env.TTS_INSTALLATION_TOKENS_ENABLED === "true";

vi.mock("axios", () => ({
  default: {
    post: vi.fn()
  }
}));

describe("tts function", () => {
  beforeEach(() => {
    post.mockReset();
    invoke.mockReset();
  });

  it.skipIf(installationTokensEnabled)(
    "requests direct TTS audio when installation tokens are off",
    async () => {
      post.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });

      const buffer = await tts("hello", "alena");

      expect(post.mock.calls[0]).to.deep.equal([
        "https://tts.linka.su/tts",
        { text: "hello", voice: "alena" },
        { responseType: "arraybuffer" }
      ]);
      expect(buffer).instanceOf(Buffer);
      expect([...buffer]).to.deep.equal([1, 2, 3]);
    }
  );

  it.skipIf(!installationTokensEnabled)(
    "sends only text and voice to the main process when installation tokens are on",
    async () => {
      invoke.mockResolvedValue(new Uint8Array([1, 2, 3]));

      const buffer = await tts("hello", "alena");

      expect(invoke.mock.calls).to.deep.equal([["tts:anonymous", "hello", "alena"]]);
      expect(post.mock.calls).to.deep.equal([]);
      expect([...buffer]).to.deep.equal([1, 2, 3]);
    }
  );
});
