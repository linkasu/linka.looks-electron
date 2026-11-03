// UI_KSR_V1 only. Core DEV phrase-mean/seed906 is a different, unused metric here.
import assert from "node:assert/strict";
import { evaluateCandidateOutput } from "./predictor-evaluation.mjs";

const points = (text) => Array.from(text).length;
const inputAt = (text, caret = text.length) => ({ text, caret, language: "ru" });
const bucket = (length) => String(Math.min(length, 4));

async function editsFor(input, predict) {
  const edits = await evaluateCandidateOutput(input, await predict(input));
  const prefix = input.text.slice(0, input.caret).match(/\p{L}+$/u)?.[0];
  if (!prefix) {
    assert.equal(edits.length, 0);
    return edits;
  }
  const context = input.text.slice(0, input.caret - prefix.length);
  const suffix = input.text.slice(input.caret);
  for (const edit of edits) {
    assert.equal(edit.draft.text, context + edit.word + (suffix || " "));
    assert.equal(
      edit.draft.caret,
      points(context + edit.word) + (!suffix || suffix.startsWith(" ") ? 1 : 0)
    );
  }
  return edits;
}

function emptyDiagnostics() {
  return {
    queries: 0,
    eligible: 0,
    coverage: 0,
    top1: 0,
    top3: 0,
    selections: 0,
    prefixes: Object.fromEntries(
      ["1", "2", "3", "4"].map((key) => [key, { queries: 0, coverage: 0, top1: 0, top3: 0 }])
    )
  };
}

async function simulate(text, predict, diagnostics) {
  const target = text + " ";
  let draft = "";
  let actions = 0;
  while (draft !== target) {
    const before = points(draft);
    const edits = await editsFor(inputAt(draft), predict);
    diagnostics.queries++;
    const prefix = draft.match(/\p{L}+$/u)?.[0];
    const matches = edits.map(
      (edit) =>
        target.startsWith(edit.draft.text) &&
        edit.draft.caret === points(edit.draft.text) &&
        points(edit.draft.text) > before
    );
    if (prefix) {
      diagnostics.eligible++;
      const bin = diagnostics.prefixes[bucket(points(prefix))];
      bin.queries++;
      for (const aggregate of [diagnostics, bin]) {
        aggregate.coverage += Number(edits.length > 0);
        aggregate.top1 += Number(matches[0] === true);
        aggregate.top3 += Number(matches.some(Boolean));
      }
    }
    let best;
    for (let index = 0; index < edits.length; index++) {
      const next = edits[index].draft.text;
      if (matches[index] && points(next) > before + 1 && (!best || points(next) > points(best)))
        best = next;
    }
    if (best) {
      draft = best;
      diagnostics.selections++;
    } else draft += Array.from(target.slice(draft.length))[0];
    actions++;
    assert(actions <= points(target), "simulation must progress without free actions");
  }
  return actions;
}

async function probe(text, predict, aggregate) {
  const check = async (input, target, caret, kind, prefixLength) => {
    const edits = await editsFor(input, predict);
    aggregate.probes++;
    aggregate[kind]++;
    aggregate.exact += Number(
      edits.some((edit) => edit.draft.text === target && edit.draft.caret === caret)
    );
    if (prefixLength) aggregate.prefixes[bucket(prefixLength)]++;
  };
  for (const match of text.matchAll(/[а-яё]+/giu)) {
    const word = match[0];
    const context = text.slice(0, match.index);
    const suffix = text.slice(match.index + word.length);
    for (let k = 1; k <= word.length; k++) {
      const input = inputAt(context + word.slice(0, k) + suffix, context.length + k);
      await check(
        input,
        text + (suffix ? "" : " "),
        points(context + word) + (!suffix || suffix.startsWith(" ") ? 1 : 0),
        "prefix",
        k
      );
    }
    for (let k = 1; k <= word.length - 2; k++) {
      const m = Math.ceil((k + word.length) / 2);
      const input = inputAt(
        context + word.slice(0, k) + word.slice(m) + suffix,
        context.length + k
      );
      await check(input, text, points(context + word.slice(0, m)), "middle", k);
    }
    await check(inputAt(text, context.length), text, points(context), "noPrefix", 0);
  }
}

