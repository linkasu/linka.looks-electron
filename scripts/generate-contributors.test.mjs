import assert from "node:assert/strict";
import { test } from "node:test";
import { getContributors } from "./generate-contributors.mjs";

const user = (login, type = "User") => ({ login, type, contributions: 1 });
const response = (data) => ({ ok: true, json: async () => data });

test("reads all pages and excludes ignored contributors, bots and duplicate logins", async () => {
  const pages = [
    [user("ibakaidov"), user("UnguryanuO"), user("dependabot[bot]", "Bot"), user("Contributor")],
    [user("contributor"), user("Another"), user("automation", "Bot"), user("other[bot]")],
    []
  ];
  let calls = 0;
  const result = await getContributors(async (url) => {
    assert.equal(new URL(url).searchParams.get("page"), String(calls + 1));
    return response(pages[calls++]);
  });
  assert.deepEqual(
    result.map((login) => login.toLowerCase()),
    ["contributor", "another"]
  );
  assert.equal(calls, 3);
});

test("does not accept a partial list when a later page fails or is invalid", async () => {
  for (const failure of [
    { ok: false, status: 403 },
    response({ message: "API error" }),
    response([user("<script>")]),
    response([{ login: "someone", type: "User" }])
  ]) {
    let calls = 0;
    await assert.rejects(
      getContributors(async () => (calls++ === 0 ? response([user("Contributor")]) : failure))
    );
  }
  await assert.rejects(
    getContributors(async () => response([])),
    /empty contributors list/
  );
  await assert.rejects(
    getContributors(async () => {
      throw new Error("offline");
    }),
    /offline/
  );
});
