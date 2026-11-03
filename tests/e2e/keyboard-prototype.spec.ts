import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

for (const [width, height] of [
  [1024, 600],
  [1366, 768]
]) {
  for (const language of ["ru", "en"]) {
    test(`numpad ${language} ${width}x${height}: symbols, geometry, selection, undo and draft`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(() => {
        window.typingBridge = {
          load: () =>
            JSON.parse(sessionStorage.getItem("numpad-draft") || '{"text":"seed","caret":4}'),
          save: (draft) => sessionStorage.setItem("numpad-draft", JSON.stringify(draft)),
          settings: () => ({
            button: {
              enabled: true,
              borders: 1,
              timeout: 1000,
              dwellIndicator: "circle",
              clickSound: false,
              eyeSelect: true,
              eyeActivation: true,
              keyboardActivation: true,
              joystickActivation: true,
              animation: true
            },
            keyMapping: { enter: ["Enter"] }
          }),
          predict: async () => [],
          cancel: () => {},
          bounds: () => {},
          onEye: () => () => {},
          close: () => {},
          speak: async () => {},
          stop: () => {}
        };
      });
      await page.goto("/typing-prototype.html");
      await page.getByRole("button", { name: "Очистить всё", exact: true }).click();
      if (language === "en")
        await page.getByRole("button", { name: "RU → EN", exact: true }).click();
      const system = page.locator(".commands button, .modes button, .editing button, .space");
      const boxes = () =>
        system.evaluateAll((buttons) =>
          buttons.map((button) => {
            const r = button.getBoundingClientRect();
            return {
              label: button.getAttribute("aria-label"),
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height
            };
          })
        );
      const before = await boxes();
      const letterHeights = await page
        .locator(".keys button")
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
      await page.getByRole("button", { name: "Цифры", exact: true }).click();
      const keys = page.locator(".keys button");
      await expect(keys).toHaveCount(12);
      expect(await keys.allTextContents()).toEqual(Array.from("123*456№7890"));
      await checkContentBounds(page);
      expect(await boxes()).toEqual(before);
      const geometry = await keys.evaluateAll((buttons) =>
        buttons.map((button) => {
          const r = button.getBoundingClientRect();
          return {
            label: button.getAttribute("aria-label"),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height
          };
        })
      );
      expect(Math.min(...geometry.map((r) => r.height))).toBeGreaterThanOrEqual(
        Math.min(...letterHeights) - 0.1
      );
      expect(Math.min(...geometry.map((r) => r.width))).toBeGreaterThan(44);
      for (const name of ["*", "№"]) {
        const key = page.getByRole("button", { name, exact: true });
        await expect(key).toHaveAccessibleName(name);
        await key.click();
      }
      const output = page.getByRole("textbox");
      await expect(output).toHaveText("*№");
      expect(await page.locator(".caret").evaluate((el) => el.getBoundingClientRect().width)).toBe(
        0
      );
      const selected = await output.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        const text = selection.toString();
        selection.removeAllRanges();
        return text;
      });
      expect(selected).toBe("*№");
      for (const name of ["Буквы", "Знаки", "Курсор", "Цифры"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await expect(output).toHaveText("*№");
      }
      await page.getByRole("button", { name: "Отменить", exact: true }).click();
      await expect(output).toHaveText("*");
      await page.getByRole("button", { name: "№", exact: true }).click();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight
        )
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`numpad-${language}-${width}x${height}.png`)
      });
      writeFileSync(
        test.info().outputPath("numpad-geometry.json"),
        JSON.stringify(
          { language, width, height, geometry, system: before, letterHeights },
          null,
          2
        )
      );
      await page.reload();
      await expect(output).toHaveText("*№");
      await page.getByRole("button", { name: "Цифры", exact: true }).click();
      await page.getByRole("button", { name: "*", exact: true }).click();
      await expect(output).toHaveText("*№*");
    });
  }
}

