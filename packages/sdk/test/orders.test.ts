import { describe, expect, it } from "vitest";
import { BestBuyValidationError } from "../src/errors/index.js";
import { harness, onlyCall, route, sampleOrder } from "./helpers.js";

const listPath = /^\/api\/orders(\?|$)/;

describe("orders.list", () => {
  it("returns a page of orders with their lines", async () => {
    const { client } = harness([
      route("GET", listPath, 200, { orders: [sampleOrder], total_count: 1 }),
    ]);
    const page = await client.orders.list();
    expect(page.items[0]?.order_id).toBe("ORDER-1");
    expect(page.items[0]?.order_lines[0]?.order_line_id).toBe("ORDER-1-A");
  });

  it("maps filters onto Mirakl query parameters and formats dates", async () => {
    const { client, calls } = harness([
      route("GET", listPath, 200, { orders: [], total_count: 0 }),
    ]);
    await client.orders.list({
      orderStateCodes: ["WAITING_ACCEPTANCE", "SHIPPING"],
      startDate: new Date("2026-09-01T00:00:00Z"),
      startUpdateDate: "2026-09-05T00:00:00Z",
      customerDebited: true,
      max: 5,
    });
    const query = onlyCall(calls).url.searchParams;
    expect(query.get("order_state_codes")).toBe("WAITING_ACCEPTANCE,SHIPPING");
    expect(query.get("start_date")).toBe("2026-09-01T00:00:00.000Z");
    expect(query.get("start_update_date")).toBe("2026-09-05T00:00:00Z");
    expect(query.get("customer_debited")).toBe("true");
    expect(query.get("max")).toBe("5");
  });
});

describe("orders.listAll", () => {
  it("pages through every order", async () => {
    const { client, calls } = harness([
      {
        method: "GET",
        pathPattern: listPath,
        reply: (req) => {
          const offset = Number(req.url.searchParams.get("offset") ?? "0");
          const orders =
            offset === 0
              ? [sampleOrder, { ...sampleOrder, order_id: "ORDER-2" }]
              : [{ ...sampleOrder, order_id: "ORDER-3" }];
          return { status: 200, body: { orders, total_count: 3 } };
        },
      },
    ]);
    const ids: string[] = [];
    for await (const order of client.orders.listAll({ max: 2 })) ids.push(order.order_id);
    expect(ids).toEqual(["ORDER-1", "ORDER-2", "ORDER-3"]);
    expect(calls).toHaveLength(2);
  });
});

describe("orders.get", () => {
  it("reads one order by id", async () => {
    const { client, calls } = harness([route("GET", /^\/api\/orders\/ORDER-1$/, 200, sampleOrder)]);
    const order = await client.orders.get("ORDER-1");
    expect(order.order_state).toBe("SHIPPING");
    expect(onlyCall(calls).url.pathname).toBe("/api/orders/ORDER-1");
  });

  it("refuses an empty order id", async () => {
    const { client, calls } = harness([route("GET", /^\/api\/orders/, 200, sampleOrder)]);
    await expect(client.orders.get("")).rejects.toBeInstanceOf(BestBuyValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe("order writes", () => {
  it("accept PUTs the per-line decisions", async () => {
    const { client, calls } = harness([route("PUT", /\/accept$/, 204)]);
    await client.orders.accept("ORDER-1", {
      orderLines: [
        { id: "ORDER-1-A", accepted: true },
        { id: "ORDER-1-B", accepted: false },
      ],
    });
    const call = onlyCall(calls);
    expect(call.method).toBe("PUT");
    expect(call.url.pathname).toBe("/api/orders/ORDER-1/accept");
    expect(call.bodyJson).toEqual({
      order_lines: [
        { id: "ORDER-1-A", accepted: true },
        { id: "ORDER-1-B", accepted: false },
      ],
    });
  });

  it("ship PUTs with no body", async () => {
    const { client, calls } = harness([route("PUT", /\/ship$/, 204)]);
    await client.orders.ship("ORDER-1");
    const call = onlyCall(calls);
    expect(call.url.pathname).toBe("/api/orders/ORDER-1/ship");
    expect(call.bodyText).toBeUndefined();
  });

  it("setTracking PUTs the carrier and tracking number in Mirakl field names", async () => {
    const { client, calls } = harness([route("PUT", /\/tracking$/, 204)]);
    await client.orders.setTracking("ORDER-1", {
      carrierCode: "CANADA_POST",
      carrierName: "Canada Post",
      trackingNumber: "TRK-9",
    });
    expect(onlyCall(calls).bodyJson).toEqual({
      tracking_number: "TRK-9",
      carrier_code: "CANADA_POST",
      carrier_name: "Canada Post",
    });
  });

  it("refuses an empty tracking number", async () => {
    const { client, calls } = harness([route("PUT", /\/tracking$/, 204)]);
    await expect(
      client.orders.setTracking("ORDER-1", { trackingNumber: "" }),
    ).rejects.toBeInstanceOf(BestBuyValidationError);
    expect(calls).toHaveLength(0);
  });
});
