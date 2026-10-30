import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { createServer, type Server } from "node:http";
import { Agent, createServer as createHttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("accepts only a scoped fixture CA with the correct HTTPS identity", async () => {
    const directory = mkdtempSync(join(tmpdir(), "looks-tls-fixture-"));
    const agents: Agent[] = [];
    try {
      const openssl = (...args: string[]) =>
        execFileSync("openssl", args, { cwd: directory, stdio: "pipe" });
      openssl(
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:P-256",
        "-nodes",
        "-keyout",
        "ca.key",
        "-out",
        "ca.pem",
        "-days",
        "2",
        "-subj",
        "/CN=Ephemeral test CA",
        "-addext",
        "basicConstraints=critical,CA:TRUE"
      );
      openssl(
        "req",
        "-new",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:P-256",
        "-nodes",
        "-keyout",
        "server.key",
        "-out",
        "server.csr",
        "-subj",
        "/CN=localhost"
      );
      writeFileSync(
        join(directory, "extensions"),
        "subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n"
      );
      openssl(
        "x509",
        "-req",
        "-in",
        "server.csr",
        "-CA",
        "ca.pem",
        "-CAkey",
        "ca.key",
        "-set_serial",
        "1",
        "-out",
        "server.pem",
        "-days",
        "2",
        "-extfile",
        "extensions"
      );
      const ca = readFileSync(join(directory, "ca.pem"));
      const url = await listen(
        createHttpsServer(
          {
            key: readFileSync(join(directory, "server.key")),
            cert: readFileSync(join(directory, "server.pem"))
          },
          (_request, response) => response.end("trusted fixture")
        ),
        "https"
      );
      const trusted = new Agent({ ca, servername: "localhost" });
      const wrongIdentity = new Agent({ ca, servername: "wrong.invalid" });
      agents.push(trusted, wrongIdentity);
      expect(
        (await axios.get(url, { httpsAgent: trusted, proxy: false, timeout: 2000 })).data
      ).toBe("trusted fixture");
      await expect(
        axios.get(url, { httpsAgent: wrongIdentity, proxy: false, timeout: 2000 })
      ).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
      await expect(axios.get(url, { proxy: false, timeout: 2000 })).rejects.toMatchObject({
        code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
      });
    } finally {
      for (const agent of agents) agent.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
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
