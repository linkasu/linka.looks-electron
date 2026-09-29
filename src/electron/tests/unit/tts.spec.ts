import { describe, expect, it, vi } from "vitest";
import { InstallationTokenTts } from "@/electron/tts";

function createStore() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn(<T>(key: string) => values.get(key) as T | undefined),
    set: vi.fn((key: string, value: unknown) => values.set(key, value))
  };
}

describe("InstallationTokenTts", () => {
  it("uses the persisted token and stable installation id", async () => {
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "stored-token",
      expiresAt: 24 * 60 * 60 * 1000 + 1_501
    });
    const post = vi.fn().mockResolvedValue({ data: new Uint8Array([1, 2]) });
    const service = new InstallationTokenTts(
      store,
      { post },
      () => 1_500,
      () => "stable-id"
    );

    await expect(service.synthesize("hello", "john")).resolves.toEqual(Buffer.from([1, 2]));

    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      "https://backend.linka.su/v1/tts/anonymous",
      { text: "hello", voice: "john" },
      expect.objectContaining({
        headers: {
          "X-TTS-Installation-Token": "stored-token",
          "Idempotency-Key": "stable-id"
        }
      })
    );
    expect(store.values.get("ttsInstallationId")).toBe("stable-id");
  });

  it("keeps a token valid for more than 24 hours without refreshing it", async () => {
    const now = 1_000;
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "stored-token",
      expiresAt: now + 24 * 60 * 60 * 1000 + 1
    });
    const post = vi.fn().mockResolvedValue({ data: new Uint8Array([2]) });
    const service = new InstallationTokenTts(
      store,
      { post },
      () => now,
      () => "stable-id"
    );

    await service.synthesize("hello", "john");

    expect(post).toHaveBeenCalledOnce();
  });

  it("refreshes a token that expires within 24 hours", async () => {
    const now = 1_000;
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "expiring-token",
      expiresAt: now + 24 * 60 * 60 * 1000
    });
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { token: "new-token", expiresAt: now + 48 * 60 * 60 * 1000 } })
      .mockResolvedValueOnce({ data: new Uint8Array([2]) });
    const service = new InstallationTokenTts(
      store,
      { post },
      () => now,
      () => "stable-id"
    );

    await service.synthesize("hello", "john");

    expect(post).toHaveBeenNthCalledWith(
      1,
      "https://backend.linka.su/v1/tts/installations",
      undefined,
      { timeout: 10_000 }
    );
  });

  it("refreshes once after 401 and reuses the idempotency key", async () => {
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "expired-token",
      expiresAt: 24 * 60 * 60 * 1000 + 1_501
    });
    const unauthorized = { response: { status: 401 } };
    const post = vi
      .fn()
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({ data: { token: "new-token", expiresAt: 3_000 } })
      .mockResolvedValueOnce({ data: new Uint8Array([3]) });
    const service = new InstallationTokenTts(
      store,
      { post },
      () => 1_500,
      () => "stable-id"
    );

    await expect(service.synthesize("привет", "alena")).resolves.toEqual(Buffer.from([3]));

    expect(post.mock.calls[0][2].headers["Idempotency-Key"]).toBe("stable-id");
    expect(post.mock.calls[2][2].headers["Idempotency-Key"]).toBe("stable-id");
    expect(post).toHaveBeenNthCalledWith(
      2,
      "https://backend.linka.su/v1/tts/installations",
      undefined,
      { timeout: 10_000 }
    );
  });

  it.each([404, 501])(
    "falls back to direct TTS only for compatibility status %s",
    async (status) => {
      const store = createStore();
      const post = vi
        .fn()
        .mockResolvedValueOnce({ data: { token: "token", expires_at: "1970-01-01T00:00:03Z" } })
        .mockRejectedValueOnce({ response: { status } })
        .mockResolvedValueOnce({ data: new Uint8Array([4]) });
      const service = new InstallationTokenTts(
        store,
        { post },
        () => 1_500,
        () => "stable-id"
      );

      await expect(service.synthesize("hello", "john")).resolves.toEqual(Buffer.from([4]));

      expect(post).toHaveBeenLastCalledWith(
        "https://tts.linka.su/tts",
        { text: "hello", voice: "john" },
        { responseType: "arraybuffer" }
      );
    }
  );

  it("does not use direct TTS after a network error", async () => {
    const store = createStore();
    const networkError = new Error("network unavailable");
    const post = vi.fn().mockRejectedValue(networkError);
    const service = new InstallationTokenTts(
      store,
      { post },
      () => 1_500,
      () => "stable-id"
    );

    await expect(service.synthesize("hello", "john")).rejects.toBe(networkError);
    expect(post).toHaveBeenCalledOnce();
  });
});
