import type {
  ImportTicket,
  Page,
  Product,
  ProductImportFileInput,
  ProductImportStatus,
  ProductOffersParams,
  ProductSearchParams,
  ProductWithOffers,
  ProductsApi,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import {
  importTicketSchema,
  parseWith,
  productImportStatusSchema,
  productListSchema,
  productOffersListSchema,
} from "../schemas/wire.js";
import { joinList, requireIdentifier, requireNonEmptyArray, toBlob } from "../schemas/inputs.js";
import { BestBuyValidationError } from "../errors/index.js";
import { normalizePageParams } from "../pagination.js";

/** Mirakl caps P11's `product_ids` and `product_references` at 100 values each. */
const MAX_P11_IDENTIFIERS = 100;

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

    async offers(
      params: ProductOffersParams,
      options?: RequestOptions,
    ): Promise<ProductWithOffers[]> {
      const ids = params?.productIds ?? [];
      const references = params?.references ?? [];
      if (ids.length === 0 && references.length === 0) {
        throw new BestBuyValidationError("Invalid argument for products.offers", {
          issues: [
            {
              path: "productIds",
              message: "productIds or references must contain at least one entry",
              code: "too_small",
            },
          ],
        });
      }
      if (ids.length > MAX_P11_IDENTIFIERS || references.length > MAX_P11_IDENTIFIERS) {
        throw new BestBuyValidationError("Invalid argument for products.offers", {
          issues: [
            {
              path: ids.length > MAX_P11_IDENTIFIERS ? "productIds" : "references",
              message: `must contain at most ${MAX_P11_IDENTIFIERS} entries`,
              code: "too_big",
            },
          ],
        });
      }
      const query: Record<string, QueryValue> = {};
      const productIds = joinList(ids);
      if (productIds !== undefined) query.product_ids = productIds;
      if (references.length > 0) {
        query.product_references = references
          .map((reference) => `${reference.type}|${reference.value}`)
          .join(",");
      }
      if (params.allOffers !== undefined) query.all_offers = params.allOffers;
      const states = joinList(params.offerStateCodes);
      if (states !== undefined) query.offer_state_codes = states;
      const raw = await http.requestJson({ operation: "products.offers", query }, options);
      return parseWith(productOffersListSchema, raw, "product offers").products;
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

    async getTransformedFile(importId: string | number, options?: RequestOptions): Promise<string> {
      const id = requireIdentifier(importId, "importId", "products.getTransformedFile");
      return http.requestText(
        { operation: "products.getTransformedFile", pathParams: { import_id: id } },
        options,
      );
    },

    async getTransformationErrorReport(
      importId: string | number,
      options?: RequestOptions,
    ): Promise<string> {
      const id = requireIdentifier(importId, "importId", "products.getTransformationErrorReport");
      return http.requestText(
        { operation: "products.getTransformationErrorReport", pathParams: { import_id: id } },
        options,
      );
    },
  };
}
