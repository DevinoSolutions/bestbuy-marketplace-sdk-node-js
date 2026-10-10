import { describe, expect, it } from "vitest";
import { BestBuyApiError } from "../src/errors/index.js";
import { harness, route, TEST_API_KEY } from "./helpers.js";

/** Drives the cheapest read against a failing route and returns the error it produced. */
async function failWith(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Promise<BestBuyApiError> {
  const { client } = harness([route("GET", /^\/api\/account/, status, body, headers)]);
  try {
    await client.account.get();
  } catch (error) {
    return error as BestBuyApiError;
  }
  throw new Error(`expected HTTP ${status} to reject`);
}

describe("upstream error mapping", () => {
  it("maps a 401 with a Mirakl message body", async () => {
    const error = await failWith(401, { message: "Invalid API key", status: 401 });
    expect(error).toBeInstanceOf(BestBuyApiError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("Invalid API key");
    expect(error.retryable).toBe(false);
  });

  it("maps the live 401 body, which lists status before message", async () => {
    // VERIFIED 2026-10-10: a bad API key answers {"status":401,"message":"Unauthorized"}.
    const error = await failWith(401, { status: 401, message: "Unauthorized" });
    expect(error.status).toBe(401);
    expect(error.message).toContain("Unauthorized");
    expect(error.retryable).toBe(false);
  });

  it("maps the live 400 for a rejected query value", async () => {
    // VERIFIED 2026-10-10: an unknown order_state_codes value is a 400 naming the field.
    const error = await failWith(400, {
      message: "Invalid value supplied for field 'order_state_codes'. Rejected value: 'BOGUS'",
      status: 400,
    });
    expect(error.status).toBe(400);
    expect(error.message).toContain("order_state_codes");
    expect(error.retryable).toBe(false);
  });

  it("maps the live 404 bodies for an unknown id", async () => {
    // VERIFIED 2026-10-10: the message is bare ("Not Found") on offers and offer imports,
    // and descriptive on orders and product imports.
    expect((await failWith(404, { message: "Not Found", status: 404 })).message).toContain(
      "Not Found",
    );
    expect(
      (await failWith(404, { message: "No order with id: 'ORDER-X'", status: 404 })).message,
    ).toContain("No order with id");
  });

  it("maps a 403 and extracts the upstream error code", async () => {
    const error = await failWith(403, {
      errors: [{ message: "Forbidden", code: "ACCESS_DENIED" }],
    });
    expect(error.status).toBe(403);
    expect(error.code).toBe("ACCESS_DENIED");
  });

  it("falls back to a status summary when the body carries no message", async () => {
    const error = await failWith(404, "");
    expect(error.status).toBe(404);
    expect(error.message).toContain("Not found");
  });

  it("joins the messages of a JSON array error body", async () => {
    const error = await failWith(400, [{ message: "price is required" }, { message: "bad sku" }]);
    expect(error.message).toContain("price is required; bad sku");
  });

  it("keeps a plain-text error body verbatim", async () => {
    const error = await failWith(400, "offer import rejected", { "content-type": "text/plain" });
    expect(error.body).toBe("offer import rejected");
  });

  it("marks 429 and 5xx as retryable", async () => {
    expect((await failWith(429, { message: "slow down" })).retryable).toBe(true);
    expect((await failWith(503, { message: "maintenance" })).retryable).toBe(true);
  });

  it("captures the upstream request id when the response carries one", async () => {
    const error = await failWith(500, { message: "boom" }, { "x-request-id": "req-9" });
    expect(error.requestId).toBe("req-9");
  });

  it("falls back to the live x-correlation-id header for the request id", async () => {
    // VERIFIED 2026-10-10: Best Buy sends x-correlation-id on every response, never x-request-id.
    const error = await failWith(
      500,
      { message: "boom" },
      { "x-correlation-id": "00000000-0000-4000-8000-000000000000" },
    );
    expect(error.requestId).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("redacts the API key even when the upstream echoes it back", async () => {
    const error = await failWith(401, { message: `key ${TEST_API_KEY} rejected` });
    expect(error.message).not.toContain(TEST_API_KEY);
    expect(error.message).toContain("[redacted]");
    expect(JSON.stringify(error.body)).not.toContain(TEST_API_KEY);
  });

  it("serializes to JSON without credentials and with the useful fields", async () => {
    const error = await failWith(400, { message: "bad request", code: "INVALID" });
    const json = error.toJSON();
    expect(json.status).toBe(400);
    expect(json.code).toBe("INVALID");
    expect(JSON.stringify(json)).not.toContain(TEST_API_KEY);
  });
});
