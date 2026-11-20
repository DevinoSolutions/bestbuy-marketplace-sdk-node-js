/**
 * `orders.buildFullRefund` (a pure helper), the `orderIds` filter on `orders.list`, and the
 * OR12-vs-OR11 difference that makes them necessary.
 *
 * VERIFIED live 2026-11-20: `GET /api/orders/{id}` (OR12) returns order lines WITHOUT `taxes`,
 * `shipping_taxes` and `refunds` (and the order without `currency_iso_code`), while
 * `GET /api/orders?order_ids=...` (OR11) returns them. OR28 refused a refund that left out the
 * shipping taxes ("All shipping taxes on order line must be specified") even though shipping
 * was 0, and accepted one carrying every tax code, zeros included. The order below has the
 * shape of that OR11 response with made-up ids and amounts.
 */
import { describe, expect, it } from "vitest";
import { BestBuyValidationError } from "../src/errors/index.js";
import type { Order } from "../src/types.js";
import { harness, onlyCall, readFixture, route } from "./helpers.js";

const order: Order = {
  order_id: "100000001-A",
  order_state: "RECEIVED",
  currency_iso_code: "CAD",
  order_tax_mode: "TAX_EXCLUDED",
  order_lines: [
    {
      order_line_id: "100000001",
      quantity: 1,
      price: 120.5,
      price_unit: 120.5,
      total_price: 120.5,
      shipping_price: 0,
      can_refund: true,
      taxes: [
        { code: "GST", amount: 6.03, tax_calculation_rule: "PROPORTIONAL_TO_AMOUNT" },
        { code: "PST", amount: 0, tax_calculation_rule: "PROPORTIONAL_TO_AMOUNT" },
      ],
      shipping_taxes: [
        { code: "GST", amount: 0, tax_calculation_rule: "PROPORTIONAL_TO_AMOUNT" },
        { code: "PST", amount: 0, tax_calculation_rule: "PROPORTIONAL_TO_AMOUNT" },
      ],
    },
  ],
};

describe("orders.buildFullRefund", () => {
  it("copies the line amounts and EVERY tax and shipping tax, zeros included", () => {
    const { client } = harness([]);
    expect(client.orders.buildFullRefund(order, "100000001", "44")).toEqual({
      orderTaxMode: "TAX_EXCLUDED",
      refunds: [
        {
          orderLineId: "100000001",
          quantity: 1,
          amount: 120.5,
          currencyIsoCode: "CAD",
          reasonCode: "44",
          shippingAmount: 0,
          taxes: [
            { code: "GST", amount: 6.03 },
            { code: "PST", amount: 0 },
          ],
          shippingTaxes: [
            { code: "GST", amount: 0 },
            { code: "PST", amount: 0 },
          ],
        },
      ],
    });
  });

  it("feeds orders.refund and puts the zero shipping taxes on the wire as strings", async () => {
    const { client, calls } = harness([
      route("PUT", /^\/api\/orders\/refund$/, 200, readFixture("order-refund-response")),
    ]);
    await client.orders.refund(client.orders.buildFullRefund(order, "100000001", "44"));
    expect(onlyCall(calls).bodyJson).toEqual({
      order_tax_mode: "TAX_EXCLUDED",
      refunds: [
        {
          order_line_id: "100000001",
          quantity: 1,
          amount: 120.5,
          currency_iso_code: "CAD",
          reason_code: "44",
          shipping_amount: 0,
          taxes: [
            { code: "GST", amount: "6.03" },
            { code: "PST", amount: "0.00" },
          ],
          shipping_taxes: [
            { code: "GST", amount: "0.00" },
            { code: "PST", amount: "0.00" },
          ],
        },
      ],
    });
  });

  it("makes no request of its own", () => {
    const { client, calls } = harness([]);
    client.orders.buildFullRefund(order, "100000001", "17");
    expect(calls).toHaveLength(0);
  });

  it("omits orderTaxMode when the order does not state a known one", () => {
    const { client } = harness([]);
    const input = client.orders.buildFullRefund(
      { ...order, order_tax_mode: "SOMETHING_ELSE" },
      "100000001",
      "44",
    );
    expect(input).not.toHaveProperty("orderTaxMode");
  });

  it("refuses an order read with orders.get (no taxes), naming orders.list", () => {
    const { client } = harness([]);
    const reduced: Order = {
      order_id: "100000001-A",
      currency_iso_code: "CAD",
      order_lines: [{ order_line_id: "100000001", quantity: 1, price: 120.5, shipping_price: 0 }],
    };
    expect(() => client.orders.buildFullRefund(reduced, "100000001", "44")).toThrow(
      BestBuyValidationError,
    );
    expect(() => client.orders.buildFullRefund(reduced, "100000001", "44")).toThrow(
      /Invalid argument for orders\.buildFullRefund/,
    );
    try {
      client.orders.buildFullRefund(reduced, "100000001", "44");
    } catch (error) {
      expect(JSON.stringify((error as BestBuyValidationError).issues)).toContain("orders.list");
    }
  });

  it.each([
    ["an unknown line", (o: Order) => o, "999", "44"],
    ["a blank reason code", (o: Order) => o, "100000001", " "],
    ["an empty line id", (o: Order) => o, "", "44"],
    [
      "a line that cannot be refunded",
      (o: Order): Order => ({
        ...o,
        order_lines: o.order_lines.map((l) => ({ ...l, can_refund: false })),
      }),
      "100000001",
      "44",
    ],
    [
      "an order without a currency",
      (o: Order): Order => {
        const { currency_iso_code: _currency, ...rest } = o;
        return rest;
      },
      "100000001",
      "44",
    ],
    [
      "a tax without an amount",
      (o: Order): Order => ({
        ...o,
        order_lines: o.order_lines.map((l) => ({ ...l, taxes: [{ code: "GST" }] })),
      }),
      "100000001",
      "44",
    ],
  ])("refuses %s", (_label, mutate, lineId, reason) => {
    const { client } = harness([]);
    expect(() => client.orders.buildFullRefund(mutate(order), lineId, reason)).toThrow(
      BestBuyValidationError,
    );
  });
});

