// Guards against committing credentials:
// 1. .gitignore must exclude .env
// 2. If a local .env exists, none of its secret values may appear in any scanned file.
// 3. Generic scan for credential-looking values next to Authorization/apiKey markers.
//
// IMPORTANT: the scan list is the WORKING TREE (`git ls-files -co --exclude-standard`,
// i.e. tracked + untracked-but-not-ignored files). Do NOT narrow this back to plain
// `git ls-files`: in a repo with nothing committed/staged that scans zero files and
// the check passes hollowly while secrets sit in soon-to-be-committed files.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
let failures = 0;
const fail = (msg: string): void => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};

// Placeholders used in docs and fixtures. An all-zero UUID is not a credential.
const DOC_DUMMIES: ReadonlySet<string> = new Set(["00000000-0000-0000-0000-000000000000"]);

const gitignore = existsSync(join(root, ".gitignore"))
  ? readFileSync(join(root, ".gitignore"), "utf8")
  : "";
if (!/^\.env$/m.test(gitignore)) fail(".gitignore does not exclude .env");

// Tracked + untracked-unignored — the set of files that could ever reach a commit.
const scanned = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter((f) => f && !f.startsWith("package-lock"));

const localSecrets: string[] = [];
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*BESTBUY_(API_KEY|SHOP_ID)\s*=\s*(.+?)\s*$/);
    const value = m?.[2];
    if (value !== undefined && value.length >= 6) {
      localSecrets.push(value.replace(/^["']|["']$/g, ""));
    }
  }
}

for (const file of scanned) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue; // binary
  }
  for (const secret of localSecrets) {
    if (text.includes(secret)) fail(`${file} contains a value from your local .env`);
  }
  // A Mirakl API key is a UUID; catch one sitting next to an auth-shaped marker.
  for (const m of text.matchAll(
    /(?:Authorization|apiKey|api_key|BESTBUY_API_KEY)["'\s:=]+([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\b/g,
  )) {
    const value = m[1];
    if (value !== undefined && !DOC_DUMMIES.has(value.toLowerCase()))
      fail(`${file} contains an API-key-looking value: ${value.slice(0, 6)}...`);
  }
  // Long opaque tokens next to the same markers (non-UUID key formats).
  for (const m of text.matchAll(
    /(?:Authorization|apiKey|api_key|BESTBUY_API_KEY)["'\s:=]+([A-Za-z0-9+/_-]{32,})\b/g,
  )) {
    const value = m[1];
    if (value !== undefined && !DOC_DUMMIES.has(value.toLowerCase()))
      fail(`${file} contains a token-looking value: ${value.slice(0, 6)}...`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} secret check(s) failed`);
  process.exit(1);
}
console.log(`Secret checks passed (${scanned.length} files scanned)`);
