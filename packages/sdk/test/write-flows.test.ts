/**
 * Write flows built from what the owner-authorized live writes of 2026-09-16 .. 2026-10-09
 * actually sent and received (OF24 offer batches, P41 product imports and their follow-up
 * reads). Everything is driven through the public API with a mocked fetch; every id, sku and
 * price below is a placeholder, only the shapes, keys and counters are the observed ones.
 *
 * The recurring lesson these tests pin: a 2xx from a write is an acknowledgement, the import
 * status can say `COMPLETE` while every line failed, and the real outcome is in the counters
 * and the reports.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { harness, onlyCall, route } from "./helpers.js";

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

describe("OF24 offer batch (live-proven request shape)", () => {
  it("posts a full-field line that identifies the product by UPC-A and carries the warranty", async () => {
    const { client, calls } = harness([
      route("POST", /^\/api\/offers$/, 201, { import_id: 5151 }),
      route("GET", /^\/api\/offers\/imports\/5151$/, 200, fixture("offer-import-inserted")),
    ]);
    const ticket = await client.offers.update({
      offers: [
        {
          shop_sku: "SKU-1",
          product_id: "000000000001",
          product_id_type: "UPC-A",
          state_code: "11",
          update_delete: "update",
          price: 100.99,
          quantity: 1,
          logistic_class: "SMALL",
          leadtime_to_ship: 1,
          offer_additional_fields: [{ code: "manufacturer-warranty", value: "365" }],
        },
      ],
    });
    expect(ticket).toEqual({ import_id: 5151 });
    expect(calls[0]?.bodyJson).toEqual({
      offers: [
        {
          shop_sku: "SKU-1",
          product_id: "000000000001",
          product_id_type: "UPC-A",
          state_code: "11",
          update_delete: "update",
          price: 100.99,
          quantity: 1,
          logistic_class: "SMALL",
          leadtime_to_ship: 1,
          offer_additional_fields: [{ code: "manufacturer-warranty", value: "365" }],
        },
      ],
    });

    const status = await client.offers.getImport(ticket.import_id);
    expect(status.status).toBe("COMPLETE");
    expect(status.lines_read).toBe(1);
    expect(status.lines_in_success).toBe(1);
    expect(status.offer_inserted).toBe(1);
    expect(status.offer_updated).toBe(0);
    expect(status.has_error_report).toBe(false);
  });

  it.each(["SKU", "UPC-A"] as const)("sends product_id_type %s verbatim", async (idType) => {
    const { client, calls } = harness([route("POST", /^\/api\/offers$/, 201, { import_id: 5153 })]);
    await client.offers.update({
      offers: [
        {
          shop_sku: "SKU-1",
          product_id: "12345678",
          product_id_type: idType,
          state_code: "11",
          price: 10,
          quantity: 0,
        },
      ],
    });
    const body = calls[0]?.bodyJson as { offers: { product_id_type: string }[] };
    expect(body.offers[0]?.product_id_type).toBe(idType);
  });

  it("does not add fields the caller left out, because OF24 treats the line as a full replace", async () => {
    // A quantity-only restatement must not gain a discount, description or lead time: the
    // platform replaces the offer line, so whatever the SDK invented would be written.
    const { client, calls } = harness([route("POST", /^\/api\/offers$/, 201, { import_id: 5154 })]);
    await client.offers.update({
      offers: [
        {
          shop_sku: "SKU-1",
          product_id: "12345678",
          product_id_type: "SKU",
          state_code: "11",
          price: 10,
          quantity: 0,
        },
      ],
    });
    const body = calls[0]?.bodyJson as { offers: Record<string, unknown>[] };
    expect(Object.keys(body.offers[0] ?? {}).sort()).toEqual([
      "price",
      "product_id",
      "product_id_type",
      "quantity",
      "shop_sku",
      "state_code",
    ]);
  });

  it("reports an accepted batch whose line changed nothing as COMPLETE with zero updates", async () => {
    // A per-offer lead time below the operator-locked shop default imports clean (17 of 17
    // lines in success) but moves no offer.
    const { client } = harness([
      route("GET", /^\/api\/offers\/imports\/5152$/, 200, fixture("offer-import-no-change")),
    ]);
    const status = await client.offers.getImport(5152);
    expect(status.status).toBe("COMPLETE");
    expect(status.lines_in_success).toBe(17);
    expect(status.lines_in_error).toBe(0);
    expect(status.offer_updated).toBe(0);
    expect(status.offer_inserted).toBe(0);
  });

  it("returns the OF03 CSV with the doubled-quote warranty message intact", async () => {
    const csv =
      '"sku","product-id","product-id-type","price","quantity","state","error-line","error-message"\n' +
      '"SKU-1","12345678","SKU","10.0","1","11","2","The mandatory additional field ""manufacturer-warranty"" is missing"\n';
    const { client, calls } = harness([
      route("GET", /^\/api\/offers\/imports\/5150\/error_report$/, 200, csv, {
        "content-type": "text/csv",
      }),
    ]);
    const report = await client.offers.getImportErrorReport(5150);
    expect(report).toBe(csv);
    expect(onlyCall(calls).url.pathname).toBe("/api/offers/imports/5150/error_report");
  });
});

describe("P41 product import (live-proven request and follow-up shapes)", () => {
  const header = '"BBYCat","shop_sku","_Title_BB_Category_Root_EN"';

  it("uploads a comma-delimited CSV with operator_format=true and returns only the ticket", async () => {
    const { client, calls } = harness([
      route("POST", /^\/api\/products\/imports$/, 201, { import_id: 1000002 }),
    ]);
    const ticket = await client.products.importFile({
      file: new TextEncoder().encode(`${header}\n"CAT_0000","SKU-1","A product"\n`),
      fileName: "product-import.csv",
      operatorFormat: true,
    });
    expect(ticket).toEqual({ import_id: 1000002 });
    const call = onlyCall(calls);
    expect(call.method).toBe("POST");
    expect(call.form?.get("operator_format")).toBe("true");
    const file = call.form?.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("product-import.csv");
    expect(await (file as File).text()).toContain('"BBYCat","shop_sku"');
  });

  it("reads a cleanly transformed import: SENT, nothing integrated yet, no reports", async () => {
    const { client } = harness([
      route("GET", /^\/api\/products\/imports\/1000002$/, 200, fixture("product-import-sent")),
    ]);
    const status = await client.products.getImport(1000002);
    expect(status.import_status).toBe("SENT");
    expect(status.transform_lines_in_success).toBe(1);
    expect(status.transform_lines_in_error).toBe(0);
    expect(status.has_error_report).toBe(false);
    expect(status.has_transformed_file).toBe(true);
    // integration_details only appears once integration has run.
    expect(status.integration_details).toBeUndefined();
  });

  it("flags a SENT import that has a transformation error report", async () => {
    const { client } = harness([
      route(
        "GET",
        /^\/api\/products\/imports\/1000003$/,
        200,
        fixture("product-import-transformation-error"),
      ),
    ]);
    const status = await client.products.getImport(1000003);
    // SENT does not mean the rows were accepted: the transform flagged a row.
    expect(status.import_status).toBe("SENT");
    expect(status.transform_lines_in_error).toBe(1);
    expect(status.has_transformation_error_report).toBe(true);
  });

  it("reads a COMPLETE import in which the catalog rejected the product", async () => {
    const { client } = harness([
      route("GET", /^\/api\/products\/imports\/1000004$/, 200, fixture("product-import-rejected")),
    ]);
    const status = await client.products.getImport(1000004);
    expect(status.import_status).toBe("COMPLETE");
    expect(status.integration_details?.rejected_products).toBe(1);
    expect(status.integration_details?.products_successfully_synchronized).toBe(0);
    expect(status.has_error_report).toBe(true);
  });

  it("returns the P44 report verbatim, whose errors column is CODE|message", async () => {
    const csv =
      '"BBYCat","shop_sku","line_number","errors"\n' +
      '"CAT_0000","SKU-1","2","3|Duplicate of item Sold and shipped by Best Buy Canada - This product could not be created because it is a duplicate of an item \'Sold and shipped by Best Buy Canada\'"\n';
    const { client } = harness([
      route("GET", /^\/api\/products\/imports\/1000004\/error_report$/, 200, csv, {
        "content-type": "text/csv",
      }),
    ]);
    expect(await client.products.getImportErrorReport(1000004)).toBe(csv);
  });

  it("surfaces the live 404 when an import has no error report", async () => {
    const { client } = harness([
      route("GET", /error_report$/, 404, {
        message: "No error report found for importTracking 1000002",
        status: 404,
      }),
    ]);
    await expect(client.products.getImportErrorReport(1000002)).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("No error report found") as unknown,
    });
  });
});
