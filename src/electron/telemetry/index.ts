import { randomUUID } from "crypto";
import { app } from "electron";
import { release } from "os";
import { join } from "path";
import { LooksIdentityClient, type IdentityRequest } from "./identity";
import type { ProjectedTelemetry } from "./projector";

const metricsEndpoint = "https://metrics.nkolinka.ru";
const identityEndpoint = "https://api.identity.linka.su";
const policyVersion = "2026-07-22-v3";

export class LooksTelemetry {
  private readonly identity: LooksIdentityClient;
  private readonly appSessionId = randomUUID();
  private enabled = true;

  constructor(private readonly options: { userDataPath: string; request?: IdentityRequest }) {
    this.identity = new LooksIdentityClient({
      directory: join(options.userDataPath, "telemetry-v3"),
      endpoint: process.env.LINKA_IDENTITY_URL ?? identityEndpoint,
      platform: currentPlatform(),
      policyVersion
    });
  }

  record(projected: ProjectedTelemetry): boolean {
    if (!this.enabled) return false;
    void this.send(projected).catch(() => undefined);
    return true;
  }

  async disableAndClear(): Promise<void> {
    this.enabled = false;
    await this.identity.deny(this.request.bind(this)).catch(() => false);
  }

  private async send(projected: ProjectedTelemetry): Promise<void> {
    if (!this.enabled) return;
    const identity = await this.identity.getAccess(this.request.bind(this));
    if (!this.enabled) return;
    const body = {
      schema_version: 2,
      batch_id: randomUUID(),
      scope: { product: "linka-looks", subject_key: identity.installationKey },
      stream: projected.stream,
      sent_at: new Date().toISOString(),
      records: [
        {
          record_id: randomUUID(),
          occurred_at: new Date().toISOString(),
          kind: projected.kind,
          app_session_id: this.appSessionId,
          app: appMetadata(),
          ...(projected.fields ?? {})
        }
      ]
    };
    const response = await fetch(
      endpoint(process.env.LINKA_METRICS_URL ?? metricsEndpoint, "/v2/batches"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${identity.accessToken!.token}`,
          "idempotency-key": body.batch_id
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
      }
    );
    if (response.status === 403) this.enabled = false;
  }

  private async request(input: string, init: RequestInit) {
    if (this.options.request) return this.options.request(input, init);
    const response = await fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    return { ok: response.ok, status: response.status, body };
  }
}

export function createLooksTelemetry() {
  return new LooksTelemetry({ userDataPath: app.getPath("userData") });
}

function appMetadata() {
  const version = safeValue(app.getVersion());
  return {
    version,
    build: version,
    platform: currentPlatform(),
    os_version: safeValue(release()),
    locale: normalizeLocale(app.getLocale())
  };
}

function currentPlatform(): "windows" | "macos" | "linux" {
  return process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : "linux";
}

function normalizeLocale(locale: string) {
  return locale === "ru" || locale === "ru-RU" || locale === "en" || locale === "en-US"
    ? locale
    : "other";
}

function safeValue(value: string) {
  const normalized = value
    .replace(/[^A-Za-z0-9._:+-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 96);
  return normalized || "unknown";
}

function endpoint(base: string, path: string): string {
  const url = new URL(base);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password)
    throw new Error("invalid metrics endpoint");
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
