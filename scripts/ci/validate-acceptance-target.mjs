import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = process.env.ACCEPTANCE_SHA ?? "";

if (
  process.env.GITHUB_REPOSITORY !== "linkasu/linka.looks-electron" ||
  process.env.GITHUB_REF !== "refs/heads/main" ||
  sha.length !== 40 ||
  !/^[0-9a-fA-F]{40}$/.test(sha) ||
  !/^https:\/\/github\.com\/linkasu\/linka\.looks-electron(?:\.git)?$/.test(
    git("remote", "get-url", "origin")
  )
) {
  throw new Error("Acceptance requires this repository, workflow on main, and an exact 40-hex SHA");
}

const target = sha.toLowerCase();
if (git("rev-parse", "--verify", `${target}^{commit}`) !== target) {
  throw new Error("Acceptance target must be a commit");
}
// The workflow fetches this repository's complete main history before validation.
git("merge-base", "--is-ancestor", target, "refs/remotes/origin/main");
console.log(target);
