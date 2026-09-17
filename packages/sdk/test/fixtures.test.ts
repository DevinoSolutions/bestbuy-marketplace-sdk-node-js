/**
 * Regression suite built from REAL read-only responses captured against the live Best Buy
 * Canada shop on 2026-09-11, plus the offer-import status and additional-field declarations
 * captured on 2026-09-16.
 *
 * The fixtures in `test/fixtures/` keep the observed keys, types and nulls verbatim;
 * identifying values (shop id, SKUs, titles, contact and billing details) were replaced with
 * placeholders before the files entered the repo, and the large payloads were truncated to a
 * few representative records. Every fixture is driven through the public API with a mocked
 * fetch, so a schema that stops accepting the real wire shape fails here rather than against
 * the live account.
 *
 * The first thing this suite pins is the bug that started it: `offers.list` rejected the real
 * payload because `logistic_class` is an object, not a string, and because `description`,
 * `price_additional_info` and `msrp` arrive as null.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { harness, route } from "./helpers.js";

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

describe("live payload fixtures", () => {
  it("parses the account payload and leaves untyped operator fields intact", async () => {
    const { client } = harness([route("GET", "/api/account", 200, fixture("account"))]);
    const account = await client.account.get();

    expect(account.shop_id).toBe(1234);
    expect(account.shop_state).toBe("OPEN");
    expect(account.currency_iso_code).toBe("CAD");
    expect(account.channels).toEqual(["INIT"]);
    expect(account.domains).toEqual(["PRODUCT"]);
    expect(account.shipping_types).toEqual(["M"]);
    expect(account.shipping_zones?.length).toBe(13);
    expect(account.shippings?.[0]?.shipping_type_code).toBe("M");
    expect(account.shipping?.lead_time_to_ship).toBeNull();
    expect(account.payment_details?.payable_balance).toBe(0);
    expect(account.applicable_taxes?.[0]?.fee_types).toContain("COMMISSION");
    expect(account.shop_additional_fields?.some((field) => field.code === "hst-gst")).toBe(true);
    // Loose parsing: fields the SDK does not model still reach the caller.
    expect((account as unknown as Record<string, unknown>).default_billing_information).toBeTypeOf(
      "object",
    );
  });

  it("parses the offer list that the first live run rejected", async () => {
    const { client } = harness([route("GET", /^\/api\/offers(\?|$)/, 200, fixture("offers-list"))]);
    const page = await client.offers.list({ max: 100 });

    expect(page.items).toHaveLength(11);
    expect(page.totalCount).toBe(11);

    const offer = page.items[0];
    // The regression: an object logistic class and three null-valued string fields.
    expect(offer?.logistic_class?.code).toBe("SMALL");
    expect(offer?.description).toBeNull();
    expect(offer?.price_additional_info).toBeNull();
    expect(offer?.msrp).toBeNull();
    expect(offer?.warehouses).toBeNull();
    expect(offer?.discount).toBeNull();

    expect(offer?.state_code).toBe("11");
    expect(offer?.category_code).toBe("CAT_1084");
    expect(offer?.category_label).toBe("Hard Drives");
    expect(offer?.channels).toEqual(["INIT"]);
    expect(offer?.fulfillment?.center?.code).toBe("DEFAULT");
    expect(offer?.applicable_pricing?.volume_prices?.[0]?.quantity_threshold).toBe(1);
    expect(offer?.all_prices?.[0]?.unit_origin_price).toBeTypeOf("number");
    expect(offer?.offer_additional_fields?.[0]?.code).toBe("manufacturer-warranty");
    expect(offer?.product_references?.[0]?.reference_type).toBe("UPC-A");
    expect(offer?.min_shipping_zone).toBe("BCLocal");
    expect(offer?.shipping_deadline).toBeTypeOf("string");

    // Every offer on this shop is condition 11 and carries the same envelope fields.
    for (const item of page.items) {
      expect(item.state_code).toBe("11");
      expect(item.currency_iso_code).toBe("CAD");
      expect(typeof item.offer_id).toBe("number");
      expect(typeof item.quantity).toBe("number");
    }
  });

  it("parses a single offer, including an inactivity reason", async () => {
    const { client } = harness([route("GET", "/api/offers/1", 200, fixture("offer"))]);
    const offer = await client.offers.get(1);

    expect(offer.active).toBe(false);
    expect(offer.inactivity_reasons).toEqual(["PRODUCT_STATUS_REJECTED"]);
    expect(offer.logistic_class?.label).toBeTypeOf("string");
  });

  it("parses the operator's offer conditions", async () => {
    const { client } = harness([route("GET", "/api/offers/states", 200, fixture("offer-states"))]);
    const states = await client.offers.states();

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ code: "11", label: "New" });
  });

  it("parses an offer import status, whose outcome key is `status`", async () => {
    const { client } = harness([
      route("GET", /^\/api\/offers\/imports\/40208046$/, 200, fixture("offer-import-status")),
    ]);
    const status = await client.offers.getImport(40208046);

    // The operator sends `status`; `import_status`, the spelling Mirakl documents, is absent.
    expect(status.status).toBe("COMPLETE");
    expect(status.import_status).toBeUndefined();
    expect(status.lines_in_error).toBe(10);
    expect(status.lines_read).toBe(10);
    expect(status.has_error_report).toBe(true);
    expect(status.mode).toBe("NORMAL");
    expect(status.type).toBe("MIRAKL");
    expect(status.offer_inserted).toBe(0);
    expect(status.offer_updated).toBe(0);
    expect(status.offer_deleted).toBe(0);
  });

  it("parses an empty order list", async () => {
    const { client } = harness([
      route("GET", /^\/api\/orders(\?|$)/, 200, fixture("orders-empty")),
    ]);
    const page = await client.orders.list({ max: 5 });

    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  it("parses an empty product search", async () => {
    const { client } = harness([
      route("GET", /^\/api\/products(\?|$)/, 200, fixture("products-empty")),
    ]);
    const page = await client.products.search({
      references: [{ type: "UPC-A", value: "000000000001" }],
    });

    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  it("parses the category hierarchy, including an empty-string root parent", async () => {
    const { client } = harness([route("GET", "/api/hierarchies", 200, fixture("hierarchies"))]);
    const hierarchies = await client.catalog.hierarchies();

    const root = hierarchies.find((node) => node.level === 1);
    expect(root?.parent_code).toBe("");
    expect(root?.label_translations?.[0]?.locale).toBe("en");
    expect(hierarchies.some((node) => node.code === "CAT_1084")).toBe(true);
  });

  it("parses the Hard Drives attribute configuration", async () => {
    const { client } = harness([
      route("GET", "/api/products/attributes", 200, fixture("product-attributes")),
    ]);
    const attributes = await client.catalog.attributes({ hierarchy: "CAT_1084" });

    const upc = attributes.find((a) => a.code === "_Primary_UPC_Category_Root_EN");
    expect(upc?.required).toBe(true);
    expect(upc?.requirement_level).toBe("REQUIRED");
    expect(upc?.roles?.[0]?.type).toBe("UNIQUE_IDENTIFIER");
    expect(upc?.roles?.[0]?.parameters?.[0]).toMatchObject({ name: "code", value: "UPC-A" });

    const image = attributes.find((a) => a.code === "_MP_Source_Image_URL_01_Category_Root_EN");
    expect(image?.type).toBe("MEDIA");
    expect(image?.type_parameters?.some((p) => p.name === "MAX_SIZE")).toBe(true);

    const title = attributes.find((a) => a.code === "_Title_BB_Category_Root_EN");
    expect(title?.validations).toContain("MAX_LENGTH|180");

    const category = attributes.find((a) => a.code === "BBYCat");
    expect(category?.hierarchy_code).toBe("");
    expect(category?.values).toBeNull();
    expect(category?.values_list).toBeNull();
  });

  it("parses operator value lists with their translations", async () => {
    const { client } = harness([route("GET", "/api/values_lists", 200, fixture("values-lists"))]);
    const lists = await client.catalog.valueLists();

    expect(lists.length).toBeGreaterThan(0);
    const first = lists[0];
    expect(first?.values?.[0]?.code).toBeTypeOf("string");
    expect(first?.label_translations?.[0]?.value).toBeTypeOf("string");
  });

  it("parses the operator's offer additional fields", async () => {
    const { client, calls } = harness([
      route("GET", "/api/additional_fields", 200, fixture("additional-fields")),
    ]);
    const fields = await client.catalog.additionalFields({ entities: ["OFFER"] });

    const warranty = fields.find((field) => field.code === "manufacturer-warranty");
    expect(warranty?.required).toBe(true);
    expect(warranty?.type).toBe("REGEX");
    expect(warranty?.regex).toBe("(0|[1-9][0-9]*)");
    expect(warranty?.entity).toBe("OFFER");

    // The optional EHF fields are NUMERIC, and `price-lock` is operator-owned.
    expect(fields.some((field) => field.type === "NUMERIC" && field.required === false)).toBe(true);
    expect(fields.find((field) => field.code === "price-lock")?.editable).toBe(false);

    expect(calls[0]?.url.searchParams.get("entities")).toBe("OFFER");
  });

  it("parses carriers, zones and shipping types", async () => {
    const { client } = harness([
      route("GET", "/api/shipping/carriers", 200, fixture("shipping-carriers")),
      route("GET", "/api/shipping/zones", 200, fixture("shipping-zones")),
      route("GET", "/api/shipping/types", 200, fixture("shipping-types")),
    ]);

    const carriers = await client.shipping.methods();
    expect(carriers.length).toBe(15);
    expect(carriers.some((c) => c.standard_code === "ca-post")).toBe(true);
    // One carrier ("Other") has no standard code; the schema must not require it.
    expect(carriers.some((c) => c.standard_code === undefined)).toBe(true);

    const zones = await client.shipping.zones();
    expect(zones.length).toBe(13);
    expect(zones.some((z) => z.code === "ONLocal")).toBe(true);

    const types = await client.shipping.types();
    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({ code: "M", mandatory_tracking: true });
  });
});
