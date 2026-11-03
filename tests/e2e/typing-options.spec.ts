import { test, expect, _electron as electron } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createE2EContext, cleanupE2EContext, mockExternalServices } from "./helpers";

for (const layout of ["A", "B", "C", "invalid-old-layout"]) {
  test(`saved layout ${layout}: settings, built Electron, compact RU/EN and restart`, async () => {
    const context = createE2EContext();
    const configPath = join(context.userDataDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        ...JSON.parse(readFileSync(configPath, "utf8")),
        button_clickSound: false,
        typingLayout: layout,
        eyeTypingDraftV1: { text: "привет", caret: 3 }
      })
    );
    async function launch() {
      return electron.launch({
        args: ["-r", resolve("tests/e2e/typing-tracker-fixture.cjs"), resolve(".")],
        env: {
          ...process.env,
          IS_TEST: "1",
          NODE_ENV: "production",
          VITE_DEV_SERVER_URL: "",
          TEST_USER_DATA_DIR: context.userDataDir,
          LINKA_HOME_DIR: context.homeDir,
          UPDATE_FEED_URL: "http://127.0.0.1:1/"
        }
      });
    }
    let app = await launch();
    try {
      let owner = await app.firstWindow();
      await mockExternalServices(owner);
      await expect(owner.locator(".root")).toBeVisible();
      await owner.evaluate(() => {
        location.hash = "/settings";
      });
      await expect(owner.locator(".keyboard-options")).toHaveCount(0);
      expect(JSON.parse(readFileSync(configPath, "utf8")).typingLayout).toBe(layout);
      await owner.screenshot({ path: test.info().outputPath(`settings-${layout}.png`) });
      await owner.evaluate(() => {
        location.hash = "/§";
      });
      async function open() {
        const next = app.waitForEvent("window");
        await owner.getByRole("button", { name: "Печать глазами", exact: true }).click();
        const page = await next;
        await expect(page.locator(".typing")).toHaveClass("typing variant-C");
        return page;
      }
      let page = await open();
      await expect(page.getByRole("textbox")).toHaveText("привет");
      await expect(page.locator(".draft > span").first()).toHaveText("при");
      expect(JSON.parse(readFileSync(configPath, "utf8")).eyeTypingDraftV1).toEqual({
        text: "привет",
        caret: 3
      });
      const measurements = [];
      expect(await page.evaluate(() => typeof Reflect.get(window, "require"))).toBe("undefined");
      expect(
        await app.evaluate(({ BrowserWindow }) => {
          const prefs = BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().endsWith("/typing.html"))!
            .webContents.getLastWebPreferences();
          return {
            sandbox: prefs.sandbox,
            contextIsolation: prefs.contextIsolation,
            nodeIntegration: prefs.nodeIntegration
          };
        })
      ).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
      for (const [width, height] of [
        [1024, 600],
        [1366, 768],
        [1920, 1080]
      ]) {
        await page.setViewportSize({ width, height });
        for (const language of ["ru", "en"]) {
          if (language === "en")
            await page.getByRole("button", { name: "RU → EN", exact: true }).click();
          await expect(page.locator(".keys button")).toHaveCount(language === "ru" ? 33 : 26);
          expect(
            await page.locator(".typing button").evaluateAll((buttons) =>
              buttons.every((b) => {
                const r = b.getBoundingClientRect();
                return (
                  r.left >= 0 &&
                  r.top >= 0 &&
                  r.right <= innerWidth &&
                  r.bottom <= innerHeight &&
                  r.width > 0 &&
                  r.height > 0 &&
                  b.scrollHeight <= b.clientHeight &&
                  b.scrollWidth <= b.clientWidth
                );
              })
            )
          ).toBe(true);
          expect(
            await page
              .locator(".commands button, .modes button, .editing button")
              .evaluateAll((buttons) =>
                Math.min(...buttons.map((b) => b.getBoundingClientRect().height))
              )
          ).toBeGreaterThanOrEqual((height - Math.min(180, height / 6) - 40) / 4 - 0.1);
          const space = await page
            .getByRole("button", { name: "Пробел", exact: true })
            .boundingBox();
          const command = await page
            .getByRole("button", { name: "Отменить", exact: true })
            .boundingBox();
          expect(space!.width).toBeGreaterThanOrEqual(command!.width * 2);
          expect(Math.abs(space!.x + space!.width / 2 - width / 2)).toBeLessThanOrEqual(0.1);
          const caretGeometry = await page.locator(".caret").evaluate((marker) => {
            const before = document.createRange(),
              after = document.createRange();
            before.selectNodeContents(marker.previousElementSibling!);
            after.selectNodeContents(marker.nextElementSibling!);
            return {
              marker: marker.getBoundingClientRect().toJSON(),
              before: before.getBoundingClientRect().toJSON(),
              after: after.getBoundingClientRect().toJSON()
            };
          });
          expect(caretGeometry.marker.width).toBe(0);
          expect(Math.abs(caretGeometry.before.right - caretGeometry.marker.x)).toBeLessThanOrEqual(
            0.1
          );
          expect(Math.abs(caretGeometry.after.x - caretGeometry.marker.x)).toBeLessThanOrEqual(0.1);
          measurements.push({
            caretGeometry,
            layout,
            language,
            width,
            height,
            output: await page.locator(".draft").evaluate((el) => {
              const r = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                fontSize: parseFloat(style.fontSize),
                lineHeight: parseFloat(style.lineHeight)
              };
            }),
            targets: await page.locator(".typing button").evaluateAll((buttons) =>
              buttons.map((button) => {
                const r = button.getBoundingClientRect();
                return {
                  label: button.getAttribute("aria-label") || button.textContent?.trim(),
                  group: button.closest(".keys")
                    ? "letters"
                    : button.closest(".predictions")
                      ? "predictions"
                      : "system",
                  x: r.x,
                  y: r.y,
                  width: r.width,
                  height: r.height
                };
              })
            )
          });
          await page.screenshot({
            path: test.info().outputPath(`${layout}-${language}-${width}x${height}.png`)
          });
        }
        await page.getByRole("button", { name: "EN → RU", exact: true }).click();
      }
      writeFileSync(test.info().outputPath("geometry.json"), JSON.stringify(measurements, null, 2));
      await page.getByRole("button", { name: "я", exact: true }).click();
      await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
      await expect(page.getByRole("button", { name: "я", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Возобновить управление", exact: true }).click();
      await page.getByRole("button", { name: "К наборам", exact: true }).click();
      page = await open();
      await expect(page.getByRole("textbox")).toHaveText("приявет");
      await expect(page.locator(".draft > span").first()).toHaveText("прия");
      await app.close();
      app = await launch();
      owner = await app.firstWindow();
      await mockExternalServices(owner);
      await expect(owner.locator(".root")).toBeVisible();
      await owner.evaluate(() => {
        location.hash = "/settings";
      });
      await expect(owner.locator(".keyboard-options")).toHaveCount(0);
      await owner.evaluate(() => {
        location.hash = "/§";
      });
      page = await open();
      await expect(page.getByRole("textbox")).toHaveText("приявет");
      await expect(page.locator(".draft > span").first()).toHaveText("прия");
      expect(JSON.parse(readFileSync(configPath, "utf8")).typingLayout).toBe(layout);
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}
