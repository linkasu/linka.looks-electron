export interface TextImageSize {
  width: number;
  height: number;
}

/** Self-contained: also serialized into the sandboxed image-generation window. */
export function layoutTextImage(
  text: string,
  width: number,
  height: number,
  measure: (text: string, fontSize: number) => number
) {
  const padding = Math.min(width, height) * 0.04;
  const maxWidth = width - padding * 2;
  const maxHeight = height - padding * 2;

  const lines = text.split(/\r\n?|\n/);
  let high = Math.floor(maxHeight / (lines.length * 1.2));
  let low = 1;
  let result: { fontSize: number; lines: string[]; lineHeight: number; padding: number } | null =
    null;
  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    const lineHeight = fontSize * 1.2;
    if (
      lines.length * lineHeight <= maxHeight &&
      lines.every((line) => measure(line, fontSize) <= maxWidth)
    ) {
      result = { fontSize, lines, lineHeight, padding };
      low = fontSize + 1;
    } else {
      high = fontSize - 1;
    }
  }
  if (!result) throw new Error("Текст не помещается в картинку. Сократите текст.");
  return result;
}
