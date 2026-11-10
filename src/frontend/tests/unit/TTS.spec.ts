import chai from "chai";
import { expect as assert } from "vitest";
import axios from "axios";
import { storageService } from "@/frontend/services/card-storage-service";
import store from "@/frontend/store";
import { CardType } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import { tts } from "@/frontend/utils/TTSServer";
import { Telemetry } from "@/frontend/utils/Telemetry";

const expect = chai.expect;
const get = axios.get as unknown as ReturnType<typeof vi.fn>;
const getAudio = storageService.getAudio as unknown as ReturnType<typeof vi.fn>;
const requestTts = tts as unknown as ReturnType<typeof vi.fn>;

interface MockedAudio {
  currentTime: number;
  oncanplay: (() => void | Promise<void>) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  onpause: (() => void) | null;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  src: string;
}

function mockedAudio(player: TTS): MockedAudio {
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

vi.mock("@/frontend/utils/Telemetry", () => ({
  Telemetry: { outcome: vi.fn(), product: vi.fn() }
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

    await player.playCards("set.linka", [
      { id: "audio", cardType: CardType.AudioCard, audioPath: "audio.mp3" }
    ]);

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

    await mockedAudio(player).oncanplay?.();
    mockedAudio(player).onended?.();
    await playing;

    expect(player.isPlaying).to.equal(false);
  });

  it("emits one content-free outcome only after all cards actually end", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    getAudio.mockResolvedValue(new Uint8Array([1]));
    const playing = player.playCards(
      "private-set.linka",
      [
        { id: "one", title: "private words", cardType: CardType.AudioCard, audioPath: "one.mp3" },
        { id: "two", cardType: CardType.AudioCard, audioPath: "two.mp3" }
      ],
      false,
      "standard"
    );
    await vi.waitFor(() => expect(audio.onended).to.be.a("function"));
    await audio.oncanplay?.();
    assert(Telemetry.outcome).not.toHaveBeenCalled();
    const firstEnd = audio.onended;
    firstEnd?.();
    await vi.waitFor(() => expect(getAudio.mock.calls).to.have.length(2));
    assert(Telemetry.outcome).not.toHaveBeenCalled();
    firstEnd?.();
    audio.onended?.();
    audio.onended?.();
    await playing;
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "completed",
      mode: "standard"
    });
  });

  it.each(["onerror", "onpause", "onended"] as const)(
    "uses the real %s callback and ignores repeated terminal callbacks",
    async (callback) => {
      const player = new TTS();
      const audio = mockedAudio(player);
      const playing = player.playText("private words", undefined, "without-space");
      await vi.waitFor(() => expect(audio[callback]).to.be.a("function"));
      assert(Telemetry.outcome).not.toHaveBeenCalled();
      const finish = audio[callback];
      finish?.();
      finish?.();
      audio.onended?.();
      await playing;
      assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
        kind: "utterance_completed",
        result:
          callback === "onended" ? "completed" : callback === "onerror" ? "failed" : "cancelled",
        mode: "without-space"
      });
    }
  );

  it("reports a rejected play request as failed, not completed", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    audio.play.mockRejectedValueOnce(new Error("private device failure"));
    const playing = player.playText("private words", undefined, "without-space");
    await vi.waitFor(() => expect(audio.oncanplay).to.be.a("function"));
    await audio.oncanplay?.();
    audio.onended?.();
    await playing;
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "failed",
      mode: "without-space"
    });
  });

  it("waits for ended when the browser pauses at the natural end", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    const playing = player.playText("private words", undefined, "without-space");
    await vi.waitFor(() => expect(audio.onended).to.be.a("function"));
    Object.defineProperty(audio, "ended", { value: true });
    audio.onpause?.();
    assert(Telemetry.outcome).not.toHaveBeenCalled();
    audio.onended?.();
    await playing;
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "completed",
      mode: "without-space"
    });
  });

  it("reports request failures without exception contents", async () => {
    const player = new TTS();
    requestTts.mockRejectedValueOnce(new Error("private request"));
    await assert(player.playText("private words", undefined, "without-space")).rejects.toThrow();
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "failed",
      mode: "without-space"
    });
  });

  it("never calls a missing audio buffer a completed utterance", async () => {
    const player = new TTS();
    getAudio.mockResolvedValue(undefined);
    await player.playCards(
      "private-set.linka",
      [{ id: "one", cardType: CardType.AudioCard, audioPath: "one.mp3" }],
      false,
      "standard"
    );
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "failed",
      mode: "standard"
    });
  });

  it("cancels pending card loading and ignores its late buffer", async () => {
    const player = new TTS();
    let complete!: (buffer: Uint8Array) => void;
    getAudio.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));
    const playing = player.playCards(
      "private-set.linka",
      [{ id: "one", cardType: CardType.AudioCard, audioPath: "one.mp3" }],
      false,
      "standard"
    );
    player.stop();
    complete(new Uint8Array([1]));
    await playing;
    expect(mockedAudio(player).src).to.equal("");
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "cancelled",
      mode: "standard"
    });
  });

  it("keeps a partial playback failure after subsequent cards end", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    getAudio.mockResolvedValueOnce(undefined).mockResolvedValueOnce(new Uint8Array([1]));
    const playing = player.playCards(
      "private-set.linka",
      [
        { id: "one", cardType: CardType.AudioCard, audioPath: "one.mp3" },
        { id: "two", cardType: CardType.AudioCard, audioPath: "two.mp3" }
      ],
      false,
      "standard"
    );
    await vi.waitFor(() => expect(audio.onended).to.be.a("function"));
    const canPlay = audio.oncanplay;
    await canPlay?.();
    await canPlay?.();
    expect(audio.play.mock.calls).to.have.length(1);
    audio.onended?.();
    await playing;
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "failed",
      mode: "standard"
    });
  });

  it("cancels a pending synthesis once and never plays its late result", async () => {
    const player = new TTS();
    let complete!: (buffer: Uint8Array) => void;
    requestTts.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));
    const playing = player.playText("private words", undefined, "without-space");
    player.stop();
    player.stop();
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "cancelled",
      mode: "without-space"
    });
    complete(new Uint8Array([1]));
    await playing;
    expect(mockedAudio(player).src).to.equal("");
    assert(Telemetry.outcome).toHaveBeenCalledTimes(1);
  });

  it("cancels superseded playback without stale callbacks settling the replacement", async () => {
    const player = new TTS();
    const audio = mockedAudio(player);
    getAudio.mockResolvedValue(new Uint8Array([1]));
    const card = { id: "one", cardType: CardType.AudioCard, audioPath: "one.mp3" };
    const first = player.playCards("set.linka", [card], true, "direct");
    await vi.waitFor(() => expect(audio.onended).to.be.a("function"));
    const staleEnd = audio.onended;
    const second = player.playCards("set.linka", [card], true, "direct");
    await vi.waitFor(() => expect(getAudio.mock.calls).to.have.length(2));
    expect(player.audio).not.to.equal(audio);
    staleEnd?.();
    expect(player.isPlaying).to.equal(true);
    assert(Telemetry.outcome).toHaveBeenCalledExactlyOnceWith({
      kind: "utterance_completed",
      result: "cancelled",
      mode: "direct"
    });
    mockedAudio(player).onended?.();
    await Promise.all([first, second]);
    assert(Telemetry.outcome).toHaveBeenNthCalledWith(2, {
      kind: "utterance_completed",
      result: "completed",
      mode: "direct"
    });
    assert(Telemetry.outcome).toHaveBeenCalledTimes(2);
  });

  it("does not emit utterance outcomes for previews or empty output", async () => {
    const player = new TTS();
    const playing = player.playText("preview");
    await vi.waitFor(() => expect(mockedAudio(player).onended).to.be.a("function"));
    mockedAudio(player).onended?.();
    await playing;
    await player.playCards("set.linka", [], false, "standard");
    await player.playText("", undefined, "without-space");
    assert(Telemetry.outcome).not.toHaveBeenCalled();
  });
});
