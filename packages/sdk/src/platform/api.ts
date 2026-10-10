import type {
  PlatformApi,
  PlatformConfiguration,
  PlatformLocale,
  RequestOptions,
} from "../types.js";
import type { BestBuyHttpClient } from "../client/http.js";
import {
  localeListSchema,
  parseWith,
  platformConfigurationSchema,
  platformVersionSchema,
} from "../schemas/wire.js";

/** Builds the `platform` namespace: read-only facts about the Mirakl instance itself. */
export function createPlatformApi(http: BestBuyHttpClient): PlatformApi {
  return {
    async version(options?: RequestOptions): Promise<string> {
      const raw = await http.requestJson({ operation: "platform.version" }, options);
      return parseWith(platformVersionSchema, raw, "platform version").version;
    },

    async configuration(options?: RequestOptions): Promise<PlatformConfiguration> {
      const raw = await http.requestJson({ operation: "platform.configuration" }, options);
      return parseWith(platformConfigurationSchema, raw, "platform configuration");
    },

    async locales(options?: RequestOptions): Promise<PlatformLocale[]> {
      const raw = await http.requestJson({ operation: "platform.locales" }, options);
      return parseWith(localeListSchema, raw, "platform locales").locales;
    },
  };
}
