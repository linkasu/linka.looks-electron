import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, nativeImage } from "electron";
import { createImageFromText } from "../../src/electron/utils/ImageFromText";

// Exercise the production generator without booting unrelated hardware/services or Playwright CDP.
app.setPath("userData", process.env.TEXT_IMAGE_SMOKE_USER_DATA!);
app.disableHardwareAcceleration();
// Keep the harness alive between image windows; production still uses its normal app lifecycle.
app.on("window-all-closed", () => {});

async function smoke() {
  const texts = [
    "Привет",
    "Хочу пить",
    "Пожалуйста, помогите",
    "Мне нужна помощь, пожалуйста, подойдите ко мне",
    "Оченьдлинноерусскоесловобезпробелов".repeat(10),
    "Первая строка\r\n\r\nВторая строка",
    "Длинная фраза из нескольких русских слов ".repeat(30),
    "\"; throw new Error('injection'); // <script> & \\"
  ];
  const sizes = [undefined, { width: 512, height: 512 }, { width: 1536, height: 512 }];
  for (const [sizeIndex, size] of sizes.entries()) {
    for (const [textIndex, text] of texts.entries()) {
      const png = await createImageFromText(text, size);
      const image = nativeImage.createFromBuffer(png);
      const { width, height } = image.getSize();
      assert.equal(width, 1024);
      assert.equal(height, size?.width === 1536 ? 341 : 1024);
      const pixels = image.toBitmap();
      let left = width,
        right = 0,
        top = height,
        bottom = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          if (pixels[offset] < 128 && pixels[offset + 3] > 0) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      assert(right > left && bottom > top, "PNG must contain visible text");
      assert(left > 1 && top > 1 && right < width - 2 && bottom < height - 2, "Clipped text");
      writeFileSync(
        join(process.env.TEXT_IMAGE_SMOKE_OUTPUT!, `${sizeIndex}-${textIndex}.png`),
        png
      );
    }
  }
  for (const text of ["", " \r\n\t ", "я".repeat(10001)]) {
    await assert.rejects(() => createImageFromText(text));
  }
  await assert.rejects(() => createImageFromText("Текст", { width: 0, height: 512 }));
  console.log(
    `Text image smoke passed: ${sizes.length * texts.length} PNGs + input rejection checks (${process.platform}).`
  );
}

app
  .whenReady()
  .then(smoke)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
