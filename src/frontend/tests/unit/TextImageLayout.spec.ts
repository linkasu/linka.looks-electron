import { layoutTextImage } from "@/common/textImageLayout";

const measure = (text: string, size: number) => Array.from(text).length * size * 0.6;

describe("text image layout", () => {
  for (const [width, height] of [
    [512, 512],
    [1536, 512],
    [512, 1024]
  ]) {
    for (const text of [
      "Привет",
      "Хочу пить",
      "Мне нужна помощь, пожалуйста, подойдите ко мне".repeat(20),
      "Оченьдлинноерусскоесловобезпробелов".repeat(10),
      "Первая строка\r\n\r\nВторая строка",
      "😀🧑🏽‍🦽 Привет <script> & кавычки \" ' \\",
      "Я ".repeat(5000)
    ]) {
      it(`fits ${JSON.stringify(text.slice(0, 35))} into ${width}×${height}`, () => {
        const layout = layoutTextImage(text, width, height, measure);
        expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(
          height - layout.padding * 2
        );
        for (const line of layout.lines) {
          expect(measure(line, layout.fontSize)).toBeLessThanOrEqual(width - layout.padding * 2);
        }
        expect(layout.lines.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
      });
    }
  }

  it("keeps ordinary words intact and uses wide-card space for larger text", () => {
    const square = layoutTextImage("Хочу пить", 512, 512, measure);
    const wide = layoutTextImage("Хочу пить", 1536, 512, measure);
    expect(square.lines).toEqual(["Хочу", "пить"]);
    expect(wide.fontSize).toBeGreaterThan(square.fontSize);
    expect(wide.lines).toEqual(["Хочу пить"]);
  });

  it("preserves explicit paragraph breaks", () => {
    expect(layoutTextImage("Да\n\nНет", 512, 512, measure).lines).toEqual(["Да", "", "Нет"]);
  });

  it("does not split ordinary words or detach their punctuation", () => {
    const text = "Пожалуйста, помогите";
    const layout = layoutTextImage(text, 1024, 1024, measure);
    expect(layout.lines.flatMap((line) => line.split(" "))).toEqual(text.split(" "));
  });

  it("rejects text that cannot fit rather than clipping it", () => {
    expect(() => layoutTextImage("Текст", 1, 1, measure)).toThrow("не помещается");
  });
});
