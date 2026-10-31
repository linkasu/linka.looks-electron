import { app, BrowserWindow } from "electron";
import { layoutTextImage } from "@/common/textImageLayout";
import type { TextImageSize } from "@/common/textImageLayout";

export async function createImageFromText(
  text: string,
  size: TextImageSize = { width: 512, height: 512 }
): Promise<Buffer> {
  if (typeof text !== "string" || !text.trim()) throw new Error("Введите текст для картинки");
  if (text.length > 10000) throw new Error("Слишком длинный текст (максимум 10000 символов)");
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error("Некорректный размер картинки");
  }
  const longestSide = Math.max(size.width, size.height);
  const width = Math.max(1, Math.round((size.width / longestSide) * 1024));
  const height = Math.max(1, Math.round((size.height / longestSide) * 1024));
  await app.whenReady();

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  try {
    await win.loadURL("data:text/html;charset=utf-8,<html><body></body></html>");
    const dataUrl = (await win.webContents.executeJavaScript(
      `(() => {
        const canvas = document.createElement("canvas");
        canvas.width = ${width};
        canvas.height = ${height};
        const ctx = canvas.getContext("2d");
        const fontFamily = "'Segoe UI', Arial, sans-serif";
        function setFont(size) { ctx.font = "700 " + size + "px " + fontFamily; }
        const layout = (${layoutTextImage.toString()})(
          ${JSON.stringify(text.trim())}, canvas.width, canvas.height,
          (text, size) => {
            setFont(size);
            const metrics = ctx.measureText(text);
            return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
          }
        );
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#111111";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        setFont(layout.fontSize);
        const startY = canvas.height / 2 - (layout.lines.length - 1) * layout.lineHeight / 2;
        layout.lines.forEach((line, index) =>
          ctx.fillText(line, canvas.width / 2, startY + index * layout.lineHeight)
        );
        return canvas.toDataURL("image/png");
      })()`
    )) as string;
    const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match) throw new Error("Не удалось создать PNG из текста");
    return Buffer.from(match[1], "base64");
  } finally {
    win.destroy();
  }
}
