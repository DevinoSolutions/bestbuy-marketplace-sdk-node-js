import { describe, expect, it } from "vitest";
import { BestBuyValidationError } from "../src/errors/index.js";
import { harness, onlyCall, route } from "./helpers.js";

describe("account.get", () => {
  it("reads the authenticated shop", async () => {
    const { client, calls } = harness([
      route("GET", "/api/account", 200, {
        shop_id: 7788,
        shop_name: "Devino",
        currency_iso_code: "CAD",
        premium: false,
      }),
    ]);
    const account = await client.account.get();
    expect(account.shop_id).toBe(7788);
    expect(account.shop_name).toBe("Devino");
    expect(onlyCall(calls).url.pathname).toBe("/api/account");
  });

  it("keeps operator-specific fields the SDK does not model", async () => {
    const { client } = harness([
      route("GET", "/api/account", 200, { shop_id: 1, operator_specific_flag: true }),
    ]);
    const account = await client.account.get();
    expect((account as unknown as Record<string, unknown>).operator_specific_flag).toBe(true);
  });

  it("rejects a response that is missing the shop id", async () => {
    const { client } = harness([route("GET", "/api/account", 200, { shop_name: "Devino" })]);
    await expect(client.account.get()).rejects.toBeInstanceOf(BestBuyValidationError);
  });
});
