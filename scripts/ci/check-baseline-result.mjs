import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const knownFailures = [
  "editor side panel scrolls to audio controls",
  "existing activation still requires an explicit telemetry choice"
];

function check(report) {
  const failures = [];
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        if (spec.tests.some((test) => test.status === "unexpected")) failures.push(spec.title);
      }
      visit(suite.suites || []);
    }
  }
  visit(report.suites);
  assert.deepEqual(failures.sort(), knownFailures);
  assert.equal(report.errors.length, 0);
  assert.equal(report.stats.expected, 10);
  assert.equal(report.stats.unexpected, 2);
  assert.equal(report.stats.skipped, 0);
  assert.equal(report.stats.flaky, 0);
}

if (process.argv[2] === "--self-test") {
  const report = {
    suites: [
      { specs: knownFailures.map((title) => ({ title, tests: [{ status: "unexpected" }] })) }
    ],
    errors: [],
    stats: { expected: 10, unexpected: 2, skipped: 0, flaky: 0 }
  };
  check(report);
  assert.throws(() => check({ ...report, stats: { ...report.stats, expected: 9 } }));
  assert.throws(() => check({ ...report, errors: ["startup failure"] }));
} else {
  check(JSON.parse(readFileSync(process.argv[2], "utf8")));
  console.log(
    "Baseline comparison matches audit: 10 PASS / 2 known stale failures; NOT a 12/12 PASS"
  );
}
