import { beforeEach, describe, expect, it } from "vitest";
import { liveEnabled, makeLiveClient } from "./helpers.js";

/**
 * READ-ONLY live smoke checks against the REAL Best Buy Canada Marketplace account.
 *
 * Every call here is a GET. Nothing in this file may create, change or delete anything —
 * `npm run check:live-readonly` derives its forbidden-token list from the WRITE rows of
 * `src/operations.ts`, so adding a mutating call fails the build rather than the account.
 *
 * Nothing live-discovered (SKUs, order numbers, shop identifiers) is ever asserted on by
 * value or printed: the assertions check shapes, not contents.
 *
 * The API key is shared with live automations, so each test waits a few seconds before it
 * calls out (the documented etiquette is >= 3 s between calls).
 */
const PAUSE_MS = 3_300;
const pace = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

describe.skipIf(!liveEnabled)("live (read-only): Best Buy Canada Marketplace", () => {
  beforeEach(pace);

  it("reads the authenticated account", async () => {
    const account = await makeLiveClient().account.get();
    expect(typeof account.shop_id).toBe("number");
  });

  it("reads at most five offers", async () => {
    const page = await makeLiveClient().offers.list({ max: 5 });
    expect(page.items.length).toBeLessThanOrEqual(5);
    expect(typeof page.totalCount).toBe("number");
    for (const offer of page.items) {
      expect(typeof offer.shop_sku).toBe("string");
      expect(typeof offer.quantity).toBe("number");
    }
  });

  it("reads one offer by id and the offer conditions", async () => {
    const client = makeLiveClient();
    const first = (await client.offers.list({ max: 1 })).items[0];
    if (first !== undefined) {
      await pace();
      const offer = await client.offers.get(first.offer_id);
      expect(offer.offer_id).toBe(first.offer_id);
    }
    await pace();
    const states = await client.offers.states();
    expect(states.length).toBeGreaterThan(0);
    for (const state of states) expect(typeof state.code).toBe("string");
  });

  it("reads at most five orders, and one of them by id", async () => {
    const client = makeLiveClient();
    const page = await client.orders.list({ max: 5 });
    expect(page.items.length).toBeLessThanOrEqual(5);
    for (const order of page.items) {
      expect(typeof order.order_id).toBe("string");
      expect(Array.isArray(order.order_lines)).toBe(true);
    }
    const first = page.items[0];
    if (first !== undefined) {
      await pace();
      const order = await client.orders.get(first.order_id);
      expect(order.order_id).toBe(first.order_id);
    }
  });

  it("looks a product up by a reference type the operator accepts", async () => {
    const client = makeLiveClient();
    const offer = (await client.offers.list({ max: 1 })).items[0];
    const reference = offer?.product_references?.find((ref) => ref.reference_type === "UPC-A");
    if (reference === undefined) return;
    await pace();
    const page = await client.products.search({
      references: [{ type: "UPC-A", value: reference.reference }],
      max: 5,
    });
    expect(typeof page.totalCount).toBe("number");
  });

  it("reads the operator category hierarchy", async () => {
    const hierarchies = await makeLiveClient().catalog.hierarchies({ maxLevel: 1 });
    expect(Array.isArray(hierarchies)).toBe(true);
    for (const node of hierarchies) expect(typeof node.code).toBe("string");
  });

  it("reads the operator value lists", async () => {
    const lists = await makeLiveClient().catalog.valueLists();
    expect(Array.isArray(lists)).toBe(true);
  });

  it("reads the offer additional-field declarations", async () => {
    const fields = await makeLiveClient().catalog.additionalFields({ entities: ["OFFER"] });
    expect(fields.some((field) => field.entity === "OFFER")).toBe(true);
    for (const field of fields) expect(typeof field.code).toBe("string");
  });

  it("reads the shipping reference data", async () => {
    const client = makeLiveClient();
    const carriers = await client.shipping.methods();
    await pace();
    const zones = await client.shipping.zones();
    await pace();
    const types = await client.shipping.types();
    expect(carriers.length).toBeGreaterThan(0);
    expect(zones.length).toBeGreaterThan(0);
    expect(types.length).toBeGreaterThan(0);
  });
});
