# Best Buy Canada Marketplace SDK (Node.js / TypeScript)

A thin, typed, transport-independent client for the **Best Buy Canada Marketplace** seller
API — a [Mirakl](https://www.mirakl.com/) Marketplace Platform instance. Offers, products,
catalog metadata, shipping reference data and orders.

- Package: `@devino/bestbuy-marketplace-sdk`
- Runtime: Node >= 22.12, ESM only
- Runtime dependencies: `zod` (that is the whole list)

> **Reads are live-verified; writes are verified only where the contracts doc says so.** Every
> read endpoint was called against a real Best Buy Canada seller account and its response
> shape recorded in
> [`docs/research/bestbuy-api-contracts.md`](docs/research/bestbuy-api-contracts.md). Of the
> mutating endpoints, the offer batch (`offers.update`, OF24) and the product import
> (`products.importFile`, P41) are marked verified from real, owner-authorized ops writes; the
> offer file import (OF01) and the order writes (accept, ship, tracking) are still marked
> **ASSUMPTION**, derived from Mirakl's standard seller API — the operator customizes paths,
> field names and codes, so treat the first real use of one of those as a verification step,
> not as a regression test.

## Install

```bash
npm install @devino/bestbuy-marketplace-sdk
```

## Quick start

```ts
import { createBestBuyClient } from "@devino/bestbuy-marketplace-sdk";

const client = createBestBuyClient({
  apiKey: process.env.BESTBUY_API_KEY!, // raw Mirakl key, no "Bearer" prefix
  // shopId: process.env.BESTBUY_SHOP_ID,  // only for multi-shop users
});

// Cheapest possible credential check — a read.
const account = await client.account.get();
console.log(account.shop_id, account.shop_name);

// One page of offers.
const page = await client.offers.list({ max: 50 });
console.log(`${page.items.length} of ${page.totalCount} offers`);

// Every offer, paged for you.
for await (const offer of client.offers.listAll({ max: 100 })) {
  console.log(offer.shop_sku, offer.price, offer.quantity);
}
```

Response objects use Mirakl's own snake_case field names; method parameters use camelCase.
[ADR 0001](docs/adr/0001-thin-fetch-client.md) explains why.

### Errors

```ts
import { BestBuyApiError, BestBuyNetworkError } from "@devino/bestbuy-marketplace-sdk";

try {
  await client.orders.list({ orderStateCodes: ["WAITING_ACCEPTANCE"] });
} catch (error) {
  if (error instanceof BestBuyApiError) {
    console.error(error.status, error.code, error.retryable);
  } else if (error instanceof BestBuyNetworkError) {
    console.error(error.timedOut ? "timed out" : "transport failure");
  }
}
```

The API key is redacted out of every response body before an error is built, so no error,
log line or `toJSON()` payload can carry it — even if the upstream echoes the header back.

### Writes

Writes are the minority of this SDK and they are marked as such everywhere:
`offers.update`, `offers.importFile`, `products.importFile`, `orders.accept`, `orders.ship`,
`orders.setTracking`. The full classification lives in one table, in code:

```ts
import { OPERATIONS, writeOperationNames } from "@devino/bestbuy-marketplace-sdk";

writeOperationNames(); // ["offers.importFile", "offers.update", "orders.accept", ...]
OPERATIONS["offers.update"]; // { code: "OF24", method: "POST", path: "/api/offers", access: "write" }
```

The three import-style writes are **asynchronous**: they return an `import_id` and nothing
else. A 2xx means Mirakl accepted the batch, not that anything changed. Poll `getImport` and
read the error report:

```ts
const { import_id } = await client.offers.update({ offers: [...] });
const status = await client.offers.getImport(import_id);
if (status.has_error_report) {
  console.log(await client.offers.getImportErrorReport(import_id)); // CSV
}
```

## Testing without a network

```ts
import { createMockFetch } from "@devino/bestbuy-marketplace-sdk/testing";

const mock = createMockFetch([
  {
    method: "GET",
    pathPattern: /^\/api\/offers/,
    reply: () => ({ status: 200, body: { offers: [], total_count: 0 } }),
  },
]);

const client = createBestBuyClient({ apiKey: "test-key", fetch: mock.fetch });
```

Unmatched requests reject, so a test can never silently reach the real API.

## Read-only live tests

`packages/sdk/test/live/` contains an opt-in smoke suite that runs against the **real seller
account**. It is **READ-ONLY by construction**: every call is a GET, and
`npm run check:live-readonly` fails the build if a mutating method, a write-shaped raw request
or an ungated `describe` block ever appears there.

```bash
cp .env.example .env      # fill in BESTBUY_API_KEY
BESTBUY_LIVE_TESTS=true npm run test:live
```

Without `BESTBUY_LIVE_TESTS=true` and a key present, the suite skips cleanly. It never runs in
CI.

## Safety rules

1. **The live suite is read-only.** Enforced by `npm run check:live-readonly`, whose forbidden
   list is derived from the WRITE rows of `packages/sdk/src/operations.ts` — so it grows
   automatically with the mutating surface.
2. **No write against the real account without explicit authorization** for that specific
   write, in that specific session. Reads are fine.
3. **Secrets live in `.env` and nowhere else.** `.env` is gitignored, only `.env.example` is
   committed, and `npm run check:secrets` scans the working tree (not just the index) for
   credential-shaped values.
4. **`REPLACE` import mode is never a default.** It is the Mirakl full-overwrite mode.
5. **Order writes are irreversible.** Refusing a line cancels it; shipping cannot be undone.

## Commands

```bash
npm run build            # tsc -> packages/sdk/dist
npm run typecheck        # scripts + workspaces
npm run lint             # ESLint (flat config)
npm run format:check     # Prettier
npm test                 # mocked suites only; no credentials needed
npm run check:secrets
npm run check:live-readonly
npm run verify:exports   # requires a fresh build
npm run check:deadcode   # knip
npm run docs:api         # typedoc, warnings as errors
BESTBUY_LIVE_TESTS=true npm run test:live   # READ-ONLY, needs .env
```

## Repository layout

```
packages/sdk/          @devino/bestbuy-marketplace-sdk
  src/operations.ts    every endpoint + READ/WRITE classification (source of truth)
  src/client/          config validation, HTTP layer
  src/errors/          error hierarchy, upstream error parsing
  src/schemas/         zod wire schemas + input guards
  src/{account,offers,products,catalog,shipping,orders}/
  src/testing/         createMockFetch
  test/                mocked suites
  test/fixtures/       sanitized live payloads (2026-09-11) used by the mocked suites
  test/live/           opt-in READ-ONLY live suite
docs/research/         API contracts (reads, OF24 and P41 VERIFIED) + public API contract
docs/adr/              architecture decisions
scripts/               secret scan, read-only guard, export verification
```

The root package is a private monorepo (`workspaces: packages/*`) so an MCP server package can
be added alongside the SDK later without restructuring.

## License

MIT
