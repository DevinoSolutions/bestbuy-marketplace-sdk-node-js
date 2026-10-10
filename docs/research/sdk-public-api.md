# SDK public API — `@devino/bestbuy-marketplace-sdk`

This document is the **binding contract** for the package's public surface. Anything not
listed here is internal and may change without notice. A future MCP server package consumes
only what is on this page.

Two automated checks keep it honest: `npm run verify:exports` loads the built entry points and
asserts the named exports exist, and `npm run docs:api` (typedoc, warnings-as-errors) fails
when a public signature references an undocumented type.

## Entry points

| Import specifier                          | Contents                        |
| ----------------------------------------- | ------------------------------- |
| `@devino/bestbuy-marketplace-sdk`         | client factory, types, errors   |
| `@devino/bestbuy-marketplace-sdk/testing` | `createMockFetch` and its types |

## Factory

```ts
function createBestBuyClient(config: BestBuyClientConfig): BestBuyClient;
```

Validates the configuration eagerly and throws `BestBuyValidationError` listing every invalid
field. Performs no I/O and reads no environment variables — the caller owns credential
loading.

```ts
interface BestBuyClientConfig {
  apiKey: string; // raw Mirakl API key; sent as-is in Authorization
  baseUrl?: string; // default https://marketplace.bestbuy.ca
  shopId?: string | number; // adds shop_id to every request
  fetch?: typeof globalThis.fetch; // injectable transport
  timeoutMs?: number; // default 30000
  userAgent?: string;
}
```

Every method accepts a trailing `RequestOptions` (`{ signal?, timeoutMs? }`).

## Namespaces

```ts
interface BestBuyClient {
  readonly account: AccountApi;
  readonly offers: OffersApi;
  readonly products: ProductsApi;
  readonly catalog: CatalogApi;
  readonly shipping: ShippingApi;
  readonly orders: OrdersApi;
  readonly inbox: InboxApi;
  readonly platform: PlatformApi;
}
```

### `account`

- `get(options?): Promise<Account>` — READ (A01)

### `offers`

- `list(params?, options?): Promise<Page<Offer>>` — READ (OF21)
- `listAll(params?, options?): AsyncIterableIterator<Offer>` — READ (OF21, paged)
- `get(offerId, options?): Promise<Offer>` — READ (OF22)
- `states(options?): Promise<OfferState[]>` — READ (OF61)
- `export(params?, options?): Promise<string>` — READ (OF51, CSV; the shop's offer book incl.
  the per-zone shipping columns; active offers only unless `includeInactiveOffers`)
- `update(input, options?): Promise<ImportTicket>` — **WRITE** (OF24, async). Each line is the
  complete desired state of the offer (a full replace, not a patch); a `COMPLETE` import can
  still have every line in error, so read the `getImport` counters and `getImportErrorReport`
- `importFile(input, options?): Promise<ImportTicket>` — **WRITE** (OF01, async)
- `getImport(importId, options?): Promise<OfferImportStatus>` — READ (OF02)
- `getImportErrorReport(importId, options?): Promise<string>` — READ (OF03, CSV)

### `products`

- `search(params, options?): Promise<Page<Product>>` — READ (P31)
- `offers(params, options?): Promise<ProductWithOffers[]>` — READ (P11). Every seller's offers on
  the given `productIds` / `references` (at most 100 each, not paged); `allOffers: true` to
  include inactive offers. The competitor-visibility read
- `importFile(input, options?): Promise<ImportTicket>` — **WRITE** (P41, async). Verified with a
  comma-delimited operator-layout CSV and `operatorFormat: true`; `COMPLETE` is not success,
  read `integration_details` and the reports
- `getImport(importId, options?): Promise<ProductImportStatus>` — READ (P42)
- `getImportErrorReport(importId, options?): Promise<string>` — READ (P44, CSV)
- `getNewProductReport(importId, options?): Promise<string>` — READ (P45, CSV)
- `getTransformedFile(importId, options?): Promise<string>` — READ (P46, CSV; 404 unless
  `has_transformed_file`)
- `getTransformationErrorReport(importId, options?): Promise<string>` — READ (P47, CSV; 404
  unless `has_transformation_error_report`)

### `catalog`

- `hierarchies(params?, options?): Promise<Hierarchy[]>` — READ (H11)
- `attributes(params?, options?): Promise<ProductAttribute[]>` — READ (PM11)
- `valueLists(params?, options?): Promise<ValueList[]>` — READ (VL11)
- `additionalFields(params?, options?): Promise<AdditionalFieldDefinition[]>` — READ (AF01)

