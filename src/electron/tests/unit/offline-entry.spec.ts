import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("loads the bundled icon stylesheet without a render-blocking CDN duplicate", () => {
  const html = readFileSync(new URL("../../../../index.html", import.meta.url), "utf8");
  const plugin = readFileSync(
    new URL("../../../frontend/plugins/vuetify.ts", import.meta.url),
    "utf8"
  );
  expect(html).not.toContain("https://cdn.jsdelivr.net/npm/@mdi/font");
  expect(plugin).toContain('import "@mdi/font/css/materialdesignicons.css";');
});