async function checkContentBounds(page: Page) {
  const failures = await page.locator(".typing button").evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const bounds = button.getBoundingClientRect();
      const label = button.getAttribute("aria-label") || button.textContent;
      const errors: string[] = [];
      for (const other of buttons) {
        if (other === button) continue;
        const r = other.getBoundingClientRect();
        if (
          Math.min(bounds.right, r.right) - Math.max(bounds.left, r.left) > 0.5 &&
          Math.min(bounds.bottom, r.bottom) - Math.max(bounds.top, r.top) > 0.5
        )
          errors.push(`${label}: overlapping target`);
      }
      if (
        bounds.left < 0 ||
        bounds.top < 0 ||
        bounds.right > innerWidth ||
        bounds.bottom > innerHeight ||
        button.scrollWidth > button.clientWidth ||
        button.scrollHeight > button.clientHeight
      )
        errors.push(`${label}: clipped button`);
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (
          !node.textContent?.trim() ||
          node.parentElement?.closest(".overlay, strong[role='status']")
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const text of range.getClientRects()) {
          if (
            text.left < bounds.left ||
            text.right > bounds.right ||
            text.top < bounds.top ||
            text.bottom > bounds.bottom
          )
            errors.push(`${label}: clipped typography`);
        }
      }
      return errors;
    })
  );
  expect(failures).toEqual([]);
}

