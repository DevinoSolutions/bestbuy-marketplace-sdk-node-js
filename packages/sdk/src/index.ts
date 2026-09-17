/**
 * `@devino/bestbuy-marketplace-sdk` — transport-independent TypeScript SDK for the Best Buy
 * Canada Marketplace seller API, a Mirakl Marketplace Platform instance.
 *
 * The public surface is defined by `docs/research/sdk-public-api.md`; every wire shape it
 * relies on is catalogued in `docs/research/bestbuy-api-contracts.md` and is an
 * **ASSUMPTION** until live-verified. Testing helpers are exported separately from
 * `@devino/bestbuy-marketplace-sdk/testing`.
 */

// Public types (interfaces, unions) — all type-only.
export type * from "./types.js";

// Error hierarchy (classes are values, used with `instanceof`).
export * from "./errors/index.js";

// Factory.
export { createBestBuyClient } from "./client/index.js";

// Operation table: every endpoint with its Mirakl code and READ/WRITE classification.
export {
  OPERATIONS,
  isWriteOperation,
  writeOperationNames,
  type HttpMethod,
  type OperationAccess,
  type OperationName,
  type OperationSpec,
} from "./operations.js";

// Paging limits, shared with callers that build their own loops.
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination.js";

// Date helpers for the ISO-8601 strings the API returns.
export { formatMiraklDate, parseMiraklDate } from "./dates.js";

// Version.
export { SDK_VERSION } from "./version.js";
