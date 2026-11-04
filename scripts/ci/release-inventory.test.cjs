const assert = require("node:assert/strict");
const { test } = require("node:test");
const { validateVersions } = require("./release-inventory.cjs");

test("inventory accepts the selected stable version only when lock and actual package agree", () => {
  const version = "4.1.2";
  const lock = { version, packages: { "": { version } } };
  const packaged = [{ packages: [{ path: "package.json", version }] }];
  assert.equal(validateVersions(version, lock, packaged), version);
  assert.throws(() => validateVersions(version, { ...lock, version: "4.0.0" }, packaged));
  assert.throws(() =>
    validateVersions(version, { ...lock, packages: { "": { version: "4.0.0" } } }, packaged)
  );
  assert.throws(() =>
    validateVersions(version, lock, [{ packages: [{ path: "package.json", version: "4.0.0" }] }])
  );
  assert.throws(() => validateVersions(version, lock, [{ packages: [] }]));
  assert.throws(() => validateVersions("4.1.2-beta", lock, packaged));
});
