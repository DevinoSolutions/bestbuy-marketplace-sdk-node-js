import type {
  ImportTicket,
  Offer,
  OfferExportParams,
  OfferImportFileInput,
  OfferImportStatus,
  OfferListParams,
  OfferState,
  OfferUpdateInput,
  OffersApi,
  Page,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import {
  importTicketSchema,
  offerImportStatusSchema,
  offerListSchema,
  offerSchema,
  offerStateListSchema,
  parseWith,
} from "../schemas/wire.js";
import { joinList, requireIdentifier, requireNonEmptyArray, toBlob } from "../schemas/inputs.js";
import { normalizePageParams, paginate, type ResolvedPageParams } from "../pagination.js";

function listQuery(params: OfferListParams | undefined, page: ResolvedPageParams) {
  const query: Record<string, QueryValue> = { max: page.max, offset: page.offset };
  const sku = joinList(params?.sku);
  if (sku !== undefined) query.sku = sku;
  if (params?.productId !== undefined) query.product_id = params.productId;
  const states = joinList(params?.offerStateCodes);
  if (states !== undefined) query.offer_state_codes = states;
  return query;
}

/** Builds the `offers` namespace. `update` and `importFile` are WRITES. */
export function createOffersApi(http: BestBuyHttpClient): OffersApi {
  async function listPage(
    params: OfferListParams | undefined,
    page: ResolvedPageParams,
    options?: RequestOptions,
  ): Promise<Page<Offer>> {
    const raw = await http.requestJson(
      { operation: "offers.list", query: listQuery(params, page) },
      options,
    );
    const parsed = parseWith(offerListSchema, raw, "offer list");
    return {
      items: parsed.offers,
      totalCount: parsed.total_count,
      offset: page.offset,
      max: page.max,
    };
  }

  return {
    async list(params?: OfferListParams, options?: RequestOptions): Promise<Page<Offer>> {
      return listPage(params, normalizePageParams(params, "offers.list"), options);
    },

    listAll(params?: OfferListParams, options?: RequestOptions): AsyncIterableIterator<Offer> {
      return paginate((page) => listPage(params, page, options), params, "offers.listAll");
    },

    async get(offerId: string | number, options?: RequestOptions): Promise<Offer> {
      const id = requireIdentifier(offerId, "offerId", "offers.get");
      const raw = await http.requestJson(
        { operation: "offers.get", pathParams: { offer_id: id } },
        options,
      );
      return parseWith(offerSchema, raw, "offer");
    },

    async states(options?: RequestOptions): Promise<OfferState[]> {
      const raw = await http.requestJson({ operation: "offers.states" }, options);
      return parseWith(offerStateListSchema, raw, "offer state list").offer_states;
    },

    async export(params?: OfferExportParams, options?: RequestOptions): Promise<string> {
      const query: Record<string, QueryValue> = {};
      if (params?.includeInactiveOffers !== undefined) {
        query.include_inactive_offers = params.includeInactiveOffers;
      }
      if (params?.lastRequestDate !== undefined) query.last_request_date = params.lastRequestDate;
      return http.requestText({ operation: "offers.export", query }, options);
    },

    // WRITE. Asynchronous upstream: the response only acknowledges the import; poll
    // `getImport` for the outcome.
    async update(input: OfferUpdateInput, options?: RequestOptions): Promise<ImportTicket> {
      requireNonEmptyArray(input?.offers ?? [], "offers", "offers.update");
      const raw = await http.requestJson(
        { operation: "offers.update", json: { offers: input.offers } },
        options,
      );
      return parseWith(importTicketSchema, raw, "offer import ticket");
    },

    // WRITE. Multipart upload of an offer file.
    async importFile(input: OfferImportFileInput, options?: RequestOptions): Promise<ImportTicket> {
      const form = new FormData();
      form.append("file", toBlob(input.file, "file", "offers.importFile"), input.fileName);
      form.append("import_mode", input.importMode);
      if (input.withProducts !== undefined) {
        form.append("with_products", String(input.withProducts));
      }
      const raw = await http.requestJson({ operation: "offers.importFile", form }, options);
      return parseWith(importTicketSchema, raw, "offer import ticket");
    },

    async getImport(
      importId: string | number,
      options?: RequestOptions,
    ): Promise<OfferImportStatus> {
      const id = requireIdentifier(importId, "importId", "offers.getImport");
      const raw = await http.requestJson(
        { operation: "offers.getImport", pathParams: { import_id: id } },
        options,
      );
      return parseWith(offerImportStatusSchema, raw, "offer import status");
    },

    async getImportErrorReport(
      importId: string | number,
      options?: RequestOptions,
    ): Promise<string> {
      const id = requireIdentifier(importId, "importId", "offers.getImportErrorReport");
      return http.requestText(
        { operation: "offers.getImportErrorReport", pathParams: { import_id: id } },
        options,
      );
    },
  };
}