export async function evaluateRows(rows, candidatePredict, frequencyPredict) {
  const diagnostics = { candidate: emptyDiagnostics(), frequency: emptyDiagnostics() };
  const safety = Object.fromEntries(
    ["candidate", "frequency"].map((key) => [
      key,
      {
        probes: 0,
        prefix: 0,
        middle: 0,
        noPrefix: 0,
        exact: 0,
        prefixes: { 1: 0, 2: 0, 3: 0, 4: 0 }
      }
    ])
  );
  const counts = [];
  const strata = new Map();
  let words = 0;
  for (const row of rows) {
    const candidate = await simulate(row.text, candidatePredict, diagnostics.candidate);
    const frequency = await simulate(row.text, frequencyPredict, diagnostics.frequency);
    const manual = points(row.text + " ");
    counts.push({ group: row.group, manual, candidate, frequency });
    const length = row.text.match(/[а-яё]+/giu).length;
    words += length;
    for (const key of [
      `domain:${row.domain ?? "fixture"}`,
      `length:${length <= 3 ? "short" : length <= 8 ? "medium" : "long"}`,
      `yo:${/ё/iu.test(row.text) ? "yes" : "no"}`,
      `negation:${/(?:^|\s)(?:не|нет|нельзя|без|никогда|ничего)(?:\s|[,.!?]|$)/iu.test(row.text) ? "yes" : "no"}`
    ]) {
      const aggregate = strata.get(key) ?? { rows: 0, manual: 0, candidate: 0, frequency: 0 };
      aggregate.rows++;
      aggregate.manual += manual;
      aggregate.candidate += candidate;
      aggregate.frequency += frequency;
      strata.set(key, aggregate);
    }
    await probe(row.text, candidatePredict, safety.candidate);
    await probe(row.text, frequencyPredict, safety.frequency);
  }
  for (const aggregate of Object.values(safety))
    aggregate.exactDenominator = aggregate.prefix + aggregate.middle;
  return {
    counts,
    diagnostics,
    safety,
    words,
    descriptiveRowPooledStrata: Object.fromEntries([...strata].sort())
  };
}

export function summarizeGroups(rows, componentMap) {
  const groups = new Map();
  for (const row of rows) {
    assert(Object.hasOwn(componentMap, row.group), "missing frozen component");
    for (const key of ["manual", "candidate", "frequency"])
      assert(Number.isFinite(row[key]) && row[key] > 0);
    assert(row.candidate <= row.manual && row.frequency <= row.manual);
    const group = groups.get(row.group) ?? { manual: 0, candidate: 0, frequency: 0, n: 0 };
    for (const key of ["manual", "candidate", "frequency"]) group[key] += row[key];
    group.n++;
    groups.set(row.group, group);
  }
  const components = new Map();
  const order = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);
  for (const [id, group] of [...groups].sort(order)) {
    const key = componentMap[id];
    const aggregate = components.get(key) ?? { manual: 0, candidate: 0, frequency: 0 };
    for (const field of ["manual", "candidate", "frequency"])
      aggregate[field] += group[field] / group.n;
    components.set(key, aggregate);
  }
  const units = [...components].sort(order).map(([, value]) => value);
  const total = units.reduce(
    (sum, unit) => ({
      manual: sum.manual + unit.manual,
      candidate: sum.candidate + unit.candidate,
      frequency: sum.frequency + unit.frequency
    }),
    { manual: 0, candidate: 0, frequency: 0 }
  );
  assert(total.manual > 0);
  return {
    ...total,
    ksr: 1 - total.candidate / total.manual,
    frequencyKsr: 1 - total.frequency / total.manual,
    delta: (total.frequency - total.candidate) / total.manual,
    units
  };
}

export function bootstrapUI(components) {
  assert(components.length > 0);
  for (const unit of components)
    assert(
      Number.isFinite(unit.manual) &&
        unit.manual > 0 &&
        Number.isFinite(unit.candidate) &&
        Number.isFinite(unit.frequency)
    );
  let state = 40003;
  const ksr = [];
  const delta = [];
  for (let sample = 0; sample < 10000; sample++) {
    let manual = 0;
    let candidate = 0;
    let frequency = 0;
    for (let draw = 0; draw < components.length; draw++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      const unit = components[state % components.length];
      manual += unit.manual;
      candidate += unit.candidate;
      frequency += unit.frequency;
    }
    ksr.push(1 - candidate / manual);
    delta.push((frequency - candidate) / manual);
  }
  const interval = (values) => {
    values.sort((a, b) => a - b);
    return [values[Math.floor(9999 * 0.025)], values[Math.floor(9999 * 0.975)]];
  };
  return { ksrCI: interval(ksr), deltaCI: interval(delta) };
}

export function qualifiesUI(intervals, comparison) {
  assert(["general", "contextual"].includes(comparison));
  return (
    intervals.ksrCI[0] > 0 &&
    (comparison === "contextual" ? intervals.deltaCI[0] > 0 : intervals.deltaCI[0] >= 0)
  );
}

export function recommendDev(pairedGainCI, modelBytes) {
  if (!pairedGainCI) return "U";
  assert(
    pairedGainCI.length === 2 &&
      pairedGainCI.every((value) => Number.isFinite(value) && value >= -1 && value <= 1) &&
      pairedGainCI[0] <= pairedGainCI[1]
  );
  return pairedGainCI[0] > 0 &&
    Number.isSafeInteger(modelBytes) &&
    modelBytes > 0 &&
    modelBytes <= 128 * 1024 * 1024
    ? "T"
    : "U";
}
