import { expect, test } from "@playwright/test";
import AdmZip from "adm-zip";
import { join } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  devServerUrl,
  firstTestWindow,
  launchTestElectron,
  standardConfig,
  writeLinkaSet
} from "./helpers";

test("editor settings expose row and column controls", async () => {
  const context = createE2EContext();
  const setName = "agent-e2e.linka";
  writeLinkaSet(context.homeDir, setName, standardConfig([{ id: "card-1", cardType: 3 }], {
    pages: [{ id: "page-1", mode: "standard", columns: 3, rows: 3, cards: [{ id: "card-1", cardType: 3 }] }]
  }));

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/edit/§${setName}`);

    await window.getByRole("button", { name: "Открыть настройки набора" }).click();
    await expect(window.getByLabel("Количество колонок")).toBeVisible();
    await expect(window.getByLabel("Количество строк")).toBeVisible();

    await window.getByLabel("Количество строк").fill("2");
    await expect(window.getByLabel("Количество строк")).toHaveValue("2");
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("assistant settings page scrolls within the main content area", async () => {
  const context = createE2EContext();

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.setViewportSize({ width: 800, height: 600 });
    await window.goto(`${devServerUrl}/#/settings`);
    await expect(window.getByText("Главные настройки")).toBeVisible();

    const main = window.locator(".app-main");
    const metrics = await main.evaluate((el) => ({
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight
    }));
    expect(metrics.overflowY).toBe("auto");
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await main.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(window.getByText("Настройки кнопок")).toBeVisible();
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("gaze set explorer keeps page scrolling disabled", async () => {
  const context = createE2EContext();
  const setName = "gaze-scroll-lock.linka";
  writeLinkaSet(context.homeDir, setName, standardConfig([{ id: "card-1", cardType: 0, title: "Карточка" }]));

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/set/§${setName}`);
    await expect(window.getByRole("button", { name: "Карточка" })).toBeVisible();

    const overflowY = await window.locator(".app-main").evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflowY).toBe("hidden");
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("set explorer grid fills the viewport above footer", async () => {
  const context = createE2EContext();
  const setName = "layout-e2e.linka";
  const cards = Array.from({ length: 48 }, (_, index) => ({
    id: `card-${index}`,
    cardType: 0,
    title: String(index),
    imagePath: "missing.png"
  }));
  writeLinkaSet(context.homeDir, setName, {
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: true,
    quizReadQuestion: false,
    pages: [0, 1].map((pageIndex) => ({
      id: `page-${pageIndex}`,
      mode: "standard",
      columns: 12,
      rows: 4,
      cards
    }))
  });

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/set/§${setName}`);
    await expect(window.getByText("1 из 2")).toBeVisible();

    const metrics = await window.evaluate(() => {
      const grid = document.querySelector(".grid")?.getBoundingClientRect();
      const footer = document.querySelector(".footer")?.getBoundingClientRect();
      const leftButton = document.querySelector(".left-grid > button")?.getBoundingClientRect();
      const rightButton = document.querySelector(".grid > button")?.getBoundingClientRect();
      return {
        footerBottom: footer?.bottom ?? 0,
        footerTop: footer?.top ?? 0,
        gridBottom: grid?.bottom ?? 0,
        gridHeight: grid?.height ?? 0,
        leftButtonHeight: leftButton?.height ?? 0,
        rightButtonHeight: rightButton?.height ?? 0,
        viewportHeight: window.innerHeight
      };
    });

    expect(metrics.footerBottom).toBeCloseTo(metrics.viewportHeight, 1);
    expect(metrics.gridBottom).toBeLessThanOrEqual(metrics.footerTop + 1);
    expect(metrics.leftButtonHeight).toBeGreaterThan(metrics.gridHeight * 0.95);
    expect(metrics.rightButtonHeight).toBeGreaterThan(metrics.gridHeight * 0.95);
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("standard set appends clicked cards to text output", async () => {
  const context = createE2EContext();
  const setName = "standard-flow.linka";
  writeLinkaSet(context.homeDir, setName, standardConfig([
    { id: "hello", cardType: 0, title: "Hello" },
    { id: "world", cardType: 0, title: "World" }
  ], { withoutSpace: true }));

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/set/§${setName}`);

    await window.getByRole("button", { name: "Hello" }).click();
    await window.getByRole("button", { name: "World" }).click();

    await expect(window.locator(".output-text .text")).toContainText("HelloWorld");
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("standard set preserves typed output while turning pages", async () => {
  const context = createE2EContext();
  const setName = "keyboard-page-turn-flow.linka";
  writeLinkaSet(context.homeDir, setName, standardConfig([], {
    withoutSpace: true,
    pages: [
      { id: "page-1", mode: "standard", columns: 1, rows: 1, cards: [{ id: "letter-a", cardType: 0, title: "А" }] },
      { id: "page-2", mode: "standard", columns: 1, rows: 1, cards: [{ id: "letter-b", cardType: 0, title: "Б" }] },
      { id: "page-3", mode: "standard", columns: 1, rows: 1, cards: [{ id: "letter-v", cardType: 0, title: "В" }] }
    ]
  }));

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/set/§${setName}`);

    await window.getByRole("button", { name: "А", exact: true }).click();
    await expect(window.locator(".output-text .text")).toContainText("А");

    await window.locator(".grid > button").click();
    await expect(window.getByText("2 из 3")).toBeVisible();
    await expect(window.locator(".output-text .text")).toContainText("А");

    await window.getByRole("button", { name: "Б", exact: true }).click();
    await expect(window.locator(".output-text .text")).toContainText("АБ");
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("quiz set handles wrong and correct answers", async () => {
  const context = createE2EContext();
  const setName = "quiz-flow.linka";
  writeLinkaSet(context.homeDir, setName, {
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: false,
    quizReadQuestion: false,
    pages: [{
      id: "quiz-page",
      mode: "quiz",
      columns: 2,
      rows: 1,
      question: "Choose right",
      cards: [
        { id: "wrong", cardType: 0, title: "Wrong" },
        { id: "right", cardType: 0, title: "Right", answer: true }
      ]
    }]
  });

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/set/§${setName}`);
    await window.getByRole("button", { name: "Начать" }).click();

    await window.getByRole("button", { name: "Wrong" }).click();
    await expect.poll(async () => {
      return window.evaluate(() => !!document.querySelector(".mdi-numeric-1-box"));
    }).toBe(true);
    await window.getByRole("button", { name: "Right" }).click();

    await expect(window.getByRole("button", { name: /Далее/ })).toBeVisible();
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("match set handles wrong and correct pairs", async () => {
  const context = createE2EContext();
  const setName = "match-flow.linka";
  writeLinkaSet(context.homeDir, setName, {
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: true,
    quizReadQuestion: false,
    pages: [{
      id: "match-page",
      mode: "match",
      columns: 2,
      rows: 2,
      cards: [
        { id: "top-apple", cardType: 0, title: "Apple", matchId: "apple", matchLane: "top" },
        { id: "top-cat", cardType: 0, title: "Cat", matchId: "cat", matchLane: "top" },
        { id: "bottom-apple", cardType: 0, title: "Apple", matchId: "apple", matchLane: "bottom" },
        { id: "bottom-cat", cardType: 0, title: "Cat", matchId: "cat", matchLane: "bottom" }
      ]
    }]
  });

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/set/§${setName}`);

    await window.getByRole("button", { name: "Apple" }).nth(0).click();
    await window.getByRole("button", { name: "Cat" }).nth(1).click();
    await expect(window.getByText("Неверная пара")).toBeVisible();

    await window.getByRole("button", { name: "Apple" }).nth(0).click();
    await window.getByRole("button", { name: "Apple" }).nth(1).click();
    await expect(window.getByText("Верно")).toBeVisible();
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

test("editor saves changed page settings to set archive", async () => {
  test.setTimeout(60000);
  const context = createE2EContext();
  const setName = "editor-save-flow.linka";
  writeLinkaSet(context.homeDir, setName, standardConfig([{ id: "card-1", cardType: 3 }], {
    pages: [{ id: "page-1", mode: "standard", columns: 3, rows: 3, cards: [{ id: "card-1", cardType: 3 }] }]
  }));

  const electronApp = await launchTestElectron(context);
  try {
    const window = await firstTestWindow(electronApp);
    await window.goto(`${devServerUrl}/#/edit/§${setName}`);

    await window.getByRole("button", { name: "Открыть настройки набора" }).click();
    await window.getByLabel("Количество строк").fill("2");
    await window.keyboard.press("Escape");
    await expect(window.getByLabel("Количество строк")).toBeHidden();
    await window.locator(".v-app-bar button").last().click({ timeout: 5000 });
    await expect(window.getByText(`Сохранить ${setName}?`)).toBeVisible();
    await window.getByRole("button", { name: /^Сохранить$/ }).evaluate((button) => (button as HTMLButtonElement).click());

    await expect.poll(() => readSetRows(context.homeDir, setName)).toBe(2);
  } finally {
    await electronApp.close();
    cleanupE2EContext(context);
  }
});

function readSetRows (homeDir: string, setName: string): number | undefined {
  const zip = new AdmZip(join(homeDir, setName));
  const config = JSON.parse(zip.readAsText("config.json")) as { pages?: Array<{ rows?: number }> };
  return config.pages?.[0].rows;
}
