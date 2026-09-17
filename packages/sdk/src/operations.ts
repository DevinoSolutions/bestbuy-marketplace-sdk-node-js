/**
 * The single source of truth for every HTTP operation this SDK performs, including its
 * READ/WRITE classification.
 *
 * Two things depend on this table:
 *
 * 1. `scripts/check-live-readonly.ts` derives its forbidden-token list from the entries
 *    marked `access: "write"`, so the read-only guard on `test/live/` automatically grows
 *    when the mutating surface grows.
 * 2. `docs/research/bestbuy-api-contracts.md` mirrors it in prose (with the Mirakl API code
 *    for each endpoint) — that document and this table must agree.
 *
 * HTTP verbs do not imply safety on their own, so the classification here is authoritative:
 * `access` is what the operation does to the seller account, not what the method suggests.
 */

/** HTTP methods used by the Best Buy (Mirakl) seller API. */
export type HttpMethod = "GET" | "POST" | "PUT";

/** Whether an operation only reads from the account or mutates it. */
export type OperationAccess = "read" | "write";

/** One endpoint: its Mirakl API code, wire location and access classification. */
export interface OperationSpec {
  /** Mirakl API code, e.g. `OF21`. */
  readonly code: string;
  readonly method: HttpMethod;
  /** Path template; `{name}` segments are substituted per call. */
  readonly path: string;
  readonly access: OperationAccess;
}

/**
 * Every operation, keyed by its SDK method path (`offers.list` is `client.offers.list`).
 *
 * The `code` on each row is the Mirakl API code from the platform's own seller API
 * reference (https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3, read
 * 2026-09-11) — it is what to search that documentation for, so it must match upstream even
 * where the operator's behaviour differs.
 *
 * Wire shapes are **ASSUMPTION** unless marked VERIFIED in
 * `docs/research/bestbuy-api-contracts.md`.
 */
export const OPERATIONS = {
  "account.get": { code: "A01", method: "GET", path: "/api/account", access: "read" },

  "offers.list": { code: "OF21", method: "GET", path: "/api/offers", access: "read" },
  "offers.get": { code: "OF22", method: "GET", path: "/api/offers/{offer_id}", access: "read" },
  "offers.states": { code: "OF61", method: "GET", path: "/api/offers/states", access: "read" },
  "offers.update": { code: "OF24", method: "POST", path: "/api/offers", access: "write" },
  "offers.importFile": {
    code: "OF01",
    method: "POST",
    path: "/api/offers/imports",
    access: "write",
  },
  "offers.getImport": {
    code: "OF02",
    method: "GET",
    path: "/api/offers/imports/{import_id}",
    access: "read",
  },
  "offers.getImportErrorReport": {
    code: "OF03",
    method: "GET",
    path: "/api/offers/imports/{import_id}/error_report",
    access: "read",
  },

  "products.search": { code: "P31", method: "GET", path: "/api/products", access: "read" },
  "products.importFile": {
    code: "P41",
    method: "POST",
    path: "/api/products/imports",
    access: "write",
  },
  "products.getImport": {
    code: "P42",
    method: "GET",
    path: "/api/products/imports/{import_id}",
    access: "read",
  },
  "products.getImportErrorReport": {
    code: "P44",
    method: "GET",
    path: "/api/products/imports/{import_id}/error_report",
    access: "read",
  },
  "products.getNewProductReport": {
    code: "P45",
    method: "GET",
    path: "/api/products/imports/{import_id}/new_product_report",
    access: "read",
  },

  "catalog.hierarchies": { code: "H11", method: "GET", path: "/api/hierarchies", access: "read" },
  "catalog.attributes": {
    code: "PM11",
    method: "GET",
    path: "/api/products/attributes",
    access: "read",
  },
  "catalog.valueLists": { code: "VL11", method: "GET", path: "/api/values_lists", access: "read" },
  "catalog.additionalFields": {
    code: "AF01",
    method: "GET",
    path: "/api/additional_fields",
    access: "read",
  },

  "shipping.methods": {
    code: "SH21",
    method: "GET",
    path: "/api/shipping/carriers",
    access: "read",
  },
  "shipping.zones": { code: "SH11", method: "GET", path: "/api/shipping/zones", access: "read" },
  "shipping.types": { code: "SH12", method: "GET", path: "/api/shipping/types", access: "read" },

  "orders.list": { code: "OR11", method: "GET", path: "/api/orders", access: "read" },
  "orders.get": { code: "OR12", method: "GET", path: "/api/orders/{order_id}", access: "read" },
  "orders.accept": {
    code: "OR21",
    method: "PUT",
    path: "/api/orders/{order_id}/accept",
    access: "write",
  },
  "orders.ship": {
    code: "OR24",
    method: "PUT",
    path: "/api/orders/{order_id}/ship",
    access: "write",
  },
  "orders.setTracking": {
    code: "OR23",
    method: "PUT",
    path: "/api/orders/{order_id}/tracking",
    access: "write",
  },
} as const satisfies Record<string, OperationSpec>;

/** Name of an operation in {@link OPERATIONS}, e.g. `"offers.list"`. */
export type OperationName = keyof typeof OPERATIONS;

/** True when the named operation mutates the seller account. */
export function isWriteOperation(name: OperationName): boolean {
  return OPERATIONS[name].access === "write";
}

/** Every mutating operation name, sorted. Mirrors the WRITE rows of the contracts doc. */
export function writeOperationNames(): OperationName[] {
  return (Object.keys(OPERATIONS) as OperationName[]).filter(isWriteOperation).sort();
}