for (const variant of ["C"]) {
  for (const [width, height] of [
    [800, 600],
    [1024, 600],
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1920, 1080]
  ]) {
    test(`${variant} ${width}x${height}: full RU and EN, stable predictions, no hidden targets`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript((layout) => {
        let draft = { text: "Привет! Hello! ", caret: 15 };
        let finishSpeech: (() => void) | undefined;
        window.typingBridge = {
          load: () => {
            if (Reflect.get(window, "failDraftLoad")) throw new Error("unreadable fixture");
            return draft;
          },
          save: (value) => {
            if (Reflect.get(window, "failDraftSave")) throw new Error("disk full fixture");
            draft = value;
          },
          settings: () => ({
            typingLayout: layout as "C",
            button: {
              enabled: true,
              borders: 1,
              timeout: 1000,
              dwellIndicator: "circle",
              clickSound: false,
              eyeSelect: true,
              eyeActivation: true,
              keyboardActivation: true,
              joystickActivation: true,
              animation: true
            },
            keyMapping: { enter: ["Enter"] }
          }),
          predict: async (_id, input) =>
            ["привет", "пример", "принято"].map((word) => ({
              word,
              draft: {
                text: input.text + word + " ",
                caret: Array.from(input.text + word + " ").length
              }
            })),
          cancel: () => {},
          bounds: () => {},
          onEye: () => () => {},
          close: () => {},
          speak: () =>
            new Promise<void>((resolve) => {
              finishSpeech = resolve;
            }),
          stop: () => finishSpeech?.()
        };
      }, variant);
      await page.goto("/typing.html");
      await expect(page.locator(".typing")).toHaveClass(`typing variant-${variant}`);
      await expect(page.locator(".prototype-switcher")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Приостановить управление", exact: true })
      ).toHaveText("Пауза");
      const keys = page.locator('[aria-label="Клавиши"] button');
      await expect(keys).toHaveCount(33);
      expect((await keys.allTextContents()).join("")).toBe("ёйцукенгшщзхъфывапролджэячсмитьбю");
      const predictions = page.locator('[aria-label="Подсказки слов"] button');
      await expect(predictions).toHaveCount(3);
      const before = await keys.evaluateAll((buttons) =>
        buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        })
      );
      await page.getByRole("button", { name: "п", exact: true }).click();
      await expect(predictions.first()).toContainText("привет");
      expect(
        await keys.evaluateAll((buttons) =>
          buttons.map((b) => {
            const r = b.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height];
          })
        )
      ).toEqual(before);
      const measurements: unknown[] = [];
      for (const language of ["ru", "en"]) {
        if (language === "en")
          await page.getByRole("button", { name: "RU → EN", exact: true }).click();
        await expect(keys).toHaveCount(language === "ru" ? 33 : 26);
        if (language === "en")
          expect((await keys.allTextContents()).join("")).toBe("qwertyuiopasdfghjklzxcvbnm");
        const icons = await page.locator(".typing-icon").evaluateAll((elements) =>
          elements.map((el) => ({
            path: el.querySelector("path")!.getAttribute("d"),
            stroke: el.getAttribute("stroke-width"),
            hidden: el.getAttribute("aria-hidden"),
            focusable: el.getAttribute("focusable")
          }))
        );
        expect(icons.length).toBe(10);
        expect(new Set(icons.map((icon) => icon.path)).size).toBe(icons.length);
        expect(
          icons.every(
            (icon) => icon.stroke === "1.8" && icon.hidden === "true" && icon.focusable === "false"
          )
        ).toBe(true);
        const geometry = await page.locator(".typing button").evaluateAll((buttons) =>
          buttons.map((button) => {
            const r = button.getBoundingClientRect();
            return {
              label: button.getAttribute("aria-label") || button.textContent?.trim(),
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              group: button.closest(".keys")
                ? "letters"
                : button.closest(".predictions")
                  ? "predictions"
                  : "system",
              visible:
                r.width > 0 &&
                r.height > 0 &&
                r.x >= 0 &&
                r.y >= 0 &&
                r.right <= innerWidth &&
                r.bottom <= innerHeight,
              clipped:
                button.scrollWidth > button.clientWidth || button.scrollHeight > button.clientHeight
            };
          })
        );
        expect(geometry.filter((g) => !g.visible || g.clipped)).toEqual([]);
        await checkContentBounds(page);
        for (let i = 0; i < geometry.length; i++) {
          for (const other of geometry.slice(i + 1)) {
            const a = geometry[i];
            expect(
              Math.min(a.x + a.width, other.x + other.width) - Math.max(a.x, other.x) > 0.5 &&
                Math.min(a.y + a.height, other.y + other.height) - Math.max(a.y, other.y) > 0.5,
              `${a.label} overlaps ${other.label}`
            ).toBe(false);
          }
        }
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight
          )
        ).toBe(true);
        const systemHeights = await page
          .locator(".commands button, .modes button, .editing button")
          .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
        // Four target rows share the space left by the enlarged draft, padding and gaps.
        const minimum = (height - Math.min(180, Math.max(96, height / 6)) - 40) / 4;
        expect(Math.min(...systemHeights)).toBeGreaterThanOrEqual(minimum - 0.1);
        const letterBounds = await keys.evaluateAll((buttons) =>
          buttons.map((b) => {
            const r = b.getBoundingClientRect();
            return { width: r.width, height: r.height };
          })
        );
        expect(Math.min(...letterBounds.map((r) => r.height))).toBeGreaterThanOrEqual(
          minimum - 0.1
        );
        const space = geometry.find((g) => g.label === "Пробел")!;
        const command = geometry.find((g) => g.label === "Отменить")!;
        expect(space.width).toBeGreaterThanOrEqual(command.width * 2);
        const keyboard = await page.locator(".typing").boundingBox();
        const spaceCenterDelta = space.x + space.width / 2 - (keyboard!.x + keyboard!.width / 2);
        expect(Math.abs(spaceCenterDelta)).toBeLessThanOrEqual(0.1);
        expect(await page.locator(".typing button:not([aria-label])").count()).toBe(0);
        measurements.push({
          language,
          spaceCenterDelta,
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
          minSystemHeight: Math.min(...systemHeights),
          minLetterWidth: Math.min(...letterBounds.map((r) => r.width)),
          minLetterHeight: Math.min(...letterBounds.map((r) => r.height)),
          geometry
        });
        await page.screenshot({
          path: test.info().outputPath(`${variant}-${language}-${width}x${height}.png`)
        });
      }
      writeFileSync(test.info().outputPath("geometry.json"), JSON.stringify(measurements, null, 2));
      await page.getByRole("button", { name: "h", exact: true }).click();
      await page.getByRole("button", { name: "Убрать слово", exact: true }).click();
      await page.getByRole("button", { name: "Отменить", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Черновик" })).toContainText("пh");
      await page.getByRole("button", { name: "Озвучить всё", exact: true }).click();
      await page.screenshot({ path: test.info().outputPath("speaking.png") });
      await page.getByRole("button", { name: "Стоп", exact: true }).click();
      await expect(page.getByRole("button", { name: "Озвучить всё", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Курсор", exact: true }).click();
      await expect(keys).toHaveCount(0);
      await checkContentBounds(page);
      await page.screenshot({ path: test.info().outputPath("cursor.png") });
      const navigation = await page.locator(".navigation button").evaluateAll((buttons) =>
        buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return {
            height: r.height,
            visible: r.top >= 0 && r.bottom <= innerHeight,
            clipped: b.scrollWidth > b.clientWidth || b.scrollHeight > b.clientHeight
          };
        })
      );
      expect(navigation).toHaveLength(6);
      expect(navigation.every((r) => r.height >= 80 && r.visible && !r.clipped)).toBe(true);
      await page.getByRole("button", { name: "В начало", exact: true }).click();
      await page.getByRole("button", { name: "Цифры", exact: true }).click();
      await expect(keys).toHaveCount(12);
      await checkContentBounds(page);
      await page.screenshot({ path: test.info().outputPath("numbers.png") });
      await page.getByRole("button", { name: "1", exact: true }).click();
      await page.getByRole("button", { name: "Знаки", exact: true }).click();
      await expect(keys).toHaveCount(22);
      await checkContentBounds(page);
      await page.screenshot({ path: test.info().outputPath("symbols.png") });
      await page.getByRole("button", { name: "!", exact: true }).click();
      await page.getByRole("button", { name: "Буквы", exact: true }).click();
      await expect(keys).toHaveCount(26);
      await page.getByRole("button", { name: "Приостановить управление", exact: true }).click();
      await expect(keys.first()).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Возобновить управление", exact: true })
      ).toContainText("Продолжить");
      await checkContentBounds(page);
      await page.screenshot({ path: test.info().outputPath("paused.png") });
      await page.getByRole("button", { name: "Возобновить управление", exact: true }).click();
      await expect(keys.first()).toBeEnabled();
      await expect(page.getByRole("textbox", { name: "Черновик" })).toContainText("1!");
      const draftBeforeClear = await page.getByRole("textbox").textContent();
      await page.getByRole("button", { name: "Очистить всё", exact: true }).click();
      await expect(page.getByRole("textbox")).toHaveText("");
      await page.getByRole("button", { name: "Отменить", exact: true }).click();
      await expect(page.getByRole("textbox")).toHaveText(draftBeforeClear!);
      await page.getByRole("button", { name: "а → А", exact: true }).click();
      await expect(keys.first()).toHaveText("Q");
      await page.getByRole("button", { name: "А → а", exact: true }).click();
      if (width === 1366) {
        await page.getByRole("button", { name: "Знаки", exact: true }).click();
        for (let line = 0; line < 8; line++)
          await page.getByRole("button", { name: "Новая строка", exact: true }).click();
        const visibleCaret = await page.locator(".caret").evaluate((caret) => {
          const r = caret.getBoundingClientRect();
          const output = caret.parentElement!.getBoundingClientRect();
          return (
            r.top >= output.top &&
            r.bottom <= output.bottom &&
            r.left >= output.left &&
            r.right <= output.right
          );
        });
        expect(visibleCaret).toBe(true);
        await page.screenshot({
          path: test.info().outputPath(`${variant}-symbols-long-draft.png`)
        });
      }
      if (width === 1024 && height === 600) {
        await page.evaluate(() => Reflect.set(window, "failDraftSave", true));
        await page.getByRole("button", { name: "a", exact: true }).click();
        await expect(page.getByRole("alert")).toContainText("не сохранён");
        await checkContentBounds(page);
        await page.screenshot({ path: test.info().outputPath(`${variant}-save-error.png`) });
        await page.addInitScript(() => Reflect.set(window, "failDraftLoad", true));
        await page.reload();
        await expect(page.getByRole("alert")).toContainText("загрузить");
        await expect(page.locator(".keys button")).toHaveCount(0);
        await checkContentBounds(page);
        await page.screenshot({ path: test.info().outputPath(`${variant}-load-error.png`) });
      }
    });
  }
}

