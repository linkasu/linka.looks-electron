import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const validator = new URL("./validate-acceptance-target.mjs", import.meta.url);

test("dispatch accepts only exact commits in this repository's main history", () => {
  const cwd = mkdtempSync(join(tmpdir(), "acceptance-target-"));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "Acceptance test");
    git("config", "user.email", "acceptance@example.invalid");
    git("remote", "add", "origin", "https://github.com/linkasu/linka.looks-electron");
    git("commit", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD");
    git("commit", "--allow-empty", "-m", "main");
    const main = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", main);
    git("checkout", "-b", "side", base);
    git("commit", "--allow-empty", "-m", "side");
    const side = git("rev-parse", "HEAD");
    const run = (sha, overrides = {}) =>
      spawnSync(process.execPath, [validator.pathname], {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "linkasu/linka.looks-electron",
          GITHUB_REF: "refs/heads/main",
          ACCEPTANCE_SHA: sha,
          ...overrides
        }
      });
    for (const sha of [base, main, main.toUpperCase()]) {
      const result = run(sha);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), sha.toLowerCase());
    }
    for (const sha of [
      "",
      "main",
      base.slice(0, 12),
      `${base}\n`,
      "g".repeat(40),
      "0".repeat(40),
      side,
      git("rev-parse", "HEAD^{tree}"),
      "$(touch /tmp/acceptance-injection)"
    ]) {
      assert.notEqual(run(sha).status, 0, `accepted ${JSON.stringify(sha)}`);
    }
    assert.notEqual(run(main, { GITHUB_REPOSITORY: "other/repo" }).status, 0);
    assert.notEqual(run(main, { GITHUB_REF: "refs/heads/side" }).status, 0);
    git("remote", "set-url", "origin", "https://github.com/other/repo");
    assert.notEqual(run(main).status, 0);
    git("remote", "set-url", "origin", "https://github.com/linkasu/linka.looks-electron.git");
    assert.equal(run(main).status, 0);
    git("update-ref", "-d", "refs/remotes/origin/main");
    assert.notEqual(run(main).status, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
