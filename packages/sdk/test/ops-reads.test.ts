/**
 * Mocked coverage for the read endpoints added for the ops scripts: P11, P46, P47, OF51,
 * SH31, SH42, SH52, M11, V01, PC01 and L01. The fixtures are PLACEHOLDER data shaped like the
 * responses captured live on 2026-10-10 (keys, types and nulls verbatim; every value invented).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BestBuyApiError, BestBuyValidationError } from "../src/errors/index.js";
import { OPERATIONS } from "../src/operations.js";
import { harness, onlyCall, route } from "./helpers.js";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

const p11Path = /^\/api\/products\/offers(\?|$)/;

describe("products.offers (P11)", () => {
  it("parses the competing offers, nulls included", async () => {
    const { client } = harness([route("GET", p11Path, 200, fixture("product-offers"))]);
    const products = await client.products.offers({ productIds: ["PROD-1"], allOffers: true });

    expect(products).toHaveLength(1);
    const product = products[0];
    expect(product?.product_sku).toBe("PROD-1");
    expect(product?.total_count).toBe(2);
    expect(product?.product_media?.type).toBe("IMAGE");
    expect(product?.offers).toHaveLength(2);

    const live = product?.offers[0];
    expect(live?.shop_name).toBe("Example Seller A");
    expect(live?.price).toBe(10.5);
    expect(live?.shop_id).toBeNull();
    expect(live?.logistic_class).toBeNull();
    expect(live?.applicable_pricing?.volume_prices?.[0]?.quantity_threshold).toBe(1);

    const inactive = product?.offers[1];
    expect(inactive?.active).toBe(false);
    expect(inactive?.inactivity_reasons).toEqual(["ZERO_QUANTITY"]);
  });

  it("sends product_ids, all_offers and offer_state_codes as comma lists", async () => {
    const { client, calls } = harness([route("GET", p11Path, 200, { products: [] })]);
    await client.products.offers({
      productIds: ["A", "B"],
      allOffers: true,
      offerStateCodes: ["11", "12"],
    });
    const url = onlyCall(calls).url;
    expect(url.pathname).toBe("/api/products/offers");
    expect(url.searchParams.get("product_ids")).toBe("A,B");
    expect(url.searchParams.get("all_offers")).toBe("true");
    expect(url.searchParams.get("offer_state_codes")).toBe("11,12");
    expect(url.searchParams.has("product_references")).toBe(false);
  });

  it("encodes references as TYPE|VALUE pairs", async () => {
    const { client, calls } = harness([route("GET", p11Path, 200, { products: [] })]);
    await client.products.offers({
      references: [
        { type: "UPC-A", value: "000000000000" },
        { type: "EAN", value: "0000000000000" },
      ],
    });
    const url = onlyCall(calls).url;
    expect(url.searchParams.get("product_references")).toBe("UPC-A|000000000000,EAN|0000000000000");
    expect(url.searchParams.has("all_offers")).toBe(false);
  });

  it("refuses an empty request and an over-long one before any call", async () => {
    const { client, calls } = harness([route("GET", p11Path, 200, { products: [] })]);
    await expect(client.products.offers({})).rejects.toBeInstanceOf(BestBuyValidationError);
    const tooMany = Array.from({ length: 101 }, (_unused, index) => `P-${index}`);
    await expect(client.products.offers({ productIds: tooMany })).rejects.toBeInstanceOf(
      BestBuyValidationError,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects a product without its sku", async () => {
    const { client } = harness([
      route("GET", p11Path, 200, { products: [{ product_title: "no sku" }] }),
    ]);
    await expect(client.products.offers({ productIds: ["X"] })).rejects.toBeInstanceOf(
      BestBuyValidationError,
    );
  });
});

describe("product import file reads (P46, P47)", () => {
  it("returns the transformed file verbatim", async () => {
    const csv = '"BBYCat";"shop_sku"\n"CAT_0000";"SKU-1"\n';
    const { client, calls } = harness([
      route("GET", "/api/products/imports/21/transformed_file", 200, csv),
    ]);
    expect(await client.products.getTransformedFile(21)).toBe(csv);
    expect(onlyCall(calls).headers.get("accept")).toContain("text/csv");
  });

  it("returns the transformation error report verbatim", async () => {
    const csv = '"sku","line number","warnings","errors"\n"SKU-1","1","","bad"\n';
    const { client } = harness([
      route("GET", "/api/products/imports/22/transformation_error_report", 200, csv),
    ]);
    expect(await client.products.getTransformationErrorReport("22")).toBe(csv);
  });

  it("surfaces the 404 Mirakl answers when the report does not exist", async () => {
    const { client } = harness([
      route("GET", "/api/products/imports/23/transformation_error_report", 404, {
        message: "Resource not available : transform_errors on import id 23",
        status: 404,
      }),
    ]);
    await expect(client.products.getTransformationErrorReport(23)).rejects.toMatchObject({
      status: 404,
    });
    await expect(client.products.getTransformationErrorReport(23)).rejects.toBeInstanceOf(
      BestBuyApiError,
    );
  });

  it("refuses an empty import id", async () => {
    const { client, calls } = harness([]);
    await expect(client.products.getTransformedFile("")).rejects.toBeInstanceOf(
      BestBuyValidationError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("offers.export (OF51)", () => {
  const csv = "offer-id;product-sku;price\n1001;PROD-1;10.5\n";

  it("returns the CSV verbatim and sends no filter by default", async () => {
    const { client, calls } = harness([route("GET", "/api/offers/export", 200, csv)]);
    expect(await client.offers.export()).toBe(csv);
    const call = onlyCall(calls);
    expect(call.url.search).toBe("");
    expect(call.headers.get("accept")).toContain("text/csv");
  });

  it("maps the filters onto Mirakl's parameter names", async () => {
    const { client, calls } = harness([route("GET", "/api/offers/export", 200, csv)]);
    await client.offers.export({
      includeInactiveOffers: true,
      lastRequestDate: "2026-01-01T00:00:00Z",
    });
    const url = onlyCall(calls).url;
    expect(url.searchParams.get("include_inactive_offers")).toBe("true");
    expect(url.searchParams.get("last_request_date")).toBe("2026-01-01T00:00:00Z");
  });
});

describe("shipping configuration reads (SH31, SH42, SH52)", () => {
  it("lists logistic classes from the logistic_classes envelope", async () => {
    const { client, calls } = harness([
      route("GET", "/api/shipping/logistic_classes", 200, {
        logistic_classes: [{ code: "SMALL", label: "Small box", description: "0.5kg to 3kg" }],
      }),
    ]);
    const classes = await client.shipping.logisticClasses();
    expect(classes[0]?.code).toBe("SMALL");
    expect(classes[0]?.description).toBe("0.5kg to 3kg");
    expect(onlyCall(calls).url.pathname).toBe("/api/shipping/logistic_classes");
  });

  it("parses the shop shipping configuration", async () => {
    const { client, calls } = harness([
      route("GET", "/api/shipping/configuration/shop", 200, fixture("shipping-configuration")),
    ]);
    const config = await client.shipping.configuration();
    expect(config.shop_id).toBe("1234");
    expect(config.lead_time_to_ship).toEqual({ default_value: 2, shop_value: 1 });
    expect(config.delivery_times).toHaveLength(2);
    expect(config.delivery_times[0]?.delivery_time?.latest_days).toBe(2);
    expect(config.order_cut_off_times[0]?.cut_off_time).toBe("17:00:00Z");
    expect(config.order_free_shipping).toBe(false);
    expect(onlyCall(calls).url.pathname).toBe("/api/shipping/configuration/shop");
  });

  it("parses the shipping-charge grid", async () => {
    const { client } = harness([
      route("GET", "/api/shipping/charges/shop", 200, fixture("shipping-charges")),
    ]);
    const charges = await client.shipping.charges();
    expect(charges.currency_iso_code).toBe("CAD");
    expect(charges.configuration).toHaveLength(2);
    expect(charges.configuration[0]?.prices.type).toBe("FREE_SHIPPING");
    expect(charges.configuration[0]?.prices.initial_price).toBeNull();
    expect(charges.configuration[1]?.prices.initial_price).toBe(5);
  });

  it("rejects a configuration without its lead time", async () => {
    const { client } = harness([
      route("GET", "/api/shipping/configuration/shop", 200, { shop_id: "1" }),
    ]);
    await expect(client.shipping.configuration()).rejects.toBeInstanceOf(BestBuyValidationError);
  });
});

describe("inbox.threads (M11)", () => {
  it("parses a thread list and keeps the seek-pagination tokens", async () => {
    const { client, calls } = harness([
      route("GET", "/api/inbox/threads", 200, {
        ...(fixture("inbox-threads") as Record<string, unknown>),
        next_page_token: "token-2",
      }),
    ]);
    const list = await client.inbox.threads();
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.entities?.[0]?.type).toBe("MMP_ORDER");
    expect(list.data[0]?.metadata?.shop_reply_needed_since).toBeNull();
    expect(list.data[0]?.authorized_participants?.map((p) => p.type)).toEqual([
      "CUSTOMER",
      "OPERATOR",
      "SHOP",
    ]);
    expect(list.data[0]?.messages?.[0]?.from?.type).toBe("SHOP_USER");
    expect(list.data[0]?.messages?.[0]?.to?.[0]?.type).toBe("CUSTOMER");
    expect(list.next_page_token).toBe("token-2");
    expect(onlyCall(calls).url.search).toBe("");
  });

  it("maps the filters onto Mirakl's parameter names", async () => {
    const { client, calls } = harness([route("GET", "/api/inbox/threads", 200, { data: [] })]);
    await client.inbox.threads({
      entityType: "MMP_ORDER",
      entityIds: ["ORDER-1", "ORDER-2"],
      updatedSince: "2026-01-01T00:00:00Z",
      withMessages: false,
      limit: 5,
      pageToken: "token-1",
    });
    const url = onlyCall(calls).url;
    expect(url.searchParams.get("entity_type")).toBe("MMP_ORDER");
    expect(url.searchParams.get("entity_id")).toBe("ORDER-1,ORDER-2");
    expect(url.searchParams.get("updated_since")).toBe("2026-01-01T00:00:00Z");
    expect(url.searchParams.get("with_messages")).toBe("false");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("page_token")).toBe("token-1");
  });

  it("has no reply surface", () => {
    const { client } = harness([]);
    expect(Object.keys(client.inbox)).toEqual(["threads"]);
  });
});

describe("platform reads (V01, PC01, L01)", () => {
  it("returns the version string", async () => {
    const { client } = harness([route("GET", "/api/version", 200, { version: "3.0001" })]);
    expect(await client.platform.version()).toBe("3.0001");
  });

  it("returns the platform configuration and keeps its trees loose", async () => {
    const { client } = harness([
      route("GET", "/api/platform/configuration", 200, {
        platform_name: "Example Marketplace",
        tenant_name: "example-prod",
        timezone: "America/Vancouver",
        features: { multi_currency: false },
        modules: { quotes: false },
        platform_configuration: { platform_model: { marketplace: true } },
      }),
    ]);
    const config = await client.platform.configuration();
    expect(config.platform_name).toBe("Example Marketplace");
    expect(config.timezone).toBe("America/Vancouver");
    expect(config.features?.multi_currency).toBe(false);
  });

  it("lists locales", async () => {
    const { client } = harness([
      route("GET", "/api/locales", 200, {
        locales: [
          { code: "en_CA", label: "English - Canada" },
          { code: "en_US", label: "English - US", platform_default: true },
        ],
      }),
    ]);
    const locales = await client.platform.locales();
    expect(locales.map((locale) => locale.code)).toEqual(["en_CA", "en_US"]);
    expect(locales[1]?.platform_default).toBe(true);
  });
});

describe("operation table (ops read coverage)", () => {
  it("registers every new endpoint as a READ with its Mirakl code", () => {
    const expected = {
      "products.offers": ["P11", "/api/products/offers"],
      "products.getTransformedFile": ["P46", "/api/products/imports/{import_id}/transformed_file"],
      "products.getTransformationErrorReport": [
        "P47",
        "/api/products/imports/{import_id}/transformation_error_report",
      ],
      "offers.export": ["OF51", "/api/offers/export"],
      "shipping.logisticClasses": ["SH31", "/api/shipping/logistic_classes"],
      "shipping.configuration": ["SH42", "/api/shipping/configuration/shop"],
      "shipping.charges": ["SH52", "/api/shipping/charges/shop"],
      "inbox.threads": ["M11", "/api/inbox/threads"],
      "platform.version": ["V01", "/api/version"],
      "platform.configuration": ["PC01", "/api/platform/configuration"],
      "platform.locales": ["L01", "/api/locales"],
    } as const;
    for (const [name, [code, path]] of Object.entries(expected)) {
      const spec = OPERATIONS[name as keyof typeof OPERATIONS];
      expect(spec.code, name).toBe(code);
      expect(spec.path, name).toBe(path);
      expect(spec.access, name).toBe("read");
      expect(spec.method, name).toBe("GET");
    }
  });
});
