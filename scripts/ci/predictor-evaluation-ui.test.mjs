import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateRows,
  summarizeGroups,
  bootstrapUI,
  qualifiesUI,
  recommendDev
} from "./predictor-evaluation-ui.mjs";

test("UI_KSR_V1 averages paraphrase counts within group, then uses ratio, not phrase mean", () => {
  const summary = summarizeGroups(
    [
      { group: "a", manual: 2, candidate: 1, frequency: 2 },
      { group: "a", manual: 6, candidate: 3, frequency: 6 },
      { group: "b", manual: 12, candidate: 2, frequency: 6 }
    ],
    { a: "a", b: "b" }
  );
  assert.equal(summary.manual, 16);
  assert.equal(summary.candidate, 4);
  assert.equal(summary.ksr, 0.75);
  assert.equal(summary.frequencyKsr, 0.375);
  assert.equal(summary.delta, 0.375);
});

test("paired component bootstrap is deterministic, fixed seed40003, ratio in every draw", () => {
  const groups = [
    { manual: 4, candidate: 2, frequency: 4 },
    { manual: 12, candidate: 2, frequency: 6 }
  ];
  const result = bootstrapUI(groups);
  assert.deepEqual(result, bootstrapUI(groups));
  assert.deepEqual(result.ksrCI, [0.5, 5 / 6]);
  assert.deepEqual(result.deltaCI, [1 / 3, 0.5]);
  assert.throws(() => bootstrapUI([]));
});

test("seed40003 percentile endpoints agree with independent Python integer/RNG fixture", () => {
  const values = [
    [13, 3, 9],
    [17, 11, 12],
    [23, 5, 17],
    [29, 18, 19],
    [31, 7, 21],
    [41, 13, 31],
    [47, 27, 28]
  ];
  assert.deepEqual(
    bootstrapUI(values.map(([manual, candidate, frequency]) => ({ manual, candidate, frequency }))),
    {
      ksrCI: [0.4514285714285714, 0.7192118226600985],
      deltaCI: [0.1005586592178771, 0.43147208121827413]
    }
  );
});

test("apriori quality boundaries: positive manual CI, nonregression, strict contextual win", () => {
  const interval = (ksr, delta) => ({ ksrCI: [ksr, 0.9], deltaCI: [delta, 0.3] });
  assert.equal(qualifiesUI(interval(0, 0.1), "general"), false);
  assert.equal(qualifiesUI(interval(0.1, -0.01), "general"), false);
  assert.equal(qualifiesUI(interval(0.1, 0), "general"), true);
  assert.equal(qualifiesUI(interval(0.1, 0), "contextual"), false);
  assert.equal(qualifiesUI(interval(0.1, 0.01), "contextual"), true);
  assert.throws(() => qualifiesUI(interval(0.1, 0.01), "choose-after-final"));
});

test("DEV defaults to U for absent/uncertain T; T requires positive paired CI and size fit", () => {
  assert.equal(recommendDev(null, 0), "U");
  assert.equal(recommendDev([-0.1, 0.2], 100), "U");
  assert.equal(recommendDev([0, 0.2], 100), "U");
  assert.equal(recommendDev([0.01, 0.2], 128 * 1024 * 1024 + 1), "U");
  assert.equal(recommendDev([0.01, 0.2], 100), "T");
});

test("manual-only simulation remains zero and does not invent quality", async () => {
  const rows = [{ group: "a", text: "тест" }];
  const empty = async (input) => ({ input, text: [], pos: 0, endOfWord: false });
  const result = await evaluateRows(rows, empty, empty);
  assert.equal(result.counts[0].manual, 5);
  assert.equal(result.counts[0].candidate, 5);
  assert.equal(result.counts[0].frequency, 5);
  assert(result.safety.candidate.probes > 0);
});

test("simulation applies real UI space policy and selection cost, not raw-core savings", async () => {
  const rows = [{ group: "a", text: "груша" }];
  const predictor = async (input) => ({
    input,
    text: ["груша"],
    pos: -input.caret,
    endOfWord: true
  });
  const empty = async (input) => ({ input, text: [], pos: 0, endOfWord: false });
  const result = await evaluateRows(rows, predictor, empty);
  assert.equal(result.counts[0].manual, 6);
  assert.equal(result.counts[0].candidate, 2);
  assert.equal(result.counts[0].frequency, 6);
});

test("composition sends only already typed prefix; app extra space before !/? is never ignored for free", async () => {
  for (const text of ["груша!", "груша?"]) {
    const seen = [];
    const predictor = async (input) => {
      seen.push({ ...input });
      return { input, text: ["груша"], pos: -input.caret, endOfWord: true };
    };
    const empty = async (input) => ({ input, text: [], pos: 0, endOfWord: false });
    const result = await evaluateRows([{ group: "fixture", text }], predictor, empty);
    const target = text + " ";
    const composition = seen.slice(0, Array.from(target).length);
    assert.deepEqual(
      composition.map((input) => input.text),
      Array.from({ length: target.length }, (_, i) => target.slice(0, i))
    );
    assert(composition.every((input) => input.caret === input.text.length));
    assert.equal(result.counts[0].candidate, target.length);
    assert.equal(result.diagnostics.candidate.selections, 0);
  }
});

test("uppercase target does not match lowercase actual draft through invented case restoration", async () => {
  const predictor = async (input) => ({
    input,
    text: ["груша"],
    pos: -input.caret,
    endOfWord: true
  });
  const empty = async (input) => ({ input, text: [], pos: 0, endOfWord: false });
  const result = await evaluateRows([{ group: "fixture", text: "Груша" }], predictor, empty);
  assert.equal(result.counts[0].candidate, 6);
  assert.equal(result.diagnostics.candidate.selections, 0);
});
