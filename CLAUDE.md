# CLAUDE.md — agent instructions for this repo

TypeScript monorepo: `packages/sdk` (`@devino/bestbuy-marketplace-sdk`), npm workspaces,
ESM/NodeNext, Node >= 22.12. An MCP server package may be added later under `packages/`.

Target API: **Best Buy Canada Marketplace**, a Mirakl Marketplace Platform (MMP) instance.

## Hard rules (safety — never break these)

1. **The live test suite is READ-ONLY.** Files in `packages/sdk/test/live/` hit the REAL
   Best Buy seller account. Never add a mutating call (`offers.update`, `offers.importFile`,
   `products.importFile`, `orders.accept`, `orders.ship`, `orders.setTracking`, any raw
   POST/PUT/DELETE). Enforced by `npm run check:live-readonly` in CI. That guard derives its
   forbidden list from the `access: "write"` rows of `packages/sdk/src/operations.ts` — do not
   weaken it; classify new endpoints correctly in `operations.ts` and the guard follows.
2. **Never perform ANY write against the real Best Buy account** (SDK call, curl, probe
   script, future MCP tool) without the owner explicitly authorizing that specific write in
   the current session. Reads (`account.get`, `offers.list`, `orders.list`, catalog reads) are
   fine.
3. **Secrets never leave `.env`.** Never print, log, commit or hardcode the API key or values
   derived from it (real SKUs and order numbers discovered live stay out of the repo too).
   Enforced by `npm run check:secrets` (scans the WORKING TREE — keep it that way).
4. **`REPLACE` offer import mode is never a default and never a convenience.** It is Mirakl's
   full-overwrite mode: everything absent from the file is deactivated. It exists in the type
   union because the platform has it; nothing in this repo may pick it automatically.
5. **MCP write tools, when that package lands, register only behind an explicit env gate**
   (`BESTBUY_MCP_ALLOW_WRITES=true`) and go through a preview→apply flow. Reserved now so the
   pattern is not invented under deadline later.

## Binding contracts

- `docs/research/sdk-public-api.md` — the SDK's public surface (a future MCP server consumes
  only this).
- `docs/research/bestbuy-api-contracts.md` — the wire shapes. Every READ endpoint the SDK
  wraps is `VERIFIED 2026-10-10 (live)`, and OF24 is verified; the remaining writes (OF01, P41,
  OR21, OR23, OR24) are still marked ASSUMPTION - derived from standard Mirakl conventions,
  not from live traffic. When you verify an endpoint, replace the marker with
  `VERIFIED <date>` and paste the observed payload (redacted). When you add an endpoint, extend the doc first (cite the source; mark
  gaps **ASSUMPTION**).
- `docs/adr/0001-thin-fetch-client.md` — thin fetch client, faithful snake_case wire shapes,
  one operations table, writes acknowledged not awaited. Follow it.
- `packages/sdk/src/operations.ts` — the machine-readable endpoint + READ/WRITE table. The
  contracts doc mirrors it; the read-only guard parses it. Keep all three in agreement.

## Toolchain pins (do not upgrade without owner sign-off)

TypeScript `~6.0.3` · zod `^4` (zod-4 API: `z.looseObject`, not `.passthrough()`; most online
examples are zod-3) · vitest `^4` · ESLint flat config · prettier `^3`.

## Conventions

- Strict TS everywhere (`noUncheckedIndexedAccess` — index access yields `T | undefined`).
- `any` is banned (`@typescript-eslint/no-explicit-any: error`); use `unknown` + narrowing.
- Relative imports in `src/` carry `.js` extensions (ESM NodeNext).
- No `console.*` in `packages/*/src` except `console.error` (stdout belongs to a future MCP
  stdio transport). Tests and scripts may log.
- **Inputs camelCase, wire payloads snake_case.** Method parameters are ours; anything that
  crosses the wire keeps Mirakl's field names verbatim (ADR 0001).
- Every response is parsed through a `z.looseObject` schema in `src/schemas/wire.ts`: required
  fields are checked, unknown fields pass through. Never hand-roll response parsing, and never
  strip unknown fields.
- Return types on module methods are the hand-written interfaces in `src/types.ts`. That is
  deliberate: if a zod schema drifts from its interface, `tsc` fails at the return statement.
  Keep it that way instead of casting.
- The three import-style writes are asynchronous. Return the `import_id`; never fake
  synchronous success by polling inside the call.
- The SDK does no retrying and no throttling. Real rate limits are unknown, and a blind retry
  of a marketplace write causes duplicate shipments. Do not add either speculatively.

## Commands

```bash
npm run build            # tsc -> packages/sdk/dist
npm run typecheck        # scripts + all workspaces
npm run lint / format:check
npm test                 # mocked suites only (65+); no credentials needed
npm run check:secrets    # working-tree secret scan
npm run check:live-readonly
npm run verify:exports   # requires a fresh build
npm run check:deadcode   # knip
npm run docs:api         # typedoc, warnings as errors
BESTBUY_LIVE_TESTS=true npm run test:live   # READ-ONLY live suite (needs .env)
```

All of these must exit 0 before claiming work is done. `check:deadcode` and `docs:api` are
part of CI too — include them in every pre-push gate. Trust exit codes, not output prettiness
(an output proxy may collapse vitest output to `PASS (n) FAIL (n)`).

## Environment gotchas (primary dev machine: Windows + OneDrive)

- OneDrive can silently roll `dist/` back to stale artifacts and has injected NUL bytes into a
  source file. After `npm run build`, confirm dist mtimes are newer than src before trusting
  dist-dependent checks; bizarre `tsc` parse errors at 1:1 → check for NUL bytes.
- Long commands: prefer the Bash tool. A killed long-running command can wedge the PowerShell
  tool session (every later command times out) — switch backends, don't retry.
- Large multi-file heredocs through the Bash tool can fail to parse; write files with the file
  tools instead of one giant shell command.
- The repo may have few/no commits; `check:secrets` deliberately scans the working tree so it
  stays honest either way.
- Never add AI/assistant attribution to commits, docs or code comments.
