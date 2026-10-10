# Best Buy Canada Marketplace — API contracts

**Status of this document: the whole READ surface the SDK wraps is verified live; of the WRITE
surface, only the offer import (OF24) is.**

On **2026-09-11** the read-only endpoints below were called against the real Best Buy Canada
seller account and their responses captured. Those rows are marked `VERIFIED 2026-09-11` and
the field inventories under them are transcribed from the observed payloads. On **2026-09-16**
an owner-authorized offer import added OF24 and its follow-up reads (OF02, OF03) plus AF01.
On **2026-10-10** every remaining READ endpoint the SDK wraps (account, offers, orders with
real orders now on the shop, product search, product-import status and reports, catalog
metadata, shipping) was re-called read-only and compared field by field with the SDK's schemas;
those rows are marked `VERIFIED 2026-10-10 (live)`. The remaining mutating endpoints — the file
imports and every order write — are still **ASSUMPTION**, derived from Mirakl's published
seller API reference.

Two sources are cited throughout:

- **live** — an observed response from this shop (read-only apart from the 2026-09-16 offer
  import noted above).
- **docs** — Mirakl's seller API reference,
  <https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3> (read 2026-09-11).
  Best Buy runs a Mirakl instance but is free to deviate, so anything only the docs say is
  still an assumption about _this_ operator.

Ground facts, all live-verified:

- Base URL: `https://marketplace.bestbuy.ca` — **VERIFIED 2026-09-11**
- Auth: `Authorization: <api-key>` — the raw key, **no `Bearer` prefix**, no token exchange.
  **VERIFIED 2026-09-11** (A01 returns 200 with it).
- Multi-shop users add `shop_id=<id>` as a query parameter. Not required for this account.
- Content type: `application/json` on JSON bodies, `multipart/form-data` on file imports.
- Dates: ISO-8601, UTC with a `Z` suffix (`2026-09-16T06:59:59.999Z`). Mirakl is JSON-native:
  numbers arrive as numbers and booleans as booleans. The platform's back-office timezone is
  `America/Vancouver` (PC01), so a date that looks like a local end-of-day will be expressed
  in UTC on the wire.
- Paging: `max` (≤ 100) and `offset`; list responses carry `total_count`. **VERIFIED
  2026-10-10 (live)** on OF21 and OR11, with two quirks: the server does **not** reject
  `max=101` (it returned every record), so the 100 cap is the SDK's own, kept deliberately; and
  an `offset` past the end returns an empty page whose `total_count` is `0` on OR11 (OF21
  keeps reporting the real total). Never treat `total_count` on an empty page as the size of
  the collection. Lists come back oldest-first (OR11 orders ascend by `created_date`).
- Response headers: every response carries `x-correlation-id` (a UUID) and **no**
  `x-request-id`; no rate-limit headers (`retry-after`, `x-ratelimit-*`) were seen on any 2xx
  or 4xx. The SDK reads `x-correlation-id` as the error `requestId`. **VERIFIED 2026-10-10
  (live).** No 429 was ever received in ~60 reads spaced 3.3 s apart, but the real limit is
  still unknown.

### A note on the Mirakl API codes

The codes in this document and in `packages/sdk/src/operations.ts` were corrected on
2026-09-11 against Mirakl's own reference. Earlier revisions used several codes that do not
exist upstream. The corrections: offer-get is **OF22** (not OF41); product search is **P31**
(not P11 — P11 is `GET /api/products/offers`, a different endpoint); the product import error
report is **P44** and the added-products report **P45** (not P43/P44); carriers are **SH21**
and zones **SH11** (they were swapped); ship is **OR24** and tracking **OR23** (also
swapped). The paths never changed — only the labels you would search the Mirakl docs for.

---

## 1. Write / read classification

This table is the contract the live-suite read-only guard is built on. It mirrors
`packages/sdk/src/operations.ts`, which is the machine-readable source of truth —
`scripts/check-live-readonly.ts` parses that file, not this one, so the two must agree.

| SDK method                      | Mirakl | Method | Path                                                   | Access    | Status                     |
| ------------------------------- | ------ | ------ | ------------------------------------------------------ | --------- | -------------------------- |
| `account.get`                   | A01    | GET    | `/api/account`                                         | READ      | VERIFIED 2026-10-10 (live) |
| `offers.list`                   | OF21   | GET    | `/api/offers`                                          | READ      | VERIFIED 2026-10-10 (live) |
| `offers.get`                    | OF22   | GET    | `/api/offers/{offer_id}`                               | READ      | VERIFIED 2026-10-10 (live) |
| `offers.states`                 | OF61   | GET    | `/api/offers/states`                                   | READ      | VERIFIED 2026-10-10 (live) |
| `offers.update`                 | OF24   | POST   | `/api/offers`                                          | **WRITE** | VERIFIED 2026-09-16        |
| `offers.importFile`             | OF01   | POST   | `/api/offers/imports`                                  | **WRITE** | ASSUMPTION                 |
| `offers.getImport`              | OF02   | GET    | `/api/offers/imports/{import_id}`                      | READ      | VERIFIED 2026-10-10 (live) |
| `offers.getImportErrorReport`   | OF03   | GET    | `/api/offers/imports/{import_id}/error_report`         | READ      | VERIFIED 2026-10-10 (live) |
| `products.search`               | P31    | GET    | `/api/products`                                        | READ      | VERIFIED 2026-10-10 (live) |
| `products.importFile`           | P41    | POST   | `/api/products/imports`                                | **WRITE** | ASSUMPTION                 |
| `products.getImport`            | P42    | GET    | `/api/products/imports/{import_id}`                    | READ      | VERIFIED 2026-10-10 (live) |
| `products.getImportErrorReport` | P44    | GET    | `/api/products/imports/{import_id}/error_report`       | READ      | VERIFIED 2026-10-10 (live) |
| `products.getNewProductReport`  | P45    | GET    | `/api/products/imports/{import_id}/new_product_report` | READ      | VERIFIED 2026-10-10 (live) |
| `catalog.hierarchies`           | H11    | GET    | `/api/hierarchies`                                     | READ      | VERIFIED 2026-10-10 (live) |
| `catalog.attributes`            | PM11   | GET    | `/api/products/attributes`                             | READ      | VERIFIED 2026-10-10 (live) |
| `catalog.valueLists`            | VL11   | GET    | `/api/values_lists`                                    | READ      | VERIFIED 2026-10-10 (live) |
| `catalog.additionalFields`      | AF01   | GET    | `/api/additional_fields`                               | READ      | VERIFIED 2026-10-10 (live) |
| `shipping.methods`              | SH21   | GET    | `/api/shipping/carriers`                               | READ      | VERIFIED 2026-10-10 (live) |
| `shipping.zones`                | SH11   | GET    | `/api/shipping/zones`                                  | READ      | VERIFIED 2026-10-10 (live) |
| `shipping.types`                | SH12   | GET    | `/api/shipping/types`                                  | READ      | VERIFIED 2026-10-10 (live) |
| `orders.list`                   | OR11   | GET    | `/api/orders`                                          | READ      | VERIFIED 2026-10-10 (live) |
| `orders.get`                    | OR12   | GET    | `/api/orders/{order_id}`                               | READ      | VERIFIED 2026-10-10 (live) |
| `orders.accept`                 | OR21   | PUT    | `/api/orders/{order_id}/accept`                        | **WRITE** | ASSUMPTION                 |
| `orders.ship`                   | OR24   | PUT    | `/api/orders/{order_id}/ship`                          | **WRITE** | ASSUMPTION                 |
| `orders.setTracking`            | OR23   | PUT    | `/api/orders/{order_id}/tracking`                      | **WRITE** | ASSUMPTION                 |

