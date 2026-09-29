import { ipcMain } from "electron";
import Store from "electron-store";
import axios from "axios";
import { v4 as uuid } from "uuid";

const BACKEND_URL = "https://backend.linka.su/v1";
const DIRECT_TTS_URL = "https://tts.linka.su/tts";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

type InstallationToken = {
  token: string;
  expiresAt: number;
};

type StoreLike = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
};

type HttpClient = Pick<typeof axios, "post">;

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } }).response?.status;
}

function isCompatibilityError(error: unknown): boolean {
  const status = statusOf(error);
  return status === 404 || status === 501;
}

function expirationOf(data: unknown): number {
  const value =
    (data as { expiresAt?: unknown; expires_at?: unknown }).expiresAt ??
    (data as { expires_at?: unknown }).expires_at;
  const expiresAt = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(expiresAt)) throw new TypeError("invalid TTS installation expiration");
  return expiresAt;
}

export class InstallationTokenTts {
  constructor(
    private readonly store: StoreLike,
    private readonly client: HttpClient = axios,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = uuid
  ) {}

  async synthesize(text: string, voice: string): Promise<Buffer> {
    const idempotencyKey = this.installationId();
    let token: InstallationToken;
    try {
      token = await this.token();
    } catch (error) {
      if (isCompatibilityError(error)) return this.direct(text, voice);
      throw error;
    }

    try {
      return await this.anonymous(text, voice, token.token, idempotencyKey);
    } catch (error) {
      if (statusOf(error) === 401) {
        try {
          token = await this.token(true);
          return await this.anonymous(text, voice, token.token, idempotencyKey);
        } catch (retryError) {
          if (isCompatibilityError(retryError)) return this.direct(text, voice);
          throw retryError;
        }
      }
      if (isCompatibilityError(error)) return this.direct(text, voice);
      throw error;
    }
  }

  private installationId(): string {
    const current = this.store.get("ttsInstallationId") as string | undefined;
    if (current) return current;
    const id = this.createId();
    this.store.set("ttsInstallationId", id);
    return id;
  }

  private async token(force = false): Promise<InstallationToken> {
    const current = this.store.get("ttsInstallationToken") as InstallationToken | undefined;
    if (!force && current && current.expiresAt > this.now() + REFRESH_INTERVAL_MS) {
      return current;
    }

    const response = await this.client.post(`${BACKEND_URL}/tts/installations`, undefined, {
      timeout: REQUEST_TIMEOUT_MS
    });
    const token = (response.data as { token?: unknown }).token;
    if (typeof token !== "string" || !token) throw new TypeError("invalid TTS installation token");
    const next = { token, expiresAt: expirationOf(response.data) };
    this.store.set("ttsInstallationToken", next);
    return next;
  }

  private async anonymous(
    text: string,
    voice: string,
    token: string,
    idempotencyKey: string
  ): Promise<Buffer> {
    const response = await this.client.post(
      `${BACKEND_URL}/tts/anonymous`,
      { text, voice },
      {
        headers: {
          "X-TTS-Installation-Token": token,
          "Idempotency-Key": idempotencyKey
        },
        responseType: "arraybuffer",
        timeout: REQUEST_TIMEOUT_MS
      }
    );
    return Buffer.from(response.data);
  }

  private async direct(text: string, voice: string): Promise<Buffer> {
    const response = await this.client.post(
      DIRECT_TTS_URL,
      { text, voice },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(response.data);
  }
}

export function registerTtsIpc(): void {
  const tts = new InstallationTokenTts(new Store({ name: "config" }));
  ipcMain.handle("tts:anonymous", (_event, text, voice) => {
    if (typeof text !== "string" || typeof voice !== "string") {
      throw new TypeError("invalid TTS request");
    }
    return tts.synthesize(text, voice);
  });
}
