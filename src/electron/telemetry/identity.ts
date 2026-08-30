import { randomUUID } from "crypto";
import { safeStorage } from "electron";
import { chmod, mkdir, open, readFile, rename, rm } from "fs/promises";
import { join } from "path";

type JSONResponse = { ok: boolean; status: number; body: unknown };
export type IdentityRequest = (input: string, init: RequestInit) => Promise<JSONResponse>;

type AccessToken = { token: string; expiresAt: string };
type StoredIdentity = {
  schemaVersion: 2;
  installationKey: string;
  credentials: string;
  protected: boolean;
};
type Identity = {
  installationKey: string;
  refreshToken: string;
  policyVersion: string;
  accessToken?: AccessToken;
};

export class LooksIdentityClient {
  private readonly path: string;
  private identity?: Identity;
  private loaded = false;
  private unavailable = false;

  constructor(
    private readonly options: {
      directory: string;
      endpoint: string;
      platform: "windows" | "macos" | "linux";
      policyVersion: string;
    }
  ) {
    this.path = join(options.directory, "installation-v2.json");
  }

  async getAccess(request: IdentityRequest): Promise<Identity> {
    await this.load();
    if (this.unavailable) throw new Error("stored installation credential is unavailable");
    if (!this.identity) {
      const response = await request(endpoint(this.options.endpoint, "/v1/public/installations"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_id: randomUUID(),
          product_id: "linka-looks",
          platform: this.options.platform,
          preference: "allowed",
          policy_version: this.options.policyVersion,
          recorded_at: new Date().toISOString()
        })
      });
      if (!response.ok) throw new Error("installation registration rejected");
      this.identity = parseRegistration(response.body, this.options);
      await this.save();
    }
    if (
      this.identity.accessToken &&
      Date.parse(this.identity.accessToken.expiresAt) > Date.now() + 60_000
    )
      return this.identity;
    const response = await request(
      endpoint(this.options.endpoint, "/v1/public/installations/token"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.identity.refreshToken}`
        },
        body: "{}"
      }
    );
    if (!response.ok) throw new Error("installation token refresh rejected");
    this.identity.accessToken = parseToken(response.body, this.identity.installationKey);
    await this.save();
    return this.identity;
  }

  async deny(request: IdentityRequest): Promise<boolean> {
    await this.load();
    if (this.unavailable || !this.identity) {
      await this.clear();
      return !this.unavailable;
    }
    const response = await request(
      endpoint(this.options.endpoint, "/v1/public/installations/telemetry-preference"),
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.identity.refreshToken}`
        },
        body: JSON.stringify({
          preference: "denied",
          policy_version: this.identity.policyVersion,
          recorded_at: new Date().toISOString()
        })
      }
    );
    if (
      !response.ok ||
      !isRecord(response.body) ||
      response.body.product !== "linka-looks" ||
      response.body.preference !== "denied" ||
      response.body.installation_key !== this.identity.installationKey
    )
      return false;
    await this.clear();
    return true;
  }

  async clear(): Promise<void> {
    this.identity = undefined;
    this.loaded = true;
    await rm(this.path, { force: true });
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    let stored: StoredIdentity;
    try {
      stored = JSON.parse(await readFile(this.path, "utf8")) as StoredIdentity;
    } catch (error) {
      if (!isMissing(error)) this.unavailable = true;
      return;
    }
    if (
      stored.schemaVersion !== 2 ||
      !isKey(stored.installationKey) ||
      typeof stored.credentials !== "string" ||
      typeof stored.protected !== "boolean"
    ) {
      this.unavailable = true;
      return;
    }
    try {
      const credentials = stored.protected
        ? safeStorage.decryptString(Buffer.from(stored.credentials, "base64"))
        : stored.credentials;
      const parsed = JSON.parse(credentials) as Record<string, unknown>;
      if (
        typeof parsed.refreshToken !== "string" ||
        parsed.refreshToken.length < 100 ||
        typeof parsed.policyVersion !== "string"
      )
        throw new Error("invalid credential");
      this.identity = {
        installationKey: stored.installationKey,
        refreshToken: parsed.refreshToken,
        policyVersion: parsed.policyVersion,
        accessToken:
          parsed.accessToken === undefined
            ? undefined
            : parseToken(parsed.accessToken, stored.installationKey)
      };
    } catch {
      this.unavailable = true;
    }
  }

  private async save(): Promise<void> {
    if (!this.identity) return;
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    const credentials = JSON.stringify({
      refreshToken: this.identity.refreshToken,
      policyVersion: this.identity.policyVersion,
      accessToken: this.identity.accessToken && {
        access_token: this.identity.accessToken.token,
        expires_at: this.identity.accessToken.expiresAt,
        token_type: "Bearer",
        installation_key: this.identity.installationKey,
        product: "linka-looks"
      }
    });
    let value = credentials;
    let protectedCredentials = false;
    if (safeStorage.isEncryptionAvailable()) {
      value = safeStorage.encryptString(credentials).toString("base64");
      protectedCredentials = true;
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(
        JSON.stringify({
          schemaVersion: 2,
          installationKey: this.identity.installationKey,
          credentials: value,
          protected: protectedCredentials
        } satisfies StoredIdentity),
        "utf8"
      );
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }
}

function parseRegistration(
  value: unknown,
  options: { platform: string; policyVersion: string }
): Identity {
  if (
    !isRecord(value) ||
    !isKey(value.installation_key) ||
    value.product !== "linka-looks" ||
    value.platform !== options.platform ||
    value.preference !== "allowed" ||
    value.policy_version !== options.policyVersion ||
    typeof value.refresh_token !== "string" ||
    value.refresh_token.length < 100
  )
    throw new Error("invalid installation registration");
  return {
    installationKey: value.installation_key,
    refreshToken: value.refresh_token,
    policyVersion: options.policyVersion,
    accessToken:
      value.metrics_token === undefined
        ? undefined
        : parseToken(value.metrics_token, value.installation_key)
  };
}

function parseToken(value: unknown, installationKey: string): AccessToken {
  if (
    !isRecord(value) ||
    (value.installation_key !== undefined && value.installation_key !== installationKey) ||
    (value.product !== undefined && value.product !== "linka-looks") ||
    typeof value.access_token !== "string" ||
    value.access_token.length < 100 ||
    value.token_type !== "Bearer" ||
    typeof value.expires_at !== "string" ||
    !Number.isFinite(Date.parse(value.expires_at))
  )
    throw new Error("invalid installation access token");
  return { token: value.access_token, expiresAt: value.expires_at };
}

function endpoint(base: string, path: string): string {
  const url = new URL(base);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password)
    throw new Error("invalid identity endpoint");
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