test("standalone demo is C only, including legacy URLs, with focus and dwell feedback", async ({
  page
}) => {
  await page.goto("/typing-prototype.html?variant=A");
  await expect(page.locator('[aria-label="Клавиши"] button')).toHaveCount(33);
  await expect(page.locator(".typing")).toHaveClass("typing variant-C");
  await expect(page.locator(".prototype-switcher")).toHaveCount(0);
  await page.getByRole("button", { name: "п", exact: true }).click();
  await expect(page.locator('[aria-label="Подсказки слов"] button').first()).toBeEnabled();
  const key = page.getByRole("button", { name: "а", exact: true });
  await page.keyboard.press("Tab");
  await key.focus();
  await expect(key).toBeFocused();
  expect(await key.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await key.evaluate((el) =>
    el.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }))
  );
  await expect(key.locator(".dwell-circle")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("focus-dwell.png") });
});

test("longest predictor words wrap without moving or clipping targets", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/typing-prototype.html");
  await page.evaluate(() => {
    window.typingBridge.predict = async () =>
      ["достопримечательностями", "электроэнцефалографический", "высококвалифицированный"].map(
        (word) => ({ word, draft: { text: word + " ", caret: Array.from(word).length + 1 } })
      );
  });
  await page.getByRole("button", { name: "п", exact: true }).click();
  await expect(page.locator(".predictions button").first()).toContainText(
    "достопримечательностями"
  );
  await checkContentBounds(page);
  await page.screenshot({ path: test.info().outputPath("longest-predictions.png") });
});

