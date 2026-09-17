import type {
  ImportTicket,
  Page,
  Product,
  ProductImportFileInput,
  ProductImportStatus,
  ProductSearchParams,
  ProductsApi,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import {
  importTicketSchema,
  parseWith,
  productImportStatusSchema,
  productListSchema,
} from "../schemas/wire.js";
import { requireIdentifier, requireNonEmptyArray, toBlob } from "../schemas/inputs.js";
import { normalizePageParams } from "../pagination.js";

/** Builds the `products` namespace. `importFile` is a WRITE. */
export function createProductsApi(http: BestBuyHttpClient): ProductsApi {
  return {
    async search(params: ProductSearchParams, options?: RequestOptions): Promise<Page<Product>> {
      requireNonEmptyArray(params?.references ?? [], "references", "products.search");
      const page = normalizePageParams(params, "products.search");
      // Mirakl encodes references as TYPE|VALUE pairs in one comma-separated parameter.
      const references = params.references
        .map((reference) => `${reference.type}|${reference.value}`)
        .join(",");
      const query: Record<string, QueryValue> = {
        product_references: references,
        max: page.max,
        offset: page.offset,
      };
      const raw = await http.requestJson({ operation: "products.search", query }, options);
      const parsed = parseWith(productListSchema, raw, "product list");
      return {
        items: parsed.products,
        totalCount: parsed.total_count,
        offset: page.offset,
        max: page.max,
      };
    },

    // WRITE. Multipart upload of a product file; the catalog work happens asynchronously.
    async importFile(
      input: ProductImportFileInput,
      options?: RequestOptions,
    ): Promise<ImportTicket> {
      const form = new FormData();
      form.append("file", toBlob(input.file, "file", "products.importFile"), input.fileName);
      if (input.operatorFormat !== undefined) {
        form.append("operator_format", String(input.operatorFormat));
      }
      const raw = await http.requestJson({ operation: "products.importFile", form }, options);
      return parseWith(importTicketSchema, raw, "product import ticket");
    },

    async getImport(
      importId: string | number,
      options?: RequestOptions,
    ): Promise<ProductImportStatus> {
      const id = requireIdentifier(importId, "importId", "products.getImport");
      const raw = await http.requestJson(
        { operation: "products.getImport", pathParams: { import_id: id } },
        options,
      );
      return parseWith(productImportStatusSchema, raw, "product import status");
    },

    async getImportErrorReport(
      importId: string | number,
      options?: RequestOptions,
    ): Promise<string> {
      const id = requireIdentifier(importId, "importId", "products.getImportErrorReport");
      return http.requestText(
        { operation: "products.getImportErrorReport", pathParams: { import_id: id } },
        options,
      );
    },

    async getNewProductReport(
      importId: string | number,
      options?: RequestOptions,
    ): Promise<string> {
      const id = requireIdentifier(importId, "importId", "products.getNewProductReport");
      return http.requestText(
        { operation: "products.getNewProductReport", pathParams: { import_id: id } },
        options,
      );
    },
  };
}
