import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import AdmZip from "adm-zip";
import { join } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  firstTestWindow,
  launchTestElectron,
  standardConfig,
  writeLinkaSet
} from "./helpers";

type Bounds = { x: number; y: number; width: number; height: number };
type TargetMap = { id: string; bounds: Bounds[] };

async function gazeClick(app: ElectronApplication, page: Page, label: string) {
  const bounds = await page.getByRole("button", { name: label, exact: true }).boundingBox();
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const targets = (globalThis as typeof globalThis & { outputTargets?: TargetMap }).outputTargets;
    const elementIndex =
      targets?.bounds.findIndex(
        (b) =>
          bounds &&
          Math.abs(b.x - bounds.x) < 1 &&
          Math.abs(b.y - bounds.y) < 1 &&
          Math.abs(b.width - bounds.width) < 1 &&
          Math.abs(b.height - bounds.height) < 1
      ) ?? -1;
    if (!targets || elementIndex < 0) throw new Error("Missing current gaze target");
    const data = { id: targets.id, elementIndex };
    BrowserWindow.getAllWindows()[0].webContents.send("eye-enter", data);
    BrowserWindow.getAllWindows()[0].webContents.send("eye-click", { ...data, count: 1 });
  }, bounds);
}

async function checkGeometry(app: ElectronApplication, page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().iterations !== Infinity
            ).length
      )
    )
    .toBe(0);
  await expect
    .poll(async () => {
      const bounds = await page.locator("button.eye").evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        })
      );
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      if (
        !bounds.length ||
        bounds.some(
          (b) =>
            b.width <= 0 ||
            b.height <= 0 ||
            b.x < 0 ||
            b.y < 0 ||
            b.x + b.width > viewport.width + 1 ||
            b.y + b.height > viewport.height + 1
        )
      )
        return false;
      return app.evaluate((_electron, bounds) => {
        const targets = (globalThis as typeof globalThis & { outputTargets?: TargetMap })
          .outputTargets;
        return (
          !!targets &&
          bounds.every((b) =>
            targets.bounds.some(
              (t) =>
                Math.abs(t.x - b.x) < 1 &&
                Math.abs(t.y - b.y) < 1 &&
                Math.abs(t.width - b.width) < 1 &&
                Math.abs(t.height - b.height) < 1
            )
          )
        );
      }, bounds);
    })
    .toBe(true);
}

