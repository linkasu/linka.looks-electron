import { randomUUID } from "node:crypto";
import { readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DEFAULT_BUBBLE_PREFERENCES,
  validPreferencePatch,
  type BubblePreferences
} from "../../common/bubble/contract";

export class BubblePreferencesStore {
  constructor(
    private readonly file: string,
    private readonly legacyFile?: string
  ) {}

  async load(): Promise<BubblePreferences> {
    try {
      const text = await readFile(this.file, "utf8");
      if (Buffer.byteLength(text) > 16384) throw new Error("INVALID_SETTINGS");
      const saved = JSON.parse(text);
      if (
        saved?.schema !== 1 ||
        !validPreferencePatch(saved.preferences) ||
        Object.keys(saved.preferences).length !== 4
      )
        throw new Error("INVALID_SETTINGS");
      return { ...saved.preferences };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("SETTINGS_UNREADABLE", { cause: error });
    }
    const preferences = { ...DEFAULT_BUBBLE_PREFERENCES };
    if (this.legacyFile) {
      try {
        const legacy = JSON.parse(await readFile(this.legacyFile, "utf8"));
        for (const [old, key] of [
          ["Diameter", "diameter"],
          ["Brightness", "brightness"],
          ["Smoothness", "smoothness"]
        ] as const) {
          const patch = { [key]: legacy[old] };
          if (validPreferencePatch(patch)) Object.assign(preferences, patch);
        }
      } catch {
        /* An optional legacy file must never prevent a safe first launch. */
      }
    }
    return preferences;
  }

  async save(preferences: BubblePreferences): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = join(dirname(this.file), `.bubble-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ schema: 1, preferences }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.file);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
