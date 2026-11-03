import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

for (const [width, height] of [
  [1024, 600],
  [1366, 768],
  [1920, 1080]
]) {
  test(`caret Range geometry ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      const input = new URL(location.href).searchParams;
      window.typingBridge = {
        load: () => ({ text: input.get("text") || "", caret: Number(input.get("caret")) }),
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
    const results = [];
    for (const language of ["ru", "en"]) {
      for (const [name, text, caret] of [
        ["start", "Ширина Wiil", 0],
        ["middle", "Ширина Wiil", 3],
        ["end", "Ширина Wiil", 11],
        ["before-space", "Ш W", 1],
        ["after-space", "Ш W", 2],
        ["spaces", "i  W", 3],
        ["emoji-before", "i😀W", 1],
        ["emoji-after", "i😀W", 2],
        ["newline-before", "ШW\niЖ", 2],
        ["newline-after", "ШW\niЖ", 3],
        ["wrap", "ШWiil ".repeat(14), 60],
        ["trailing-newline", "ШW\n", 3],
        ["empty", "", 0]
      ] as const) {
        await page.goto(`/typing.html?text=${encodeURIComponent(text)}&caret=${caret}`);
        await expect(page.locator(".draft")).toBeVisible();
        if (language === "en")
          await page.getByRole("button", { name: "RU → EN", exact: true }).click();
        const geometry = await page.locator(".draft").evaluate((output) => {
          const marker = output.querySelector<HTMLElement>(".caret")!;
          const before = marker.previousElementSibling!;
          const after = marker.nextElementSibling!;
          function rangeRect(el: Element, start: number, end: number) {
            const range = document.createRange();
            const node = el.firstChild;
            if (!node) return null;
            range.setStart(node, start);
            range.setEnd(node, end);
            return range.getBoundingClientRect().toJSON();
          }
          const left = before.textContent || "",
            right = after.textContent || "";
          const previous = Array.from(left).at(-1) || "",
            next = Array.from(right)[0] || "";
          const style = getComputedStyle(output);
          const ctx = document.createElement("canvas").getContext("2d")!;
          ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          function ink(char: string) {
            const m = ctx.measureText(char);
            return {
              advance: m.width,
              left: m.actualBoundingBoxLeft,
              right: m.actualBoundingBoxRight
            };
          }
          const r = marker.getBoundingClientRect();
          return {
            marker: r.toJSON(),
            before: rangeRect(before, 0, left.length),
            after: rangeRect(after, 0, right.length),
            previous: rangeRect(before, left.length - previous.length, left.length),
            next: rangeRect(after, 0, next.length),
            previousChar: previous,
            nextChar: next,
            previousInk: ink(previous),
            nextInk: ink(next),
            text: left + right,
            font: ctx.font,
            output: output.getBoundingClientRect().toJSON(),
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            pseudo: {
              border: getComputedStyle(marker, "::after").borderInlineStartWidth,
              content: getComputedStyle(marker, "::after").content
            },
            selection: (() => {
              const range = document.createRange();
              range.selectNodeContents(output);
              const selection = getSelection()!;
              selection.removeAllRanges();
              selection.addRange(range);
              const text = selection.toString();
              selection.removeAllRanges();
              return text;
            })()
          };
        });
        results.push({ language, name, text, caret, geometry });
        writeFileSync(
          test.info().outputPath("caret-measurements.json"),
          JSON.stringify(results, null, 2)
        );
        if (
          ["middle", "after-space", "emoji-after", "newline-after", "wrap", "start"].includes(name)
        ) {
          await page.screenshot({ path: test.info().outputPath(`${language}-${name}.png`) });
          await page
            .locator(".draft")
            .screenshot({ path: test.info().outputPath(`${language}-${name}-detail.png`) });
        }
        expect(geometry.text).toBe(text);
        if (process.env.CARET_BASELINE !== "1") {
          expect(geometry.marker.width).toBe(0);
          expect(geometry.pseudo.border).toBe("2px");
          expect(geometry.selection).toBe(text);
          const p = geometry.previous,
            n = geometry.next,
            m = geometry.marker;
          if (p && geometry.previousChar !== "\n" && p.top < m.bottom && p.bottom > m.top)
            expect(Math.abs(p.right - m.x)).toBeLessThanOrEqual(0.1);
          if (n && geometry.nextChar !== "\n" && n.top < m.bottom && n.bottom > m.top)
            expect(Math.abs(n.x - m.x)).toBeLessThanOrEqual(0.1);
        }
      }
    }
  });
}
