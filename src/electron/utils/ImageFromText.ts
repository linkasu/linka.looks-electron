import { join } from "path";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { app, BrowserWindow } from "electron";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";

const BIN = resolveExtraResource("ImageGenerator.exe");
const IMAGE_SIZE = 512;

export async function createImageFromText (text: string):Promise<Buffer> {
  if (process.platform === "darwin") {
    return createMacOSImageFromText(text);
  }
  if (process.platform !== "win32") {
    throw new Error("Создание картинки из текста поддерживается только на Windows и macOS");
  }

  return createWindowsImageFromText(text);
}

function createWindowsImageFromText (text: string): Promise<Buffer> {
  if (!existsSync(BIN)) {
    throw new Error("Не найден ImageGenerator.exe");
  }

  return new Promise((resolve, reject) => {
    const file = join(tmpdir(), uuid() + ".png");
    execFile(BIN, [file, text], async (err) => {
      if (err) {
        console.error(err);

        return reject(err);
      }

      try {
        const buffer = await readFile(file);
        await unlink(file).catch((error) => console.warn("Failed to remove generated image:", error));
        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function createMacOSImageFromText (text: string): Promise<Buffer> {
  await app.whenReady();

  const win = new BrowserWindow({
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createCanvasDocument())}`);
    const dataUrl = await win.webContents.executeJavaScript(createCanvasScript(text), true) as string;
    const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match) {
      throw new Error("Не удалось создать PNG из текста");
    }

    return Buffer.from(match[1], "base64");
  } finally {
    win.destroy();
  }
}

function createCanvasDocument (): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;overflow:hidden;background:transparent">
    <canvas id="canvas" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}"></canvas>
  </body>
</html>`;
}

function createCanvasScript (text: string): string {
  return `(() => {
    const text = ${JSON.stringify(text)}.trim() || " ";
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const size = ${IMAGE_SIZE};
    const padding = 42;
    const maxWidth = size - padding * 2;
    const maxHeight = size - padding * 2;
    const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

    function setFont(fontSize) {
      ctx.font = "700 " + fontSize + "px " + fontFamily;
    }

    function splitLongWord(word, maxWidth) {
      const parts = [];
      let part = "";
      for (const char of word) {
        const candidate = part + char;
        if (part && ctx.measureText(candidate).width > maxWidth) {
          parts.push(part);
          part = char;
        } else {
          part = candidate;
        }
      }
      if (part) parts.push(part);
      return parts;
    }

    function wrapParagraph(paragraph, maxWidth) {
      const words = paragraph.split(/\\s+/).filter(Boolean);
      const lines = [];
      let line = "";

      for (const word of words) {
        const candidate = line ? line + " " + word : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        if (ctx.measureText(word).width <= maxWidth) {
          line = word;
        } else {
          const parts = splitLongWord(word, maxWidth);
          lines.push(...parts.slice(0, -1));
          line = parts[parts.length - 1] || "";
        }
      }

      if (line) lines.push(line);
      return lines.length ? lines : [""];
    }

    function wrapText(fontSize) {
      setFont(fontSize);
      return text.split(/\\r?\\n/).flatMap((paragraph) => wrapParagraph(paragraph, maxWidth));
    }

    let fontSize = 96;
    let lines = wrapText(fontSize);
    while (fontSize > 24) {
      const lineHeight = fontSize * 1.18;
      const textHeight = lines.length * lineHeight;
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
      if (textHeight <= maxHeight && widest <= maxWidth) break;
      fontSize -= 4;
      lines = wrapText(fontSize);
    }

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(fontSize);

    const lineHeight = fontSize * 1.18;
    const startY = size / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => ctx.fillText(line, size / 2, startY + index * lineHeight));

    return canvas.toDataURL("image/png");
  })()`;
}
