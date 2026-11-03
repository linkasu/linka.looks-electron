import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  validateDataset,
  verifySeal,
  verifySplitSeparation,
  evaluateCandidateOutput
} from "./predictor-evaluation.mjs";

const encode = (rows) => Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
const row = (overrides = {}) => ({
  group: "fixture-001",
  intent: "fixture-need",
  domain: "fixture",
  text: "верните коврик",
  source: "FIRST_PARTY_PROJECT_AUTHORED_SYNTHETIC",
  ...overrides
});
const digest = (data) => createHash("sha256").update(data).digest("hex");

test("counts semantic groups, not paraphrase rows; accepts NFC UTF-8", () => {
  const data = encode([row(), row({ text: "коврик нужен обратно" })]);
  assert.equal(validateDataset(data, 1).groups, 1);
  assert.throws(() => validateDataset(data, 2), /groups/);
});

test("rejects duplicate IDs across intents, near-duplicates and source laundering", () => {
  assert.throws(() => validateDataset(encode([row(), row({ intent: "other" })]), 1));
  assert.throws(() =>
    validateDataset(encode([row(), row({ group: "fixture-002", text: "Верните, коврик!" })]), 1)
  );
  for (const source of ["TATOEBA", "WIKIPEDIA", "PREVIOUS_RESERVED", "CHAT", "UNKNOWN"]) {
    assert.throws(() => validateDataset(encode([row({ source })]), 1), /source/);
  }
  assert.throws(() => validateDataset(encode([row({ text: "е\u0308жик" })]), 1), /NFC/);
  assert.throws(() => validateDataset(Buffer.from([0xff]), 1));
  assert.throws(
    () => validateDataset(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encode([row()])]), 1),
    /BOM/
  );
});

test("DEV and FINAL cannot share normalized text or group/intent IDs", () => {
  const final = encode([row()]);
  const dev = row({ group: "dev-001", intent: "dev-intent", text: "бумага прозрачная" });
  verifySplitSeparation(final, encode([dev]));
  for (const overlap of [
    { text: "Верните коврик!" },
    { group: row().group },
    { intent: row().intent }
  ]) {
    assert.throws(() => verifySplitSeparation(final, encode([{ ...dev, ...overlap }])), /overlap/);
  }
});

test("seal rejects changed content, proxy final, insufficient groups and wrong split", () => {
  const data = encode([row()]);
  const manifest = {
    schema: "linka-evaluation-seal-v1",
    split: "FINAL",
    source: "FIRST_PARTY_PROJECT_AUTHORED_SYNTHETIC",
    license: "CC0-1.0",
    synthetic: true,
    clinicalAAC: false,
    proxy: false,
    minGroups: 500,
    rows: 1,
    groups: 1,
    sha256: digest(data)
  };
  assert.throws(() => verifySeal(data, manifest), /groups/);
  assert.throws(() => verifySeal(data, { ...manifest, proxy: true }), /proxy/);
  assert.throws(() => verifySeal(data, { ...manifest, split: "DEV" }), /FINAL/);
  assert.throws(() => verifySeal(Buffer.concat([data, Buffer.from(" ")]), manifest), /hash/);
});

test("accepts a complete seal (generated contract fixture, NOT evaluation data)", () => {
  const alphabet = Array.from("абвгдежзийклмнопрстуфхцчшщэюя");
  const data = encode(
    Array.from({ length: 500 }, (_, index) =>
      row({
        group: `fixture-${index}`,
        intent: `intent-${index}`,
        text: `проверка ${alphabet[Math.floor(index / alphabet.length)]}${alphabet[index % alphabet.length]}`
      })
    )
  );
  assert.equal(
    verifySeal(data, {
      schema: "linka-evaluation-seal-v1",
      split: "FINAL",
      source: row().source,
      license: "CC0-1.0",
      synthetic: true,
      clinicalAAC: false,
      proxy: false,
      minGroups: 500,
      groups: 500,
      rows: 500,
      sha256: digest(data)
    }).groups,
    500
  );
});

test("adapter executes actual app filtering, exact context, suffix, codepoint caret and Undo", async () => {
  const input = { text: "😀 я  хо хвост", caret: "😀 я  хо".length, language: "ru" };
  const result = {
    input,
    pos: -5,
    endOfWord: true,
    text: ["я хочу", "я  хочу", "я  хорошего", "я  хотел", "я  ходить"]
  };
  const edits = await evaluateCandidateOutput(input, result);
  assert.deepEqual(
    edits.map((edit) => edit.word),
    ["хочу", "хорошего", "хотел"]
  );
  assert.equal(edits[0].draft.text, "😀 я  хочу хвост");
  assert.equal(edits[0].draft.caret, Array.from("😀 я  хочу ").length);
  const middle = { text: "хорать", caret: 2, language: "ru" };
  assert.equal(
    (
      await evaluateCandidateOutput(middle, {
        input: middle,
        pos: -2,
        endOfWord: true,
        text: ["иг"]
      })
    )[0].draft.text,
    "играть"
  );
  const end = { text: "гру", caret: 3, language: "ru" };
  assert.equal(
    (
      await evaluateCandidateOutput(end, {
        input: end,
        pos: -3,
        endOfWord: true,
        text: ["груша"]
      })
    )[0].draft.text,
    "груша "
  );
});

test("adapter rejects stale, malformed and oversized core outputs", async () => {
  const input = { text: "гру", caret: 3, language: "ru" };
  const result = { input, pos: -3, endOfWord: true, text: ["груша"] };
  await assert.rejects(
    evaluateCandidateOutput(input, { ...result, input: { ...input, caret: 2 } })
  );
  await assert.rejects(evaluateCandidateOutput(input, { ...result, text: Array(6).fill("груша") }));
  await assert.rejects(evaluateCandidateOutput(input, { ...result, pos: -4 }));
  const oversizedUtf8 = { text: "я".repeat(8193), caret: 8193, language: "ru" };
  await assert.rejects(
    evaluateCandidateOutput(oversizedUtf8, {
      input: oversizedUtf8,
      pos: 0,
      endOfWord: false,
      text: []
    })
  );
});

test("completed word may advance caret without adding history or undoing an unrelated edit", async () => {
  const input = { text: "груша рядом", caret: 5, language: "ru" };
  const edits = await evaluateCandidateOutput(input, {
    input,
    pos: -5,
    endOfWord: true,
    text: ["груша"]
  });
  assert.deepEqual(edits, [{ word: "груша", draft: { text: input.text, caret: 6 } }]);
});