### `shipping`

- `methods(options?): Promise<ShippingCarrier[]>` — READ (SH21, carriers)
- `zones(options?): Promise<ShippingZone[]>` — READ (SH11)
- `types(options?): Promise<ShippingType[]>` — READ (SH12, shipping methods)
- `logisticClasses(options?): Promise<LogisticClass[]>` — READ (SH31)
- `configuration(options?): Promise<ShippingConfiguration>` — READ (SH42; lead time, delivery
  times, cut-offs)
- `charges(options?): Promise<ShippingCharges>` — READ (SH52; the shipping-charge grid)

### `inbox`

- `threads(params?, options?): Promise<InboxThreadList>` — READ (M11). Seek-paginated
  (`next_page_token`); `withMessages` includes customer-written message bodies. No reply method
  exists on purpose

### `platform`

- `version(options?): Promise<string>` — READ (V01)
- `configuration(options?): Promise<PlatformConfiguration>` — READ (PC01)
- `locales(options?): Promise<PlatformLocale[]>` — READ (L01)

### `orders`

- `list(params?, options?): Promise<Page<Order>>` — READ (OR11)
- `listAll(params?, options?): AsyncIterableIterator<Order>` — READ (OR11, paged)
- `get(orderId, options?): Promise<Order>` — READ (OR12)
- `accept(orderId, input, options?): Promise<void>` — **WRITE** (OR21)
- `ship(orderId, options?): Promise<void>` — **WRITE** (OR24)
- `setTracking(orderId, input, options?): Promise<void>` — **WRITE** (OR23)

## Naming convention

Inputs are camelCase (`offerStateCodes`, `startUpdateDate`); response objects and the offer
records passed to `offers.update` keep their Mirakl snake_case field names. See ADR 0001 for
why, and `docs/research/bestbuy-api-contracts.md` for each shape.

Read and write shapes are not always symmetric upstream, and the SDK mirrors that rather than
papering over it: an offer's `logistic_class` is an object (`{ code, label }`) on a read and a
bare code string on an `offers.update` record, a discount is `discount_price` on a read
(`OfferDiscount`) but `price` on a write (`OfferDiscountInput`), and a custom field is
`{ code, type, value }` on a read (`AdditionalField`) but `{ code, value }` on a write
(`AdditionalFieldInput`).

`offers.update` records carry `offer_additional_fields`. Best Buy rejects every line that omits
`manufacturer-warranty`; read the required set from `catalog.additionalFields({ entities:
["OFFER"] })` rather than hardcoding it.

## Pagination

```ts
interface Page<T> {
  items: T[];
  totalCount: number;
  offset: number;
  max: number;
}
```

`MAX_PAGE_SIZE` (100) and `DEFAULT_PAGE_SIZE` (100) are exported. A `max` outside 1..100 or a
negative `offset` throws `BestBuyValidationError` before any request is sent. The `listAll`
iterators stop at the reported `total_count`, on an empty page, or on a short page — whichever
comes first.

## Operation table

```ts
const OPERATIONS: Record<OperationName, OperationSpec>; // code, method, path, access
function isWriteOperation(name: OperationName): boolean;
function writeOperationNames(): OperationName[];
```

Exported so callers (and the repo's own read-only guard) can reason about which methods
mutate the account without hardcoding a second list.

## Errors

```
BestBuyError
├── BestBuyApiError        status, code?, body, retryable, requestId?
├── BestBuyNetworkError    timedOut
└── BestBuyValidationError issues[]
```

Every error is JSON-safe via `toJSON()` and free of credential material: the API key is
redacted out of response text before any error is constructed.

## Dates

```ts
function parseMiraklDate(value: string | null | undefined): Date | undefined;
function formatMiraklDate(value: Date | string): string;
```

Timestamps are returned as strings exactly as received; these helpers are opt-in.

## Testing helpers

```ts
function createMockFetch(routes: readonly MockRoute[]): MockFetch;
```

Route-table-driven mock `fetch` that records calls (method, URL, headers, JSON body, multipart
form) and rejects unmatched requests, so a test can never reach the real network.

## Constants

`SDK_VERSION`, `MAX_PAGE_SIZE`, `DEFAULT_PAGE_SIZE`.
