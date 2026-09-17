import type {
  RequestOptions,
  ShippingApi,
  ShippingCarrier,
  ShippingType,
  ShippingZone,
} from "../types.js";
import type { BestBuyHttpClient } from "../client/http.js";
import {
  carrierListSchema,
  parseWith,
  shippingTypeListSchema,
  zoneListSchema,
} from "../schemas/wire.js";

/**
 * Builds the `shipping` namespace: carrier, zone and method reference data, read-only.
 *
 * All three paths were confirmed live on 2026-09-11. Note the envelope keys differ per
 * endpoint (`carriers`, `shipping_zones`, `shipping_types`) — that asymmetry is upstream's.
 */
export function createShippingApi(http: BestBuyHttpClient): ShippingApi {
  return {
    async methods(options?: RequestOptions): Promise<ShippingCarrier[]> {
      const raw = await http.requestJson({ operation: "shipping.methods" }, options);
      return parseWith(carrierListSchema, raw, "shipping carriers").carriers;
    },

    async zones(options?: RequestOptions): Promise<ShippingZone[]> {
      const raw = await http.requestJson({ operation: "shipping.zones" }, options);
      return parseWith(zoneListSchema, raw, "shipping zones").shipping_zones;
    },

    async types(options?: RequestOptions): Promise<ShippingType[]> {
      const raw = await http.requestJson({ operation: "shipping.types" }, options);
      return parseWith(shippingTypeListSchema, raw, "shipping types").shipping_types;
    },
  };
}
