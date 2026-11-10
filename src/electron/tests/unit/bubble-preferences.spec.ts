import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BubblePreferencesStore } from "../../bubble/preferences";
import { DEFAULT_BUBBLE_PREFERENCES } from "../../../common/bubble/contract";

describe("Bubble preference file", () => {
  const folders: string[] = [];
  afterEach(async () => {
    await Promise.all(
      folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
    );
  });
  async function setup() {
    const folder = await mkdtemp(join(tmpdir(), "bubble-settings-"));
    folders.push(folder);
    return { file: join(folder, "settings.json"), legacy: join(folder, "legacy.json") };
  }
  it("imports appearance but never turns on the new feature or modifies standalone settings", async () => {
    const { file, legacy } = await setup();
    const original = JSON.stringify({
      Visible: true,
      Diameter: 60,
      Brightness: 80,
      Smoothness: 20
    });
    await writeFile(legacy, original);
    const store = new BubblePreferencesStore(file, legacy);
    const preferences = await store.load();
    expect(preferences).toEqual({ enabled: false, diameter: 60, brightness: 80, smoothness: 20 });
    await store.save(preferences);
    expect(await store.load()).toEqual(preferences);
    expect(await readFile(legacy, "utf8")).toBe(original);
  });
  it("preserves malformed and future files rather than clearing them", async () => {
    const { file } = await setup();
    for (const contents of [
      "broken",
      JSON.stringify({ schema: 2, preferences: DEFAULT_BUBBLE_PREFERENCES })
    ]) {
      await writeFile(file, contents);
      await expect(new BubblePreferencesStore(file).load()).rejects.toThrow("SETTINGS_UNREADABLE");
      expect(await readFile(file, "utf8")).toBe(contents);
    }
  });
});