The verb does not decide the classification — the effect on the account does. Today every
READ here happens to be a GET, and the guard asserts that; if the operator ever exposes a
read-on-POST endpoint, classify it in `operations.ts` and say why in this document.

---

## 2. Account

### A01 `GET /api/account` — **VERIFIED 2026-09-11**

Returns the authenticated shop. Observed top-level fields, in the order the platform sends
them:

`applicable_taxes[]` (`{code, label, fee_types[]}`), `approval_delay` (null),
`approval_rate` (null), `banner` (null), `billing_info` (`{bank_city, bank_name, bank_street,
bic, iban, owner, zip_code}`, all null here), `channels[]` (`["INIT"]`), `closed_from` (null),
`closed_to` (null), `contact_informations` (`{city, civility, country, email, fax, firstname,
lastname, phone, phone_secondary, state, street1, street2, web_site, zip_code}`),
`currency_iso_code` (`"CAD"`), `date_created`, `default_billing_information`
(`{corporate_information{company_registration_name, company_registration_number},
default_language, fiscal_information{tax_identification_country}, id,
registration_address{city, country_iso_code, state, street_1, street_2, zip_code}}`),
`description`, `domains[]` (`["PRODUCT"]`), `evaluations_count`, `free_shipping`, `grade`
(null), `is_professional`, `last_updated_date`, `logo` (null), `model` (`"MARKETPLACE"`),
`offers_count`, `order_messages_response_delay` (null), `orders_count`, `payment_details`
(`{paid_balance, payable_balance, pending_balance}`), `payment_info` (`{@type,
bank_account_number, bank_name, bic, owner, routing_number}`), `payment_method_mandatory`,
`premium`, `pro_details` (`{VAT_number, corporate_name, identification_number,
tax_identification_number}`), `return_policy`, `shipping` (`{lead_time_to_ship}`, null here),
`shipping_country` (`"CAN"`), `shipping_types[]` (`["M"]`), `shipping_zones[]` (13 codes),
`shippings[]` (`{additional_fields[], shipping_free_amount, shipping_type_code,
shipping_type_label, shipping_type_standard_code, shipping_zone_code, shipping_zone_label}`
— one row per zone), `shop_additional_fields[]` (`{code, type, value}`: `bc-pst`,
`french-supported`, `hst-gst`, `mb-pst`, `qc-qst`, `seller-validation`, `shop-description-fr`,
`shop-name-fr`, `sk-pst`), `shop_id`, `shop_name`, `shop_state` (`"OPEN"`),
`suspension_type` (null).

Fields earlier assumed and **not** returned: `email`, `closed`, `state`. The shop's state is
`shop_state`; the contact e-mail lives under `contact_informations.email`.

**Re-verified 2026-10-10 (live)**: the key set is unchanged (the captured body parses through
`accountSchema`). Two value-level facts worth knowing: `shipping.lead_time_to_ship` is still
`null` here (the operator, not the seller, sets the lead time - offers all carry
`leadtime_to_ship` 2), and `offers_count` (22) counts **active** offers while `GET /api/offers`
reports `total_count` 34 - OF21 also lists the deactivated ones. `shop_id` is a JSON number.

Only `shop_id` is treated as required. This is the cheapest read in the API and the natural
credential preflight. The SDK types the operational fields and deliberately leaves the
banking/billing objects untyped (they still pass through).

The sanitized fixture is `packages/sdk/test/fixtures/account.json` — contact, banking,
billing and registration values are placeholders; the shape is the real one.

---

## 3. Offers

### OF21 `GET /api/offers` — **VERIFIED 2026-09-11**

Query: `sku`, `product_id`, `offer_state_codes`, `max`, `offset` (docs also list `favorite`,
`pricing_channel_code`, `pricing_customer_organization_id`).

Envelope: `{ "offers": [...], "total_count": <int> }`.

Observed offer fields — this is the full set the platform returned for all 11 offers:

| Field                                                                              | Observed                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `offer_id`                                                                         | integer                                                                                                                  |
| `shop_sku`, `product_sku`, `product_title`, `product_brand`, `product_description` | strings                                                                                                                  |
| `price`, `total_price`                                                             | numbers                                                                                                                  |
| `msrp`                                                                             | **null**                                                                                                                 |
| `price_additional_info`, `description`                                             | **null**                                                                                                                 |
| `all_prices[]`                                                                     | `{channel_code, discount_start_date, discount_end_date, price, unit_discount_price, unit_origin_price, volume_prices[]}` |
| `applicable_pricing`                                                               | same object as one `all_prices` entry                                                                                    |
| `…volume_prices[]`                                                                 | `{price, quantity_threshold, unit_discount_price, unit_origin_price}`                                                    |
| `quantity`                                                                         | integer                                                                                                                  |
| `state_code`                                                                       | `"11"` on every offer                                                                                                    |
| `active`                                                                           | boolean                                                                                                                  |
| `allow_quote_requests`                                                             | `false`                                                                                                                  |
| `inactivity_reasons[]`                                                             | empty, or `["PRODUCT_STATUS_REJECTED"]` on a deactivated offer                                                           |
| `leadtime_to_ship`                                                                 | integer                                                                                                                  |
| `shipping_deadline`                                                                | ISO-8601 UTC string                                                                                                      |
| `discount`                                                                         | **null**                                                                                                                 |
| `category_code`, `category_label`                                                  | `"CAT_1084"` / `"Hard Drives"`                                                                                           |
| `channels[]`                                                                       | `["INIT"]`                                                                                                               |
| `currency_iso_code`                                                                | `"CAD"`                                                                                                                  |
| `logistic_class`                                                                   | **object** `{code, label}`, e.g. `{"code":"SMALL","label":"Small Box (0.5 - 3.0kg/1.1 to 6.6Lbs)"}`                      |
| `fulfillment`                                                                      | `{"center":{"code":"DEFAULT"}}`                                                                                          |
| `min_shipping_price`, `min_shipping_price_additional`                              | numbers                                                                                                                  |
| `min_shipping_type`, `min_shipping_zone`                                           | `"M"` / `"BCLocal"`                                                                                                      |
| `offer_additional_fields[]`                                                        | `{code, type, value}` — this shop carries `manufacturer-warranty`                                                        |
| `product_references[]`                                                             | `{reference, reference_type}` with `reference_type` = `"UPC-A"`                                                          |
| `warehouses`                                                                       | **null**                                                                                                                 |

Not returned by this operator, though Mirakl documents them: `min_quantity_alert`,
`available_start_date`, `available_end_date`, `max_order_quantity`, `min_order_quantity`,
`package_quantity`, `internal_description`, `favorite_rank`, `eco_contributions`,
`retail_prices`, `product_tax_code`. The SDK keeps them optional.

**This is the payload that broke the first live run.** The SDK modelled `logistic_class` as a
string and `description` / `price_additional_info` as non-nullable, so `offers.list` threw
`BestBuyValidationError: Unexpected offer list payload`. Fixed on 2026-09-11 and pinned by
`packages/sdk/test/fixtures/offers-list.json`.

Required by the SDK: `offer_id`, `shop_sku`, `price`, `quantity`, plus `total_count` on the
envelope.

**VERIFIED 2026-10-10 (live)** against 34 offers (22 active, 12 inactive): the field set above
is complete and unchanged, `msrp`, `discount`, `description`, `price_additional_info` and
`warehouses` were `null` on every offer, `state_code` was `"11"` everywhere, and
`product_references` always held a single `UPC-A` entry. Further observations:

