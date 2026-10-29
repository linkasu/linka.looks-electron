import { expect, test } from "@playwright/test";
import AdmZip from "adm-zip";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  cleanupE2EContext,
  createE2EContext,
  devServerUrl,
  firstTestWindow,
  launchTestElectron,
  writeLinkaSet
} from "./helpers";

const oldImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);

for (const span of [1, 3]) {
  test(`text images wrap and round-trip in a ${span}-cell card`, async () => {
    const testInfo = test.info();
    test.setTimeout(90000);
    const context = createE2EContext();
    const setName = `text-images-${span}.linka`;
    const audio = Buffer.from("existing audio asset");
    writeLinkaSet(
      context.homeDir,
      setName,
      {
        version: "3.0",
        withoutSpace: false,
        pages: [
          {
            id: "page-1",
            mode: "standard",
            columns: 3,
            rows: 3,
            cards: [
              {
                id: "target",
                cardType: 0,
                title: "Исходная карточка",
                width: span,
                imagePath: "old.png",
                audioPath: "voice.mp3",
                audioText: "Исходная озвучка",
                audioVoice: "old-voice"
              },
              { id: "empty-1", cardType: 2 },
              { id: "empty-2", cardType: 2 },
              { id: "old", cardType: 0, title: "Старая картинка", imagePath: "old.png" }
            ]
          }
        ]
      },
      { "old.png": oldImage, "voice.mp3": audio }
    );
    const app = await launchTestElectron(context);
    try {
      const window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/edit/§${setName}`);
      await window.getByRole("button", { name: "Исходная карточка", exact: true }).click();
      const image = window.locator(".cards .selected .img");
      const cases = [
        "Привет",
        "Хочу пить",
        "Мне нужна помощь, пожалуйста, подойдите ко мне",
        "Оченьдлинноерусскоесловобезпробелов".repeat(4),
        '<script> & "кавычки" \' \\',
        "Длинная фраза из нескольких русских слов ".repeat(30)
      ];
      for (const [index, text] of cases.entries()) {
        const previous = await image.getAttribute("style");
        await window.getByRole("button", { name: "Создать из текста" }).click();
        await window.getByLabel("Текст для картинки").fill(text);
        await window.getByRole("button", { name: "Создать", exact: true }).click();
        await expect(image).not.toHaveAttribute("style", previous!);
        const metrics = await image.evaluate(async (element) => {
          const url = getComputedStyle(element).backgroundImage.match(/url\("(.+)"\)/)?.[1];
          if (!url) throw new Error("Missing generated image");
          const img = new Image();
          img.src = url;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
          let left = img.width,
            right = 0,
            top = img.height,
            bottom = 0;
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              if (pixels[(y * img.width + x) * 4] < 128) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
            }
          }
          const bounds = element.getBoundingClientRect();
          return {
            width: img.width,
            height: img.height,
            left,
            right,
            top,
            bottom,
            areaRatio: bounds.width / bounds.height,
            png: canvas.toDataURL("image/png").split(",")[1]
          };
        });
        expect(metrics.width).toBe(Math.max(1, Math.round(1024 * Math.min(1, metrics.areaRatio))));
        expect(metrics.height).toBe(
          Math.max(1, Math.round(1024 * Math.min(1, 1 / metrics.areaRatio)))
        );
        expect(metrics.right).toBeGreaterThan(metrics.left);
        expect(metrics.bottom).toBeGreaterThan(metrics.top);
        expect(metrics.left).toBeGreaterThan(1);
        expect(metrics.top).toBeGreaterThan(1);
        expect(metrics.right).toBeLessThan(metrics.width - 2);
        expect(metrics.bottom).toBeLessThan(metrics.height - 2);
        const pngPath = testInfo.outputPath(`case-${index}-generated.png`);
        const cardPath = testInfo.outputPath(`case-${index}-card.png`);
        writeFileSync(pngPath, Buffer.from(metrics.png, "base64"));
        await window.locator(".cards .selected").screenshot({ path: cardPath });
        await testInfo.attach(`case-${index}-png`, { path: pngPath, contentType: "image/png" });
        await testInfo.attach(`case-${index}-card`, { path: cardPath, contentType: "image/png" });
      }

      const unchangedImage = await image.getAttribute("style");
      await window.getByRole("button", { name: "Создать из текста" }).click();
      await window.getByLabel("Текст для картинки").fill("   ");
      await window.getByRole("button", { name: "Создать", exact: true }).click();
      await expect(window.getByText(/Введите текст для картинки/)).toBeVisible();
      await expect(image).toHaveAttribute("style", unchangedImage!);

      await window.locator(".v-app-bar button").last().click();
      await window
        .getByRole("button", { name: /^Сохранить$/ })
        .evaluate((el) => (el as HTMLButtonElement).click());
      const readCard = () => {
        const zip = new AdmZip(join(context.homeDir, setName));
        return JSON.parse(zip.readAsText("config.json")).pages[0].cards[0];
      };
      await expect.poll(() => readCard().imagePath).not.toBe("old.png");
      expect(readCard()).toMatchObject({
        id: "target",
        title: "Исходная карточка",
        audioPath: "voice.mp3",
        audioText: "Исходная озвучка",
        audioVoice: "old-voice"
      });
      expect(readCard().width ?? 1).toBe(span);
      const zip = new AdmZip(join(context.homeDir, setName));
      expect(zip.readFile("old.png")).toEqual(oldImage);
      expect(zip.readFile("voice.mp3")).toEqual(audio);
      expect(zip.readFile(readCard().imagePath)?.subarray(1, 4).toString()).toBe("PNG");
      await window.goto(`${devServerUrl}/#/set/§${setName}`);
      await expect(
        window.getByRole("button", { name: "Старая картинка", exact: true })
      ).toBeVisible();
      await expect(
        window.getByRole("button", { name: "Исходная карточка", exact: true })
      ).toBeVisible();
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}
