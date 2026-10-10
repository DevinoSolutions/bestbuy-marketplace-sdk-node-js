import type {
  LogisticClass,
  RequestOptions,
  ShippingApi,
  ShippingCarrier,
  ShippingCharges,
  ShippingConfiguration,
  ShippingType,
  ShippingZone,
} from "../types.js";
import type { BestBuyHttpClient } from "../client/http.js";
import {
  carrierListSchema,
  logisticClassListSchema,
  parseWith,
  shippingChargesSchema,
  shippingConfigurationSchema,
  shippingTypeListSchema,
  zoneListSchema,
} from "../schemas/wire.js";

/**
 * Builds the `shipping` namespace: carrier, zone and method reference data plus the shop's own
 * shipping configuration, read-only.
 *
 * Every path was confirmed live (reference data on 2026-09-11, the rest on 2026-10-10). Note
 * the envelope keys differ per endpoint (`carriers`, `shipping_zones`, `shipping_types`,
 * `logistic_classes`) and SH42 / SH52 are bare objects - that asymmetry is upstream's.
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

    async logisticClasses(options?: RequestOptions): Promise<LogisticClass[]> {
      const raw = await http.requestJson({ operation: "shipping.logisticClasses" }, options);
      return parseWith(logisticClassListSchema, raw, "logistic classes").logistic_classes;
    },

    async configuration(options?: RequestOptions): Promise<ShippingConfiguration> {
      const raw = await http.requestJson({ operation: "shipping.configuration" }, options);
      return parseWith(shippingConfigurationSchema, raw, "shipping configuration");
    },

    async charges(options?: RequestOptions): Promise<ShippingCharges> {
      const raw = await http.requestJson({ operation: "shipping.charges" }, options);
      return parseWith(shippingChargesSchema, raw, "shipping charges");
    },
  };
}
