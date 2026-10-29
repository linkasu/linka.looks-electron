import { build } from "vite";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = mkdtempSync(join(tmpdir(), "linka-text-smoke-"));
const userData = join(temporary, "userData");
const output = join(root, "test-results", "text-image-generator");
mkdirSync(userData);
mkdirSync(output, { recursive: true });

try {
  await build({
    configFile: false,
    resolve: { alias: { "@": join(root, "src") } },
    build: {
      ssr: join(root, "scripts/ci/text-image-smoke.ts"),
      outDir: join(temporary, "bundle"),
      minify: true,
      rollupOptions: {
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "smoke.cjs" }
      }
    }
  });
  const require = createRequire(import.meta.url);
  execFileSync(require("electron"), [join(temporary, "bundle", "smoke.cjs")], {
    stdio: "inherit",
    timeout: 120000,
    env: {
      ...process.env,
      TEXT_IMAGE_SMOKE_OUTPUT: output,
      TEXT_IMAGE_SMOKE_USER_DATA: userData
    }
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
// This is a one-shot CLI; no Vite worker needs to remain alive after the child exits.
process.exit(0);
