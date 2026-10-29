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

  function wrap(fontSize: number): string[] {
    return text.split(/\r\n?|\n/).flatMap((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate, fontSize) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const char of word) {
          if (line && measure(line + char, fontSize) > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      lines.push(line);
      return lines;
    });
  }

  const widestWord = Math.max(...text.split(/\s+/).map((word) => measure(word, 1)));
  // Prefer whole words; very long words may wrap instead of shrinking the entire phrase.
  let high = Math.floor(Math.min(maxHeight / 1.2, Math.max(maxHeight / 4, maxWidth / widestWord)));
  let low = 1;
  let result: { fontSize: number; lines: string[]; lineHeight: number; padding: number } | null =
    null;
  while (low <= high) {
    const fontSize = Math.floor((low + high) / 2);
    const lines = wrap(fontSize);
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