for (const [width, height] of [
  [1024, 600],
  [1366, 768],
  [1920, 1080]
]) {
  test(`readable output ${width}x${height}: multiline, wrapping, selection and caret`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const text = sessionStorage.getItem("output-fixture") || "Русский текст\nEnglish text";
      window.typingBridge = {
        load: () => ({ text, caret: Array.from(text).length }),
        save: () => {},
        settings: () => ({
          button: {
            enabled: true,
            borders: 1,
            timeout: 1000,
            dwellIndicator: "circle",
            clickSound: false,
            eyeSelect: true,
            eyeActivation: true,
            keyboardActivation: true,
            joystickActivation: true,
            animation: true
          },
          keyMapping: { enter: ["Enter"] }
        }),
        predict: async () => [],
        cancel: () => {},
        bounds: () => {},
        onEye: () => () => {},
        close: () => {},
        speak: async () => {},
        stop: () => {}
      };
    });
    await page.goto("/typing.html");
    const output = page.getByRole("textbox");
    const size = await output.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        font: parseFloat(style.fontSize),
        twoLinesFit: el.scrollHeight <= el.clientHeight
      };
    });
    expect(size.height).toBeCloseTo(Math.min(180, height / 6), 1);
    expect(size.font).toBeCloseTo(Math.min(56, Math.max(32, width * 0.03)), 1);
    expect(size.twoLinesFit).toBe(true);
    await page.screenshot({ path: test.info().outputPath("two-lines.png") });
    const text = (
      "Длинный русский текст. Long English text.\n" +
      "ОченьДлинноеСлово".repeat(20) +
      "W".repeat(200) +
      "\n"
    ).repeat(4);
    await page.evaluate((value) => sessionStorage.setItem("output-fixture", value), text);
    await page.reload();
    await expect(output).toContainText("Long English text");
    expect(await output.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Курсор", exact: true }).click();
    for (const name of ["В начало", "Слово вправо", "В конец"]) {
      await page.getByRole("button", { name, exact: true }).click();
      expect(
        await page.locator(".caret").evaluate((el) => {
          const r = el.getBoundingClientRect();
          const p = el.parentElement!.getBoundingClientRect();
          return r.top >= p.top && r.bottom <= p.bottom && r.left >= p.left && r.right <= p.right;
        }),
        name
      ).toBe(true);
    }
    const selected = await output.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const text = selection.toString();
      selection.removeAllRanges();
      return text;
    });
    expect(selected).toBe(text);
    await checkContentBounds(page);
    await page.screenshot({ path: test.info().outputPath("long-output-caret.png") });
  });
}
