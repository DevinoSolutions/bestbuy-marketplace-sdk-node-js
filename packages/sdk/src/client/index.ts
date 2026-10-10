import type { BestBuyClient, BestBuyClientConfig } from "../types.js";
import { createAccountApi } from "../account/api.js";
import { createCatalogApi } from "../catalog/api.js";
import { createInboxApi } from "../inbox/api.js";
import { createOffersApi } from "../offers/api.js";
import { createOrdersApi } from "../orders/api.js";
import { createPlatformApi } from "../platform/api.js";
import { createProductsApi } from "../products/api.js";
import { createShippingApi } from "../shipping/api.js";
import { resolveConfig } from "./config.js";
import { BestBuyHttpClient } from "./http.js";

/**
 * Creates a Best Buy Canada Marketplace client.
 *
 * Configuration is validated eagerly — an invalid field throws
 * {@link BestBuyValidationError} here rather than on the first request — and nothing touches
 * the network or the API key at construction time. Call `account.get()` once at startup for a
 * read-only check that the key is actually accepted.
 */
export function createBestBuyClient(config: BestBuyClientConfig): BestBuyClient {
  const resolved = resolveConfig(config);
  const http = new BestBuyHttpClient(resolved);

  return {
    account: createAccountApi(http),
    offers: createOffersApi(http),
    products: createProductsApi(http),
    catalog: createCatalogApi(http),
    shipping: createShippingApi(http),
    orders: createOrdersApi(http),
    inbox: createInboxApi(http),
    platform: createPlatformApi(http),
  };
}
