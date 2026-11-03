import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createE2EContext, cleanupE2EContext, mockExternalServices } from "./helpers";

test("main-window keyboard uses the real sidecar, denies foreign senders and persists", async () => {
  test.skip(
    !process.env.TYPING_ELECTRON_EXECUTABLE &&
      (!existsSync(
        resolve(
          "predictor-resources",
          process.platform === "win32" ? "lp-electron.exe" : "lp-electron"
        )
      ) ||
        !existsSync(resolve("predictor-resources/model.lpk"))),
    "Provision the pinned sidecar and tiny model before real integration qualification."
  );
  const context = createE2EContext();
  const configPath = join(context.userDataDir, "config.json");
  const original = { text: "😀я хо суффикс😀", caret: 5 };
  writeFileSync(
    configPath,
    JSON.stringify({
      ...JSON.parse(readFileSync(configPath, "utf8")),
      button_clickSound: false,
      eyeTypingDraftV1: original
    })
  );
  const executablePath = process.env.TYPING_ELECTRON_EXECUTABLE;
  async function launch() {
    const application = await electron.launch({
      executablePath,
      args: [
        "-r",
        resolve("tests/e2e/typing-tracker-fixture.cjs"),
        ...(executablePath ? [] : [resolve(".")])
      ],
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
    return application;
  }
  let app = await launch();
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(Boolean(executablePath));
    let owner = await app.firstWindow();
    await mockExternalServices(owner);
    await expect(owner.locator(".root")).toBeVisible();
    async function open() {
      await owner.getByRole("button", { name: "Печать глазами", exact: true }).click();
      const page = owner;
      await expect(page).toHaveURL(/#\/eye-typing$/);
      expect(app.windows()).toEqual([page]);
      page.on("pageerror", (error) => console.error("TYPING_PAGE_ERROR", error.message));
      page.on("console", (message) => {
        if (message.type() === "error") console.error("TYPING_CONSOLE", message.text());
      });
      page.on("requestfailed", (request) =>
        console.error("TYPING_REQUEST_FAILED", request.url(), request.failure())
      );
      await expect(page.getByRole("textbox", { name: "Черновик" })).toBeVisible();
      return page;
    }
    let page = await open();
    expect(
      await page.evaluate(() => ({
        require: typeof Reflect.get(window, "require"),
        process: typeof Reflect.get(window, "process")
      }))
    ).toEqual({ require: "function", process: "object" });
    const preferences = await app.evaluate(async ({ BrowserWindow }) => {
      // Root the Inspector evaluation in the Node loop; otherwise Electron can collect its Promise.
      await new Promise<void>((resolve) => setImmediate(resolve));
      const window = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().endsWith("#/eye-typing")
      );
      const preferences = window!.webContents.getLastWebPreferences();
      return {
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration
      };
    });
    expect(preferences).toEqual({ sandbox: false, contextIsolation: false, nodeIntegration: true });
    const denied = await app.evaluate(async ({ BrowserWindow }) => {
      const owner = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().endsWith("#/eye-typing")
      )!;
      const foreign = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }
      });
      try {
        await foreign.loadURL("about:blank");
        return await foreign.webContents.executeJavaScript(`
          (async () => {
            const { ipcRenderer } = require("electron");
            return ipcRenderer.invoke("typing:predict", 999, {
              text: "хо", caret: 2, language: "ru"
            });
          })()
        `);
      } finally {
        foreign.destroy();
        owner.focus();
      }
    });
    expect(denied).toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(JSON.parse(readFileSync(configPath, "utf8")).eyeTypingDraftV1).toEqual(original);
    const suggestions = page.locator('[aria-label="Подсказки слов"] button');
    await expect(suggestions.first()).toBeVisible();
    await expect(suggestions.first()).toBeEnabled();
    await expect(page.locator('[aria-label="Клавиши"] button')).toHaveCount(33);
    await expect(page.getByRole("button", { name: "я", exact: true })).toBeVisible();
    expect(
      await app.evaluate(async ({ BrowserWindow, ipcMain }) => {
        const window = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().endsWith("#/eye-typing")
        )!;
        const [x, y] = window.getPosition();
        const changed = new Promise<boolean>((resolve) =>
          ipcMain.once("eye-elements", (_event, data) => resolve(typeof data.id === "string"))
        );
        window.setPosition(x + 8, y + 8);
        return changed;
      })
    ).toBe(true);
    const word = await suggestions.first().getAttribute("aria-label");
    await suggestions.first().click();
    await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText(
      `😀я ${word} суффикс😀`
    );
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText(original.text);
    await page.getByRole("button", { name: "Убрать символ", exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText("😀я х суффикс😀");
    await page.getByRole("button", { name: "о", exact: true }).click();
    await expect(suggestions.first()).toBeEnabled();
    await suggestions.first().click();
    await expect(page.getByRole("textbox")).toHaveText(`😀я ${word} суффикс😀`);
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await page.getByRole("button", { name: "Очистить всё", exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText("");
    await expect(suggestions.first()).toBeDisabled();
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await page.getByRole("button", { name: "Курсор", exact: true }).click();
    await page.getByRole("button", { name: "В начало", exact: true }).click();
    await expect(suggestions.first()).toBeDisabled();
    for (let i = 0; i < original.caret; i++)
      await page.getByRole("button", { name: "Символ вправо", exact: true }).click();
    await expect(suggestions.first()).toBeEnabled();
    await page.getByRole("button", { name: "Буквы", exact: true }).click();
    expect(
      await page.getByRole("textbox").evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        const text = selection.toString();
        selection.removeAllRanges();
        return text;
      })
    ).toBe(original.text);
    expect(await page.locator(".caret").evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
    await page.screenshot({ path: test.info().outputPath("context-preserved.png") });
    await page.getByRole("button", { name: "Цифры", exact: true }).click();
    for (const name of ["*", "№"]) await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText("😀я хо*№ суффикс😀");
    for (let i = 0; i < 2; i++)
      await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText(original.text);
    await page.getByRole("button", { name: "Буквы", exact: true }).click();
    await page.getByRole("button", { name: "RU → EN", exact: true }).click();
    await expect(suggestions).toHaveCount(3);
    await expect(suggestions.first()).toBeDisabled();
    await expect(page.locator('[aria-label="Клавиши"] button')).toHaveCount(26);
    await expect(page.getByRole("button", { name: "z", exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="Сравнение прототипов"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Цифры", exact: true }).click();
    for (const name of ["*", "№"]) await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText("😀я хо*№ суффикс😀");
    await page.getByRole("button", { name: "Буквы", exact: true }).click();
    await page.getByRole("button", { name: "h", exact: true }).click();
    await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
    await expect(page.getByRole("button", { name: "h", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Возобновить управление", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath("main-window-keyboard.png") });
    await page.getByRole("button", { name: "К наборам", exact: true }).click();
    page = await open();
    await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText("😀я хо*№h суффикс😀");
    await app.close();
    app = await launch();
    owner = await app.firstWindow();
    await mockExternalServices(owner);
    await expect(owner.locator(".root")).toBeVisible();
    page = await open();
    await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText("😀я хо*№h суффикс😀");
    expect(JSON.parse(readFileSync(configPath, "utf8")).eyeTypingDraftV1).toEqual({
      text: "😀я хо*№h суффикс😀",
      caret: 8
    });
    await page.getByRole("button", { name: "Очистить всё", exact: true }).click();
    const ru = "йцукенгшщзхъфывапролджэячсмитьбюё";
    for (const name of ru) await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText(ru);
    await page.getByRole("button", { name: "RU → EN", exact: true }).click();
    const en = "qwertyuiopasdfghjklzxcvbnm";
    for (const name of en) await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText(ru + en);
    await page.getByRole("button", { name: "Цифры", exact: true }).click();
    for (const name of "123*456№7890")
      await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveText(ru + en + "123*456№7890");
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
