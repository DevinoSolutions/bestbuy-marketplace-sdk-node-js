import { describe, expect, it } from "vitest";
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
 */
describe.skipIf(!liveEnabled)("live (read-only): Best Buy Canada Marketplace", () => {
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

  it("reads at most five orders", async () => {
    const page = await makeLiveClient().orders.list({ max: 5 });
    expect(page.items.length).toBeLessThanOrEqual(5);
    for (const order of page.items) {
      expect(typeof order.order_id).toBe("string");
      expect(Array.isArray(order.order_lines)).toBe(true);
    }
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
});
