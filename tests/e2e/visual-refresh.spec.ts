import { test, expect, type Page, type ElectronApplication, type Locator } from "@playwright/test";
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

const screenshotDir = resolve("docs/visual-refresh");

type GazeTargets = {
  id: string;
  bounds: Array<{ x: number; y: number; width: number; height: number }>;
};

async function recordGazeTargets(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.on("eye-elements", (_event, targets) => {
      (globalThis as typeof globalThis & { uxEyeTargets?: GazeTargets }).uxEyeTargets = targets;
    });
  });
}

async function resumeByGaze(app: ElectronApplication, resume: Locator) {
  await expect(resume).toHaveClass(/eye/);
  const rect = await resume.boundingBox();
  expect(rect).not.toBeNull();
  const target = await app.evaluate((_electron, rect) => {
    const targets = (globalThis as typeof globalThis & { uxEyeTargets?: GazeTargets }).uxEyeTargets;
    return {
      id: targets?.id,
      elementIndex:
        targets?.bounds.findIndex(
          (bound) =>
            Math.abs(bound.x - rect!.x) < 1 &&
            Math.abs(bound.y - rect!.y) < 1 &&
            Math.abs(bound.width - rect!.width) < 1 &&
            Math.abs(bound.height - rect!.height) < 1
        ) ?? -1
    };
  }, rect);
  expect(target.elementIndex).toBeGreaterThanOrEqual(0);
  await app.evaluate(({ BrowserWindow }, target) => {
    BrowserWindow.getAllWindows()[0].webContents.send("eye-enter", target);
  }, target);
  await expect(resume.locator(".progress-bar")).toBeVisible();
  await app.evaluate(({ BrowserWindow }, target) => {
    BrowserWindow.getAllWindows()[0].webContents.send("eye-click", { ...target, count: 1 });
  }, target);
}

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".v-progress-circular--indeterminate")).toHaveCount(0);
  await page.screenshot({ path: join(screenshotDir, `${name}.png`), animations: "disabled" });
}

function phraseFixture() {
  const setsRoot = resolve("extraResources/defaultSets");
  const phrasePath = readdirSync(setsRoot, { recursive: true })
    .map(String)
    .find((path) => path.endsWith("Фраза.linka"));
  expect(phrasePath, "the packaged public phrase fixture is available").toBeTruthy();
  const archive = new AdmZip(join(setsRoot, phrasePath!));
  const source = JSON.parse(archive.readAsText("config.json"));
  const cards: Array<Record<string, unknown>> = source.cards
    .filter((card: Record<string, unknown>) => card.title && card.imagePath)
    .slice(0, 6)
    .map((card: Record<string, unknown>, index: number) => ({
      ...card,
      id: `visual-${index}`,
      title: String(card.title).trim(),
      audioPath: undefined
    }));
  const entries: Record<string, Buffer> = {};
  cards.forEach((card: Record<string, unknown>) => {
    const name = String(card.imagePath);
    const buffer = archive.readFile(name);
    expect(buffer).toBeTruthy();
    entries[name] = buffer!;
  });
  return { cards, entries };
}

