import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Predictor } from "../../../../vendor/predictor/packages/electron/src/index";
import { TypingSession } from "../../services/typingSession";

const input = { text: "я хо", caret: 4, language: "ru" as const };
const directories: string[] = [];
const sessions: TypingSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

function directory() {
  const path = mkdtempSync(join(tmpdir(), "typing-process-"));
  directories.push(path);
  return path;
}

function session(executablePath: string, modelPath: string, timeoutMs = 5000) {
  const predictor = new Predictor({ executablePath, modelPath, timeoutMs });
  const value = new TypingSession(predictor);
  sessions.push(value);
  return { value, predictor };
}

describe("typing process lifecycle", () => {
  it.each(["missing", "corrupt"])(
    "reports %s model from the real Rust executable",
    async (kind) => {
      const modelPath = join(directory(), "model.lpk");
      if (kind === "corrupt") writeFileSync(modelPath, "not an LPK model");
      const { value } = session(resolve("predictor-resources/lp-electron"), modelPath);
      await expect(value.predict(1, input)).rejects.toMatchObject({
        code: kind === "missing" ? "MODEL_MISSING" : "MODEL_CORRUPT"
      });
      expect(await value.predict(2, { ...input, language: "en" })).toEqual([]);
    }
  );

  it("reports spawn failure without changing a draft", async () => {
    const { value } = session(
      join(directory(), "absent"),
      resolve("predictor-resources/model.lpk")
    );
    await expect(value.predict(1, input)).rejects.toMatchObject({ code: "SPAWN" });
    expect(input).toEqual({ text: "я хо", caret: 4, language: "ru" });
  });

  it.each(["timeout", "cancel", "supersede", "dispose", "exit", "protocol"])(
    "settles %s and reaps the child (test-only process fixture, not inference)",
    async (operation) => {
      const path = directory();
      const executable = join(path, "fixture");
      const pidPath = join(path, "pid");
      // A controllable child exercises transport failures; inference tests use Rust separately.
      writeFileSync(
        executable,
        `#!${process.execPath}\nconst fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
process.stdin.resume();
process.stdin.on('end', () => {
  ${operation === "exit" ? "process.exit(2);" : operation === "protocol" ? "process.stdout.write('bad-json');" : "setInterval(() => {}, 1000);"}
});\n`,
        { mode: 0o700 }
      );
      const { value, predictor } = session(executable, join(path, "unused"), 1000);
      const pending = value.predict(1, input).catch((error: unknown) => error);
      await vi.waitFor(() => expect(existsSync(pidPath)).toBe(true));
      const pid = Number(readFileSync(pidPath, "utf8"));
      if (operation === "cancel") value.cancel(1);
      if (operation === "supersede")
        expect(await value.predict(2, { ...input, language: "en" })).toEqual([]);
      if (operation === "dispose") await value.dispose();
      const codes = {
        timeout: "TIMEOUT",
        cancel: "CANCELLED",
        supersede: "CANCELLED",
        dispose: "CANCELLED",
        exit: "PROCESS",
        protocol: "PROTOCOL"
      };
      expect(await pending).toMatchObject({ code: codes[operation as keyof typeof codes] });
      expect(() => process.kill(pid, 0)).toThrow();
      if (operation === "dispose") {
        expect(predictor.state).toBe("disposed");
        await expect(value.predict(2, input)).rejects.toMatchObject({ code: "DISPOSED" });
      } else {
        expect(await value.predict(3, { ...input, language: "en" })).toEqual([]);
        expect(predictor.state).toBe("ready");
      }
    }
  );
});
