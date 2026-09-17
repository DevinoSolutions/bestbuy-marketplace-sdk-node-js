/**
 * Shared harness for the mocked suites. Every test drives the real client through an
 * injected `fetch`, so the code under test is the same code that ships — only the socket is
 * replaced.
 */
import { createBestBuyClient } from "../src/index.js";
import { createMockFetch, type MockRoute, type RecordedCall } from "../src/testing/index.js";
import type { BestBuyClient, BestBuyClientConfig } from "../src/types.js";

/** Obviously-fake key. Real keys never appear in this repo. */
export const TEST_API_KEY = "test-api-key-not-a-real-credential";

/** A client wired to a mock route table, plus the log of requests it made. */
export interface Harness {
  client: BestBuyClient;
  calls: RecordedCall[];
}

/** Builds a client whose fetch answers from `routes`. */
export function harness(
  routes: readonly MockRoute[],
  config: Partial<BestBuyClientConfig> = {},
): Harness {
  const mock = createMockFetch(routes);
  const client = createBestBuyClient({
    apiKey: TEST_API_KEY,
    fetch: mock.fetch,
    ...config,
  });
  return { client, calls: mock.calls };
}

/** A route that always answers with the given status and body. */
export function route(
  method: string,
  pathPattern: RegExp | string,
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): MockRoute {
  return {
    method,
    pathPattern,
    reply: () => ({
      status,
      ...(body !== undefined ? { body } : {}),
      ...(headers ? { headers } : {}),
    }),
  };
}

/** The single call the test made, for assertions on URL, headers and body. */
export function onlyCall(calls: readonly RecordedCall[]): RecordedCall {
  if (calls.length !== 1) throw new Error(`expected exactly 1 call, saw ${calls.length}`);
  const call = calls[0];
  if (call === undefined) throw new Error("no call recorded");
  return call;
}

/** A minimal valid offer payload. */
export const sampleOffer = {
  offer_id: 4242,
  shop_sku: "SKU-1",
  product_sku: "PROD-1",
  product_title: "Sample product",
  price: 199.99,
  quantity: 3,
  state_code: "11",
  active: true,
};

/** A minimal valid order payload. */
export const sampleOrder = {
  order_id: "ORDER-1",
  order_state: "SHIPPING",
  created_date: "2026-09-01T12:00:00Z",
  order_lines: [{ order_line_id: "ORDER-1-A", quantity: 1, offer_sku: "SKU-1" }],
};