test("calm visual refresh preserves both roles and captures the real screens", async () => {
  test.setTimeout(90000);
  mkdirSync(screenshotDir, { recursive: true });
  const context = createE2EContext();
  const { cards, entries } = phraseFixture();
  const name = "Общение.linka";
  const config = standardConfig(cards, {
    pages: [{ id: "visual-page", mode: "standard", rows: 2, columns: 3, cards }]
  });
  writeLinkaSet(context.homeDir, name, config, entries);
  writeLinkaSet(
    context.homeDir,
    "Викторина.linka",
    standardConfig(cards.slice(0, 2), {
      quizAutoNext: false,
      pages: [
        {
          id: "visual-quiz",
          mode: "quiz",
          rows: 1,
          columns: 2,
          question: "Выберите карточку «Я»",
          cards: cards.slice(0, 2).map((card: Record<string, unknown>, index: number) => ({
            ...card,
            answer: index === 0
          }))
        }
      ]
    }),
    entries
  );

  const app = await launchTestElectron(context);
  try {
    await recordGazeTargets(app);
    const page = await firstTestWindow(app);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.unmaximize();
      window.setContentSize(1280, 800);
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${devServerUrl}/#/set/§${name}`);
    const gridCards = page.locator(".grid > .cards > button.eyebtn");
    await expect(gridCards).toHaveCount(6);
    const declineTelemetry = page.getByTestId("telemetry-disable");
    if (await declineTelemetry.isVisible()) await declineTelemetry.click();
    await expect
      .poll(() =>
        gridCards
          .locator(".img")
          .evaluateAll((images) =>
            images.every((image) => getComputedStyle(image).backgroundImage.includes("blob:"))
          )
      )
      .toBe(true);
    await page.getByRole("button", { name: "Я", exact: true }).click();
    await page.getByRole("button", { name: "хочу", exact: true }).click();
    await expect(page.locator("button button")).toHaveCount(0);
    await capture(page, "communication");
    await page.getByRole("button", { name: "Очистить сообщение", exact: true }).click();
    await expect(page.locator(".output-text .card")).toHaveCount(0);
    await capture(page, "message-cleared");
    await page.getByRole("button", { name: "Вернуть сообщение", exact: true }).click();
    await expect(page.locator(".output-text .card")).toHaveCount(2);

    const card = gridCards.first();
    await card.evaluate((element) =>
      element.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }))
    );
    await expect(card).toHaveClass(/isInside/);
    await expect(card.locator(".progress-bar")).toBeVisible();
    const dwell = await card.locator(".progress-bar").evaluate((element) => {
      const animation = element.getAnimations({ subtree: true })[0];
      animation.pause();
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
      const bounds = element.getBoundingClientRect();
      const target = element.closest("button")!.getBoundingClientRect();
      return {
        widthDifference: target.width - bounds.width,
        heightDifference: target.height - bounds.height
      };
    });
    expect(dwell.widthDifference).toBeLessThanOrEqual(4);
    expect(dwell.heightDifference).toBeLessThanOrEqual(4);
    await page.screenshot({ path: join(screenshotDir, "gaze-dwell-full-card.png") });
    await card.evaluate((element) => element.dispatchEvent(new CustomEvent("eye-exit")));
    await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Возобновить управление", exact: true })
    ).toBeEnabled();
    await expect(card).toBeDisabled();
    await capture(page, "paused");
    const resume = page.getByRole("button", { name: "Возобновить управление", exact: true });
    await expect(resume).toHaveClass(/eye/);
    await resume.evaluate((element) =>
      element.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }))
    );
    await expect(resume.locator(".progress-bar")).toBeVisible();
    await resume.evaluate((element) => element.dispatchEvent(new CustomEvent("eye-exit")));
    await page.getByRole("button", { name: "Инструменты помощника", exact: true }).click();
    await expect(page.locator(".gaze-pause")).toBeDisabled();
    await page.getByRole("button", { name: "Закрыть инструменты", exact: true }).click();
    await expect(card).toBeDisabled();
    await resumeByGaze(
      app,
      page.getByRole("button", { name: "Возобновить управление", exact: true })
    );
    await expect(card).toBeEnabled();
    await page.getByRole("button", { name: "Инструменты помощника", exact: true }).click();
    await expect(card).toBeDisabled();
    await page.getByRole("button", { name: "Закрыть инструменты", exact: true }).click();
    await expect(card).toBeEnabled();

    await page.goto(`${devServerUrl}/#/edit/§${name}`);
    await page.locator(".editor .cards .eyebtn").first().click();
    await expect
      .poll(() =>
        page.locator(".editor-canvas").evaluate((canvas) => {
          const grid = canvas.querySelector(".cards");
          return grid
            ? grid.getBoundingClientRect().top - canvas.getBoundingClientRect().top
            : Infinity;
        })
      )
      .toBeLessThan(100);
    await capture(page, "editor");
    await page.goto(`${devServerUrl}/#/settings`);
    await expect(page.getByText("Настройки", { exact: true }).first()).toBeVisible();
    await page.locator("summary").filter({ hasText: "Оформление карточек" }).click();
    await capture(page, "settings");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(800, 600)
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await capture(page, "settings-compact");
    await page.getByTestId("settings-trial-button").scrollIntoViewIfNeeded();
    await page.getByTestId("settings-trial-button").click();
    await expect(page.getByTestId("settings-trial-status")).toHaveText("Сработало: 1");
    await capture(page, "settings-trial");
    await page.getByTestId("dwell-indicator-select").click();
    await page.getByRole("option", { name: "Круг по центру", exact: true }).click();
    await expect(page.locator(".v-menu .v-overlay__content")).toBeHidden();
    const trial = page.getByTestId("settings-trial-button");
    await trial.evaluate((element) =>
      element.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }))
    );
    await expect(trial.locator(".dwell-circle")).toBeVisible();
    await trial.locator(".dwell-circle").evaluate((element) => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
    });
    await page.screenshot({ path: join(screenshotDir, "gaze-dwell-central-circle.png") });
    await page.reload();
    await expect(page.getByTestId("dwell-indicator-select")).toContainText("Круг по центру");
    await page.getByTestId("dwell-indicator-select").click();
    await page.getByRole("option", { name: "От краёв к центру", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Оформление карточек" }).click();

    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2)
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
    );
    await page.getByRole("button", { name: "Чёрно-белая", exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator(".color-preview .eyebtn")
          .last()
          .evaluate((element) => ({
            background: getComputedStyle(element).backgroundColor,
            color: getComputedStyle(element).color
          }))
      )
      .toEqual({ background: "rgb(221, 221, 221)", color: "rgb(0, 0, 0)" });
    await page.getByRole("button", { name: "Спокойная", exact: true }).click();

    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
    );
    await page.goto(`${devServerUrl}/#/set/§Викторина.linka`);
    await expect(page.getByRole("button", { name: "Начать", exact: true })).toHaveClass(/eye/);
    await expect(gridCards.first()).toBeDisabled();
    await page.getByRole("button", { name: "Начать", exact: true }).click();
    await expect(gridCards.first()).toBeEnabled();
    await capture(page, "quiz");

    await page.goto(`${devServerUrl}/#/tobii-calibration`);
    await expect(page.getByText(/Калибровка/).first()).toBeVisible();
    await capture(page, "calibration");
    await page.goto(`${devServerUrl}/#/set/§missing-file.linka`);
    await expect(page.getByRole("heading", { name: "Не удалось открыть набор" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Попробовать снова" })).toBeVisible();
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});

test("task examples show the fourth quiz question and matching choices without communication output", async () => {
  test.setTimeout(90000);
  mkdirSync(screenshotDir, { recursive: true });
  const context = createE2EContext();
  const { cards, entries } = phraseFixture();
  const titles = ["Я", "мультик", "читать", "гулять"];
  const choices = titles.map((title) => {
    const card = cards.find((item) => item.title === title);
    expect(card, `public fixture contains ${title}`).toBeTruthy();
    return card!;
  });
  const questions = [
    "Выберите карточку «Я»",
    "Что выбирают, чтобы посмотреть мультфильм?",
    "Что можно делать с книгой?",
    "Что выбирают, чтобы пойти на улицу?"
  ];
  writeLinkaSet(
    context.homeDir,
    "Викторина — четыре вопроса.linka",
    standardConfig([], {
      quizAutoNext: false,
      pages: questions.map((question, page) => ({
        id: `task-question-${page}`,
        mode: "quiz",
        rows: 2,
        columns: 2,
        question,
        cards: choices.map((card, index) => ({
          ...card,
          id: `task-answer-${page}-${index}`,
          answer: page === index
        }))
      }))
    }),
    entries
  );
  const pairChoices = [choices[0], choices[2], choices[3]];
  const matchCards = [
    ...pairChoices.map((card, index) => ({
      ...card,
      id: `top-${index}`,
      matchId: String(card.title),
      matchLane: "top"
    })),
    ...[pairChoices[2], pairChoices[0], pairChoices[1]].map((card, index) => ({
      ...card,
      id: `bottom-${index}`,
      matchId: String(card.title),
      matchLane: "bottom"
    }))
  ];
  writeLinkaSet(
    context.homeDir,
    "Задание — найди пару.linka",
    standardConfig([], {
      pages: [{ id: "task-match", mode: "match", rows: 2, columns: 3, cards: matchCards }]
    }),
    entries
  );

  const app = await launchTestElectron(context);
  try {
    await recordGazeTargets(app);
    const page = await firstTestWindow(app);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.unmaximize();
      window.setContentSize(1280, 800);
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${devServerUrl}/#/set/§Викторина — четыре вопроса.linka`);
    await page.getByRole("button", { name: "Начать", exact: true }).click();
    const grid = page.locator(".grid > .cards");
    for (let index = 0; index < 3; index++) {
      await grid.getByRole("button", { name: titles[index], exact: true }).click();
      await page.getByRole("button", { name: "Далее", exact: true }).click();
    }
    await expect(page.locator(".page-indicator")).toHaveText("Вопрос 4 из 4");
    await expect(page.getByRole("heading", { name: questions[3] })).toBeVisible();
    await expect(page.locator(".output-text")).toHaveCount(0);
    await capture(page, "quiz-4-of-4");

    await grid.getByRole("button", { name: "читать", exact: true }).click();
    await expect(page.locator(".attempts")).toHaveAttribute("aria-label", "Ошибок: 1");
    await expect(page.locator(".page-indicator")).toHaveText("Вопрос 4 из 4");
    await expect(grid.locator(".answer-wrong")).toHaveAttribute("aria-label", "читать");
    await expect(page.getByText("Попробуйте ещё раз", { exact: true })).toBeVisible();
    await capture(page, "quiz-wrong-answer");
    await grid.getByRole("button", { name: "гулять", exact: true }).click();
    await expect(page.getByRole("heading", { name: questions[3] })).toBeVisible();
    await expect(grid.locator(".answer-correct")).toHaveAttribute("aria-label", "гулять");
    await capture(page, "quiz-correct-answer");
    await page.getByRole("button", { name: "Далее", exact: true }).click();
    await expect(page.getByText("Викторина завершена", { exact: true })).toBeVisible();
    await expect(page.getByText("Вы прошли все вопросы. Ошибок: 1")).toBeVisible();
    await expect(grid.locator("button.eye")).toHaveCount(0);
    await capture(page, "quiz-finished");
    await page.getByRole("button", { name: "К наборам", exact: true }).click();
    await expect(page.locator(".folder-grid")).toBeVisible();

    await page.goto(`${devServerUrl}/#/set/§Задание — найди пару.linka`);
    await expect(grid.locator("button")).toHaveCount(6);
    await expect(page.locator(".output-text")).toHaveCount(0);
    await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
    const taskResume = page.getByRole("button", { name: "Возобновить управление", exact: true });
    await expect(taskResume).toHaveClass(/eye/);
    await expect(grid.locator("button.eye")).toHaveCount(0);
    await capture(page, "task-paused");
    await resumeByGaze(app, taskResume);
    await expect(grid.locator("button.eye")).toHaveCount(6);
    await capture(page, "match-task");
    await grid.getByRole("button", { name: "Я", exact: true }).first().click();
    await expect(grid.locator(".active")).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("Выберите карточку из другой строки", { exact: true })
    ).toBeVisible();
    await capture(page, "match-selected");
    await grid.getByRole("button", { name: "гулять", exact: true }).last().click();
    await expect(page.getByText("Неверная пара", { exact: true })).toBeVisible();
    await expect(page.locator(".attempts")).toHaveAttribute("aria-label", "Ошибок: 1");
    await capture(page, "match-wrong-pair");
    await expect(grid.locator(".active")).toHaveAttribute("aria-label", "Я");
    await grid.getByRole("button", { name: "Я", exact: true }).last().click();
    await expect(grid.locator(".matched")).toHaveCount(2);
    await expect(grid.locator(".matched").first()).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Найдено пар: 1 из 3", exact: true })
    ).toBeVisible();
    await capture(page, "match-found-pair");
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
