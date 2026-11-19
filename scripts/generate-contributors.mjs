import { writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// GitHub profile and repository commit history confirm Ivan Bakaidov's account.
const mainAuthors = new Set(["ibakaidov"]);

export async function getContributors(request = fetch) {
  const contributors = new Map();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "linka-looks-contributors"
  };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  // Request through the empty page, rather than assuming a short page is the last one.
  for (let page = 1; page <= 1000; page++) {
    const response = await request(
      `https://api.github.com/repos/linkasu/linka.looks-electron/contributors?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(30000), redirect: "error" }
    );
    if (!response.ok) throw new Error(`GitHub contributors: HTTP ${response.status}, page ${page}`);
    const data = await response.json();
    if (!Array.isArray(data) || data.length > 100) {
      throw new Error(`Invalid contributors page ${page}`);
    }
    if (!data.length) {
      if (page === 1) throw new Error("GitHub returned an empty contributors list");
      return [...contributors.values()];
    }
    for (const contributor of data) {
      if (
        !contributor ||
        typeof contributor.login !== "string" ||
        !/^[a-z\d](?:[a-z\d-]{0,38})(?:\[bot\])?$/i.test(contributor.login) ||
        !["User", "Bot"].includes(contributor.type) ||
        !Number.isSafeInteger(contributor.contributions) ||
        contributor.contributions < 1
      ) {
        throw new Error(`Invalid contributor on page ${page}`);
      }
      const login = contributor.login.toLowerCase();
      if (contributor.type !== "Bot" && !login.endsWith("[bot]") && !mainAuthors.has(login)) {
        contributors.set(login, contributor.login);
      }
    }
  }
  throw new Error("GitHub contributors pagination did not finish");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contributors = await getContributors();
  const output = new URL("../src/frontend/contributors.json", import.meta.url);
  const temporary = new URL(`${output.href}.tmp`);
  await writeFile(temporary, `${JSON.stringify(contributors, null, 2)}\n`);
  await rename(temporary, output);
  console.log(`Embedded ${contributors.length} GitHub contributors`);
}