describe("orders.list orderIds filter (OR11) and orders.get (OR12)", () => {
  it("maps orderIds onto order_ids, comma-joined", async () => {
    const { client, calls } = harness([
      route("GET", /^\/api\/orders\?/, 200, { orders: [order], total_count: 1 }),
    ]);
    const page = await client.orders.list({ orderIds: ["100000001-A", "100000002-A"] });
    expect(page.items[0]?.order_lines[0]?.taxes).toHaveLength(2);
    expect(onlyCall(calls).url.searchParams.get("order_ids")).toBe("100000001-A,100000002-A");
  });

  it("carries orderIds through listAll too", async () => {
    const { client, calls } = harness([
      route("GET", /^\/api\/orders\?/, 200, { orders: [order], total_count: 1 }),
    ]);
    for await (const item of client.orders.listAll({ orderIds: ["100000001-A"] })) {
      expect(item.order_id).toBe("100000001-A");
    }
    expect(onlyCall(calls).url.searchParams.get("order_ids")).toBe("100000001-A");
  });

  it("reads one order from its own path (OR12), not as a filtered list", async () => {
    const { client, calls } = harness([
      route("GET", /^\/api\/orders\/100000001-A$/, 200, {
        order_id: "100000001-A",
        order_lines: [{ order_line_id: "100000001", quantity: 1 }],
      }),
    ]);
    const got = await client.orders.get("100000001-A");
    expect(got.order_lines[0]?.taxes).toBeUndefined();
    expect(onlyCall(calls).url.search).not.toContain("order_ids");
  });

  it("parses the refunds OR11 reports on a line, with their WAITING_REFUND_PAYMENT state", async () => {
    const withRefund: Order = {
      ...order,
      order_lines: order.order_lines.map((l) => ({
        ...l,
        can_refund: false,
        refunds: [{ id: "2000001", state: "WAITING_REFUND_PAYMENT", quantity: 1, amount: 120.5 }],
      })),
    };
    const { client } = harness([
      route("GET", /^\/api\/orders\?/, 200, { orders: [withRefund], total_count: 1 }),
    ]);
    const page = await client.orders.list({ orderIds: ["100000001-A"] });
    expect(page.items[0]?.order_lines[0]?.refunds?.[0]?.state).toBe("WAITING_REFUND_PAYMENT");
  });
});
