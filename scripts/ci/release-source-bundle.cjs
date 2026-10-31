// Pinned public inputs only; this bundle is not proprietary Tobii corresponding source.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { digest } = require("./release-artifacts.cjs");

async function main() {
  const root = "release-evidence/upstream-source";
  fs.mkdirSync(root); // Fail rather than overwrite evidence from another attempt.
  const manifest = [];
  for (const [repo, sha] of [
    ["node-eyelog", "b1200c685fc11337e3eec1dda12045b2fdc99d3f"],
    ["EyeLog", "565dbbbb300925396a7adb5aa9d630fee32502b9"],
    ["EyeLog", "57559cd4178dfaa35d8d22649ba0ac4470dab5ab"]
  ]) {
    const url = `https://codeload.github.com/linkasu/${repo}/tar.gz/${sha}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    assert(response.ok, `source download failed: ${repo} HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      assert(size <= 64 * 1024 * 1024, "source archive exceeds bound");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    assert(bytes.length > 0, "empty source archive");
    const name = `${repo}-${sha}.tar.gz`;
    fs.writeFileSync(path.join(root, name), bytes, { flag: "wx" });
    const entries = execFileSync("tar", ["-tzf", path.join(root, name)], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    })
      .trim()
      .split("\n");
    assert(
      entries.length > 0 &&
        entries.every((entry) => !path.posix.isAbsolute(entry) && !entry.split("/").includes("..")),
      "unsafe archive member"
    );
    manifest.push({ repo: `linkasu/${repo}`, sha, url, name, size, sha256: digest(bytes) });
  }
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const documented = fs.readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
  for (const item of manifest)
    assert(documented.includes(item.sha), "source pin absent from notices");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