test("output position: legacy/new sets, typing state, gaze geometry and restart", async () => {
  test.setTimeout(120000);
  const context = createE2EContext();
  const card = { id: "a", cardType: 0, title: "А", audioText: "А", audioVoice: "alena" };
  const legacy = new AdmZip();
  legacy.addFile(
    "config.json",
    Buffer.from(
      JSON.stringify({
        version: "2.0",
        columns: 1,
        rows: 1,
        withoutSpace: true,
        cards: [card]
      })
    )
  );
  legacy.writeZip(join(context.homeDir, "old.linka"));
  writeLinkaSet(context.homeDir, "new.linka", standardConfig([card], { withoutSpace: true }));
  let app = await launchTestElectron(context);
  try {
    let page = await firstTestWindow(app);
    async function record() {
      await app.evaluate(({ ipcMain }) => {
        ipcMain.on("eye-elements", (_event, targets: TargetMap) => {
          (globalThis as typeof globalThis & { outputTargets?: TargetMap }).outputTargets = targets;
        });
      });
    }
    await record();
    const navigate = async (path: string) => {
      await page.evaluate((path) => {
        location.hash = path;
      }, path);
    };
    for (const file of ["old.linka", "new.linka"]) {
      await navigate(`/set/§${file}`);
      await expect(page.locator(".output-line")).toBeVisible();
      await page.locator(".grid button").filter({ hasText: "А" }).first().click();
      const message = page.locator(".output-text .text");
      await expect(message).toContainText("А");
      for (const position of ["top", "bottom", "top", "bottom"]) {
        const toggle = page.getByRole("button", { name: /^Строка вывода:/ });
        if (
          (await toggle.getAttribute("aria-label")) !==
          `Строка вывода: ${position === "top" ? "Сверху" : "Снизу"}`
        )
          await toggle.click();
        for (const size of [
          { width: 800, height: 600 },
          { width: 1280, height: 720 },
          { width: 1920, height: 1080 }
        ]) {
          await page.setViewportSize(size);
          await checkGeometry(app, page);
          const output = await page.locator(".output-line").boundingBox();
          const grid = await page.locator(".root > .grid").boundingBox();
          await page.screenshot({
            path: test.info().outputPath(`${file}-${position}-${size.width}.png`)
          });
          expect(
            output &&
              grid &&
              (position === "top"
                ? output.y + output.height <= grid.y + 1
                : grid.y + grid.height <= output.y + 1),
            JSON.stringify({ position, output, grid })
          ).toBeTruthy();
        }
        await expect(message).toContainText("А");
      }
      const speech = page.waitForRequest("https://tts.linka.su/**");
      await gazeClick(app, page, "Произнести сообщение");
      await speech;
      await expect(message).toContainText("А");
      await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Убрать последнее", exact: true })
      ).toBeDisabled();
      await page.getByRole("button", { name: "Возобновить управление", exact: true }).click();
      await page.getByRole("button", { name: "Очистить сообщение", exact: true }).click();
      await page.getByRole("button", { name: "Строка вывода: Снизу", exact: true }).click();
      await page.getByRole("button", { name: "Вернуть сообщение", exact: true }).click();
      await expect(message).toContainText("А");
      await page.getByRole("button", { name: "Строка вывода: Сверху", exact: true }).click();
      await page.getByRole("button", { name: "Убрать последнее", exact: true }).click();
      await expect(message).not.toContainText("А");
      await page.getByRole("button", { name: "Скрыть строку вывода", exact: true }).click();
      await expect(page.locator(".output-line")).toHaveCount(0);
      await page.getByRole("button", { name: "Показать строку вывода", exact: true }).click();
    }
    await navigate("/eye-typing");
    const draft = page.getByRole("textbox", { name: "Черновик" });
    await expect(draft).toBeVisible();
    await page.getByRole("button", { name: "а", exact: true }).click();
    await page.getByRole("button", { name: "б", exact: true }).click();
    await page.getByRole("button", { name: "Курсор", exact: true }).click();
    await page.getByRole("button", { name: "В начало", exact: true }).click();
    for (const label of ["Снизу", "Сверху", "Снизу"]) {
      await page.getByRole("button", { name: `Строка вывода: ${label}`, exact: true }).click();
      await expect(draft).toHaveText("аб");
      for (const size of [
        { width: 800, height: 600 },
        { width: 1024, height: 768 },
        { width: 1366, height: 768 }
      ]) {
        await page.setViewportSize(size);
        await checkGeometry(app, page);
        const output = await draft.boundingBox();
        const keys = await page.locator(".navigation").boundingBox();
        expect(
          output &&
            keys &&
            (label === "Снизу"
              ? output.y + output.height <= keys.y + 1
              : keys.y + keys.height <= output.y + 1)
        ).toBeTruthy();
        await page.screenshot({
          path: test.info().outputPath(`typing-after-${label}-${size.width}.png`)
        });
      }
    }
    await page.getByRole("button", { name: "Буквы", exact: true }).click();
    await page.getByRole("button", { name: "в", exact: true }).click();
    await expect(draft).toHaveText("ваб");
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(draft).toHaveText("аб");
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(draft).toHaveText("а");
    await page.getByRole("button", { name: "Строка вывода: Сверху", exact: true }).click();
    await checkGeometry(app, page);
    const speech = page.waitForRequest("https://tts.linka.su/**");
    await gazeClick(app, page, "Озвучить всё");
    await speech;
    await expect(draft).toHaveText("а");
    await checkGeometry(app, page);
    await app.close();
    app = await launchTestElectron(context);
    page = await firstTestWindow(app);
    await record();
    await navigate("/eye-typing");
    await expect(page.locator(".typing")).toHaveClass(/output-bottom/);
    await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText("а");
    await checkGeometry(app, page);
    await navigate("/set/§old.linka");
    await expect(page.locator(".root_bottom")).toBeVisible();
    await checkGeometry(app, page);
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