- `inactivity_reasons[]` values seen: `ZERO_QUANTITY`, `PRODUCT_STATUS_REJECTED`,
  `CATEGORY_UNAUTHORIZED_TO_SELL`. An inactive offer also keeps its stored `quantity`.
- Filters: `sku=<shop_sku>` returned that offer only (`total_count` 1); `product_id=<product_sku>`
  matched on the **Best Buy product SKU** (`product_sku`), not on the UPC; `offer_state_codes=11`
  returned all 34; an unknown `sku` returns `{"offers":[],"total_count":0}` (200, not 404).
- Paging: `max=2` windows (`offset` 0 then 2) returned disjoint offers with a constant
  `total_count`; `offset=1000` returned an empty page with the real `total_count`.
- Every offer's `offer_additional_fields[]` held exactly one entry, `manufacturer-warranty`
  (`type` `REGEX`, string value).
- `all_prices[]` and `applicable_pricing` carried one entry with `channel_code` `null`, no
  discount dates, and one `volume_prices[]` row (`quantity_threshold` 1).

### OF22 `GET /api/offers/{offer_id}` — **VERIFIED 2026-09-11**

The same offer object, unwrapped (no envelope, no `total_count`). Verified against a
deactivated offer, which is where `inactivity_reasons` was observed non-empty. Re-verified
2026-10-10 (live): identical key set to the OF21 element. An unknown id answers
`404 {"message":"Not Found","status":404}`.

### OF61 `GET /api/offers/states` — **VERIFIED 2026-09-11**

```json
{ "offer_states": [{ "code": "11", "label": "New" }], "total_count": 1 }
```

The envelope also carries `total_count` (1). Re-verified 2026-10-10 (live).

**Best Buy Canada configures exactly one offer condition: `11` (New).** There is no
refurbished or used condition on this platform — anything that assumes a Mirakl instance's
wider `11`/`12`/…/`51` range does not apply here. `GET /api/offers/conditions` and
`/api/offer_states` both 404; `/api/offers/states` is the path.

### OF24 `POST /api/offers` — **WRITE** — **VERIFIED 2026-09-16**

Body:

```json
{
  "offers": [
    {
      "shop_sku": "SKU-1",
      "product_id": "0840006676577",
      "product_id_type": "UPC",
      "price": 129.99,
      "quantity": 4,
      "state_code": "11",
      "update_delete": "update",
      "description": "optional",
      "min_quantity_alert": 1,
      "leadtime_to_ship": 2,
      "logistic_class": "SMALL",
      "discount": { "price": 119.99, "start_date": "...", "end_date": "..." },
      "price_additional_info": "optional",
      "available_started": "...",
      "available_ended": "..."
    }
  ]
}
```

Two asymmetries between this write payload and the OF21 read, both confirmed in the docs and
both modelled in the SDK (`OfferDiscountInput` vs `OfferDiscount`):

- the discount amount is `price` on a write and `discount_price` on a read;
- `logistic_class` is a bare code string on a write and an object on a read.

Response: `{ "import_id": 5150 }` (201). The call is **asynchronous** — a 2xx means the
platform accepted the batch, not that any offer changed. Poll OF02 for the outcome and OF03
for the per-line errors. Mirakl deduplicates identical import requests and may return the
`import_id` of an existing import rather than creating a new one.

**ASSUMPTION**: the SDK requires `shop_sku`, `product_id`, `product_id_type`, `price`,
`quantity` and `state_code` on every record. The docs mark `quantity` optional and
`update_delete` required; requiring the full set is still the safe default, because a partial
payload the platform reads as a full one can silently reset a field.

**VERIFIED 2026-09-16 — every offer line must also carry the operator's required additional
fields.** A batch whose records satisfied the schema above was accepted with an `import_id`,
then failed **every** line on the operator side with
`The mandatory additional field "manufacturer-warranty" is missing`. The required set comes
from AF01 (`GET /api/additional_fields?entities=OFFER`, section 5), not from the offer schema,
so a line that satisfies this document can still fail upstream. Send them as
`offer_additional_fields: [{ "code": "...", "value": "..." }]` — the write shape is
`{code, value}`, without the `type` a read returns. This is also the practical proof that a
2xx from OF24 says nothing about the outcome: the outcome is OF02 plus OF03.

### OF01 `POST /api/offers/imports` — **WRITE** — **ASSUMPTION**

`multipart/form-data` with parts `file`, `import_mode` (`NORMAL` | `PARTIAL_UPDATE` |
`REPLACE`) and optional `with_products`. Response `{ "import_id": 77 }`.

**Danger**: `REPLACE` is the Mirakl equivalent of a full-catalog overwrite. The SDK exposes
it because the platform does, but nothing in this repo may default to it.

### OF02 `GET /api/offers/imports/{import_id}` — **VERIFIED 2026-09-16**

The complete body, as returned for the OF24 batch above:

```json
{
  "date_created": "2026-09-16T21:20:13Z",
  "has_error_report": true,
  "import_id": 40208046,
  "lines_in_error": 10,
  "lines_in_pending": 0,
  "lines_in_success": 0,
  "lines_read": 10,
  "mode": "NORMAL",
  "offer_deleted": 0,
  "offer_inserted": 0,
  "offer_updated": 0,
  "status": "COMPLETE",
  "type": "MIRAKL"
}
```

**The outcome key is `status`, not `import_status`.** Mirakl's reference documents
`import_status`, and that is the key this document and the SDK carried before today; it was
not present in the live body. Reading `import_status` yields `undefined` on this operator,
which is indistinguishable from an import that has not finished — read `status`. The SDK keeps
`import_status` as an optional field so a payload that does use the documented spelling still
parses, but it has never been observed here.

`status` was `COMPLETE` for a batch in which every line failed: **`COMPLETE` describes the
processing run, not success.** The line counters are the outcome — here `lines_read` 10,
`lines_in_error` 10, `lines_in_success` 0 — together with `has_error_report`. Also observed:
`mode` (the import mode, `NORMAL`), `type` (`MIRAKL` for an OF24 batch) and the
`offer_inserted` / `offer_updated` / `offer_deleted` counters, all zero here.
`date_process_started` and `date_process_ended`, which the docs mention, were not returned.

**Re-verified 2026-10-10 (live)** on two further single-line OF24 batches from 2026-10-05: the
body has exactly the keys listed above and still spells the outcome `status` (`COMPLETE`),
with `lines_read` 1 / `lines_in_error` 1. The key set is stable across batches. An unknown
import id answers `404 {"message":"Not Found","status":404}`.

### OF03 `GET /api/offers/imports/{import_id}/error_report` — **VERIFIED 2026-09-16**

Returns CSV, not JSON; the SDK returns the text verbatim. Quoted, comma-separated, with the
submitted offer columns followed by two error columns. The observed header row:

```csv
"sku","product-id","product-id-type","description","internal-description","price","price-ranges","price-additional-info","quantity","min-quantity-alert","state","available-start-date","available-end-date","update-delete","logistic-class","discount-price","discount-start-date","discount-end-date","discount-ranges","leadtime-to-ship","allow-quote-requests","product-tax-code","min-order-quantity","max-order-quantity","package-quantity","pricing-unit","error-line","error-message"
```

`error-line` is the line number within the submitted batch and `error-message` is the
operator's text. The last two columns of a representative row:

```csv
"2","The mandatory additional field ""manufacturer-warranty"" is missing"
```

Note the doubled quotes: the message embeds a quoted field code, escaped CSV-style. Anything
parsing this report has to handle embedded quotes rather than splitting on commas.

