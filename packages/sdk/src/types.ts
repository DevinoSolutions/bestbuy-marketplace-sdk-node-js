/**
 * The public type surface of the SDK.
 *
 * Two naming conventions meet in this file, on purpose:
 *
 * - **Inputs use camelCase.** Method parameters (`offerStateCodes`, `startUpdateDate`) are
 *   ordinary TypeScript ergonomics; the client maps them onto Mirakl query parameters.
 * - **Wire payloads keep their Mirakl names.** Responses, and the offer records accepted by
 *   `offers.update`, use the upstream snake_case fields verbatim. This SDK is a thin,
 *   faithful mapping (ADR 0001): renaming fields we have not yet live-verified would invent
 *   a second vocabulary that is guaranteed to drift.
 *
 * Response shapes marked VERIFIED in `docs/research/bestbuy-api-contracts.md` were taken
 * from real read-only responses captured on 2026-09-11, 2026-09-16 and 2026-10-10; the rest
 * are still **ASSUMPTION**.
 * Response objects are validated loosely: known fields are type-checked, unknown fields pass
 * through untouched.
 */

/** A label Mirakl carries in several locales. */
export interface LocalizedLabel {
  locale: string;
  value: string;
}

/** Mirakl's shape for every operator-defined custom field. */
export interface AdditionalField {
  code: string;
  type?: string;
  value?: string | null;
}

/** The write side of the same idea: reads return {@link AdditionalField}, which also carries `type`. */
export interface AdditionalFieldInput {
  code: string;
  value: string;
}

/** Configuration accepted by `createBestBuyClient`. */
export interface BestBuyClientConfig {
  /**
   * Mirakl API key for the shop user. Sent raw in the `Authorization` header (no `Bearer`
   * prefix). Never logged, never included in an error.
   */
  apiKey: string;
  /** Defaults to `https://marketplace.bestbuy.ca`. Must be https (http only for loopback). */
  baseUrl?: string;
  /** Sent as the `shop_id` query parameter. Only needed for multi-shop users. */
  shopId?: string | number;
  /** Injectable fetch, for tests and proxies. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Overrides the default `User-Agent`. */
  userAgent?: string;
}

/** Per-call options accepted by every method. */
export interface RequestOptions {
  /** Caller-supplied abort signal, combined with the configured timeout. */
  signal?: AbortSignal;
  /** Overrides the client-wide `timeoutMs` for this call. */
  timeoutMs?: number;
}

/** Paging parameters shared by every Mirakl list endpoint. */
export interface PageParams {
  /** Page size. Mirakl caps this at 100; larger values are rejected before the request. */
  max?: number;
  /** Zero-based offset of the first record to return. */
  offset?: number;
}

/** One page of a Mirakl list response. */
export interface Page<T> {
  items: T[];
  /** `total_count` reported by the API: total records matching the filter, not page size. */
  totalCount: number;
  /** Offset this page was fetched at. */
  offset: number;
  /** Page size requested. */
  max: number;
}

// ---------------------------------------------------------------------------
// Account (A01)
// ---------------------------------------------------------------------------

/** One zone/method pair of the shop's shipping grid. */
export interface AccountShipping {
  shipping_type_code: string;
  shipping_type_label?: string;
  shipping_type_standard_code?: string | null;
  shipping_zone_code: string;
  shipping_zone_label?: string;
  shipping_free_amount?: number | null;
  additional_fields?: AdditionalField[] | null;
}

/** The shop's own contact record. */
export interface AccountContact {
  civility?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
  fax?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip_code?: string | null;
  web_site?: string | null;
}

/**
 * The authenticated shop, as returned by `GET /api/account`.
 *
 * The fields below are the ones Best Buy actually returns. The response also carries banking
 * and billing objects (`billing_info`, `payment_info`, `default_billing_information`,
 * `pro_details`); they are deliberately left untyped and simply pass through, because nothing
 * in this SDK should invite reading them.
 */
export interface Account {
  shop_id: number;
  shop_name?: string;
  /** e.g. `OPEN`. Mirakl has no separate `closed` boolean on this payload. */
  shop_state?: string;
  currency_iso_code?: string;
  premium?: boolean;
  date_created?: string;
  last_updated_date?: string;
  closed_from?: string | null;
  closed_to?: string | null;
  suspension_type?: string | null;
  model?: string;
  description?: string | null;
  banner?: string | null;
  logo?: string | null;
  grade?: number | null;
  approval_delay?: number | null;
  approval_rate?: number | null;
  order_messages_response_delay?: number | null;
  evaluations_count?: number;
  offers_count?: number;
  orders_count?: number;
  free_shipping?: boolean;
  is_professional?: boolean;
  payment_method_mandatory?: boolean;
  return_policy?: string | null;
  channels?: string[];
  domains?: string[];
  shipping?: { lead_time_to_ship?: number | null };
  shipping_country?: string | null;
  shipping_types?: string[];
  shipping_zones?: string[];
  shippings?: AccountShipping[];
  shop_additional_fields?: AdditionalField[];
  payment_details?: {
    paid_balance?: number;
    payable_balance?: number;
    pending_balance?: number;
  };
  applicable_taxes?: { code: string; label?: string; fee_types?: string[] }[];
  contact_informations?: AccountContact;
}

/** Reads the authenticated shop's own account record. */
export interface AccountApi {
  /** `A01` — `GET /api/account`. */
  get(options?: RequestOptions): Promise<Account>;
}

// ---------------------------------------------------------------------------
// Offers (OF01, OF02, OF03, OF21, OF22, OF24, OF51, OF61)
// ---------------------------------------------------------------------------

