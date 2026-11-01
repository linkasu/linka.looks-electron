import { DEFAULT_COLORS } from "@/frontend/plugins/visualDefaults";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return rgb.reduce(
    (sum, value, index) =>
      sum +
      (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
        [0.2126, 0.7152, 0.0722][index],
    0
  );
}

function contrast(first: string, second: string) {
  const [dark, light] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (light + 0.05) / (dark + 0.05);
}

describe("calm visual defaults", () => {
  it("keeps text and functional boundaries readable on the standard surfaces", () => {
    expect(contrast(DEFAULT_COLORS.primary, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#243431", "#F6F7F4")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#536761", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DEFAULT_COLORS.secondary, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    expect(contrast(DEFAULT_COLORS.secondary, "#F6F7F4")).toBeGreaterThanOrEqual(3);
  });
});
