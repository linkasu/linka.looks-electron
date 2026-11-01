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
  it("uses an unexpired token after early refresh fails without masking expiry, force or compatibility", async () => {
    for (const scenario of ["valid", "expired", "forced", "compatibility"] as const) {
      const store = createStore();
      store.values.set("ttsInstallationToken", {
        token: "fixture-token",
        expiresAt: scenario === "expired" ? 1000 : scenario === "forced" ? 172801000 : 61000
      });
      const failure =
        scenario === "compatibility" ? { response: { status: 501 } } : new Error("offline");
      const post = vi.fn();
      if (scenario === "forced") post.mockRejectedValueOnce({ response: { status: 401 } });
      post.mockRejectedValueOnce(failure).mockResolvedValueOnce({ data: new Uint8Array([7]) });
      const service = new InstallationTokenTts(
        store,
        { post },
        () => 1000,
        () => "fixture-id"
      );
      if (scenario === "expired" || scenario === "forced") {
        await expect(service.synthesize("мама", "alena")).rejects.toBe(failure);
        expect(post).toHaveBeenCalledTimes(scenario === "forced" ? 2 : 1);
      } else {
        await expect(service.synthesize("мама", "alena")).resolves.toEqual(Buffer.from([7]));
        expect(post.mock.calls[1][0]).toBe(
          scenario === "valid"
            ? "https://backend.linka.su/v1/tts/anonymous"
            : "https://tts.linka.su/tts"
        );
      }
    }
  });
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

  it("uses an unexpired cached token when early refresh fails", async () => {
    const now = 1_000;
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "still-valid-token",
      expiresAt: now + 60_000
    });
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient network error"))
      .mockResolvedValueOnce({ data: new Uint8Array([7]) });
    const service = new InstallationTokenTts(
      store,
      { post },
      () => now,
      () => "stable-id"
    );

    await expect(service.synthesize("мама", "alena")).resolves.toEqual(Buffer.from([7]));

    expect(post).toHaveBeenNthCalledWith(
      2,
      "https://backend.linka.su/v1/tts/anonymous",
      { text: "мама", voice: "alena" },
      expect.objectContaining({
        headers: {
          "X-TTS-Installation-Token": "still-valid-token",
          "Idempotency-Key": "stable-id"
        }
      })
    );
  });

  it("rethrows refresh error when cached token has already expired", async () => {
    const now = 5_000;
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "already-expired-token",
      expiresAt: now
    });
    const networkError = new Error("offline");
    const post = vi.fn().mockRejectedValueOnce(networkError);
    const service = new InstallationTokenTts(
      store,
      { post },
      () => now,
      () => "stable-id"
    );

    await expect(service.synthesize("мама", "alena")).rejects.toBe(networkError);
    expect(post).toHaveBeenCalledOnce();
  });

  it("does not reuse a rejected cached token when forced refresh fails", async () => {
    const store = createStore();
    store.values.set("ttsInstallationToken", {
      token: "rejected-token",
      expiresAt: 48 * 60 * 60 * 1000
    });
    const networkError = new Error("offline");
    const post = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockRejectedValueOnce(networkError);
    const service = new InstallationTokenTts(store, { post }, () => 1_000);

    await expect(service.synthesize("hello", "john")).rejects.toBe(networkError);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([404, 501])(
    "does not mask compatibility status %s with a cached token",
    async (status) => {
      const store = createStore();
      store.values.set("ttsInstallationToken", {
        token: "still-valid-token",
        expiresAt: 60_000
      });
      const post = vi
        .fn()
        .mockRejectedValueOnce({ response: { status } })
        .mockResolvedValueOnce({ data: new Uint8Array([4]) });
      const service = new InstallationTokenTts(store, { post }, () => 1_000);

      await expect(service.synthesize("hello", "john")).resolves.toEqual(Buffer.from([4]));
      expect(post).toHaveBeenLastCalledWith(
        "https://tts.linka.su/tts",
        { text: "hello", voice: "john" },
        { responseType: "arraybuffer" }
      );
    }
  );

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
