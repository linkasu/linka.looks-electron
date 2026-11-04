const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ownedProcessIds } = require("./process-census.cjs");

for (const platform of ["win32", "darwin", "linux"]) {
  const output =
    platform === "win32"
      ? JSON.stringify([
          { ProcessId: 30, ParentProcessId: 20 },
          { ProcessId: 99, ParentProcessId: 1 },
          { ProcessId: 20, ParentProcessId: 10 },
          { ProcessId: 10, ParentProcessId: 1 },
          { ProcessId: 0, ParentProcessId: 0 }
        ])
      : " 30 20\r\n 99 1\r\n 20 10\r\n 10 1\r\n 0 0\r\n";
  test(`${platform}: includes root and transitive descendants, not unrelated processes`, () => {
    assert.deepEqual(ownedProcessIds(output, platform, 10), [10, 20, 30]);
  });
}

test("Windows: accepts a single CIM object", () => {
  assert.deepEqual(ownedProcessIds('{"ProcessId":20,"ParentProcessId":10}', "win32", 10), [10, 20]);
});

for (const output of [
  "",
  "[]",
  "null",
  "not JSON",
  '[{"pid":20,"ppid":10}]',
  '[{"ProcessId":"20","ParentProcessId":10}]',
  '[{"ProcessId":20}]',
  '[{"ProcessId":20,"ParentProcessId":null}]',
  '[{"ProcessId":-1,"ParentProcessId":10}]',
  '[{"ProcessId":1.5,"ParentProcessId":10}]',
  '[{"ProcessId":9007199254740992,"ParentProcessId":10}]'
]) {
  test(`Windows: rejects invalid census ${JSON.stringify(output)}`, () => {
    assert.throws(() => ownedProcessIds(output, "win32", 10));
  });
}

for (const output of ["", "  ", "PID PPID", "20 x", "20", "20 10 extra", "-20 10", "1.5 10"]) {
  test(`POSIX: rejects invalid census ${JSON.stringify(output)}`, () => {
    assert.throws(() => ownedProcessIds(output, "linux", 10));
  });
}

test("rejects an unavailable root PID instead of returning an empty owned set", () => {
  assert.throws(() => ownedProcessIds("20 10", "linux", undefined));
});

test("descendant traversal terminates for cyclic parent relationships", () => {
  assert.deepEqual(ownedProcessIds("20 10\n10 20", "linux", 10), [10, 20]);
});
