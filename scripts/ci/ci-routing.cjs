const assert = require("node:assert/strict");

function route(paths) {
  const suites = new Set(["format"]);
  const reasons = [];
  let packaging = false;
  for (const file of paths) {
    assert(
      typeof file === "string" &&
        file &&
        !file.startsWith("/") &&
        !file.includes("\\") &&
        !file.split("/").some((part) => part === ".." || part === "." || !part),
      "expected repo-relative changed path"
    );
    const packaged =
      /^(LICENSE|THIRD_PARTY_NOTICES|package(?:-lock)?\.json|\.npmrc$|\.nvmrc$|build\/|extraResources\/|predictor-resources\/|vendor\/)/.test(
        file
      ) ||
      /^docs\/(security\/|.*approval)/.test(file) ||
      /^scripts\/ci\/(provision-eyelog\.cjs|stage-approved-predictor\.cjs|candidate-eyelog-api\.cjs|packaged-resources-smoke\.js|macos-single-build\.cjs)$/.test(
        file
      ) ||
      (/updat(er|e)/i.test(file) && file.startsWith("src/"));
    const metadata =
      file.startsWith(".github/") ||
      file === "scripts/ci/model-import-origin.cjs" ||
      /^scripts\/ci\/.*\.test\.(cjs|mjs)$/.test(file) ||
      /^scripts\/mirror\/(update|public-verify)(\.test)?\.cjs$/.test(file) ||
      /^scripts\/ci\/(ci-routing|candidate-(contract|io|stage|keychain-password|mac-sign)|qualification-(contract|runner)|release-(artifacts(-mac-compat)?|inventory|security-audit|source-bundle|publication(-io)?)|real-upgrade(-contract)?|windows-sdk-(launch|process|fixture|runtime)|update-smoke|plain-app-startup|startup-diagnostics|run-text-image-smoke|text-image-smoke|check-baseline-result|validate-acceptance-target|verify-predictor-resources|import-book-candidate|model-import-contract|book-execution-receipt|book-model-evaluation|promote-base-model|predictor-evaluation(-runner|-ui)?|windows-model-benchmark(\.fixture|\.ui)?|asar-evidence|check-asar-evidence|report-asar-evidence|test-asar-evidence|test-report-asar-evidence|test-verify-macos-payload|verify-macos-payload)\.(cjs|mjs|js|ts|ps1|cs|py)$/.test(
        file
      ) ||
      /^(AGENTS\.md|CLAUDE\.md|\.gitignore|\.prettierignore|eslint\.config\.mjs|prettier\.config\.cjs)$/.test(
        file
      );
    const docs = /^(docs|agents)\//.test(file) || /^(README|CHANGELOG)[^/]*$/i.test(file);
    let reason;
    if (packaged) {
      packaging = true;
      for (const suite of ["contracts", "static", "unit", "windows"]) suites.add(suite);
      reason = "packaging/legal/approval input";
    } else if (metadata) {
      suites.add("contracts");
      suites.add("static");
      reason = "CI/helper/metadata: no app or runtime build";
    } else if (docs) {
      reason = "documentation only";
    } else if (/^(tests\/(e2e|packaged)\/|playwright.*\.ts$)/.test(file)) {
      for (const suite of ["contracts", "static", "windows"]) suites.add(suite);
      reason = "integration harness: no deterministic reusable app artifact; one Windows fallback";
    } else if (file.startsWith("src/frontend/tests/") || /^vitest.*\.ts$/.test(file)) {
      for (const suite of ["contracts", "static", "unit"]) suites.add(suite);
      reason = "unit runtime tests";
    } else {
      for (const suite of ["contracts", "static", "unit", "windows"]) suites.add(suite);
      reason = "application or unknown input (conservative)";
    }
    reasons.push({ path: file, reason });
  }
  return {
    suites: ["format", "contracts", "static", "unit", "windows"].filter((suite) =>
      suites.has(suite)
    ),
    packaging,
    jobs: [
      "route",
      "fast",
      ...(suites.has("contracts") && !suites.has("windows") ? ["windows-contracts"] : []),
      ...["unit", "windows"].filter((suite) => suites.has(suite))
    ],
    builds: suites.has("windows") ? 1 : 0,
    reasons
  };
}

function changedPaths(diff) {
  const fields = diff.split("\0");
  assert.equal(fields.pop(), "", "malformed NUL diff");
  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    assert.match(status, /^(?:[ACDMRTUXB]|[RC]\d+)$/, "malformed diff status");
    const count = /^[RC]/.test(status) ? 2 : 1;
    for (let part = 0; part < count; part++) {
      assert(fields[index], "malformed diff path");
      paths.push(fields[index++]);
    }
  }
  return paths;
}

function assertRequired(required, needs) {
  assert(
    Array.isArray(required) && required.includes("route") && required.includes("fast"),
    "missing required routing/checks"
  );
  for (const name of required) {
    assert.equal(
      needs[name]?.result,
      "success",
      `required job ${name}: ${needs[name]?.result || "missing"}`
    );
  }
}

module.exports = { route, changedPaths, assertRequired };

if (require.main === module) {
  const fs = require("node:fs");
  const result = route(changedPaths(fs.readFileSync(0, "utf8")));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `required=${JSON.stringify(result.jobs)}`,
        ...["contracts", "static", "unit", "windows"].map(
          (suite) => `${suite}=${result.suites.includes(suite)}`
        ),
        `packaging=${result.packaging}`,
        ""
      ].join("\n")
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## CI routing\n\n${JSON.stringify(result, null, 2)}\n\nUnselected suites: NOT_APPLICABLE, not PASS.\n`
    );
  }
  console.log(JSON.stringify(result, null, 2));
}
