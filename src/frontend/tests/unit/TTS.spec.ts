import chai from "chai";
import axios from "axios";
import { storageService } from "@/frontend/services/card-storage-service";
import store from "@/frontend/store";
import { CardType } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import { tts } from "@/frontend/utils/TTSServer";

const expect = chai.expect;
const get = axios.get as unknown as ReturnType<typeof vi.fn>;
const getAudio = storageService.getAudio as unknown as ReturnType<typeof vi.fn>;
const requestTts = tts as unknown as ReturnType<typeof vi.fn>;

interface MockedAudio {
  currentTime: number;
  oncanplay: (() => void | Promise<void>) | null;
  onended: (() => void) | null;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  src: string;
}

function mockedAudio (player: TTS): MockedAudio {
  return player.audio as unknown as MockedAudio;
}

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: {
    getAudio: vi.fn()
  }
}));

vi.mock("@/frontend/utils/TTSServer", () => ({
  tts: vi.fn()
}));

describe("TTS", () => {
  beforeEach(() => {
    TTS.voices.splice(0);
    get.mockResolvedValue({ data: [] });
    getAudio.mockReset();
    requestTts.mockReset();
    requestTts.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("loads voices once on construction", async () => {
    get.mockResolvedValue({
      data: [{ id: "john", lang_code: "en-US", name: "John" }]
    });

    new TTS();

    await vi.waitFor(() => {
      expect(TTS.voices).to.have.length(1);
    });
    expect(TTS.voices[0]).to.deep.equal({
      value: "john",
      text: "John (en-US)",
      langCode: "en-US"
    });

    new TTS();

    expect(get.mock.calls).to.have.length(1);
  });

  it("resolves English and Russian voices from store settings", () => {
    const player = new TTS();
    store.commit("voiceEn", "emma");
    store.commit("voiceRu", "oksana");

    expect(player.resolveVoice("hello")).to.equal("emma");
    expect(player.resolveVoice("привет")).to.equal("oksana");
    expect(player.resolveVoice("hello привет")).to.equal("oksana");
  });

  it("plays card audio from storage", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    getAudio.mockResolvedValue(new Uint8Array([9, 8, 7]));

    const playing = player.playCards("set.linka", [
      { id: "space", cardType: CardType.SpaceCard },
      { id: "audio", cardType: CardType.AudioCard, audioPath: "audio.mp3" }
    ]);

    await vi.waitFor(() => {
      expect(audio.src).to.equal("blob:unit-test");
    });
    await audio.oncanplay?.();
    audio.onended?.();
    await playing;

    expect(getAudio.mock.calls).to.deep.equal([["set.linka", "audio.mp3"]]);
    expect(audio.play.mock.calls).to.have.length(1);
    expect(player.isPlaying).to.equal(false);
  });

  it("stops current card playback when called without force", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    player.isPlaying = true;

    await player.playCards("set.linka", [{ id: "audio", cardType: CardType.AudioCard, audioPath: "audio.mp3" }]);

    expect(audio.pause.mock.calls).to.have.length(1);
    expect(getAudio.mock.calls).to.have.length(0);
  });

  it("plays text through TTS server", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    store.commit("voiceEn", "john");

    const playing = player.playText("hello");

    await vi.waitFor(() => {
      expect(requestTts.mock.calls[0]).to.deep.equal(["hello", "john"]);
    });
    await audio.oncanplay?.();
    audio.onended?.();
    await playing;

    expect(audio.play.mock.calls).to.have.length(1);
    expect(player.isPlaying).to.equal(false);
  });

  it("pauses existing text playback instead of starting another request", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    player.isPlaying = true;

    await player.playText("hello");

    expect(audio.pause.mock.calls).to.have.length(1);
    expect(requestTts.mock.calls).to.have.length(0);
  });

  it("force plays text after stopping current audio", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    player.isPlaying = true;

    const playing = player.forcePlayText("привет", "alena");

    await vi.waitFor(() => {
      expect(requestTts.mock.calls[0]).to.deep.equal(["привет", "alena"]);
    });
    expect(audio.currentTime).to.equal(0);
    expect(audio.pause.mock.calls).to.have.length(1);

    await audio.oncanplay?.();
    audio.onended?.();
    await playing;

    expect(player.isPlaying).to.equal(false);
  });
});
