import type {
  Order,
  OrderAcceptInput,
  OrderListParams,
  OrderTrackingInput,
  OrdersApi,
  Page,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import { orderListSchema, orderSchema, parseWith } from "../schemas/wire.js";
import { joinList, requireNonEmptyArray, requireNonEmptyString } from "../schemas/inputs.js";
import { normalizePageParams, paginate, type ResolvedPageParams } from "../pagination.js";
import { formatMiraklDate } from "../dates.js";

function listQuery(params: OrderListParams | undefined, page: ResolvedPageParams) {
  const query: Record<string, QueryValue> = { max: page.max, offset: page.offset };
  const states = joinList(params?.orderStateCodes);
  if (states !== undefined) query.order_state_codes = states;
  if (params?.startDate !== undefined) query.start_date = formatMiraklDate(params.startDate);
  if (params?.startUpdateDate !== undefined) {
    query.start_update_date = formatMiraklDate(params.startUpdateDate);
  }
  if (params?.customerDebited !== undefined) query.customer_debited = params.customerDebited;
  return query;
}

/** Builds the `orders` namespace. `accept`, `ship` and `setTracking` are WRITES. */
export function createOrdersApi(http: BestBuyHttpClient): OrdersApi {
  async function listPage(
    params: OrderListParams | undefined,
    page: ResolvedPageParams,
    options?: RequestOptions,
  ): Promise<Page<Order>> {
    const raw = await http.requestJson(
      { operation: "orders.list", query: listQuery(params, page) },
      options,
    );
    const parsed = parseWith(orderListSchema, raw, "order list");
    return {
      items: parsed.orders,
      totalCount: parsed.total_count,
      offset: page.offset,
      max: page.max,
    };
  }

  return {
    async list(params?: OrderListParams, options?: RequestOptions): Promise<Page<Order>> {
      return listPage(params, normalizePageParams(params, "orders.list"), options);
    },

    listAll(params?: OrderListParams, options?: RequestOptions): AsyncIterableIterator<Order> {
      return paginate((page) => listPage(params, page, options), params, "orders.listAll");
    },

    async get(orderId: string, options?: RequestOptions): Promise<Order> {
      const id = requireNonEmptyString(orderId, "orderId", "orders.get");
      const raw = await http.requestJson(
        { operation: "orders.get", pathParams: { order_id: id } },
        options,
      );
      return parseWith(orderSchema, raw, "order");
    },

    // WRITE. Accepting or refusing order lines is irreversible.
    async accept(
      orderId: string,
      input: OrderAcceptInput,
      options?: RequestOptions,
    ): Promise<void> {
      const id = requireNonEmptyString(orderId, "orderId", "orders.accept");
      requireNonEmptyArray(input?.orderLines ?? [], "orderLines", "orders.accept");
      await http.requestJson(
        {
          operation: "orders.accept",
          pathParams: { order_id: id },
          json: {
            order_lines: input.orderLines.map((line) => ({
              id: requireNonEmptyString(line.id, "orderLines.id", "orders.accept"),
              accepted: line.accepted,
            })),
          },
        },
        options,
      );
    },

    // WRITE. Marks the whole order shipped.
    async ship(orderId: string, options?: RequestOptions): Promise<void> {
      const id = requireNonEmptyString(orderId, "orderId", "orders.ship");
      await http.requestJson({ operation: "orders.ship", pathParams: { order_id: id } }, options);
    },

    // WRITE. Sets carrier and tracking number on the order.
    async setTracking(
      orderId: string,
      input: OrderTrackingInput,
      options?: RequestOptions,
    ): Promise<void> {
      const id = requireNonEmptyString(orderId, "orderId", "orders.setTracking");
      const trackingNumber = requireNonEmptyString(
        input?.trackingNumber,
        "trackingNumber",
        "orders.setTracking",
      );
      const json: Record<string, string> = { tracking_number: trackingNumber };
      if (input.carrierCode !== undefined) json.carrier_code = input.carrierCode;
      if (input.carrierName !== undefined) json.carrier_name = input.carrierName;
      if (input.carrierUrl !== undefined) json.carrier_url = input.carrierUrl;
      await http.requestJson(
        { operation: "orders.setTracking", pathParams: { order_id: id }, json },
        options,
      );
    },
  };
}