/**
 * How a product is identified when creating or updating an offer.
 *
 * VERIFIED 2026-10-10 (from live ops writes): `SKU` (the Best Buy product sku, i.e. the
 * `product_sku` P31 returns) and `UPC-A` (the operator's UPC reference type, the one P31
 * matches on) were each accepted on offer lines that imported with `lines_in_success` equal
 * to `lines_read`. `UPC`, `EAN` and `SHOP_SKU` are Mirakl's documented names and have no
 * successful live write behind them.
 */
export type ProductIdType = "UPC-A" | "UPC" | "EAN" | "SKU" | "SHOP_SKU";

/**
 * A time-boxed promotional price as it comes back on a READ.
 *
 * Mirakl spells the amount `discount_price` here and `price` in the OF24 write payload; see
 * {@link OfferDiscountInput} for the write side.
 */
export interface OfferDiscount {
  discount_price?: number;
  /** ISO-8601 timestamp. */
  start_date?: string | null;
  /** ISO-8601 timestamp. */
  end_date?: string | null;
  /** Price before the discount. */
  origin_price?: number | null;
  ranges?: { price: number; quantity_threshold: number }[] | null;
}

/** A time-boxed promotional price as accepted by `offers.update`. */
export interface OfferDiscountInput {
  price: number;
  /** ISO-8601 timestamp. */
  start_date?: string;
  /** ISO-8601 timestamp. */
  end_date?: string;
  ranges?: { price: number; quantity_threshold: number }[];
}

/** A quantity-threshold tier inside a pricing block. */
export interface OfferVolumePrice {
  price: number;
  quantity_threshold: number;
  unit_origin_price?: number | null;
  unit_discount_price?: number | null;
}

