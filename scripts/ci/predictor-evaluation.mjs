// Offline contract checks only. This module never starts a predictor or reads training data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = "FIRST_PARTY_PROJECT_AUTHORED_SYNTHETIC";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalized = (text) =>
  text
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const bindingPaths = [
  "docs/model-400-evaluation.md",
  "scripts/ci/predictor-evaluation.mjs",
  "scripts/ci/predictor-evaluation.test.mjs",
  "scripts/ci/predictor-evaluation-ui.mjs",
  "scripts/ci/predictor-evaluation-ui.test.mjs",
  "scripts/ci/predictor-evaluation-runner.mjs",
  "scripts/ci/predictor-evaluation-runner.test.mjs",
  "vendor/predictor/packages/electron/src/index.ts",
  "vendor/predictor/docs/electron-api.md",
  "src/electron/services/typingSession.ts",
  "src/frontend/utils/eyeTyping.ts"
];

export function validateDataset(bytes, minGroups) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert(Buffer.from(text).equals(bytes), "UTF-8 must have no BOM or replacement decoding");
  assert.equal(text, text.normalize("NFC"), "NFC required");
  assert(text.endsWith("\n"), "JSONL must end with newline");
  const rows = text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  const groups = new Map();
  const intents = new Map();
  const sentences = new Set();
  const lengths = { short: 0, medium: 0, long: 0 };
  let yo = 0;
  let negation = 0;
  const domains = new Map();
  for (const row of rows) {
    assert.equal(row.source, source, "unapproved source");
    for (const key of ["group", "intent", "domain", "text"]) {
      assert(
        typeof row[key] === "string" && row[key].trim() === row[key] && row[key],
        `invalid ${key}`
      );
    }
    assert(/^[a-z0-9-]+$/.test(row.group), "invalid group ID");
    assert(/^[а-яё ,.!?;:—«»-]+$/iu.test(row.text), "only generic RU prose; no identifiers/digits");
    assert.equal(groups.get(row.group) ?? row.intent, row.intent, "group has multiple intents");
    assert.equal(intents.get(row.intent) ?? row.group, row.group, "intent split across groups");
    groups.set(row.group, row.intent);
    intents.set(row.intent, row.group);
    const key = normalized(row.text);
    assert(!sentences.has(key), "duplicate/near-duplicate text (case, punctuation, ё folded)");
    sentences.add(key);
    const words = row.text.match(/[а-яё]+/giu).length;
    lengths[words <= 3 ? "short" : words <= 8 ? "medium" : "long"]++;
    if (/ё/iu.test(row.text)) yo++;
    if (/(?:^|\s)(?:не|нет|нельзя|без|никогда|ничего)(?:\s|[,.!?]|$)/iu.test(row.text)) negation++;
    domains.set(row.domain, (domains.get(row.domain) ?? 0) + 1);
  }
  assert(groups.size >= minGroups, `insufficient semantic groups: ${groups.size} < ${minGroups}`);
  return {
    rows: rows.length,
    groups: groups.size,
    domains: Object.fromEntries(domains),
    lengths,
    yo,
    negation
  };
}

export function verifySplitSeparation(finalBytes, devBytes) {
  const parse = (bytes) => bytes.toString("utf8").trimEnd().split("\n").map(JSON.parse);
  const final = parse(finalBytes);
  const finalText = new Set(final.map((row) => normalized(row.text)));
  const finalGroups = new Set(final.map((row) => row.group));
  const finalIntents = new Set(final.map((row) => row.intent));
  for (const row of parse(devBytes)) {
    assert(!finalText.has(normalized(row.text)), "DEV/FINAL normalized text overlap");
    assert(!finalGroups.has(row.group), "DEV/FINAL group overlap");
    assert(!finalIntents.has(row.intent), "DEV/FINAL intent overlap");
  }
}

export function verifySealMetadata(manifest) {
  assert.equal(manifest.schema, "linka-evaluation-seal-v1");
  assert.equal(manifest.split, "FINAL", "not FINAL");
  assert.equal(manifest.source, source, "unapproved source");
  assert.equal(manifest.license, "CC0-1.0");
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.clinicalAAC, false);
  assert.equal(manifest.proxy, false, "proxy cannot be FINAL");
}

