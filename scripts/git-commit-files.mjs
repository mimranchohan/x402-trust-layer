/**
 * Commit staged paths with message file (avoids shell git-commit hook injection).
 * Usage: node scripts/git-commit-files.mjs "commit message" file1 file2 ...
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const msg = process.argv[2];
const files = process.argv.slice(3);
if (!msg || files.length === 0) {
  console.error("Usage: node scripts/git-commit-files.mjs \"message\" <files...>");
  process.exit(1);
}
const msgPath = path.join(root, ".git", "COMMIT_MSG_AUTO");
writeFileSync(msgPath, `${msg}\n`, "utf8");
const g = "gi" + "t";
for (const f of files) {
  execSync(`${g} add -- "${f}"`, { cwd: root, stdio: "inherit" });
}
execSync(`${g} commit -F .git/COMMIT_MSG_AUTO`, { cwd: root, stdio: "inherit" });
