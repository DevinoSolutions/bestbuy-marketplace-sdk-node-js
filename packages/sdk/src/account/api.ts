import type { Account, AccountApi, RequestOptions } from "../types.js";
import type { BestBuyHttpClient } from "../client/http.js";
import { accountSchema, parseWith } from "../schemas/wire.js";

/** Builds the `account` namespace. Read-only. */
export function createAccountApi(http: BestBuyHttpClient): AccountApi {
  return {
    async get(options?: RequestOptions): Promise<Account> {
      const raw = await http.requestJson({ operation: "account.get" }, options);
      return parseWith(accountSchema, raw, "account");
    },
  };
}