export function verifySeal(bytes, manifest) {
  verifySealMetadata(manifest);
  assert.equal(hash(bytes), manifest.sha256, "dataset hash mismatch");
  assert.equal(manifest.minGroups, 500, "FINAL minimum fixed at 500 groups");
  const stats = validateDataset(bytes, 500);
  assert.equal(stats.groups, manifest.groups);
  assert.equal(stats.rows, manifest.rows);
  return stats;
}

export async function verifyAppBindings(manifest) {
  assert.deepEqual(Object.keys(manifest.bindings).sort(), [...bindingPaths].sort());
  for (const relative of bindingPaths) {
    assert.equal(
      hash(await readFile(new URL(`../../${relative}`, import.meta.url))),
      manifest.bindings[relative],
      "app tooling binding mismatch"
    );
  }
}

// Transpile the exact checked-out UI classes, rather than maintaining a second filter.
// TypeScript is an existing dev dependency; no app dependency or predictor process is added.
async function loadAdapter() {
  const compile = async (relative, imports = []) => {
    const file = new URL(relative, import.meta.url);
    let js = ts.transpileModule(await readFile(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    for (const [from, to] of imports) js = js.replace(JSON.stringify(from), JSON.stringify(to));
    return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  };
  const library = await compile("../../vendor/predictor/packages/electron/src/index.ts");
  const session = await compile("../../src/electron/services/typingSession.ts", [
    ["../../../vendor/predictor/packages/electron/src/index", library]
  ]);
  const keyboard = await compile("../../src/frontend/utils/eyeTyping.ts");
  return {
    ...(await import(session)),
    ...(await import(keyboard)),
    ...(await import(library))
  };
}
let adapter;

export async function evaluateCandidateOutput(input, result) {
  const { TypingSession, EyeTyping, applySuggestion } = await (adapter ??= loadAdapter());
  // Validate even outputs with no applicable prefix; malformed replies must not disappear as misses.
  assert(Array.isArray(result.text) && result.text.length <= 5, "core limit is 5");
  if (result.text.length) applySuggestion(input, result, 0);
  else applySuggestion(input, { ...result, text: [""] }, 0);
  const session = new TypingSession({ predict: async () => result });
  const edits = await session.predict(1, input);
  assert(edits.length <= 3, "app limit is 3");
  for (const edit of edits) {
    const before = { text: input.text, caret: Array.from(input.text.slice(0, input.caret)).length };
    const keyboard = new EyeTyping();
    keyboard.insert(input.text);
    keyboard.move(before.caret);
    const history = structuredClone(keyboard.history);
    keyboard.accept(edit.draft);
    assert.deepEqual(keyboard.draft, edit.draft);
    if (edit.draft.text !== before.text) {
      assert.equal(
        keyboard.history.length,
        history.length + 1,
        "text edit needs one history entry"
      );
      keyboard.undo();
      assert.deepEqual(keyboard.draft, before, "text edit/Undo must be atomic");
    }
    // A caret-only acceptance is navigation, not an edit: do not Undo an unrelated prior edit.
    assert.deepEqual(keyboard.history, history, "accept must preserve unrelated history");
  }
  return edits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(
      process.argv.length,
      4,
      "usage: node predictor-evaluation.mjs FINAL.jsonl manifest.json"
    );
    const bytes = await readFile(process.argv[2]);
    const manifest = JSON.parse(await readFile(process.argv[3], "utf8"));
    const stats = verifySeal(bytes, manifest);
    assert.deepEqual(stats, manifest.statistics, "strata/count seal mismatch");
    await verifyAppBindings(manifest);
    const dev = await readFile(new URL("DEV.jsonl", pathToFileURL(process.argv[3])));
    assert.equal(hash(dev), manifest.dev.sha256, "DEV hash mismatch");
    assert.deepEqual(validateDataset(dev, manifest.dev.groups), manifest.dev.statistics);
    verifySplitSeparation(bytes, dev);
    console.log(
      JSON.stringify({
        status: "SEALED_NOT_QUALITY_EVALUATED",
        manifestSha256: hash(await readFile(process.argv[3])),
        ...stats
      })
    );
  } catch {
    // Parser/assertion details can contain private FINAL text. Never print them.
    console.error(
      "Evaluation contract BLOCKED: invalid arguments, content, split or seal; curator-only diagnosis required"
    );
    process.exitCode = 1;
  }
}
