import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { createServer, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done())))
  );
});

async function listen(server: Server, protocol = "http") {
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `${protocol}://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("security dependency network regressions (loopback only)", () => {
  it("follows redirects with proxy + NO_PROXY and bounds redirect loops", async () => {
    const url = await listen(
      createServer((request, response) => {
        if (request.url === "/ok") return response.end("fixture");
        response.writeHead(302, { location: request.url === "/loop" ? "/loop" : "/ok" });
        response.end();
      })
    );
    vi.stubEnv("HTTP_PROXY", "http://127.0.0.1:1");
    vi.stubEnv("http_proxy", "http://127.0.0.1:1");
    vi.stubEnv("NO_PROXY", "127.0.0.1");
    vi.stubEnv("no_proxy", "127.0.0.1");
    expect((await axios.get(`${url}/redirect`, { timeout: 2000 })).data).toBe("fixture");
    await expect(
      axios.get(`${url}/loop`, { maxRedirects: 2, timeout: 2000 })
    ).rejects.toMatchObject({
      code: "ERR_FR_TOO_MANY_REDIRECTS"
    });
  });

  it("rejects an HTTPS endpoint without a valid TLS identity", async () => {
    const url = await listen(createHttpsServer(), "https");
    await expect(axios.get(url, { proxy: false, timeout: 2000 })).rejects.toThrow();
  });

  it("updater runtime removes credentials on cross-origin and downgrade redirects", () => {
    const require = createRequire(import.meta.url);
    const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
    const { HttpExecutor } = updaterRequire("builder-util-runtime");
    for (const target of [
      "https://other.invalid/file",
      "https://feed.invalid:444/file",
      "http://feed.invalid/file"
    ]) {
      const result = HttpExecutor.prepareRedirectUrlOptions(target, {
        protocol: "https:",
        hostname: "feed.invalid",
        path: "/latest.yml",
        headers: {
          Authorization: "fixture-only",
          Cookie: "fixture-only",
          "X-Api-Key": "fixture-only",
          Accept: "application/yaml"
        }
      });
      expect(result.headers).toMatchObject({ Accept: "application/yaml" });
      for (const name of ["Authorization", "Cookie", "X-Api-Key"]) {
        expect(result.headers).not.toHaveProperty(name);
      }
    }
    const result = HttpExecutor.prepareRedirectUrlOptions("https://feed.invalid/file", {
      protocol: "https:",
      hostname: "feed.invalid",
      path: "/latest.yml",
      headers: { Authorization: "fixture-only" }
    });
    expect(result.headers.Authorization).toBe("fixture-only");
  });
});