Re-verified 2026-10-10 (live): `200`, `Content-Type: text/csv`, same 28-column header. A second
failure mode was seen on a 2026-10-05 batch: `error-message` =
`The product does not exist` (the `product-id` / `product-id-type` pair matched nothing in the
catalog). Any parser should therefore treat `error-message` as free text.

---

## 4. Products

### P31 `GET /api/products` — **VERIFIED 2026-09-16**

Query: `product_references=TYPE|VALUE,TYPE|VALUE`, plus `max` and `offset`. The pipe may be
sent raw or percent-encoded (`%7C`) — both were confirmed to work. Omitting the `TYPE|`
prefix is rejected: `400 {"message":"Invalid query param format, expected 'a|x,b|y'"}`.

This endpoint **works and returns matches**, correcting the 2026-09-11 entry in this document
which recorded it as always-empty and speculated the operator had disabled catalog reads for
sellers. That conclusion was a bad probe, not upstream behaviour. Re-verified 2026-09-16
against this shop with `UPC-A|843591031110` (a UPC carried by our own live offer 240270298):

```json
{
  "products": [
    {
      "category_code": "CAT_1076",
      "category_label": "Computer Memory",
      "product_id": "843591031110",
      "product_id_type": "UPC-A",
      "product_sku": "12978747",
      "product_title": "DDR4, 3200MHz 16GB 2 x 288 DIMM, Unbuffered, 16-18-18-36 ..."
    }
  ],
  "total_count": 1
}
```

Live-proven matching semantics, all 2026-09-16:

- **`UPC-A` is the working reference type** for this operator. `EAN`, `GTIN` and `MPN` were
  re-tried against a product known to be in the catalog and all returned empty, so `UPC-A` is
  effectively the only usable type here.
- **The stored reference is matched literally, including leading zeros.** Best Buy stores some
  UPCs zero-padded to 13 digits (`0887276843674`) and others bare (`649528940001`). A query
  for the bare form of a zero-padded record misses. Always probe both forms — send
  `UPC-A|<upc>,UPC-A|0<upc>` in one call, since the parameter takes a comma-separated list.
- **Batching works**: up to 10 references per call were exercised without truncation, and the
  response omits references that do not match rather than returning a placeholder. Mirakl caps
  the response at 100 products.
- **The catalog's UPC is not always the manufacturer's UPC.** Samsung's 990 PRO 2TB w/
  heatsink (MPN `MZ-V9P2T0CW`) is stored under `8806094594652`, while our Newegg record and the
  retail packaging carry `887276656991`. A miss on our UPC therefore does **not** prove the
  product is absent — see the note below.
- **A miss is not proof of absence.** Cross-check a missing SKU by searching the public
  bestbuy.ca API by model number, reading `upcNumber` off the product JSON, and re-querying
  P31 with that value. That path recovered one SKU (above) that the UPC sweep had written off.

**`product_id` on the response is the reference to send back on an offer import** — not our
own UPC. They differ often enough that using ours would silently fail product matching.

**Re-verified 2026-10-10 (live)** with the SDK's own client: the SDK percent-encodes the pipe
(`UPC-A%7C…`, via `URLSearchParams`) and the request matched; the hit has exactly the keys
`category_code`, `category_label`, `product_id`, `product_id_type` (`"UPC-A"`), `product_sku`,
`product_title`, with `total_count`. A query with no `TYPE|` prefix is a `400` whose message
echoes the rejected value: `Invalid query param format, expected 'a|x,b|y', found '<value>'`.
Two references in one call (`UPC-A|a,UPC-A|b`) is accepted; unmatched references are simply
absent (`{"products":[],"total_count":0}`, 200).

### P11 `GET /api/products/offers` — **VERIFIED 2026-10-10 (live)**, not wrapped by the SDK

