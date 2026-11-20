import type {
  Order,
  OrderAcceptInput,
  OrderListParams,
  OrderRefundInput,
  OrderRefundResult,
  OrderRefundTax,
  OrderTrackingInput,
  OrdersApi,
  Page,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient, QueryValue } from "../client/http.js";
import {
  orderListSchema,
  orderRefundResultSchema,
  orderSchema,
  parseWith,
} from "../schemas/wire.js";
import {
  formatMoneyString,
  joinList,
  requireNonEmptyArray,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requirePositiveInteger,
} from "../schemas/inputs.js";
import { BestBuyValidationError } from "../errors/index.js";
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

const TAX_MODES: readonly string[] = ["TAX_INCLUDED", "TAX_EXCLUDED"];

/** Validates a list of refund taxes; amounts are STRINGS with 2 decimals on the wire. */
function refundTaxes(
  taxes: readonly OrderRefundTax[],
  path: string,
): { code: string; amount: string }[] {
  return taxes.map((tax, index) => ({
    code: requireNonEmptyString(tax?.code, `${path}[${index}].code`, "orders.refund"),
    amount: formatMoneyString(tax.amount, `${path}[${index}].amount`, "orders.refund"),
  }));
}

/** Builds the `orders` namespace. `accept`, `ship`, `setTracking` and `refund` are WRITES. */
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

    // WRITE. Refunds money to the customer (OR28); irreversible.
    async refund(input: OrderRefundInput, options?: RequestOptions): Promise<OrderRefundResult> {
      const ctx = "orders.refund";
      const refunds = input?.refunds ?? [];
      requireNonEmptyArray(refunds, "refunds", ctx);
      if (input.orderTaxMode !== undefined && !TAX_MODES.includes(input.orderTaxMode)) {
        throw new BestBuyValidationError(`Invalid argument for ${ctx}`, {
          issues: [
            {
              path: "orderTaxMode",
              message: "must be TAX_INCLUDED or TAX_EXCLUDED",
              code: "invalid_value",
            },
          ],
        });
      }

      const lines = refunds.map((line, index) => {
        const at = `refunds[${index}]`;
        const wire: Record<string, unknown> = {
          order_line_id: requireNonEmptyString(line?.orderLineId, `${at}.orderLineId`, ctx),
          quantity: requirePositiveInteger(line.quantity, `${at}.quantity`, ctx),
          amount: requireNonNegativeNumber(line.amount, `${at}.amount`, ctx),
          currency_iso_code: requireNonEmptyString(
            line.currencyIsoCode,
            `${at}.currencyIsoCode`,
            ctx,
          ),
          reason_code: requireNonEmptyString(line.reasonCode, `${at}.reasonCode`, ctx),
        };
        if (line.shippingAmount !== undefined) {
          wire.shipping_amount = requireNonNegativeNumber(
            line.shippingAmount,
            `${at}.shippingAmount`,
            ctx,
          );
        }
        if (line.taxes !== undefined) wire.taxes = refundTaxes(line.taxes, `${at}.taxes`);
        if (line.shippingTaxes !== undefined) {
          wire.shipping_taxes = refundTaxes(line.shippingTaxes, `${at}.shippingTaxes`);
        }
        if (line.excludedFromShipment !== undefined) {
          wire.excluded_from_shipment = line.excludedFromShipment;
        }
        if (line.fees !== undefined) {
          wire.fees = line.fees.map((fee, feeIndex) => ({
            code: requireNonEmptyString(fee?.code, `${at}.fees[${feeIndex}].code`, ctx),
            amount: requireNonNegativeNumber(fee.amount, `${at}.fees[${feeIndex}].amount`, ctx),
          }));
        }
        if (line.taxLegalNotice !== undefined) wire.tax_legal_notice = line.taxLegalNotice;
        return wire;
      });

      const json: Record<string, unknown> = { refunds: lines };
      if (input.orderTaxMode !== undefined) json.order_tax_mode = input.orderTaxMode;
      const raw = await http.requestJson({ operation: "orders.refund", json }, options);
      // The refund is already created at this point; an empty body is tolerated.
      return parseWith(orderRefundResultSchema, raw ?? {}, "order refund");
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
