import { test, expect, _electron as electron } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createE2EContext, cleanupE2EContext, mockExternalServices } from "./helpers";

for (const cycles of [2, 50]) {
  test(`eye typing route preserves the main BrowserWindow on enter, back and reenter (${cycles} cycles)`, async () => {
    test.setTimeout(240000);
    const started = performance.now();
    const context = createE2EContext();
    if (cycles === 50) {
      const configPath = join(context.userDataDir, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          ...JSON.parse(readFileSync(configPath, "utf8")),
          button_clickSound: false,
          eyeTypingDraftV1: { text: "хо", caret: 2 }
        })
      );
    }
    const app = await electron.launch({
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
    const ownedPids = new Set<number>([app.process().pid!]);
    const measurements = [];
    const dialogs: string[] = [];
    function recordProcesses() {
      const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/).map(Number));
      const liveOwned = new Set<number>([app.process().pid!]);
      let previousSize = 0;
      while (previousSize !== liveOwned.size) {
        previousSize = liveOwned.size;
        for (const [pid, parent] of rows) if (liveOwned.has(parent)) liveOwned.add(pid);
      }
      for (const pid of liveOwned) ownedPids.add(pid);
      return [...liveOwned];
    }
    try {
      const page = await app.firstWindow();
      page.on("dialog", (dialog) => {
        dialogs.push(`${dialog.type()}: ${dialog.message()}`);
        void dialog.dismiss();
      });
      await mockExternalServices(page);
      await expect(page.locator(".root")).toBeVisible();
      const windowState = () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((window) => ({
            id: window.id,
            bounds: window.getBounds(),
            maximized: window.isMaximized(),
            fullscreen: window.isFullScreen()
          }))
        );
      const original = await windowState();
      expect(original).toHaveLength(1);
      const mainState = () =>
        app.evaluate(({ ipcMain, app }) => {
          const handlers = Reflect.get(ipcMain, "_invokeHandlers");
          if (!(handlers instanceof Map))
            throw new Error("Electron invoke-handler registry unavailable");
          return {
            listeners: Object.fromEntries(
              ipcMain.eventNames().map((name) => [String(name), ipcMain.listenerCount(name)])
            ),
            typingHandlers: [...handlers.keys()]
              .filter((name) => String(name).startsWith("typing:"))
              .sort(),
            beforeQuit: app.listenerCount("before-quit")
          };
        });
      const rendererState = () =>
        page.evaluate(() => {
          const { ipcRenderer } = Reflect.get(window, "require")("electron");
          return Object.fromEntries(
            ipcRenderer.eventNames().map((name: string) => [name, ipcRenderer.listenerCount(name)])
          );
        });
      const originalMain = await mainState();
      expect(originalMain.typingHandlers).toEqual(["typing:predict", "typing:release"]);
      expect(originalMain.listeners["typing:cancel"]).toBe(1);
      const originalRenderer = await rendererState();
      let typingRenderer: Record<string, number> | undefined;
      for (let entry = 0; entry < (cycles === 50 ? cycles * 2 : cycles); entry++) {
        await page.getByRole("button", { name: "Печать глазами", exact: true }).click();
        await expect(page).toHaveURL(/#\/eye-typing$/, { timeout: 3000 });
        await expect(page.getByRole("textbox", { name: "Черновик" })).toBeVisible();
        expect(await windowState()).toEqual(original);
        expect(app.windows()).toEqual([page]);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        if (cycles === 50) await expect(page.locator(".predictions button").first()).toBeEnabled();
        const activeRenderer = await rendererState();
        if (!typingRenderer) typingRenderer = activeRenderer;
        expect(activeRenderer).toEqual(typingRenderer);
        expect(await mainState()).toEqual(originalMain);
        const activePids = recordProcesses();
        await page.getByRole("button", { name: "К наборам", exact: true }).click();
        await expect(page).toHaveURL(/#\/(?:%C2%A7|§)$/);
        await expect(
          page.getByRole("button", { name: "Печать глазами", exact: true })
        ).toBeVisible();
        expect(await windowState()).toEqual(original);
        expect(app.windows()).toEqual([page]);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect.poll(rendererState).toEqual(originalRenderer);
        expect(await mainState()).toEqual(originalMain);
        expect(dialogs).toEqual([]);
        measurements.push({
          entry: entry + 1,
          elapsedMs: performance.now() - started,
          activePids,
          main: await mainState(),
          rendererTyping: activeRenderer,
          rendererAfterBack: await rendererState(),
          memory: await app.evaluate(({ app }) => ({
            main: process.memoryUsage(),
            processes: app.getAppMetrics()
          }))
        });
      }
      await page.screenshot({ path: test.info().outputPath("after-lifecycle-stress.png") });
    } finally {
      try {
        await app.close();
        await expect
          .poll(
            () =>
              [...ownedPids].filter((pid) => {
                try {
                  process.kill(pid, 0);
                  return true;
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
                  throw error;
                }
              }),
            { timeout: 10000 }
          )
          .toEqual([]);
      } finally {
        writeFileSync(
          test.info().outputPath("lifecycle-measurements.json"),
          JSON.stringify(
            {
              cycles,
              entries: measurements.length,
              elapsedMs: performance.now() - started,
              scope:
                "built-file Electron, single process, tracker fixture, tiny predictor model; memory recorded without threshold",
              ownedPids: [...ownedPids],
              dialogs,
              measurements
            },
            null,
            2
          )
        );
        cleanupE2EContext(context);
      }
    }
  });
}

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
        await owner.getByRole("button", { name: "Печать глазами", exact: true }).click();
        await expect(owner).toHaveURL(/#\/eye-typing$/);
        await expect(owner.locator(".typing")).toHaveClass("typing variant-C");
        expect(app.windows()).toEqual([owner]);
        return owner;
      }
      let page = await open();
      await expect(page.getByRole("textbox")).toHaveText("привет");
      await expect(page.locator(".draft > span").first()).toHaveText("при");
      expect(JSON.parse(readFileSync(configPath, "utf8")).eyeTypingDraftV1).toEqual({
        text: "привет",
        caret: 3
      });
      const measurements = [];
      expect(await page.evaluate(() => typeof Reflect.get(window, "require"))).toBe("function");
      expect(
        await app.evaluate(({ BrowserWindow }) => {
          const prefs = BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().endsWith("#/eye-typing"))!
            .webContents.getLastWebPreferences();
          return {
            sandbox: prefs.sandbox,
            contextIsolation: prefs.contextIsolation,
            nodeIntegration: prefs.nodeIntegration
          };
        })
      ).toEqual({ sandbox: false, contextIsolation: false, nodeIntegration: true });
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
          const keyboard = (await page.locator(".typing").boundingBox())!;
          expect(keyboard.height).toBeLessThanOrEqual(height - 40);
          expect(keyboard.y + keyboard.height).toBeLessThanOrEqual(height - 40);
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
          ).toBeGreaterThanOrEqual(
            (keyboard.height - Math.max(96, Math.min(180, keyboard.height / 6)) - 40) / 4 - 0.1
          );
          const space = await page
            .getByRole("button", { name: "Пробел", exact: true })
            .boundingBox();
          const command = await page
            .getByRole("button", { name: "Отменить", exact: true })
            .boundingBox();
          expect(space!.width).toBeGreaterThanOrEqual(command!.width * 2);
          // Native scrollbars can narrow the keyboard without changing the outer viewport.
          expect(
            Math.abs(space!.x + space!.width / 2 - (keyboard.x + keyboard.width / 2))
          ).toBeLessThanOrEqual(0.1);
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
