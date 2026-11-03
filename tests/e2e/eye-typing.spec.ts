import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  firstTestWindow,
  launchTestElectron
} from "./helpers";

test("eye typing: full layout, sticky screens, undo, navigation and restart persistence", async () => {
  test.setTimeout(60000);
  const context = createE2EContext();
  const configPath = join(context.userDataDir, "config.json");
  writeFileSync(
    configPath,
    JSON.stringify({ ...JSON.parse(readFileSync(configPath, "utf8")), button_clickSound: false })
  );
  let app = await launchTestElectron(context);
  try {
    let page = await firstTestWindow(app);
    let owner = page;
    async function openTyping() {
      const created = app.waitForEvent("window");
      await owner.getByRole("button", { name: "Печать глазами", exact: true }).click();
      const typing = await created;
      await expect(typing.getByRole("textbox", { name: "Черновик" })).toBeVisible();
      return typing;
    }
    page = await openTyping();
    expect(await page.evaluate(() => typeof Reflect.get(window, "require"))).toBe("undefined");
    expect(await page.evaluate(() => typeof Reflect.get(window, "process"))).toBe("undefined");
    const draft = () => page.getByRole("textbox", { name: "Черновик" });
    for (const size of [
      { width: 800, height: 600 },
      { width: 1024, height: 768 },
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(() =>
          page.locator(".typing button.eye").evaluateAll((buttons) =>
            buttons.every((button) => {
              const rect = button.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.left >= 0 &&
                rect.right <= innerWidth &&
                rect.top >= 0 &&
                rect.bottom <= innerHeight
              );
            })
          )
        )
        .toBe(true);
      await expect(page.locator('[aria-label="Клавиши"] button')).toHaveCount(33);
      await page.screenshot({
        path: test.info().outputPath(`full-ru-${size.width}x${size.height}.png`)
      });
      await page.getByRole("button", { name: "RU → EN", exact: true }).click();
      await expect(page.locator('[aria-label="Клавиши"] button')).toHaveCount(26);
      await page.screenshot({
        path: test.info().outputPath(`full-en-${size.width}x${size.height}.png`)
      });
      await page.getByRole("button", { name: "EN → RU", exact: true }).click();
    }
    await page.getByRole("button", { name: "а", exact: true }).click();
    await page.getByRole("button", { name: "Цифры", exact: true }).click();
    await page.getByRole("button", { name: "1", exact: true }).click();
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.getByRole("button", { name: "Цифры", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.getByRole("button", { name: "Знаки", exact: true }).click();
    await page.getByRole("button", { name: "!", exact: true }).click();
    await page.getByRole("button", { name: "?", exact: true }).click();
    await expect(page.getByRole("button", { name: "Знаки", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(draft()).toHaveText("а12!?");
    await page.getByRole("button", { name: "Очистить всё", exact: true }).click();
    await expect(draft()).toHaveText("");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(draft()).toHaveText("а12!?");
    await page.getByRole("button", { name: "Курсор", exact: true }).click();
    await expect(page.getByLabel("Клавиши", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "В начало", exact: true }).click();
    await page.getByRole("button", { name: "Символ вправо", exact: true }).click();
    await page.getByRole("button", { name: "Буквы", exact: true }).click();
    await page.getByRole("button", { name: "б", exact: true }).click();
    await expect(draft()).toHaveText("аб12!?");
    await page.getByRole("button", { name: "RU → EN", exact: true }).click();
    await page.getByRole("button", { name: "h", exact: true }).click();
    await page.getByRole("button", { name: "i", exact: true }).click();
    await expect(draft()).toHaveText("абhi12!?");
    await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
    await expect(page.getByRole("button", { name: "h", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Возобновить управление", exact: true }).click();
    await expect(page.getByRole("button", { name: "h", exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("eye-typing-en.png") });
    await page.getByRole("button", { name: "К наборам", exact: true }).click();
    page = await openTyping();
    await expect(draft()).toHaveText("абhi12!?");
    await expect
      .poll(() =>
        page
          .locator(".typing button.eye")
          .evaluateAll((buttons) =>
            buttons.every((button) => button.getBoundingClientRect().bottom <= innerHeight)
          )
      )
      .toBe(true);
    await app.close();
    app = await launchTestElectron(context);
    page = await firstTestWindow(app);
    owner = page;
    page = await openTyping();
    await expect(draft()).toHaveText("абhi12!?");
    expect(JSON.parse(readFileSync(configPath, "utf8")).eyeTypingDraftV1).toEqual({
      text: "абhi12!?",
      caret: 4
    });
    await expect
      .poll(() =>
        page
          .locator(".typing button.eye")
          .evaluateAll((buttons) =>
            buttons.every((button) => button.getBoundingClientRect().bottom <= innerHeight)
          )
      )
      .toBe(true);
    await page.screenshot({ path: test.info().outputPath("eye-typing-restored-ru.png") });
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
