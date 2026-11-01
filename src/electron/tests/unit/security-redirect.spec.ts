import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe("updater redirect policy", () => {
  it("drops fixture credentials on origin, port and protocol changes without making requests", () => {
    const require = createRequire(import.meta.url);
    const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
    const { HttpExecutor } = updaterRequire("builder-util-runtime");
    for (const url of [
      "https://other.invalid/file",
      "https://feed.invalid:444/file",
      "http://feed.invalid/file"
    ]) {
      const result = HttpExecutor.prepareRedirectUrlOptions(url, {
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
      for (const header of ["Authorization", "Cookie", "X-Api-Key"])
        expect(result.headers).not.toHaveProperty(header);
      expect(result.headers.Accept).toBe("application/yaml");
    }
  });
});
