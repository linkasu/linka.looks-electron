import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const directory = fileURLToPath(new URL("../docs/visual-refresh/", import.meta.url));
const source = resolve(directory, "index.html");
const screenshots = [
  "communication",
  "editor",
  "settings",
  "quiz",
  "calibration",
  "paused",
  "quiz-4-of-4",
  "quiz-wrong-answer",
  "quiz-correct-answer",
  "quiz-finished",
  "match-task",
  "match-selected",
  "match-wrong-pair",
  "match-found-pair"
];
await Promise.all(screenshots.map((name) => access(resolve(directory, `${name}.png`))));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(source).href);
  await page.evaluate(() => document.fonts.ready);
  const images = await page.locator("img").evaluateAll((items) =>
    items.map((image) => ({
      source: image.getAttribute("src"),
      loaded: image.complete && image.naturalWidth > 0
    }))
  );
  assert(
    images.every((image) => image.loaded),
    `Missing report images: ${JSON.stringify(images)}`
  );
  const pages = await page.locator(".page").count();
  assert.equal(pages, 11, "The report must contain eleven deliberately composed pages");
  const overflow = await page.locator(".page").evaluateAll((items) =>
    items
      .map((element, index) => ({
        page: index + 1,
        overflow: element.scrollHeight > element.clientHeight + 1
      }))
      .filter((item) => item.overflow)
  );
  assert.deepEqual(overflow, [], "Report content must fit the printed pages");
  const pdf = resolve(directory, "key-changes.pdf");
  await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
  const buffer = await readFile(pdf);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert((await stat(pdf)).size > 10000, "The PDF must include the report and real screenshots");
  console.log(`${pdf} · ${pages} pages · ${buffer.length} bytes`);
} finally {
  await browser.close();
}
