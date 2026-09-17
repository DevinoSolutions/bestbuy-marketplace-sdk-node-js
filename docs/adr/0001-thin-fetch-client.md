# ADR 0001 — Thin, fetch-based client with faithful wire shapes

**Status**: accepted · 2026-09-11

## Context

Best Buy Canada Marketplace is a Mirakl Marketplace Platform instance. Compared with the
Newegg API this repo's sibling wraps, the protocol is pleasant: JSON in and out, numbers that
are actually numbers, ISO-8601 timestamps with offsets, one auth header, consistent
`max`/`offset`/`total_count` paging.

What we do **not** have is a verified contract. Best Buy's seller documentation sits behind
the Mirakl back office, and operators customize paths, field names, required parameters and
state vocabularies. Everything in `docs/research/bestbuy-api-contracts.md` is currently an
**ASSUMPTION**.

That combination — simple protocol, unverified details — decides the design.

## Decision

**One dependency, one transport.** The SDK's only runtime dependency is `zod`. HTTP goes
through the platform `fetch`, injectable via `config.fetch`. No axios, no retry framework, no
env-var reading, no I/O at import time. The package is consumable from a queue worker, a cron
job, an HTTP service or a future MCP server with no adaptation.

**Responses keep their Mirakl field names.** `offer.shop_sku`, not `offer.shopSku`. Method
parameters are camelCase because they are our own vocabulary, but anything that crosses the
wire stays verbatim. Renaming unverified fields would create a second vocabulary that drifts
from the platform the moment a guess turns out wrong, and it would make a live-verification
diff unreadable. When the contracts document graduates from ASSUMPTION to VERIFIED, a
camelCase view layer can be added on top without breaking anyone.

**Loose validation, strict envelopes.** Every response is parsed with `z.looseObject`: the
handful of fields the SDK depends on are type-checked, and every other field passes through
untouched. A missing `offer_id` is a `BestBuyValidationError` at the call site; an
operator-specific extra field is simply carried along.

**One operations table.** `src/operations.ts` holds every endpoint with its Mirakl code, verb,
path and READ/WRITE classification. The HTTP layer builds requests from it, the read-only
guard derives its forbidden-call list from it, and the contracts document mirrors it. Adding
an endpoint means adding one row, and the mutating surface cannot grow without the guard
growing too.

**Async writes are acknowledged, not awaited.** `offers.update`, `offers.importFile` and
`products.importFile` return an `import_id` and nothing more. The SDK deliberately does not
poll on the caller's behalf: a 2xx from Mirakl means "batch accepted", and pretending
otherwise is how silent partial failures happen. Callers poll `getImport` and read the error
report.

## Consequences

- Adding an endpoint is a row in `operations.ts`, a schema, a method and a test.
- Callers see Mirakl's vocabulary, which means the contracts document is directly usable when
  debugging, and a wire-level trace matches the code.
- The SDK does no throttling and no retrying. Neither is safe to guess: real rate limits are
  unknown, and a blind retry of a write against a marketplace is how duplicate shipments
  happen. Both belong here only once the live behaviour is observed.
- A future MCP server package gets a transport-independent dependency and will gate its write
  tools behind an explicit environment flag plus a preview/apply flow, exactly as the Newegg
  MCP server does.
