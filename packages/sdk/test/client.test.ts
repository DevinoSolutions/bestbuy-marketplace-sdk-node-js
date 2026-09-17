import { describe, expect, it } from "vitest";
import { createBestBuyClient } from "../src/index.js";
import { BestBuyNetworkError, BestBuyValidationError } from "../src/errors/index.js";
import { harness, onlyCall, route, sampleOffer, TEST_API_KEY } from "./helpers.js";

const offerListRoute = route("GET", /^\/api\/offers(\?|$)/, 200, {
  offers: [sampleOffer],
  total_count: 1,
});

describe("createBestBuyClient configuration", () => {
  it("rejects a missing API key with a validation error naming the field", () => {
    expect.assertions(2);
    try {
      createBestBuyClient({ apiKey: "" });
    } catch (error) {
      expect(error).toBeInstanceOf(BestBuyValidationError);
      expect((error as BestBuyValidationError).issues[0]?.path).toBe("apiKey");
    }
  });

  it("rejects a non-https base URL", () => {
    expect(() => createBestBuyClient({ apiKey: "k", baseUrl: "http://example.com" })).toThrow(
      BestBuyValidationError,
    );
  });

  it("allows http for loopback so a fixture server can stand in for the API", () => {
    expect(() =>
      createBestBuyClient({ apiKey: "k", baseUrl: "http://127.0.0.1:8080" }),
    ).not.toThrow();
  });

  it("rejects a non-positive timeout", () => {
    expect(() => createBestBuyClient({ apiKey: "k", timeoutMs: 0 })).toThrow(
      BestBuyValidationError,
    );
  });

  it("reports every invalid field at once", () => {
    expect.assertions(1);
    try {
      createBestBuyClient({ apiKey: "", timeoutMs: -1, baseUrl: "not a url" });
    } catch (error) {
      expect((error as BestBuyValidationError).issues.length).toBe(3);
    }
  });
});

describe("request construction", () => {
  it("sends the API key raw in Authorization, with no Bearer prefix", async () => {
    const { client, calls } = harness([offerListRoute]);
    await client.offers.list();
    expect(onlyCall(calls).headers.get("authorization")).toBe(TEST_API_KEY);
  });

  it("asks for JSON and identifies itself with a User-Agent", async () => {
    const { client, calls } = harness([offerListRoute]);
    await client.offers.list();
    const call = onlyCall(calls);
    expect(call.headers.get("accept")).toBe("application/json");
    expect(call.headers.get("user-agent")).toMatch(/bestbuy-marketplace-sdk/);
  });

  it("defaults to the Best Buy Canada marketplace host", async () => {
    const { client, calls } = harness([offerListRoute]);
    await client.offers.list();
    expect(onlyCall(calls).url.origin).toBe("https://marketplace.bestbuy.ca");
  });

  it("honours a custom base URL", async () => {
    const { client, calls } = harness([offerListRoute], { baseUrl: "https://sandbox.example.com" });
    await client.offers.list();
    expect(onlyCall(calls).url.origin).toBe("https://sandbox.example.com");
  });

  it("adds shop_id only when the client was configured with one", async () => {
    const withShop = harness([offerListRoute], { shopId: 1234 });
    await withShop.client.offers.list();
    expect(onlyCall(withShop.calls).url.searchParams.get("shop_id")).toBe("1234");

    const withoutShop = harness([offerListRoute]);
    await withoutShop.client.offers.list();
    expect(onlyCall(withoutShop.calls).url.searchParams.has("shop_id")).toBe(false);
  });

  it("surfaces a non-JSON success body as a validation error", async () => {
    const { client } = harness([route("GET", /^\/api\/offers/, 200, "<html>maintenance</html>")]);
    await expect(client.offers.list()).rejects.toBeInstanceOf(BestBuyValidationError);
  });
});

describe("transport failures", () => {
  const hangingFetch: typeof globalThis.fetch = ((
    _input: unknown,
    init?: { signal?: AbortSignal },
  ) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted === true) {
        reject(new Error("aborted"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as typeof globalThis.fetch;

  it("turns the configured timeout into a network error flagged as timed out", async () => {
    const client = createBestBuyClient({
      apiKey: TEST_API_KEY,
      fetch: hangingFetch,
      timeoutMs: 5,
    });
    const error = await client.account.get().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BestBuyNetworkError);
    expect((error as BestBuyNetworkError).timedOut).toBe(true);
  });

  it("distinguishes a caller abort from a timeout", async () => {
    const client = createBestBuyClient({
      apiKey: TEST_API_KEY,
      fetch: hangingFetch,
      timeoutMs: 30_000,
    });
    const controller = new AbortController();
    controller.abort();
    const error = await client.account
      .get({ signal: controller.signal })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BestBuyNetworkError);
    expect((error as BestBuyNetworkError).timedOut).toBe(false);
  });

  it("never leaks the API key into a transport error", async () => {
    const client = createBestBuyClient({
      apiKey: TEST_API_KEY,
      fetch: hangingFetch,
      timeoutMs: 5,
    });
    const error = await client.account.get().catch((err: unknown) => err);
    expect(JSON.stringify(error)).not.toContain(TEST_API_KEY);
    expect((error as Error).message).not.toContain(TEST_API_KEY);
  });
});