Query `product_ids=<product_sku>[,…]` plus `all_offers=true`. Envelope `{ "products": [...] }`
(**no** top-level `total_count`); each product carries `category_code`, `category_label`,
`product_brand`, `product_description`, `product_media` (`{media_url, type}`),
`product_references[]`, `product_sku`, `product_title`, a per-product `total_count` and
`offers[]`. Each offer is the public marketplace view: `active`, `all_prices`,
`applicable_pricing`, `price`, `total_price`, `quantity`, `state_code`, `shop_name`,
`shop_id` (`null` here), `shop_grade`, `nb_evaluation`, `premium`, `is_professional`,
`leadtime_to_ship`, `shipping_deadline`, `min_shipping_*`, `logistic_class` (`null` - unlike
OF21's object), `min_quantity_alert`, `offer_additional_fields`, `inactivity_reasons`,
`channels`, `currency_iso_code`, `msrp`, `discount`, `description`, `price_additional_info`,
`allow_quote_requests`, `offer_id`. This is the competitor-visibility read (it returns other
sellers' offers on the same product); it is not exposed through the SDK yet.

### P41 `POST /api/products/imports` — **WRITE** — **ASSUMPTION**

`multipart/form-data` with `file` and optional `operator_format`. Response
`{ "import_id": 21 }`. **ASSUMPTION**: `operator_format` is a boolean flag; it may instead be
a named format code, in which case the SDK signature needs widening.

### P42 `GET /api/products/imports/{import_id}` — **VERIFIED 2026-10-10 (live)**

Corrected: the earlier assumed status object (`transformed_lines`, `integrated_products`,
`lines_in_error`) does not exist on this operator. The real body, for a completed one-product
import from 2026-09-23:

```json
{
  "date_created": "2026-01-01T00:00:00Z",
  "has_error_report": true,
  "has_new_product_report": false,
  "has_transformation_error_report": false,
  "has_transformed_file": true,
  "import_id": 1000001,
  "import_status": "COMPLETE",
  "integration_details": {
    "invalid_products": 0,
    "products_not_accepted_in_time": 1,
    "products_not_synchronized_in_time": 0,
    "products_successfully_synchronized": 0,
    "products_with_synchronization_issues": 0,
    "products_with_wrong_identifiers": 0,
    "rejected_products": 0
  },
  "shop_id": 1234,
  "transform_lines_in_error": 0,
  "transform_lines_in_success": 1,
  "transform_lines_read": 1,
  "transform_lines_with_warning": 0,
  "update_options": { "allow_locked_values_override": false, "lock_mode": "NONE" }
}
```

- **The outcome key here is `import_status`** (unlike OF02, which uses `status`). Values seen:
  `SENT` (file transformed, integration not finished; an import whose transformation had
  errors also reports `SENT`, with `has_transformation_error_report` true) and `COMPLETE`.
- **`COMPLETE` is not success.** The import above is `COMPLETE` with
  `products_successfully_synchronized` 0 and `products_not_accepted_in_time` 1 - the product
  was never accepted. The outcome is in `integration_details` plus the reports.
- `integration_details` was **absent** on the `SENT` import (`integration_details` appears
  only once integration has run); the `transform_lines_*` counters are always present.
- `shop_id` is the numeric shop id (placeholder above). An unknown import id answers
  `404 {"message":"Import with identifier [1] not found","status":404}`.
- The `has_*` flags tell you which reports exist: fetch a report only when its flag is true.

### P44 `GET /api/products/imports/{import_id}/error_report` — **VERIFIED 2026-10-10 (live)**

`200`, `Content-Type: text/csv`, **comma**-delimited and quoted. It echoes the submitted
product columns (for a Mac mini import: `BBYCat`, `shop_sku`, the title/description/brand/UPC/
model/MPN columns, the image URL columns and the category attribute columns) followed by two
operator columns, `line_number` and `errors`. `errors` is `<CODE>|<message>`, for example
`MCM-04011|The product has not been accepted in the configured time period.` Treat the code
before the pipe as stable and the message as free text.

### P45 `GET /api/products/imports/{import_id}/new_product_report` — **VERIFIED 2026-10-10 (live)** (absence only)

When the import produced no new-product report this answers **`404`**, not an empty CSV:
`{"message":"Resource not available : report on import id 1000001","status":404}`. That
matches `has_new_product_report: false` on P42, so a caller should check the flag first. The
shape of the report itself, when one exists, is still **ASSUMPTION** (no import on this shop
has produced one).

### Two further product-import reads the SDK does not wrap — **VERIFIED 2026-10-10 (live)**

- `GET /api/products/imports/{import_id}/transformed_file` (P46): the file as Best Buy
  transformed it - **semicolon**-delimited and quoted, the submitted columns only (no
  `line_number` / `errors`).
- `GET /api/products/imports/{import_id}/transformation_error_report` (P47): answers `404
{"message":"Resource not available : transform_errors on import id …"}` when
  `has_transformation_error_report` is false. When it is true (a 2026-09-23 capture of an
  import with `transform_lines_in_error` 1) the body is a **comma**-delimited quoted CSV: the
  submitted columns followed by `line number` (with a space, unlike P44's `line_number`),
  `warnings` and `errors`.

---

## 5. Catalog metadata

**All four endpoints below were re-called on 2026-10-10 and matched**: H11 (`max_level=1` →
20 root nodes, `parent_code` `""`, no `total_count`), PM11 (`hierarchy=CAT_1084` → the same 60
attributes, 15 `required`, 15 with a `values_list`, key set unchanged), VL11 (`code=Base_YN` →
one list with two values; filtering by `code` is cheap and works) and AF01 (below). Status:
`VERIFIED 2026-10-10 (live)` for all of them.

### H11 `GET /api/hierarchies` — **VERIFIED 2026-09-11**

Query `hierarchy`, `max_level`. Response `{ "hierarchies": [...] }` — **no `total_count`**.
693 nodes on this operator. Each node:

```json
{
  "code": "CAT_11",
  "label": "Home Theatre",
  "label_translations": [{ "locale": "en", "value": "Home Theatre" }],
  "level": 1,
  "parent_code": ""
}
```

`parent_code` is the **empty string** on a root node, not `null`. `update_date` was not
returned. Category codes are `CAT_<n>`; the offers on this shop sit in `CAT_1084`
("Hard Drives").

### PM11 `GET /api/products/attributes` — **VERIFIED 2026-09-11**

Query `hierarchy`, `max_level`, `with_roles`. Verified with `hierarchy=CAT_1084`, which
returned 60 attributes. Each attribute:

```json
{
  "code": "_Primary_UPC_Category_Root_EN",
  "label": "...",
  "label_translations": [{ "locale": "en", "value": "..." }],
  "description": "...",
  "description_translations": [...],
  "type": "TEXT",
  "type_parameter": null,
  "type_parameters": null,
  "required": true,
  "requirement_level": "REQUIRED",
  "variant": false,
  "roles": [{ "type": "UNIQUE_IDENTIFIER", "parameters": [{ "name": "code", "value": "UPC-A" }] }],
  "hierarchy_code": "",
  "values_list": null,
  "values": null,
  "default_value": null,
  "example": null
}
```

Field notes: the list-backing field is **`values_list`**, not `values_list_code`;
`hierarchy_code` is `""` for attributes that apply to every category; `validations` (12 of 60)
and `transformations` (1 of 60) are free-form strings, e.g. `MAX_LENGTH|180` or an embedded
`SCRIPT|"…"|false`; `type_parameters` is an array of `{name, value}` on `MEDIA` attributes
(`MAX_SIZE` = 10240, `TYPE` = `IMAGE`). Types seen: `TEXT`, `LONG_TEXT`, `LIST`, `MEDIA`,
`INTEGER`, `DECIMAL`. `requirement_level` ∈ {`REQUIRED`, `RECOMMENDED`, `OPTIONAL`}. Role
types seen: `CATEGORY`, `SHOP_SKU`, `TITLE`, `DESCRIPTION`, `BRAND`, `UNIQUE_IDENTIFIER`,
`MAIN_IMAGE`, `VARIANT_GROUP_CODE`.

**Required attributes for `CAT_1084` ("Hard Drives")** — the exact set a product import would
have to carry:

| Code                                          | Type      | Role                                               |
| --------------------------------------------- | --------- | -------------------------------------------------- |
| `BBYCat`                                      | TEXT      | `CATEGORY`                                         |
| `shop_sku`                                    | TEXT      | `SHOP_SKU` (max length 30)                         |
| `_Title_BB_Category_Root_EN`                  | LONG_TEXT | `TITLE` (max 180; no `&nbsp;`, no word > 28 chars) |
| `_Short_Description_BB_Category_Root_EN`      | LONG_TEXT | `DESCRIPTION` (max 480)                            |
| `_Brand_Name_Category_Root_EN`                | TEXT      | `BRAND`                                            |
| `_Primary_UPC_Category_Root_EN`               | TEXT      | `UNIQUE_IDENTIFIER`, code `UPC-A`                  |
| `_Model_Number_Category_Root_EN`              | TEXT      | —                                                  |
| `_Manufacturers_Part_Number_Category_Root_EN` | TEXT      | —                                                  |
| `_MP_Source_Image_URL_01_Category_Root_EN`    | MEDIA     | `MAIN_IMAGE`                                       |
| `_ProductCondition_20257570_CAT_1084_EN`      | LIST      | —                                                  |
| `_InternalorExternal_13353_CAT_1084_EN`       | LIST      | —                                                  |
| `_Wireless_7297_CAT_1084_EN`                  | LIST      | —                                                  |
| `_Interface_1537731_CAT_1084_EN`              | LIST      | —                                                  |
| `_FormFactor_17152446_CAT_1084_EN`            | LIST      | —                                                  |
| `_StorageDriveType_17182720_CAT_1084_EN`      | LIST      | —                                                  |

The unique identifier this operator wants is a **UPC-A**, which is the same reference type its
offers carry.

### VL11 `GET /api/values_lists` — **VERIFIED 2026-09-11**

Query `code`. Response `{ "values_lists": [...] }` — **no `total_count`**. 1127 lists on this
operator, ~1.4 MB uncompressed; fetch a single list with `code` when you can.

```json
{
  "code": "80_PLUS_Certification",
  "label": "80 PLUS Certification",
  "label_translations": [{ "locale": "en", "value": "80 PLUS Certification" }],
  "values": [
    { "code": "Gold", "label": "Gold", "label_translations": [{ "locale": "en", "value": "Gold" }] }
  ]
}
```

Note this is **not** where offer conditions live — those come from OF61, and there is only
one (`11`). The value lists back `LIST`-typed product attributes.

### AF01 `GET /api/additional_fields` — **VERIFIED 2026-09-16**

Query `entities` (comma-separated, e.g. `entities=OFFER`). Response
`{ "additional_fields": [...], "total_count": <n> }` (**VERIFIED 2026-10-10 (live)**: the earlier
"no `total_count`" note was wrong; it equals the array length and the endpoint is not paged -
16 rows with `entities=OFFER`, 31 without a filter). This is where the operator declares the
custom fields a write has to carry, and it is **not** discoverable from PM11: product
attributes and additional fields are separate registries.

```json
{
  "code": "manufacturer-warranty",
  "description": "Seller's parts and labour warranty in days. If no warranty is available, enter 0 (E.g.: 45)",
  "editable": true,
  "entity": "OFFER",
  "label": "Warranty - Parts & Labour",
  "regex": "(0|[1-9][0-9]*)",
  "required": true,
  "type": "REGEX"
}
```

For `entities=OFFER` this operator declares:

- **`manufacturer-warranty`** — the only `required: true` field, and the one OF24 rejects a
  line for omitting. `type` `REGEX`, pattern `(0|[1-9][0-9]*)`: a whole number of days, `0`
  when there is no warranty. Leading zeros and decimals do not match.
- **`ehf-amount-<province>`** — optional `NUMERIC` fields, one per province, for the
  environmental handling fee.
- **`price-lock`** — a `STRING` field with `editable: false`. The operator owns it; a seller
  write is not accepted.

Complete list for `entities=OFFER` (VERIFIED 2026-10-10 (live), 16 rows): `price-lock`
(STRING, not editable), `manufacturer-warranty` (REGEX, required), one NUMERIC
`ehf-amount-<province>` per province (`ab bc mb nb nl ns nt nu on pe qc sk yt`, 13 rows) and
`pim` (STRING, editable, optional - purpose undocumented). Without a filter AF01 also returns
the other entities this operator defines: `ORDER_LINE` (`language`, STRING, **required**, not
editable; `ehf-charge`, NUMERIC) and `SHOP` (`shop-name-fr`, `shop-description-fr`,
`shipping-policy[-fr]`, `return-policy[-fr]` as TEXTAREA, and the BOOLEANs `french-supported`,
`hst-gst`, `bc-pst`, `sk-pst`, `mb-pst`, `qc-qst`, `seller-validation`). Field `type` values
seen: `STRING`, `REGEX`, `NUMERIC`, `BOOLEAN`, `TEXTAREA`. `regex` appears only on `REGEX` rows,
and `description` only on some rows.

Send them on an OF24 record as `offer_additional_fields`, using the write shape
`{ "code": ..., "value": ... }` (a read returns `{code, type, value}`). Pinned by
`packages/sdk/test/fixtures/additional-fields.json`.

---

## 6. Shipping

All three shipping endpoints answered `200`; the earlier "expect a 404 here before anywhere
else" warning is withdrawn. Each uses a **different envelope key**. All three were re-called
on 2026-10-10 and matched (15 carriers, 13 zones, 1 type): `VERIFIED 2026-10-10 (live)`.
None carries `total_count`.

### SH21 `GET /api/shipping/carriers` — **VERIFIED 2026-09-11**

```json
{
  "carriers": [
    {
      "code": "CPCL",
      "label": "Canada Post",
      "standard_code": "ca-post",
      "tracking_url": "https://www.canadapost.ca/track-reperage/en#/details/{trackingId}"
    }
  ]
}
```

15 carriers. `standard_code` is present on 14 of them (the exception is the catch-all
carrier). `tracking_url` is a template whose placeholder is `{trackingId}`.

### SH11 `GET /api/shipping/zones` — **VERIFIED 2026-09-11**

Envelope key is **`shipping_zones`**, not `zones`:

```json
{
  "shipping_zones": [{ "code": "BCLocal", "label": "BC Local", "description": "BC Local V1A-V9Z" }]
}
```

13 zones, one per province group split Local/Remote plus `TRLocal` (Territories). The
`description` carries the postal-code ranges.

### SH12 `GET /api/shipping/types` — **VERIFIED 2026-09-11**

Envelope key is `shipping_types`:

```json
{
  "shipping_types": [
    {
      "click_and_collect": false,
      "code": "M",
      "description": "Ground Regular",
      "ignore_lead_time_to_ship": false,
      "label": "Ground Regular",
      "mandatory_tracking": true,
      "standard_code": "CU_ADD-STD"
    }
  ]
}
```

**Best Buy Canada offers exactly one shipping method to this seller: `M` (Ground Regular),
and it requires tracking before a shipment can be confirmed.** `delivery_by_operator` is
documented but was not returned.

---

## 7. Orders

### OR11 `GET /api/orders` — **VERIFIED 2026-10-10 (live)**

Query: `order_state_codes` (comma-separated), `start_date`, `start_update_date`,
`customer_debited`, `max`, `offset`.

The shop now has six real orders (the 2026-09-11 call saw none), so the full shape is
transcribed from observed payloads - six orders across the states `WAITING_ACCEPTANCE`,
`SHIPPING`, `SHIPPED` and `RECEIVED`, one line each. Envelope `{ "orders": [...],
"total_count": <int> }`; orders ascend by `created_date`. Redacted example (values are
placeholders; the **keys, types and nulls are the real ones**):

```json
{
  "orders": [
    {
      "order_id": "ORDER-1-A",
      "commercial_id": "ORDER-1",
      "order_state": "RECEIVED",
      "order_state_reason_code": null,
      "order_state_reason_label": null,
      "created_date": "2026-01-01T00:00:00Z",
      "last_updated_date": "2026-01-01T00:00:00Z",
      "acceptance_decision_date": "2026-01-01T00:00:00Z",
      "customer_debited_date": "2026-01-01T00:00:00Z",
      "can_cancel": false,
      "can_shop_ship": false,
      "currency_iso_code": "CAD",
      "price": 100.0,
      "total_price": 100.0,
      "total_commission": 10.0,
      "shipping_price": 0,
      "shipping_type_code": "M",
      "shipping_type_label": "Ground Regular",
      "shipping_type_standard_code": "CU_ADD-STD",
      "shipping_zone_code": "ONLocal",
      "shipping_zone_label": "Ontario Local",
      "shipping_company": "Canada Post",
      "shipping_carrier_code": "CPCL",
      "shipping_carrier_standard_code": "ca-post",
      "shipping_tracking": "TRACK-1",
      "shipping_tracking_url": "https://www.canadapost.ca/track-reperage/en#/details/TRACK-1",
      "shipping_deadline": "2026-01-01T00:00:00Z",
      "shipping_pudo_id": null,
      "leadtime_to_ship": 2,
      "delivery_date": { "earliest": "2026-01-01T00:00:00Z", "latest": "2026-01-01T00:00:00Z" },
      "fulfillment": { "center": { "code": "DEFAULT" } },
      "references": { "order_reference_for_customer": "REF-1" },
      "payment_type": "",
      "paymentType": "",
      "payment_workflow": "PAY_ON_ACCEPTANCE",
      "order_tax_mode": "TAX_EXCLUDED",
      "customer_notification_email": "buyer@example.invalid",
      "customer_directly_pays_seller": false,
      "fully_refunded": false,
      "has_customer_message": false,
      "has_incident": false,
      "has_invoice": false,
      "channel": null,
      "quote_id": null,
      "discount_campaigns": [],
      "promotions": { "applied_promotions": [], "total_deduced_amount": 0 },
      "order_additional_fields": [],
      "order_refunds": null,
      "order_taxes": null,
      "customer": {
        "customer_id": "CUSTOMER-1",
        "firstname": "...",
        "lastname": "...",
        "civility": "",
        "locale": "en_US",
        "billing_address": {
          "city": "...",
          "civility": "",
          "company": "",
          "company_2": null,
          "country": "CAN",
          "country_iso_code": null,
          "firstname": "...",
          "lastname": "...",
          "phone": "...",
          "phone_secondary": "",
          "state": "...",
          "street_1": "...",
          "street_2": "",
          "zip_code": "..."
        },
        "shipping_address": { "...": "same keys as billing_address plus additional_info" }
      },
      "order_lines": [
        {
          "order_line_id": "ORDER-1-A-1",
          "order_line_index": 1,
          "order_line_state": "RECEIVED",
          "order_line_state_reason_code": null,
          "order_line_state_reason_label": null,
          "offer_id": 100001,
          "offer_sku": "SKU-1",
          "offer_state_code": "11",
          "product_sku": "PROD-1",
          "product_shop_sku": null,
          "product_title": "Example product",
          "category_code": "CAT_1084",
          "category_label": "Hard Drives",
          "description": null,
          "price_additional_info": null,
          "quantity": 1,
          "price": 100.0,
          "price_unit": 100.0,
          "total_price": 100.0,
          "shipping_price": 0,
          "shipping_price_unit": null,
          "shipping_price_additional_unit": null,
          "commission_fee": 10.0,
          "commission_rate_vat": 13.0,
          "commission_vat": 1.3,
          "total_commission": 11.3,
          "commission_taxes": [{ "amount": 1.3, "code": "ON_HST", "rate": 13.0 }],
          "taxes": [
            {
              "amount": 0,
              "code": "HST",
              "tax_calculation_rule": "NONE",
              "amount_breakdown": { "parts": [] }
            }
          ],
          "shipping_taxes": [],
          "price_amount_breakdown": {
            "parts": [
              {
                "amount": 100.0,
                "commissionable": true,
                "debitable_from_customer": true,
                "payable_to_shop": true
              }
            ]
          },
          "shipping_price_amount_breakdown": { "parts": [] },
          "can_refund": true,
          "cancelations": [],
          "refunds": [],
          "fees": [],
          "promotions": [],
          "created_date": "2026-01-01T00:00:00Z",
          "last_updated_date": "2026-01-01T00:00:00Z",
          "debited_date": "2026-01-01T00:00:00Z",
          "shipped_date": "2026-01-01T00:00:00Z",
          "received_date": "2026-01-01T00:00:00Z",
          "order_line_additional_fields": [{ "code": "language", "type": "STRING", "value": "en" }],
          "product_medias": [
            { "media_url": "https://example.invalid/i.jpg", "mime_type": "JPG", "type": "MEDIUM" }
          ],
          "shipping_from": {
            "address": {
              "city": null,
              "country_iso_code": "CAN",
              "state": null,
              "street_1": null,
              "street_2": null,
              "zip_code": null
            },
            "warehouse": null
          }
        }
      ]
    }
  ],
  "total_count": 1
}
```

What differs from the earlier Mirakl-derived assumption, and what is worth knowing:

- **Order ids carry a suffix**: `order_id` is `<commercial_id>-A` (the commercial id is the
  customer-facing order number; the `-A` is the per-shop split). Lines are
  `<order_id>-<n>`. OR12 is verified to take the suffixed `order_id`; the write endpoints
  (OR21 / OR23 / OR24) are unverified but are expected to take the same id, not `commercial_id`.
- **`customer.billing_address` and `customer.shipping_address` are `null` until the order is
  accepted** (`WAITING_ACCEPTANCE`); afterwards both are populated and the shipping address
  adds `additional_info`. `customer_notification_email` is a Mirakl notification relay address
  (on a `notification.mirakl.net` domain), not the buyer's own.
- Before acceptance `acceptance_decision_date`, `customer_debited_date`, `shipping_company`,
  `shipping_tracking`, `shipping_tracking_url` and every order-line transition date
  (`debited_date`, `shipped_date`, `received_date`) are `null`; they fill in as the order
  moves. `can_shop_ship` was `true` only on the `SHIPPING` order and `false` on
  `WAITING_ACCEPTANCE` and `RECEIVED` ones.
- `shipping_company` is the carrier's display name (`Canada Post`), `shipping_carrier_code` its
  SH21 code (`CPCL`) and `shipping_carrier_standard_code` its standard code (`ca-post`); the
  tracking URL is a fully expanded link (the SH21 `{trackingId}` template already applied).
- `payment_type` and the camelCase `paymentType` both exist (both `""` here);
  `payment_workflow` is `PAY_ON_ACCEPTANCE` and `order_tax_mode` is `TAX_EXCLUDED`, matching
  PC01.
- `order_state` and the single line's `order_line_state` were equal on every order seen.
  **Observed states: `WAITING_ACCEPTANCE`, `SHIPPING`, `SHIPPED`, `RECEIVED`.** The rest of
  Mirakl's vocabulary (`STAGING`, `WAITING_DEBIT`, `WAITING_DEBIT_PAYMENT`, `TO_COLLECT`,
  `CLOSED`, `REFUSED`, `CANCELED`) has not been seen on this shop and stays **ASSUMPTION**.
- The ORDER_LINE additional field the operator requires is `language` (AF01), present as
  `{code, type: "STRING", value}`.
- Tax objects: `commission_taxes[]` is `{amount, code, rate}`; `taxes[]` / `shipping_taxes[]`
  are `{amount, amount_breakdown, code, tax_calculation_rule}` with the rules `NONE` and
  `PROPORTIONAL_TO_AMOUNT` seen. The SDK types `amount_breakdown` loosely (it passes through).

Filters, all exercised on 2026-10-10 (live):

| Query                                           | Result                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `order_state_codes=RECEIVED`                    | `total_count` 5 (the matching orders only)                                              |
| `order_state_codes=SHIPPING,WAITING_ACCEPTANCE` | comma list accepted; `total_count` 0 (none in those states now)                         |
| `order_state_codes=BOGUS`                       | **400** `Invalid value supplied for field 'order_state_codes'. Rejected value: 'BOGUS'` |
| `start_date=<ISO-8601 Z>`                       | filters on creation time (`total_count` 1 for a date in October)                        |
| `start_update_date=<ISO-8601 Z>`                | filters on last update (`total_count` 2)                                                |
| `customer_debited=true` / `false`               | `true` returned all 6, `false` returned 0 - a real filter                               |
| `max=2&offset=2`                                | disjoint pages, constant `total_count` 6                                                |
| `offset=1000`                                   | empty page, **`total_count` 0** (see Ground facts)                                      |

Required by the SDK: `order_id`, `order_lines[]`, each line's `order_line_id` and `quantity`,
plus `total_count` on the envelope. Everything else is optional or nullable in the schema.

### OR12 `GET /api/orders/{order_id}` — **VERIFIED 2026-10-10 (live)**

The order object, unwrapped - but **a strict subset of the OR11 element**. OR12 lacks
`can_cancel`, `can_shop_ship`, `channel`, `currency_iso_code`, `customer_debited_date`,
`customer_directly_pays_seller`, `delivery_date`, `discount_campaigns`, `fulfillment`,
`fully_refunded`, `leadtime_to_ship`, `order_additional_fields`, `order_refunds`,
`order_tax_mode`, `order_taxes`, `payment_workflow`, `promotions`, `quote_id`, `references`,
`shipping_carrier_code`, `shipping_carrier_standard_code`, `shipping_deadline`,
`shipping_pudo_id` and `shipping_type_standard_code`. It is narrower below the top level too:
`customer` has no `locale` and its addresses no `company_2`, and each order line lacks
`cancelations`, `commission_taxes`, `fees`, `price_amount_breakdown`, `product_medias`,
`product_shop_sku`, `promotions`, `refunds`, `shipping_from`, `shipping_price_amount_breakdown`,
`shipping_taxes` and `taxes` (32 line keys against OR11's 44). Everything it does return has
the same type as in OR11, and nothing appears only in OR12. Do not rely on the missing fields
after a `get`; read them from `list`. An unknown id answers
`404 {"message":"No order with id: 'NOPE-A'","status":404}`.

### OR21 `PUT /api/orders/{order_id}/accept` — **WRITE** — **ASSUMPTION**

Body `{ "order_lines": [{ "id": "ORDER-1-A", "accepted": true }] }`. Expected `204`.
Irreversible: refusing a line cancels it.

### OR24 `PUT /api/orders/{order_id}/ship` — **WRITE** — **ASSUMPTION**

No body. Expected `204`. Marks the whole order shipped. Because SH12 reports
`mandatory_tracking: true` for the only shipping method this shop has, tracking (OR23) must
land **before** this call.

### OR23 `PUT /api/orders/{order_id}/tracking` — **WRITE** — **ASSUMPTION**

Body `{ "carrier_code": "...", "carrier_name": "...", "carrier_url": "...",
"tracking_number": "..." }`. Expected `204`. **ASSUMPTION**: `carrier_code` must come from
the carrier list; supplying `carrier_name` free-form may be rejected when a code exists.

---

## 8. Platform configuration (context, read-only)

Two further read-only endpoints were probed on 2026-09-11 and are worth recording even though
the SDK does not wrap them yet.

`GET /api/platform/configuration` (PC01) reports, among others: `platform_name` "Best Buy
Marketplace", `tenant_name` `bby-prod`, `timezone` `America/Vancouver`, `multi_currency`
false, `offer_prices_decimals` `"2"`, `operator_csv_delimiter` `COMMA`,
`list_of_multiple_values_separator` `"|"`, `product_import_only_on_leaf` true,
`lead_time_to_ship_by_sellers_enabled` `YES`, `order_tax_mode` `TAX_EXCLUDED`,
`order_workflows.order_acceptance` `BOTH`, `pricing.channel_pricing` `DISABLED`,
`pricing.volume_pricing` false, `promotion.discount_campaign` true, `returns.marketplace`
true, `shipment.multi_shipment` false, `tax_collection.tax_collection_by_operator` true,
`modules.offer_management_mode` `SIMPLE`, `modules.quotes` false.

`GET /api/locales` (L01) returns `en_CA`, `en_US` (platform default), `fr_FR`, `fr_CA`.

Practical consequences: prices are two-decimal CAD only; multi-value attribute fields are
`|`-separated; product imports must target leaf categories; there is no volume or channel
pricing to model; and a French locale exists, which is why the account carries
`shop-name-fr` / `shop-description-fr` custom fields.

---

## 9. Errors

Every error body observed so far is a JSON object `{ "message": ..., "status": <int> }`. The key
order differs (`message` first on 400/404, `status` first on 401); the parser does not care.
**VERIFIED 2026-10-10 (live)**:

| Status | Trigger                                                 | Body                                                                                                       |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 400    | `product_references` without a `TYPE\|` prefix          | `{"message":"Invalid query param format, expected 'a\|x,b\|y', found '<value>'","status":400}`             |
| 400    | unknown `order_state_codes` value                       | `{"message":"Invalid value supplied for field 'order_state_codes'. Rejected value: 'BOGUS'","status":400}` |
| 401    | wrong API key (all-zero dummy key)                      | `{"status":401,"message":"Unauthorized"}`                                                                  |
| 404    | unknown offer id, unknown offer import id, unknown path | `{"message":"Not Found","status":404}`                                                                     |
| 404    | unknown order id                                        | `{"message":"No order with id: '<id>'","status":404}`                                                      |
| 404    | unknown product import id                               | `{"message":"Import with identifier [<id>] not found","status":404}`                                       |
| 404    | a product-import report that does not exist             | `{"message":"Resource not available : report on import id <id>","status":404}`                             |

The 404 for unknown paths was first seen on 2026-09-11 (`/api/offer_states`,
`/api/offers/conditions`, `/api/offers-conditions`). Responses carry `x-correlation-id` and
no `x-request-id` (see Ground facts). A seller→operator message call (M14) is documented by
the owner's notes as `403 "feature not enabled"`; the SDK does not wrap it and it was not
re-called here.

Other variants the parser also handles, still **ASSUMPTION** (never observed from this
operator): `{ "errors": [{ "message": "...", "code": "..." }] }`, a bare JSON array of error
objects, a plain-text body, and an HTML error page from a gateway. `errors/parse-upstream.ts`
accepts all of them and never throws while parsing.

Status meanings assumed: `400` malformed request or rejected field, `401` bad or missing API
key, `403` key valid but not entitled to the endpoint, `404` unknown id or endpoint not
enabled for this operator, `429` rate limited, `5xx` platform fault. `408`, `429` and `5xx`
are marked retryable; nothing else is. Of these, 400, 401 and 404 are now live-verified; 403,
429 and 5xx are still assumptions.

**Open question**: Mirakl publishes a recommended and a maximum call frequency per endpoint
(OF61 and SH12, for instance, are documented as "once per day"), but no numeric rate limit for
this operator. The 2026-10-10 verification issued ~60 reads at >= 3.3 s spacing without a 429
and no response carried a rate-limit header. The SDK does no client-side throttling — add one
once a real limit is observed. Do not poll the reference endpoints in a loop.

---

## 10. Verification checklist

**Done on 2026-10-10 (live), all READ-only, via direct GETs and via the SDK's own client**:
A01; OF21 (pages, `sku`, `product_id`, `offer_state_codes` filters, past-the-end offset, `max`
over 100); OF22 (+ 404); OF61; OF02 (two batches + 404); OF03; P31 (percent-encoded pipe,
multi-reference, missing-prefix 400); P11 (not wrapped); P42 (+ 404); P44; P45 (404 when
absent); H11; PM11 (CAT_1084); VL11 (`code` filter); AF01 (`entities=OFFER` and unfiltered);
SH21, SH11, SH12; OR11 (every query parameter, paging, an invalid state, past-the-end offset);
OR12 (+ 404); a bad-key 401. Every captured payload parses through the SDK's schemas; the
shapes that changed the SDK are orders (OR11 / OR12), the product-import status (P42), the
`total_count` on AF01 / OF61, and the error `requestId` header. Captured payloads were
sanitized into `packages/sdk/test/fixtures/` (`orders-list.json`, `order.json`,
`product-import-status.json`, `products-match.json`, plus the earlier ones) and are parsed by
`packages/sdk/test/fixtures.test.ts`.

Earlier passes: 2026-09-11 (A01, OF21, OF22, OF61, H11, PM11, VL11, SH21, SH11, SH12, PC01,
L01) and 2026-09-16 (P31, OF02, OF03, AF01 after an owner-authorized OF24).

Still unverified, in the order it will matter:

1. **Every remaining write** — OF01, P41, OR21, OR23, OR24. (OF24 is verified.) Writes stay
   untouched until the owner authorizes a specific write in a specific session.
2. **The wider order-state vocabulary** — only `WAITING_ACCEPTANCE`, `SHIPPING`, `SHIPPED` and
   `RECEIVED` have been observed; `CANCELED`, `REFUSED`, `CLOSED`, `WAITING_DEBIT*` and
   `TO_COLLECT` are Mirakl's names and stay **ASSUMPTION**, as does any order with more than
   one line, a non-empty `cancelations` / `refunds` / `fees` / `promotions` array, or a
   non-null `order_refunds` / `order_taxes`.
3. **The P45 new-product report body** — no import on this shop has produced one.
4. **403, 429 and 5xx behaviour**, and the real rate limit.
5. **The `transformation_error_report` and `transformed_file` (P46 / P47) reads** are
   documented above but are not wrapped by the SDK and were fetched from earlier captures
   rather than re-called.
6. **The `GET /api/platform/configuration` (PC01) and `GET /api/locales` (L01) reads** are
   recorded in section 8 from 2026-09-11 and were not re-called; the SDK does not wrap them.
