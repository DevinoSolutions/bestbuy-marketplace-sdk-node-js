import { describe, expect, it } from "vitest";
import { BestBuyValidationError } from "../src/errors/index.js";
import { harness, onlyCall, route } from "./helpers.js";

const searchPath = /^\/api\/products(\?|$)/;

describe("products.search", () => {
  it("encodes references as TYPE|VALUE pairs in one parameter", async () => {
    const { client, calls } = harness([
      route("GET", searchPath, 200, { products: [], total_count: 0 }),
    ]);
    await client.products.search({
      references: [
        { type: "UPC", value: "0840006676577" },
        { type: "SKU", value: "SKU-1" },
      ],
    });
    expect(onlyCall(calls).url.searchParams.get("product_references")).toBe(
      "UPC|0840006676577,SKU|SKU-1",
    );
  });

  it("returns the matched products with the total count", async () => {
    const { client } = harness([
      route("GET", searchPath, 200, {
        products: [{ product_sku: "PROD-1", product_title: "A product" }],
        total_count: 1,
      }),
    ]);
    const page = await client.products.search({ references: [{ type: "EAN", value: "123" }] });
    expect(page.items[0]?.product_sku).toBe("PROD-1");
    expect(page.totalCount).toBe(1);
  });

  it("refuses a search with no references", async () => {
    const { client, calls } = harness([
      route("GET", searchPath, 200, { products: [], total_count: 0 }),
    ]);
    await expect(client.products.search({ references: [] })).rejects.toBeInstanceOf(
      BestBuyValidationError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("products.importFile (WRITE)", () => {
  it("uploads the file and forwards the operator format flag", async () => {
    const { client, calls } = harness([
      route("POST", /^\/api\/products\/imports/, 201, { import_id: 21 }),
    ]);
    const ticket = await client.products.importFile({
      file: new Blob(["sku;title"]),
      fileName: "products.csv",
      operatorFormat: true,
    });
    expect(ticket.import_id).toBe(21);
    expect(onlyCall(calls).form?.get("operator_format")).toBe("true");
  });
});

describe("product import follow-up", () => {
  it("reads the import status", async () => {
    const { client } = harness([
      route("GET", /^\/api\/products\/imports\/21$/, 200, {
        import_id: 21,
        import_status: "RUNNING",
        transformed_lines: 10,
      }),
    ]);
    const status = await client.products.getImport(21);
    expect(status.import_status).toBe("RUNNING");
    expect(status.transformed_lines).toBe(10);
  });

  it("returns the error report and the new-product report as raw text", async () => {
    const { client } = harness([
      route("GET", /error_report/, 200, "line;error\n"),
      route("GET", /new_product_report/, 200, "sku;status\n"),
    ]);
    expect(await client.products.getImportErrorReport(21)).toBe("line;error\n");
    expect(await client.products.getNewProductReport(21)).toBe("sku;status\n");
  });
});
