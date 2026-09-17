// Enforces the repository rule that the live test suite is READ-ONLY.
//
// The live tests in packages/sdk/test/live/ hit the REAL Best Buy Canada Marketplace seller
// account; they must never mutate it. This guard fails CI when a live file gains a mutating
// SDK call, a write-shaped raw request, an ungated describe block, or when the guard itself
// would pass vacuously (no files found).
//
// The forbidden-call list is DERIVED from packages/sdk/src/operations.ts: every operation
// marked `access: "write"` contributes a `.<method>(` pattern. That is deliberate — when the
// mutating surface grows, this guard grows with it and nobody has to remember to update a
// hand-maintained list here.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const liveDir = join(root, "packages", "sdk", "test", "live");
const operationsFile = join(root, "packages", "sdk", "src", "operations.ts");

let failures = 0;
const fail = (msg: string): void => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};

interface Forbidden {
  re: RegExp;
  why: string;
}

/** Reads the WRITE operations straight out of the SDK's operation table. */
function writeOperationsFromSource(): string[] {
  const source = readFileSync(operationsFile, "utf8");
  // Comments in that file legitimately quote `access: "write"` while explaining the table, so
  // strip them before counting anything.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // Path templates carry literal braces ("/api/orders/{order_id}/ship"). Collapse them too,
  // otherwise the entry matcher below mistakes a path placeholder for the end of the entry and
  // silently drops every operation whose path is parameterized — which is most of the writes.
  const flattened = code.replace(/\{\w+\}/g, "_");
  const names: string[] = [];
  for (const match of flattened.matchAll(/"([a-z]+\.[A-Za-z]+)":\s*\{[^}]*access:\s*"write"/g)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  // Cross-check the parse against a plain count so a future formatting change cannot quietly
  // shrink the guard back down.
  const declared = (code.match(/access:\s*"write"/g) ?? []).length;
  if (names.length !== declared) {
    fail(
      `parsed ${names.length} WRITE operation(s) but the table declares ${declared} — ` +
        `the guard's parser is out of step with operations.ts`,
    );
  }
  return names;
}

const writeOperations = writeOperationsFromSource();
if (writeOperations.length === 0) {
  fail(
    `no WRITE operations parsed out of ${relative(root, operationsFile)} — the derived guard would be empty`,
  );
}

const FORBIDDEN: Forbidden[] = [
  // Derived: one pattern per mutating SDK method, e.g. offers.update -> /\.update\s*\(/
  ...writeOperations.map((name) => {
    const method = name.slice(name.indexOf(".") + 1);
    return {
      re: new RegExp(`\\.${method}\\s*\\(`),
      why: `${name} (write)`,
    };
  }),
  // Belt and braces: the task brief names products.import explicitly; the SDK spells that
  // method importFile, so match both spellings.
  { re: /\.import\s*\(/, why: "products.import (write)" },
  // Raw write-shaped traffic. Every live call must be a GET through the SDK.
  { re: /["'`]POST["'`]/, why: "raw POST request (all live traffic must be reads)" },
  { re: /["'`]PUT["'`]/, why: "raw PUT request (all live traffic must be reads)" },
  { re: /["'`]DELETE["'`]/, why: "raw DELETE request (all live traffic must be reads)" },
  { re: /\bnew FormData\s*\(/, why: "multipart upload (import/write surface)" },
];

let files: string[] = [];
try {
  files = readdirSync(liveDir).filter((f) => f.endsWith(".ts"));
} catch {
  fail(`live test directory missing at ${liveDir} — guard cannot verify anything`);
}
if (files.length === 0 && failures === 0) {
  fail("no live test files found — guard would pass vacuously; fix the path or the suite");
}

for (const file of files) {
  const path = join(liveDir, file);
  const rel = relative(root, path).replaceAll("\\", "/");
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const isTestFile = file.endsWith(".live.test.ts");
  lines.forEach((line, i) => {
    for (const { re, why } of FORBIDDEN) {
      if (re.test(line)) fail(`${rel}:${i + 1} ${why} — the live suite is read-only`);
    }
    // Every live call goes through the SDK; no raw network access from the suite.
    if (/\bfetch\s*\(/.test(line)) {
      fail(
        `${rel}:${i + 1} raw fetch() in the live suite — every live call must go through the SDK`,
      );
    }
  });
  if (isTestFile && !lines.some((l) => l.includes("describe.skipIf(!liveEnabled)"))) {
    fail(`${rel} missing the describe.skipIf(!liveEnabled) gate`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} read-only guard check(s) failed`);
  process.exit(1);
}
console.log(
  `Live suite read-only guard passed (${files.length} file(s) scanned, ` +
    `${writeOperations.length} write operation(s) guarded)`,
);
