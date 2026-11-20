/**
 * OR28 refund (`orders.refund`), a WRITE. Driven through the public API with a mocked fetch;
 * every id and amount is a made-up placeholder. The 200 body comes from
 * `order-refund-response.json`, a REAL response captured live on 2026-11-20 with every id and
 * amount replaced by a fake value (structure, types and key order are the captured ones). The
 * tests also pin that parsing stays lenient, and `buildFullRefund` reproduces the request that
 * succeeded live (all GST/PST taxes and shipping taxes, zeros included).
 */
import { describe, expect, it } from "vitest";
import { BestBuyApiError, BestBuyValidationError } from "../src/errors/index.js";
import { harness, onlyCall, readFixture, route } from "./helpers.js";

const refundPath = /^\/api\/orders\/refund$/;

const line = {
  orderLineId: "100000001",
  quantity: 1,
  amount: 120.5,
  currencyIsoCode: "CAD",
  reasonCode: "44",
};

describe("orders.refund (OR28)", () => {
  it("PUTs /api/orders/refund with Mirakl field names and string tax amounts", async () => {
    const { client, calls } = harness([
      route("PUT", refundPath, 200, readFixture("order-refund-response")),
    ]);
    const result = await client.orders.refund({
      orderTaxMode: "TAX_EXCLUDED",
      refunds: [
        {
          ...line,
          shippingAmount: 5,
          taxes: [
            { code: "GST", amount: 6.025 },
            { code: "PST", amount: "8.4" },
          ],
          shippingTaxes: [{ code: "GST", amount: 0.25 }],
          excludedFromShipment: false,
          fees: [{ code: "FEE-1", amount: 1.5 }],
          taxLegalNotice: "notice",
        },
      ],
    });

    const call = onlyCall(calls);
    expect(call.method).toBe("PUT");
    expect(call.url.pathname).toBe("/api/orders/refund");
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(call.bodyJson).toEqual({
      order_tax_mode: "TAX_EXCLUDED",
      refunds: [
        {
          order_line_id: "100000001",
          quantity: 1,
          amount: 120.5,
          currency_iso_code: "CAD",
          reason_code: "44",
          shipping_amount: 5,
          taxes: [
            { code: "GST", amount: "6.03" },
            { code: "PST", amount: "8.40" },
          ],
          shipping_taxes: [{ code: "GST", amount: "0.25" }],
          excluded_from_shipment: false,
          fees: [{ code: "FEE-1", amount: 1.5 }],
          tax_legal_notice: "notice",
        },
      ],
    });
    // Tax amounts are strings on the wire, not numbers.
    const body = call.bodyText ?? "";
    expect(body).toContain('"amount":"6.03"');
    expect(body).toContain('"amount":"8.40"');
    expect(body).toContain('"amount":"0.25"');

    expect(result.order_tax_mode).toBe("TAX_EXCLUDED");
    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]).toMatchObject({
      refund_id: "2000001",
      order_refund_id: "22222222-2222-4222-8222-222222222222",
      amount: 120.5,
      reason_code: "44",
      order_line_id: "100000001",
      quantity: 1,
      currency_iso_code: "CAD",
    });
  });

  it("sends only the required keys when the optional ones are omitted", async () => {
    const { client, calls } = harness([route("PUT", refundPath, 200, { refunds: [] })]);
    await client.orders.refund({ refunds: [line] });
    expect(onlyCall(calls).bodyJson).toEqual({
      refunds: [
        {
          order_line_id: "100000001",
          quantity: 1,
          amount: 120.5,
          currency_iso_code: "CAD",
          reason_code: "44",
        },
      ],
    });
  });

  it("allows a zero amount and several lines", async () => {
    const { client, calls } = harness([route("PUT", refundPath, 200, { refunds: [] })]);
    await client.orders.refund({
      orderTaxMode: "TAX_INCLUDED",
      refunds: [
        { ...line, amount: 0 },
        { ...line, orderLineId: "100000002", reasonCode: "17", quantity: 2 },
      ],
    });
    const json = onlyCall(calls).bodyJson as { order_tax_mode: string; refunds: unknown[] };
    expect(json.order_tax_mode).toBe("TAX_INCLUDED");
    expect(json.refunds).toHaveLength(2);
  });

  it("tolerates an empty or sparse response after the refund was created", async () => {
    const empty = harness([route("PUT", refundPath, 204)]);
    await expect(empty.client.orders.refund({ refunds: [line] })).resolves.toEqual({ refunds: [] });

    const sparse = harness([
      route("PUT", refundPath, 200, {
        refunds: [{ refund_id: "5", quantity: null }],
        order_tax_mode: null,
      }),
    ]);
    const result = await sparse.client.orders.refund({ refunds: [line] });
    expect(result.refunds[0]?.refund_id).toBe("5");
  });

  it("surfaces an upstream rejection as an API error", async () => {
    const { client } = harness([route("PUT", refundPath, 400, { message: "bad refund" })]);
    await expect(client.orders.refund({ refunds: [line] })).rejects.toBeInstanceOf(BestBuyApiError);
  });

  it.each([
    ["no refunds", { refunds: [] }],
    ["zero quantity", { refunds: [{ ...line, quantity: 0 }] }],
    ["fractional quantity", { refunds: [{ ...line, quantity: 1.5 }] }],
    ["negative amount", { refunds: [{ ...line, amount: -1 }] }],
    ["NaN amount", { refunds: [{ ...line, amount: Number.NaN }] }],
    ["infinite amount", { refunds: [{ ...line, amount: Number.POSITIVE_INFINITY }] }],
    ["string amount", { refunds: [{ ...line, amount: "5.00" }] }],
    ["empty order line id", { refunds: [{ ...line, orderLineId: "" }] }],
    ["empty currency", { refunds: [{ ...line, currencyIsoCode: "" }] }],
    ["blank reason code", { refunds: [{ ...line, reasonCode: " " }] }],
    ["negative shipping amount", { refunds: [{ ...line, shippingAmount: -0.01 }] }],
    ["non-numeric tax amount", { refunds: [{ ...line, taxes: [{ code: "GST", amount: "abc" }] }] }],
    ["negative tax amount", { refunds: [{ ...line, taxes: [{ code: "GST", amount: -2 }] }] }],
    ["empty tax code", { refunds: [{ ...line, taxes: [{ code: "", amount: 1 }] }] }],
    ["bad shipping tax", { refunds: [{ ...line, shippingTaxes: [{ code: "GST", amount: "x" }] }] }],
    ["negative fee", { refunds: [{ ...line, fees: [{ code: "F", amount: -1 }] }] }],
    ["unknown tax mode", { orderTaxMode: "TAX_MAYBE", refunds: [line] }],
  ])("refuses %s before any request is made", async (_label, input) => {
    const { client, calls } = harness([route("PUT", refundPath, 200, { refunds: [] })]);
    await expect(
      client.orders.refund(input as unknown as Parameters<typeof client.orders.refund>[0]),
    ).rejects.toBeInstanceOf(BestBuyValidationError);
    expect(calls).toHaveLength(0);
  });
});