/** Scope a pricing block applies to. Empty on a single-channel shop. */
export interface OfferPricingContext {
  channel_codes?: string[] | null;
  customer_group_ids?: string[] | null;
  customer_organization_ids?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** One entry of `all_prices`, and the shape of `applicable_pricing`. */
export interface OfferPricing {
  price: number;
  unit_origin_price?: number | null;
  unit_discount_price?: number | null;
  channel_code?: string | null;
  discount_start_date?: string | null;
  discount_end_date?: string | null;
  volume_prices?: OfferVolumePrice[] | null;
  context?: OfferPricingContext | null;
}

/** The operator's logistic class, as returned on an offer read. */
export interface OfferLogisticClass {
  code: string;
  label?: string;
}

/** Which fulfillment centre serves the offer. `DEFAULT` on a seller-fulfilled shop. */
export interface OfferFulfillment {
  center?: { code?: string };
}

/** Per-warehouse stock on an offer. `null` when the operator has no warehouses. */
export interface OfferWarehouse {
  code: string;
  quantity?: number;
}

/** A product reference carried on an offer or product record. */
export interface ProductReference {
  reference: string;
  reference_type: string;
}

/** An offer as returned by the list and get endpoints. */
export interface Offer {
  offer_id: number;
  shop_sku: string;
  product_sku?: string;
  product_title?: string;
  product_brand?: string | null;
  product_description?: string | null;
  price: number;
  total_price?: number;
  msrp?: number | null;
  price_additional_info?: string | null;
  all_prices?: OfferPricing[];
  /** The price that currently applies, after channel and volume rules. */
  applicable_pricing?: OfferPricing | null;
  quantity: number;
  min_quantity_alert?: number;
  /** Condition code. Best Buy Canada configures exactly one: `11` (New). */
  state_code?: string;
  active?: boolean;
  allow_quote_requests?: boolean;
  /** Why an inactive offer is inactive, e.g. `PRODUCT_STATUS_REJECTED`. */
  inactivity_reasons?: string[];
  description?: string | null;
  leadtime_to_ship?: number;
  shipping_deadline?: string | null;
  discount?: OfferDiscount | null;
  available_start_date?: string | null;
  available_end_date?: string | null;
  category_code?: string;
  category_label?: string;
  channels?: string[];
  currency_iso_code?: string;
  /** An object on reads; `offers.update` takes the bare code string instead. */
  logistic_class?: OfferLogisticClass | null;
  fulfillment?: OfferFulfillment | null;
  min_shipping_price?: number | null;
  min_shipping_price_additional?: number | null;
  min_shipping_type?: string | null;
  min_shipping_zone?: string | null;
  offer_additional_fields?: AdditionalField[];
  warehouses?: OfferWarehouse[] | null;
  product_references?: ProductReference[];
}

/** One offer condition configured by the operator. */
export interface OfferState {
  code: string;
  label?: string;
}

/** Filters for `offers.list`. */
export interface OfferListParams extends PageParams {
  /** One or more shop SKUs. */
  sku?: string | readonly string[];
  /** Restricts the result to offers on a single product. */
  productId?: string;
  /** Condition/state codes to include. */
  offerStateCodes?: readonly string[];
}

/** One record of an `offers.update` payload. */
export interface OfferUpdateEntry {
  shop_sku: string;
  product_id: string;
  product_id_type: ProductIdType;
  price: number;
  quantity: number;
  state_code: string;
  /**
   * Defaults to `update` upstream (a create-or-update upsert; every verified live write sent
   * it); `delete` removes the offer and has no verified outcome here.
   */
  update_delete?: "update" | "delete";
  /**
   * Operator logistic class code, e.g. `SMALL`. The accepted codes come from
   * `GET /api/shipping/logistic_classes` (LETTER, SMALL, MED, ... — live-read 2026-09-16).
   * Best Buy stamps every existing offer with one, so omitting it on a create leans on an
   * operator-side default that is not documented — set it explicitly.
   */
  logistic_class?: string;
  /**
   * Operator-defined additional fields. VERIFIED 2026-09-16: Best Buy rejects every offer line
   * that lacks `manufacturer-warranty` (REGEX `(0|[1-9][0-9]*)`, warranty in days) with
   * `The mandatory additional field "manufacturer-warranty" is missing`. Read the required
   * set from `GET /api/additional_fields?entities=OFFER` (AF01).
   */
  offer_additional_fields?: readonly AdditionalFieldInput[];
  description?: string;
  min_quantity_alert?: number;
  leadtime_to_ship?: number;
  discount?: OfferDiscountInput;
  price_additional_info?: string;
  /** ISO-8601 timestamp. */
  available_started?: string;
  /** ISO-8601 timestamp. */
  available_ended?: string;
}

/** Payload for `offers.update`. */
export interface OfferUpdateInput {
  offers: readonly OfferUpdateEntry[];
}

/** How an uploaded offer file is applied. */
export type OfferImportMode = "NORMAL" | "PARTIAL_UPDATE" | "REPLACE";

/** Payload for `offers.importFile`. */
export interface OfferImportFileInput {
  /** File contents. `Buffer` is a `Uint8Array`, so Node buffers are accepted directly. */
  file: Blob | Uint8Array;
  fileName: string;
  importMode: OfferImportMode;
  /** Set when the file also carries product data. */
  withProducts?: boolean;
}

/** Acknowledgement of an asynchronous import. The work happens after the response. */
export interface ImportTicket {
  import_id: number;
}

/** Progress of an offer import. */
export interface OfferImportStatus {
  import_id: number;
  /**
   * The key the operator actually sends (VERIFIED 2026-09-16), e.g. `COMPLETE`. Read this one.
   */
  status?: string;
  /**
   * Mirakl's documented spelling of the same idea. Never observed on this operator; kept
   * optional so a payload that does carry it still parses.
   */
  import_status?: string;
  /** `NORMAL`, `PARTIAL_UPDATE` or `REPLACE` — the mode the import ran under. */
  mode?: string;
  /** Import source, e.g. `MIRAKL` for an OF24 batch. */
  type?: string;
  has_error_report?: boolean;
  lines_read?: number;
  lines_in_success?: number;
  lines_in_error?: number;
  lines_in_pending?: number;
  /**
   * `offer_inserted` / `offer_updated` / `offer_deleted` count what actually changed. A line
   * can be in `lines_in_success` and still move none of them: a batch that only asked for a
   * per-offer `leadtime_to_ship` below the operator-locked shop default imported clean with
   * `offer_updated` 0 and the offers kept the default. VERIFIED 2026-10-10 (from live ops
   * writes).
   */
  offer_inserted?: number;
  offer_updated?: number;
  offer_deleted?: number;
  date_created?: string;
  date_process_started?: string;
  date_process_ended?: string;
}

/** Filters for `offers.export`. */
export interface OfferExportParams {
  /** `true` also exports inactive offers; upstream defaults to active offers only. */
  includeInactiveOffers?: boolean;
  /**
   * ISO-8601 timestamp: export only offers changed since the previous call's date (Mirakl's
   * `last_request_date`). **ASSUMPTION**: the delta semantics are documented, not observed.
   */
  lastRequestDate?: string;
}

/** Offer reads and writes. Only the READ methods are safe against a live shop. */
export interface OffersApi {
  /** `OF21` — `GET /api/offers`. */
  list(params?: OfferListParams, options?: RequestOptions): Promise<Page<Offer>>;
  /** `OF21` — pages through every matching offer. */
  listAll(params?: OfferListParams, options?: RequestOptions): AsyncIterableIterator<Offer>;
  /** `OF22` — `GET /api/offers/{offer_id}`. */
  get(offerId: string | number, options?: RequestOptions): Promise<Offer>;
  /** `OF61` — `GET /api/offers/states`: the operator's offer conditions. */
  states(options?: RequestOptions): Promise<OfferState[]>;
  /**
   * `OF51` — `GET /api/offers/export`. The shop's whole offer book as raw CSV (semicolon-
   * delimited, quoted), including the per-zone `shipping-price[zone=..,method=..]` columns
   * that `offers.list` does not carry. Synchronous; mind the size on a large catalog.
   */
  export(params?: OfferExportParams, options?: RequestOptions): Promise<string>;
  /** `OF24` — `POST /api/offers`. **WRITE**, asynchronous. */
  update(input: OfferUpdateInput, options?: RequestOptions): Promise<ImportTicket>;
  /** `OF01` — `POST /api/offers/imports`. **WRITE**, asynchronous. */
  importFile(input: OfferImportFileInput, options?: RequestOptions): Promise<ImportTicket>;
  /** `OF02` — `GET /api/offers/imports/{import_id}`. */
  getImport(importId: string | number, options?: RequestOptions): Promise<OfferImportStatus>;
  /** `OF03` — `GET /api/offers/imports/{import_id}/error_report`. Returns raw CSV. */
  getImportErrorReport(importId: string | number, options?: RequestOptions): Promise<string>;
}

// ---------------------------------------------------------------------------
// Products (P11, P31, P41, P42, P44, P45, P46, P47)
// ---------------------------------------------------------------------------

/**
 * Identifier namespace accepted by `products.search`.
 *
 * Mirakl accepts the operator's own reference types here and documents `SKU` and `SHOP_SKU`
 * as invalid for this endpoint. Best Buy stamps its offers with `UPC-A`. The type stays open
 * because the accepted set is the operator's, not the platform's, and P31's matching
 * semantics are still unverified against this shop.
 */
export type ProductReferenceType =
  "UPC" | "UPC-A" | "EAN" | "GTIN" | (string & NonNullable<unknown>);

/** One `type|value` pair in a product search. */
export interface ProductSearchReference {
  type: ProductReferenceType;
  value: string;
}

/** Filters for `products.search`. */
export interface ProductSearchParams extends PageParams {
  references: readonly ProductSearchReference[];
}

/** A catalog product matched by `products.search`. */
export interface Product {
  product_sku?: string;
  product_title?: string;
  /** The reference that matched, echoed back with its type. */
  product_id?: string;
  product_id_type?: string;
  category_code?: string;
  category_label?: string;
  shop_sku?: string;
  product_references?: ProductReference[];
  active?: boolean;
}

/** Payload for `products.importFile`. */
export interface ProductImportFileInput {
  file: Blob | Uint8Array;
  fileName: string;
  /**
   * Sends `operator_format` (as the string `"true"`/`"false"`). VERIFIED 2026-10-10: every
   * product import that reached the catalog stage was sent with `true`, with a comma-delimited
   * quoted UTF-8 CSV in the operator's own column layout (`BBYCat`, `shop_sku`, then
   * `_<Attribute>_<id>_<category>_EN` columns from PM11).
   */
  operatorFormat?: boolean;
}

/**
 * Progress of a product import (VERIFIED 2026-10-10).
 *
 * Unlike an offer import, a product import runs in two stages: Best Buy first transforms the
 * file (`transform_lines_*`, status `SENT` while that is the only thing that happened), then
 * the products are integrated into the catalog (`integration_details`, status `COMPLETE`).
 * `COMPLETE` still does not mean success - read `integration_details` and the reports.
 */
export interface ProductImportStatus {
  import_id: number;
  /** Seen: `SENT`, `COMPLETE`. */
  import_status?: string;
  shop_id?: number;
  date_created?: string;
  has_error_report?: boolean;
  has_new_product_report?: boolean;
  has_transformation_error_report?: boolean;
  has_transformed_file?: boolean;
  transform_lines_read?: number;
  transform_lines_in_success?: number;
  transform_lines_in_error?: number;
  transform_lines_with_warning?: number;
  /** Present once the import has reached the integration stage. */
  integration_details?: {
    invalid_products?: number;
    products_not_accepted_in_time?: number;
    products_not_synchronized_in_time?: number;
    products_successfully_synchronized?: number;
    products_with_synchronization_issues?: number;
    products_with_wrong_identifiers?: number;
    rejected_products?: number;
  } | null;
  update_options?: { allow_locked_values_override?: boolean; lock_mode?: string } | null;
}

/** Filters for `products.offers`. At least one of `productIds` / `references` is required. */
export interface ProductOffersParams {
  /** Best Buy product SKUs (the `product_sku` P31 returns). Mirakl caps this at 100. */
  productIds?: readonly string[];
  /** `TYPE|VALUE` references, as in `products.search`. Mirakl caps this at 100. */
  references?: readonly ProductSearchReference[];
  /**
   * `false` (the default upstream) returns only active offers; `true` returns every offer,
   * including inactive ones. VERIFIED 2026-10-10 that a product whose only offer is inactive
   * comes back with `offers: []` unless this is `true`.
   */
  allOffers?: boolean;
  /** Offer condition codes to include. */
  offerStateCodes?: readonly string[];
}

/**
 * One offer on a catalog product, in the public marketplace view P11 returns - including
 * other sellers' offers. Unlike {@link Offer} it has no `shop_sku`, and on Best Buy `shop_id`,
 * `shop_grade`, `logistic_class` and `msrp` are null (VERIFIED 2026-10-10).
 */
export interface ProductOffer {
  offer_id: number;
  active?: boolean;
  all_prices?: OfferPricing[];
  applicable_pricing?: OfferPricing | null;
  allow_quote_requests?: boolean;
  channels?: string[];
  currency_iso_code?: string;
  description?: string | null;
  discount?: OfferDiscount | null;
  inactivity_reasons?: string[];
  is_professional?: boolean;
  leadtime_to_ship?: number | null;
  logistic_class?: OfferLogisticClass | null;
  min_quantity_alert?: number | null;
  min_shipping_price?: number | null;
  min_shipping_price_additional?: number | null;
  min_shipping_type?: string | null;
  min_shipping_zone?: string | null;
  msrp?: number | null;
  nb_evaluation?: number | null;
  offer_additional_fields?: AdditionalField[];
  premium?: boolean;
  price: number;
  price_additional_info?: string | null;
  quantity?: number;
  /** ISO-8601 timestamp. */
  shipping_deadline?: string | null;
  shop_grade?: number | null;
  shop_id?: number | null;
  shop_name?: string;
  state_code?: string;
  total_price?: number;
}

/** A catalog product with the offers sellers have placed on it (P11). */
export interface ProductWithOffers {
  product_sku: string;
  product_title: string;
  product_brand?: string | null;
  product_description?: string | null;
  product_media?: { media_url: string; type?: string } | null;
  product_references: ProductReference[];
  category_code: string;
  category_label: string;
  /** Number of offers on this product, not the number of products in the response. */
  total_count: number;
  offers: ProductOffer[];
}

/** Product catalog lookups and imports. */
export interface ProductsApi {
  /** `P31` — `GET /api/products?product_references=TYPE|VALUE`. */
  search(params: ProductSearchParams, options?: RequestOptions): Promise<Page<Product>>;
  /**
   * `P11` — `GET /api/products/offers`. Every seller's offers on the given products (the
   * competitor-visibility read). Not paged: the envelope carries no `total_count`.
   */
  offers(params: ProductOffersParams, options?: RequestOptions): Promise<ProductWithOffers[]>;
  /** `P41` — `POST /api/products/imports`. **WRITE**, asynchronous. */
  importFile(input: ProductImportFileInput, options?: RequestOptions): Promise<ImportTicket>;
  /** `P42` — `GET /api/products/imports/{import_id}`. */
  getImport(importId: string | number, options?: RequestOptions): Promise<ProductImportStatus>;
  /** `P44` — `GET /api/products/imports/{import_id}/error_report`. Returns raw CSV. */
  getImportErrorReport(importId: string | number, options?: RequestOptions): Promise<string>;
  /** `P45` — `GET /api/products/imports/{import_id}/new_product_report`. Returns raw CSV. */
  getNewProductReport(importId: string | number, options?: RequestOptions): Promise<string>;
  /**
   * `P46` — `GET /api/products/imports/{import_id}/transformed_file`. The file as Best Buy
   * transformed it: raw CSV, semicolon-delimited and quoted. Check
   * `ProductImportStatus.has_transformed_file` first; an absent file answers `404`.
   */
  getTransformedFile(importId: string | number, options?: RequestOptions): Promise<string>;
  /**
   * `P47` — `GET /api/products/imports/{import_id}/transformation_error_report`. Raw CSV.
   * Answers `404` unless `ProductImportStatus.has_transformation_error_report` is true.
   */
  getTransformationErrorReport(
    importId: string | number,
    options?: RequestOptions,
  ): Promise<string>;
}

// ---------------------------------------------------------------------------
// Catalog metadata (H11, PM11, VL11)
// ---------------------------------------------------------------------------

/** A node of the operator's category hierarchy. */
export interface Hierarchy {
  code: string;
  label?: string;
  label_translations?: LocalizedLabel[];
  level?: number;
  /** Empty string on a root node, not null. */
  parent_code?: string | null;
  update_date?: string;
}

/** What an attribute means to the catalog, e.g. `TITLE`, `MAIN_IMAGE`, `UNIQUE_IDENTIFIER`. */
export interface AttributeRole {
  type: string;
  parameters?: { name: string; value?: string | null }[];
}

/** A product attribute definition. */
export interface ProductAttribute {
  code: string;
  label?: string;
  label_translations?: LocalizedLabel[];
  description?: string | null;
  description_translations?: LocalizedLabel[];
  /** `TEXT`, `LONG_TEXT`, `LIST`, `MEDIA`, `INTEGER`, `DECIMAL`. */
  type?: string;
  type_parameter?: string | null;
  type_parameters?: { name: string; value: string }[] | null;
  required?: boolean;
  /** `REQUIRED`, `RECOMMENDED` or `OPTIONAL` — finer-grained than `required`. */
  requirement_level?: string;
  variant?: boolean;
  roles?: AttributeRole[];
  /** Empty string when the attribute applies to every category. */
  hierarchy_code?: string | null;
  /** The value list backing a `LIST` attribute. */
  values_list?: string | null;
  /** Stock Mirakl's spelling of the same idea; Best Buy sends `values_list`. */
  values_list_code?: string | null;
  values?: ValueListEntry[] | null;
  default_value?: string | null;
  example?: string | null;
  /** Operator validation rules, e.g. `MAX_LENGTH|180` or an embedded `SCRIPT|...`. */
  validations?: string | null;
  transformations?: string | null;
}

/** One allowed value inside a value list. */
export interface ValueListEntry {
  code: string;
  label?: string;
  label_translations?: LocalizedLabel[];
}

/** A named list of allowed attribute values. */
export interface ValueList {
  code: string;
  label?: string;
  label_translations?: LocalizedLabel[];
  values?: ValueListEntry[];
}

/** Filters for `catalog.hierarchies`. */
export interface HierarchyParams {
  /** Restricts the result to one subtree. */
  hierarchy?: string;
  /** Deepest level to return. */
  maxLevel?: number;
}

/** Filters for `catalog.attributes`. */
export interface AttributeParams {
  hierarchy?: string;
  maxLevel?: number;
  /** Includes each attribute's role metadata. */
  withRoles?: boolean;
}

/** Filters for `catalog.valueLists`. */
export interface ValueListParams {
  /** Restricts the result to a single list. */
  code?: string;
}

/**
 * An operator-defined additional field, as declared by AF01. `required` fields must appear in
 * the matching write payload: on this operator every OFFER line needs `manufacturer-warranty`.
 */
export interface AdditionalFieldDefinition {
  code: string;
  label?: string;
  description?: string;
  /** The entity the field hangs off: `OFFER`, `ORDER_LINE` or `SHOP` on this operator. */
  entity?: string;
  /** `REGEX`, `NUMERIC`, `STRING`, `BOOLEAN` or `TEXTAREA` on this operator. */
  type?: string;
  required?: boolean;
  /** False when the operator sets the value itself and a seller write is ignored. */
  editable?: boolean;
  /** Validation pattern on a `REGEX` field, e.g. `(0|[1-9][0-9]*)`. */
  regex?: string;
}

/** Filters for `catalog.additionalFields`. */
export interface AdditionalFieldParams {
  /** Entities to describe, e.g. `["OFFER"]`. Sent comma-joined. */
  entities?: readonly string[];
}

/** Read-only catalog metadata: hierarchies, attributes, value lists and additional fields. */
export interface CatalogApi {
  /** `H11` — `GET /api/hierarchies`. */
  hierarchies(params?: HierarchyParams, options?: RequestOptions): Promise<Hierarchy[]>;
  /** `PM11` — `GET /api/products/attributes`. */
  attributes(params?: AttributeParams, options?: RequestOptions): Promise<ProductAttribute[]>;
  /** `VL11` — `GET /api/values_lists`. */
  valueLists(params?: ValueListParams, options?: RequestOptions): Promise<ValueList[]>;
  /** `AF01` — `GET /api/additional_fields`: the operator's custom-field declarations. */
  additionalFields(
    params?: AdditionalFieldParams,
    options?: RequestOptions,
  ): Promise<AdditionalFieldDefinition[]>;
}

// ---------------------------------------------------------------------------
// Shipping (SH11, SH12, SH21, SH31, SH42, SH52)
// ---------------------------------------------------------------------------

/** A carrier the operator accepts for tracking. */
export interface ShippingCarrier {
  code: string;
  label?: string;
  /** The carrier's cross-platform code, e.g. `ca-post`. Absent for `Other`. */
  standard_code?: string;
  /** Tracking URL template; `{trackingId}` is the placeholder. */
  tracking_url?: string;
}

/** A shipping zone configured by the operator. */
export interface ShippingZone {
  code: string;
  label?: string;
  /** Postal-code ranges the zone covers. */
  description?: string;
}

/** A shipping method (Mirakl calls it a shipping type) the operator offers. */
export interface ShippingType {
  code: string;
  label?: string;
  description?: string;
  standard_code?: string;
  click_and_collect?: boolean;
  delivery_by_operator?: boolean;
  /** When true the shop's lead time is excluded from the shipping deadline. */
  ignore_lead_time_to_ship?: boolean;
  /** When true a tracking number is required before a shipment can be confirmed. */
  mandatory_tracking?: boolean;
}

/** A logistic (package-size) class the operator defines. */
export interface LogisticClass {
  code: string;
  label?: string;
  description?: string;
}

/** Delivery window for one zone/method pair. */
export interface ShippingDeliveryTime {
  shipping_type_code: string;
  shipping_zone_code: string;
  /** Seen: `OPERATOR`. */
  set_by?: string;
  delivery_time?: { earliest_days?: number | null; latest_days?: number | null } | null;
}

/** Order cut-off for one shipping method. */
export interface ShippingCutOffTime {
  shipping_type_code: string;
  /** UTC time of day, e.g. `17:00:00Z`. */
  cut_off_time?: string | null;
  is_required?: boolean;
  set_by?: string;
}

/**
 * The shop's shipping configuration (SH42), VERIFIED 2026-10-10 (live). The same
 * `lead_time_to_ship.shop_value` is what the Best Buy seller portal edits; the SDK has no
 * write for it.
 */
export interface ShippingConfiguration {
  /** A string here, though A01 / SH52 carry the shop id as a number. */
  shop_id: string;
  /** ISO-8601 timestamp. */
  last_updated_date?: string;
  lead_time_to_ship: { default_value?: number | null; shop_value?: number | null };
  delivery_times: ShippingDeliveryTime[];
  order_cut_off_times: ShippingCutOffTime[];
  order_free_shipping: boolean;
  shipping_paid_by_operator: boolean;
}

/** One zone / method / logistic-class cell of the operator's shipping-charge grid. */
export interface ShippingChargeCell {
  shipping_zone_code: string;
  shipping_method_code: string;
  logistic_class_code: string;
  overridden_by_shop?: boolean;
  prices: {
    /** Seen live: `FREE_SHIPPING`. Documented: `FIXED_PRICE`, `ORDER_RANGE` (**ASSUMPTION**). */
    type: string;
    initial_price?: number | null;
    additional_price?: number | null;
    free_shipping_threshold?: number | null;
    ranges?: Record<string, unknown>[] | null;
  };
}

/** The shipping-charge grid (SH52). */
export interface ShippingCharges {
  shop_id: number;
  currency_iso_code: string;
  /** ISO-8601 timestamp. */
  last_updated_date?: string;
  configuration: ShippingChargeCell[];
}

/** Read-only shipping reference data. */
export interface ShippingApi {
  /** `SH21` — `GET /api/shipping/carriers`. */
  methods(options?: RequestOptions): Promise<ShippingCarrier[]>;
  /** `SH11` — `GET /api/shipping/zones`. */
  zones(options?: RequestOptions): Promise<ShippingZone[]>;
  /** `SH12` — `GET /api/shipping/types`. */
  types(options?: RequestOptions): Promise<ShippingType[]>;
  /** `SH31` — `GET /api/shipping/logistic_classes`. */
  logisticClasses(options?: RequestOptions): Promise<LogisticClass[]>;
  /** `SH42` — `GET /api/shipping/configuration/shop`: lead time, delivery times, cut-offs. */
  configuration(options?: RequestOptions): Promise<ShippingConfiguration>;
  /** `SH52` — `GET /api/shipping/charges/shop`: the shipping-charge grid. */
  charges(options?: RequestOptions): Promise<ShippingCharges>;
}

// ---------------------------------------------------------------------------
// Inbox (M11) and platform (V01, PC01, L01) - read-only
// ---------------------------------------------------------------------------

/** Filters for `inbox.threads`. */
export interface InboxThreadParams {
  /** e.g. `MMP_ORDER`, `MMP_OFFER`, `SELLER_OPERATOR` (Mirakl's documented set). */
  entityType?: string;
  /** Requires `entityType`; upstream answers `400` otherwise. */
  entityIds?: readonly string[];
  /** ISO-8601 timestamp: only threads modified at or after it. */
  updatedSince?: string;
  /** `true` includes the last 100 messages of each thread. Customer content: handle with care. */
  withMessages?: boolean;
  /** Seek-pagination page size. Upstream default 50. */
  limit?: number;
  /** `next_page_token` / `previous_page_token` from the previous page. **ASSUMPTION**: parameter name. */
  pageToken?: string;
}

/** Someone who can post on a thread. */
export interface InboxParticipant {
  /** Absent on the `OPERATOR` participant. */
  id?: string;
  /** Seen: `CUSTOMER`, `OPERATOR`, `SHOP`. */
  type: string;
  display_name?: string;
}

/** One message on a thread, present only when `withMessages` is set (VERIFIED 2026-10-10). */
export interface InboxMessage {
  id: string;
  /** Customer-written content. */
  body?: string | null;
  date_created?: string;
  /** Who wrote it. Seen: `SHOP_USER`; `organization_details` carries the author's organisation. */
  from?: {
    type: string;
    display_name?: string;
    organization_details?: Record<string, unknown> | null;
  } | null;
  to?: InboxParticipant[];
}

/** A message thread (M11). */
export interface InboxThread {
  id: string;
  /** Seen: `{ type: "FREE_TEXT", value: "…" }`. */
  topic?: { type: string; value?: string | null } | null;
  /** What the thread is about. Seen: `MMP_ORDER`. */
  entities?: { id: string; type: string; label?: string }[];
  authorized_participants?: InboxParticipant[];
  current_participants?: InboxParticipant[];
  date_created?: string;
  date_updated?: string;
  metadata?: {
    last_message_date?: string | null;
    /** Non-null while the shop owes the customer a reply. */
    shop_reply_needed_since?: string | null;
    total_count?: number;
  } | null;
  /** Present only when `withMessages` is set: the most recent messages (upstream caps it at 100). */
  messages?: InboxMessage[];
}

/** One page of threads. Seek pagination: follow `next_page_token`, there is no `total_count`. */
export interface InboxThreadList {
  data: InboxThread[];
  next_page_token?: string | null;
  previous_page_token?: string | null;
}

/** Read-only message inbox. */
export interface InboxApi {
  /** `M11` — `GET /api/inbox/threads`. */
  threads(params?: InboxThreadParams, options?: RequestOptions): Promise<InboxThreadList>;
}

/** A locale the platform supports. */
export interface PlatformLocale {
  code: string;
  label?: string;
  /** True on exactly one locale. */
  platform_default?: boolean;
}

/**
 * Platform feature flags (PC01). Only the envelope is typed: the `features` / `modules` /
 * `platform_configuration` trees are the operator's, read them off the loose objects.
 */
export interface PlatformConfiguration {
  platform_name: string;
  tenant_name?: string;
  /** IANA zone the platform's timestamps are expressed in, e.g. `America/Vancouver`. */
  timezone?: string;
  features?: Record<string, unknown>;
  modules?: Record<string, unknown>;
  platform_configuration?: Record<string, unknown>;
}

/** Read-only platform facts. */
export interface PlatformApi {
  /** `V01` — `GET /api/version`: the Mirakl platform version string (e.g. `3.1306`). */
  version(options?: RequestOptions): Promise<string>;
  /** `PC01` — `GET /api/platform/configuration`. */
  configuration(options?: RequestOptions): Promise<PlatformConfiguration>;
  /** `L01` — `GET /api/locales`. */
  locales(options?: RequestOptions): Promise<PlatformLocale[]>;
}

// ---------------------------------------------------------------------------
// Orders (OR11, OR12, OR21, OR23, OR24)
// ---------------------------------------------------------------------------

/** A tax line on an order line (`taxes`, `shipping_taxes`, `commission_taxes`). */
export interface OrderTax {
  /** e.g. `GST`, `PST`, `HST`, `ON_HST`. */
  code: string;
  amount?: number;
  /** Present on `commission_taxes` lines. */
  rate?: number;
  /** e.g. `NONE`, `PROPORTIONAL_TO_AMOUNT`. Present on `taxes` / `shipping_taxes` lines. */
  tax_calculation_rule?: string;
}

/** A postal address on an order (`customer.billing_address`, `customer.shipping_address`). */
export interface OrderAddress {
  civility?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  company?: string | null;
  company_2?: string | null;
  street_1?: string | null;
  street_2?: string | null;
  /** Shipping address only. */
  additional_info?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  country_iso_code?: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
}

/**
 * One line of an order (VERIFIED 2026-10-10).
 *
 * The date fields are `null` until the matching transition happens; the live suite has seen
 * the states `WAITING_ACCEPTANCE`, `SHIPPING` and `RECEIVED` (the full vocabulary beyond
 * those is still an assumption).
 */
export interface OrderLine {
  order_line_id: string;
  order_line_index?: number;
  order_line_state?: string;
  order_line_state_reason_code?: string | null;
  order_line_state_reason_label?: string | null;
  offer_id?: number;
  offer_sku?: string;
  offer_state_code?: string;
  product_sku?: string;
  product_shop_sku?: string | null;
  product_title?: string;
  category_code?: string;
  category_label?: string;
  description?: string | null;
  price_additional_info?: string | null;
  quantity: number;
  price?: number;
  price_unit?: number;
  total_price?: number;
  shipping_price?: number;
  shipping_price_unit?: number | null;
  shipping_price_additional_unit?: number | null;
  commission_fee?: number;
  commission_rate_vat?: number;
  commission_vat?: number;
  total_commission?: number;
  commission_taxes?: OrderTax[];
  taxes?: OrderTax[];
  shipping_taxes?: OrderTax[];
  can_refund?: boolean;
  cancelations?: unknown[];
  refunds?: unknown[];
  fees?: unknown[];
  promotions?: unknown[];
  created_date?: string;
  last_updated_date?: string;
  debited_date?: string | null;
  shipped_date?: string | null;
  received_date?: string | null;
  /** This operator declares `language` (required) and `ehf-charge` for ORDER_LINE (AF01). */
  order_line_additional_fields?: AdditionalField[];
  product_medias?: { media_url: string; mime_type?: string | null; type?: string | null }[];
  shipping_from?: { address?: OrderAddress | null; warehouse?: unknown } | null;
}

/** The customer on an order. Addresses are `null` until the order is accepted. */
export interface OrderCustomer {
  customer_id?: string;
  firstname?: string;
  lastname?: string;
  civility?: string;
  locale?: string;
  billing_address?: OrderAddress | null;
  shipping_address?: OrderAddress | null;
}

/**
 * An order as returned by the list and get endpoints (VERIFIED 2026-10-10).
 *
 * `orders.list` (OR11) returns the whole object. `orders.get` (OR12) returns a strict subset
 * of it - no `delivery_date`, `shipping_deadline`, `shipping_carrier_code`, `references`,
 * `fulfillment`, `can_cancel`, `currency_iso_code`, ... - so those fields are optional.
 */
export interface Order {
  order_id: string;
  commercial_id?: string;
  order_state?: string;
  order_state_reason_code?: string | null;
  order_state_reason_label?: string | null;
  created_date?: string;
  last_updated_date?: string;
  acceptance_decision_date?: string | null;
  customer_debited_date?: string | null;
  can_cancel?: boolean;
  can_shop_ship?: boolean;
  currency_iso_code?: string;
  price?: number;
  total_price?: number;
  total_commission?: number;
  shipping_price?: number;
  shipping_type_code?: string;
  shipping_type_label?: string;
  shipping_type_standard_code?: string;
  shipping_zone_code?: string;
  shipping_zone_label?: string;
  shipping_company?: string | null;
  shipping_carrier_code?: string | null;
  shipping_carrier_standard_code?: string | null;
  shipping_tracking?: string | null;
  shipping_tracking_url?: string | null;
  /** ISO-8601 UTC: when the order must ship by. */
  shipping_deadline?: string | null;
  shipping_pudo_id?: string | null;
  leadtime_to_ship?: number;
  /** The delivery window promised to the customer. */
  delivery_date?: { earliest?: string | null; latest?: string | null } | null;
  fulfillment?: { center?: { code?: string } } | null;
  references?: { order_reference_for_customer?: string | null } | null;
  payment_type?: string | null;
  /** e.g. `PAY_ON_ACCEPTANCE`. */
  payment_workflow?: string;
  /** e.g. `TAX_EXCLUDED`. */
  order_tax_mode?: string;
  customer_notification_email?: string | null;
  customer_directly_pays_seller?: boolean;
  fully_refunded?: boolean;
  has_customer_message?: boolean;
  has_incident?: boolean;
  has_invoice?: boolean;
  channel?: string | null;
  quote_id?: string | null;
  order_additional_fields?: AdditionalField[];
  customer?: OrderCustomer;
  order_lines: OrderLine[];
}

/** Filters for `orders.list`. */
export interface OrderListParams extends PageParams {
  /** Order state codes to include, e.g. `WAITING_ACCEPTANCE`. */
  orderStateCodes?: readonly string[];
  /** Only orders created at or after this instant. */
  startDate?: string | Date;
  /** Only orders updated at or after this instant. */
  startUpdateDate?: string | Date;
  /** Filters on whether the customer has been debited. */
  customerDebited?: boolean;
}

/** One accept/refuse decision for an order line. */
export interface OrderLineDecision {
  id: string;
  accepted: boolean;
}

/** Payload for `orders.accept`. */
export interface OrderAcceptInput {
  orderLines: readonly OrderLineDecision[];
}

/** Payload for `orders.setTracking`. */
export interface OrderTrackingInput {
  carrierCode?: string;
  carrierName?: string;
  carrierUrl?: string;
  trackingNumber: string;
}

/** Order reads and the three order writes. Only `list` and `get` are safe against a live shop. */
export interface OrdersApi {
  /** `OR11` — `GET /api/orders`. */
  list(params?: OrderListParams, options?: RequestOptions): Promise<Page<Order>>;
  /** `OR11` — pages through every matching order. */
  listAll(params?: OrderListParams, options?: RequestOptions): AsyncIterableIterator<Order>;
  /** `OR12` — `GET /api/orders/{order_id}`. */
  get(orderId: string, options?: RequestOptions): Promise<Order>;
  /** `OR21` — `PUT /api/orders/{order_id}/accept`. **WRITE**. */
  accept(orderId: string, input: OrderAcceptInput, options?: RequestOptions): Promise<void>;
  /** `OR24` — `PUT /api/orders/{order_id}/ship`. **WRITE**. */
  ship(orderId: string, options?: RequestOptions): Promise<void>;
  /** `OR23` — `PUT /api/orders/{order_id}/tracking`. **WRITE**. */
  setTracking(orderId: string, input: OrderTrackingInput, options?: RequestOptions): Promise<void>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** The Best Buy Canada Marketplace client returned by `createBestBuyClient`. */
export interface BestBuyClient {
  readonly account: AccountApi;
  readonly offers: OffersApi;
  readonly products: ProductsApi;
  readonly catalog: CatalogApi;
  readonly shipping: ShippingApi;
  readonly orders: OrdersApi;
  readonly inbox: InboxApi;
  readonly platform: PlatformApi;
}
