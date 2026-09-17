# AGENTS.md

Full agent instructions live in **[CLAUDE.md](./CLAUDE.md)** — read it before changing code.

Non-negotiables (duplicated here so no tool misses them):

1. `packages/sdk/test/live/` is READ-ONLY against a REAL seller account — never add writes
   there (`npm run check:live-readonly` enforces this in CI, deriving its forbidden list from
   the WRITE rows of `packages/sdk/src/operations.ts`).
2. Never write to the real Best Buy account in any form without the owner explicitly
   authorizing that specific write in the current session.
3. Never print or commit credentials or live-discovered identifiers; `npm run check:secrets`
   scans the working tree and must stay that way.
4. `REPLACE` offer import mode is never a default — it deactivates everything absent from the
   file.
5. MCP write tools, when that package lands, stay gated behind `BESTBUY_MCP_ALLOW_WRITES=true`
   plus a preview→apply flow.
6. `docs/research/bestbuy-api-contracts.md` marks each shape `VERIFIED <date>` or
   **ASSUMPTION**. The read surface was verified live on 2026-09-11; every write is still an
   assumption. Do not present guessed field names as facts.

Before claiming done: `npm run format:check && npm run typecheck && npm run lint &&
npm run build && npm test && npm run verify:exports && npm run check:secrets &&
npm run check:live-readonly && npm run check:deadcode && npm run docs:api` — all exit 0.
