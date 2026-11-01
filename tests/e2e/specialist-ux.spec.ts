import { test, expect } from "@playwright/test";
import AdmZip from "adm-zip";
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  devServerUrl,
  firstTestWindow,
  launchTestElectron,
  standardConfig,
  writeLinkaSet
} from "./helpers";

test("specialist preparation: sets, card editing, settings and communication", async () => {
  test.setTimeout(90000);
  const context = createE2EContext();
  const stage = process.env.UX_EVIDENCE_STAGE || "after";
  const evidence = resolve(`docs/issue-143/${stage}`);
  mkdirSync(evidence, { recursive: true });
  const name = "Занятие.linka";
  const setsRoot = resolve("extraResources/defaultSets");
  const phrasePath = readdirSync(setsRoot, { recursive: true })
    .map(String)
    .find((path) => path.endsWith("Фраза.linka"));
  expect(phrasePath).toBeTruthy();
  const archive = new AdmZip(join(setsRoot, phrasePath!));
  const source = JSON.parse(archive.readAsText("config.json"));
  const entries: Record<string, Buffer> = {};
  for (const [index, title] of ["Я", "хочу"].entries()) {
    const card = source.cards.find((card: { title?: string }) => card.title?.trim() === title);
    const image = archive.readFile(card.imagePath);
    expect(image).toBeTruthy();
    entries[`${index}.png`] = image!;
  }
  const cards = [
    { id: "one", title: "Я", cardType: 0, imagePath: "0.png" },
    { id: "two", title: "хочу", cardType: 0, imagePath: "1.png" },
    { id: "three", cardType: 3 }
  ];
  writeLinkaSet(context.homeDir, name, standardConfig(cards), entries);
  const app = await launchTestElectron(context);
  try {
    const page = await firstTestWindow(app);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".folder-grid")).toBeVisible({ timeout: 20000 });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.unmaximize();
      window.setContentSize(1280, 800);
    });
    await page.goto(`${devServerUrl}/#/§`);
    const tools = page.getByRole("button", { name: `Действия помощника: ${name.slice(0, -6)}` });
    await expect(tools).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${evidence}/sets.png`, animations: "disabled" });
    let focusColor = "";
    if (stage !== "before") {
      for (let attempt = 0; attempt < 2; attempt++) {
        await tools.focus();
        const target = await tools.boundingBox();
        expect(target!.width).toBeGreaterThanOrEqual(44);
        expect(target!.height).toBeGreaterThanOrEqual(44);
        expect(
          await tools.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))
        ).toBeGreaterThanOrEqual(2);
        focusColor = await tools.evaluate((element) => getComputedStyle(element).outlineColor);
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menuitem", { name: "Открыть", exact: true })).toBeFocused();
        await expect(page.locator(".folder-item .eyebtn").first()).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toBeHidden();
        await expect(tools).toBeFocused();
      }
      await tools.click({ button: "right" });
      await expect(page.getByRole("menuitem", { name: "Открыть", exact: true })).toBeFocused();
      await page.getByRole("menuitem", { name: "Переименовать", exact: true }).click();
      const rename = page.getByRole("dialog");
      await expect(rename.getByLabel("Название", { exact: true })).toHaveValue("Занятие");
      await rename.getByLabel("Название", { exact: true }).fill("Не переименовывать");
      await rename.getByRole("button", { name: "Отмена", exact: true }).click();
      await expect(tools).toBeFocused();
      await expect(page.locator(".folder-item .eyebtn").first()).toBeEnabled();
      await page.keyboard.press("Enter");
    } else await tools.click();
    await expect(page.getByText("Дублировать", { exact: true })).toBeVisible();
    if (stage !== "before") {
      await expect(page.getByRole("menuitem", { name: "Открыть", exact: true })).toBeFocused();
      await page.screenshot({ path: `${evidence}/set-actions.png`, animations: "disabled" });
      const contrast = await page.evaluate((focusColor) => {
        const luminance = (color: string) => {
          const channels = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const text = getComputedStyle(document.querySelector('[role="menuitem"]')!).color;
        const muted = getComputedStyle(document.querySelector(".folder-heading")!).color;
        const white = luminance("rgb(255, 255, 255)");
        const canvas = getComputedStyle(document.querySelector(".v-application")!).backgroundColor;
        return {
          text: (white + 0.05) / (luminance(text) + 0.05),
          muted: (luminance(canvas) + 0.05) / (luminance(muted) + 0.05),
          focus: (white + 0.05) / (luminance(focusColor) + 0.05),
          canvas
        };
      }, focusColor);
      console.log("Measured contrast:", contrast);
      expect(contrast.text).toBeGreaterThanOrEqual(4.5);
      expect(contrast.muted).toBeGreaterThanOrEqual(4.5);
      expect(contrast.focus).toBeGreaterThanOrEqual(3);
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: "Редактировать набор", exact: true })
      ).toBeFocused();
      await page.keyboard.press("Enter");
    } else {
      await page.screenshot({ path: `${evidence}/set-actions.png`, animations: "disabled" });
      await page.goto(`${devServerUrl}/#/edit/§${name}`);
    }
    await expect(page.locator(".editor .cards .eyebtn")).toHaveCount(3);
    await page.locator(".editor .cards .eyebtn").first().click();
    await expect(page.getByLabel("Название карточки", { exact: true })).toHaveValue("Я");
    await expect
      .poll(() =>
        page
          .locator(".editor .cards .img")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundImage.includes("blob:"))
      )
      .toBe(true);
    await page.screenshot({ path: `${evidence}/editor.png`, animations: "disabled" });
    if (stage !== "before") {
      const title = page.getByLabel("Название карточки", { exact: true });
      await title.fill("Я на занятии");
      await page.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(page.getByText("Набор сохранён", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Сохранить", exact: true }).click();
      await title.fill("Не сохранять");
      await page.getByRole("button", { name: "Выйти из редактора", exact: true }).click();
      await page.getByRole("button", { name: "Продолжить редактирование", exact: true }).click();
      await expect(title).toHaveValue("Не сохранять");
      await page.getByRole("button", { name: "Выйти из редактора", exact: true }).click();
      await page.getByRole("button", { name: "Выйти без сохранения", exact: true }).click();
      await expect(tools).toBeVisible();
      await tools.click();
      await page.getByRole("menuitem", { name: "Редактировать набор", exact: true }).click();
      await page.locator(".editor .cards .eyebtn").first().click();
      await expect(title).toHaveValue("Я на занятии");
    }
    await page.goto(`${devServerUrl}/#/settings`);
    await expect(page.getByText("Управление коммуникатором", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidence}/settings.png`, animations: "disabled" });
    await page.getByTestId("settings-trial-button").click();
    await page.getByTestId("settings-trial-button").click();
    await expect(page.getByTestId("settings-trial-status")).toHaveText("Сработало: 2");
    await page.goto(`${devServerUrl}/#/set/§${name}`);
    await expect(page.locator(".grid > .cards > .eyebtn")).toHaveCount(3);
    await page
      .getByRole("button", { name: stage === "before" ? "Я" : "Я на занятии", exact: true })
      .click();
    await page.screenshot({ path: `${evidence}/communication.png`, animations: "disabled" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(800, 600)
    );
    await page.goto(`${devServerUrl}/#/edit/§${name}`);
    await page.locator(".editor .cards .eyebtn").first().click();
    await page.screenshot({ path: `${evidence}/editor-compact.png`, animations: "disabled" });
    if (stage !== "before") {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      const settings = page.getByRole("button", { name: "Открыть настройки набора", exact: true });
      await settings.click();
      await expect(page.getByLabel("Режим страницы", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Закрыть настройки набора", exact: true }).click();
      await expect(settings).toBeFocused();
    }
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
