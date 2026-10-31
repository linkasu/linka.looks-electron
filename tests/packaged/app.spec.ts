import { _electron as electron, expect, test } from "@playwright/test";
import AdmZip from "adm-zip";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  firstTestWindow,
  standardConfig,
  writeLinkaSet,
  type E2EContext
} from "../e2e/helpers";

function launch(context: E2EContext) {
  const executablePath =
    process.env.PACKAGED_EXECUTABLE ||
    (process.platform === "win32"
      ? resolve("dist/win-unpacked/LINKa. смотри.exe")
      : resolve(
          `dist/mac${process.arch === "arm64" ? "-arm64" : ""}/LINKa. смотри.app/Contents/MacOS/LINKa. смотри`
        ));
  return electron.launch({
    executablePath,
    timeout: 20000,
    args: ["-r", resolve("scripts/ci/startup-diagnostics.cjs"), "--remote-debugging-port=9343"],
    env: {
      ...process.env,
      IS_TEST: "1",
      TEST_USER_DATA_DIR: context.userDataDir,
      LINKA_HOME_DIR: context.homeDir,
      NODE_ENV: "production",
      VITE_DEV_SERVER_URL: ""
    }
  });
}

test("packaged startup, consent persistence, storage save and process reopen", async () => {
  const context = createE2EContext(false);
  const name = "packaged-startup.linka";
  writeLinkaSet(context.homeDir, name, standardConfig([{ id: "new", cardType: 3 }]));
  let app = await launch(context);
  try {
    let page = await firstTestWindow(app);
    await expect(page.getByText("Техническая статистика", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Не отправлять", exact: true }).click();
    const preference = join(context.userDataDir, "telemetry-preference-v3.json");
    await expect
      .poll(() => existsSync(preference) && JSON.parse(readFileSync(preference, "utf8")))
      .toEqual({ schemaVersion: 3, preference: "disabled" });
    const version = await page.evaluate(() =>
      globalThis.require("electron").ipcRenderer.invoke("app_version")
    );
    console.log("packaged-version", version);
    expect(version.isPackaged).toBe(true);
    expect(version.platform).toBe(process.platform);
    await page.evaluate((name) => {
      location.hash = `/edit/§${name}`;
    }, name);
    await page.getByRole("button", { name: "Открыть настройки набора" }).click();
    await page.getByLabel("Количество строк").fill("2");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Количество строк")).toBeHidden();
    await page.locator(".v-app-bar button").last().click();
    await page.getByRole("button", { name: /^Сохранить$/ }).click();
    const config = () =>
      JSON.parse(new AdmZip(join(context.homeDir, name)).readAsText("config.json"));
    await expect.poll(() => config().pages[0].rows).toBe(2);
    await app.close();
    app = await launch(context);
    page = await firstTestWindow(app);
    await expect(page.getByText("packaged-startup", { exact: true })).toBeVisible();
    await expect(page.getByText("Техническая статистика", { exact: true })).toHaveCount(0);
    await page.evaluate((name) => {
      location.hash = `/set/§${name}`;
    }, name);
    await expect(page.locator(".grid")).toBeVisible();
    expect(config().pages[0].rows).toBe(2);
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});

test("packaged editor generation IPC, cancel, save and reopen preserve existing assets", async () => {
  test.setTimeout(120000);
  const context = createE2EContext();
  const name = "packaged-images.linka";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64"
  );
  const audio = Buffer.from("existing audio bytes");
  writeLinkaSet(
    context.homeDir,
    name,
    standardConfig([
      {
        id: "target",
        cardType: 0,
        title: "Старая карточка",
        imagePath: "old.png",
        audioPath: "old.mp3",
        audioText: "Старый текст",
        audioVoice: "alena"
      },
      { id: "other", cardType: 0, title: "Другая карточка", imagePath: "old.png" }
    ]),
    { "old.png": png, "old.mp3": audio }
  );
  const file = join(context.homeDir, name);
  const original = readFileSync(file);
  let app = await launch(context);
  try {
    let page = await firstTestWindow(app);
    const edit = async () => {
      await page.evaluate((name) => {
        location.hash = `/edit/§${name}`;
      }, name);
      await page.getByRole("button", { name: "Старая карточка", exact: true }).click();
    };
    await page.waitForLoadState("domcontentloaded");
    await edit();
    const image = () => page.locator(".cards .selected .img");
    const before = await image().getAttribute("style");
    await page.getByRole("button", { name: "Создать из текста", exact: true }).click();
    await page.getByLabel("Текст для картинки").fill("Отменённый текст");
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(image()).toHaveAttribute("style", before!);
    for (const text of ["Повтор", "Повтор", "Новая картинка"]) {
      const previous = await image().getAttribute("style");
      await page.getByRole("button", { name: "Создать из текста", exact: true }).click();
      await page.getByLabel("Текст для картинки").fill(text);
      await page.getByRole("button", { name: "Создать", exact: true }).click();
      await expect(image()).not.toHaveAttribute("style", previous!);
    }
    expect(readFileSync(file)).toEqual(original);
    await app.close();
    expect(readFileSync(file)).toEqual(original);
    app = await launch(context);
    page = await firstTestWindow(app);
    await page.waitForLoadState("domcontentloaded");
    await edit();
    const previous = await image().getAttribute("style");
    await page.getByRole("button", { name: "Создать из текста", exact: true }).click();
    await page.getByLabel("Текст для картинки").fill("Сохранённая картинка");
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(image()).not.toHaveAttribute("style", previous!);
    await page.locator(".v-app-bar button").last().click();
    await page.getByRole("button", { name: /^Сохранить$/ }).click();
    const config = () => JSON.parse(new AdmZip(file).readAsText("config.json"));
    await expect.poll(() => config().pages[0].cards[0].imagePath).not.toBe("old.png");
    const saved = config();
    expect(saved.pages[0].cards[0]).toMatchObject({
      title: "Старая карточка",
      audioPath: "old.mp3",
      audioText: "Старый текст",
      audioVoice: "alena"
    });
    const zip = new AdmZip(file);
    expect(zip.readFile("old.png")).toEqual(png);
    expect(zip.readFile("old.mp3")).toEqual(audio);
    expect(zip.readFile(saved.pages[0].cards[0].imagePath)?.subarray(1, 4).toString()).toBe("PNG");
    await app.close();
    app = await launch(context);
    page = await firstTestWindow(app);
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate((name) => {
      location.hash = `/set/§${name}`;
    }, name);
    await expect(page.getByRole("button", { name: "Старая карточка", exact: true })).toBeVisible();
    expect(config()).toEqual(saved);
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
