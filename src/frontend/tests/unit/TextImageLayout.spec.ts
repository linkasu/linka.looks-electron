import { layoutTextImage } from "@/common/textImageLayout";

const measure = (text: string, size: number) => Array.from(text).length * size * 0.6;

describe("text image layout", () => {
  it("shrinks a phrase instead of adding line breaks", () => {
    const text = "Мне нужна помощь, пожалуйста, подойдите ко мне";
    const layout = layoutTextImage(text, 512, 512, measure);
    expect(layout.lines).toEqual([text]);
  });
  for (const [width, height] of [
    [512, 512],
    [1536, 512],
    [512, 1024]
  ]) {
    for (const text of [
      "Привет",
      "Хочу пить",
      "Мне нужна помощь, пожалуйста, подойдите ко мне".repeat(10),
      "Оченьдлинноерусскоесловобезпробелов".repeat(10),
      "Первая строка\r\n\r\nВторая строка",
      "😀🧑🏽‍🦽 Привет <script> & кавычки \" ' \\",
      "Хочу  пить\tпожалуйста"
    ]) {
      it(`fits ${JSON.stringify(text.slice(0, 35))} into ${width}×${height}`, () => {
        const layout = layoutTextImage(text, width, height, measure);
        expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(
          height - layout.padding * 2
        );
        for (const line of layout.lines) {
          expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(width - layout.padding * 2);
        }
        expect(layout.lines).toEqual(text.split(/\r\n?|\n/));
      });
    }
  }
  it("uses a larger font on a wide card without wrapping on a square card", () => {
    const square = layoutTextImage("Хочу пить", 512, 512, measure);
    const wide = layoutTextImage("Хочу пить", 1536, 512, measure);
    expect(square.lines).toEqual(["Хочу пить"]);
    expect(wide.fontSize).toBeGreaterThan(square.fontSize);
    expect(wide.lines).toEqual(["Хочу пить"]);
  });
  it("preserves explicit paragraph breaks", () => {
    expect(layoutTextImage("Да\r\n\rНет\n", 512, 512, measure).lines).toEqual([
      "Да",
      "",
      "Нет",
      ""
    ]);
  });
  it("keeps the existing font size for a short word that already fits", () => {
    expect(layoutTextImage("Привет", 512, 512, measure).fontSize).toBe(130);
  });
  it("chooses the largest font that fits the whole phrase", () => {
    const text = "Пожалуйста, помогите";
    const layout = layoutTextImage(text, 512, 512, measure);
    expect(measure(text, layout.fontSize + 1)).toBeGreaterThan(512 - layout.padding * 2);
  });
  it("rejects text too long for the minimum font instead of wrapping or clipping it", () => {
    expect(() => layoutTextImage("Я ".repeat(5000), 512, 512, measure)).toThrow("не помещается");
  });
  it("rejects text that cannot fit instead of clipping it", () => {
    expect(() => layoutTextImage("Текст", 1, 1, measure)).toThrow("не помещается");
  });
});
