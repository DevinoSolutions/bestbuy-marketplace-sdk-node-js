import { describe, expect, it } from "vitest";
import { BestBuyValidationError } from "../src/errors/index.js";
import type { MockRoute } from "../src/testing/index.js";
import { harness, onlyCall, route, sampleOffer } from "./helpers.js";

const listPath = /^\/api\/offers(\?|$)/;

describe("offers.list", () => {
  it("returns a page with the reported total count", async () => {
    const { client } = harness([
      route("GET", listPath, 200, { offers: [sampleOffer], total_count: 37 }),
    ]);
    const page = await client.offers.list();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.shop_sku).toBe("SKU-1");
    expect(page.totalCount).toBe(37);
    expect(page.max).toBe(100);
  });

  it("maps camelCase filters onto Mirakl query parameters", async () => {
    const { client, calls } = harness([
      route("GET", listPath, 200, { offers: [], total_count: 0 }),
    ]);
    await client.offers.list({
      sku: ["SKU-1", "SKU-2"],
      productId: "PROD-9",
      offerStateCodes: ["11", "12"],
      max: 25,
      offset: 50,
    });
    const query = onlyCall(calls).url.searchParams;
    expect(query.get("sku")).toBe("SKU-1,SKU-2");
    expect(query.get("product_id")).toBe("PROD-9");
    expect(query.get("offer_state_codes")).toBe("11,12");
    expect(query.get("max")).toBe("25");
    expect(query.get("offset")).toBe("50");
  });

  it("rejects a page size above the Mirakl maximum before sending anything", async () => {
    const { client, calls } = harness([
      route("GET", listPath, 200, { offers: [], total_count: 0 }),
    ]);
    await expect(client.offers.list({ max: 500 })).rejects.toBeInstanceOf(BestBuyValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe("offers.listAll", () => {
  it("walks every page until the total count is reached", async () => {
    const pages: MockRoute[] = [
      {
        method: "GET",
        pathPattern: listPath,
        reply: (req) => {
          const offset = Number(req.url.searchParams.get("offset") ?? "0");
          const offers = [
            { ...sampleOffer, offer_id: offset + 1, shop_sku: `SKU-${offset + 1}` },
            { ...sampleOffer, offer_id: offset + 2, shop_sku: `SKU-${offset + 2}` },
          ];
          return { status: 200, body: { offers: offset >= 6 ? [] : offers, total_count: 6 } };
        },
      },
    ];
    const { client, calls } = harness(pages);
    const collected: string[] = [];
    for await (const offer of client.offers.listAll({ max: 2 })) collected.push(offer.shop_sku);
    expect(collected).toEqual(["SKU-1", "SKU-2", "SKU-3", "SKU-4", "SKU-5", "SKU-6"]);
    expect(calls).toHaveLength(3);
  });

  it("stops on a short page even when total_count disagrees", async () => {
    const { client, calls } = harness([
      route("GET", listPath, 200, { offers: [sampleOffer], total_count: 9999 }),
    ]);
    const collected = [];
    for await (const offer of client.offers.listAll({ max: 50 })) collected.push(offer.offer_id);
    expect(collected).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});

describe("offers.get", () => {
  it("reads a single offer by id", async () => {
    const { client, calls } = harness([route("GET", /^\/api\/offers\/4242/, 200, sampleOffer)]);
    const offer = await client.offers.get(4242);
    expect(offer.offer_id).toBe(4242);
    expect(onlyCall(calls).url.pathname).toBe("/api/offers/4242");
  });
});

describe("offers.update (WRITE)", () => {
  it("posts the offer records and returns the import ticket", async () => {
    const { client, calls } = harness([route("POST", listPath, 201, { import_id: 5150 })]);
    const ticket = await client.offers.update({
      offers: [
        {
          shop_sku: "SKU-1",
          product_id: "0840006676577",
          product_id_type: "UPC",
          price: 129.99,
          quantity: 4,
          state_code: "11",
        },
      ],
    });
    expect(ticket.import_id).toBe(5150);
    const call = onlyCall(calls);
    expect(call.method).toBe("POST");
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(call.bodyJson).toEqual({
      offers: [
        {
          shop_sku: "SKU-1",
          product_id: "0840006676577",
          product_id_type: "UPC",
          price: 129.99,
          quantity: 4,
          state_code: "11",
        },
      ],
    });
  });

  it("refuses an empty offer list without touching the network", async () => {
    const { client, calls } = harness([route("POST", listPath, 201, { import_id: 1 })]);
    await expect(client.offers.update({ offers: [] })).rejects.toBeInstanceOf(
      BestBuyValidationError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("offers.importFile (WRITE)", () => {
  it("uploads the file as multipart form data with the import mode", async () => {
    const { client, calls } = harness([
      route("POST", /^\/api\/offers\/imports/, 201, { import_id: 77 }),
    ]);
    const ticket = await client.offers.importFile({
      file: new Uint8Array([115, 107, 117]),
      fileName: "offers.csv",
      importMode: "PARTIAL_UPDATE",
      withProducts: false,
    });
    expect(ticket.import_id).toBe(77);
    const form = onlyCall(calls).form;
    expect(form?.get("import_mode")).toBe("PARTIAL_UPDATE");
    expect(form?.get("with_products")).toBe("false");
    const file = form?.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect(await (file as Blob).text()).toBe("sku");
  });
});

describe("offer import follow-up", () => {
  it("reads the import status", async () => {
    const { client } = harness([
      route("GET", /^\/api\/offers\/imports\/77$/, 200, {
        import_id: 77,
        import_status: "COMPLETE",
        lines_in_success: 3,
        has_error_report: false,
      }),
    ]);
    const status = await client.offers.getImport(77);
    expect(status.import_status).toBe("COMPLETE");
    expect(status.lines_in_success).toBe(3);
  });

  it("returns the error report as raw CSV", async () => {
    const csv = "line;error\n1;price missing\n";
    const { client, calls } = harness([
      route("GET", /error_report/, 200, csv, { "content-type": "text/csv" }),
    ]);
    expect(await client.offers.getImportErrorReport(77)).toBe(csv);
    expect(onlyCall(calls).headers.get("accept")).toContain("text/csv");
  });
});
