import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBestBuyClient } from "../../src/index.js";
import type { BestBuyClient } from "../../src/types.js";

/**
 * Shared setup for the opt-in, READ-ONLY live suite. Loads the repo-root `.env` into
 * `process.env` (no dependency; never overwrites already-set vars, never logs values) so the
 * suite runs straight from the project's `.env` once `BESTBUY_LIVE_TESTS=true` is set.
 *
 * SAFETY: nothing in the live suite performs a write. Only the READ rows of
 * `src/operations.ts` are ever issued (account, offer/order list and get, offer states,
 * product search and competing offers, offer export, catalog metadata, shipping reference data
 * and configuration, inbox threads, platform facts), and
 * `npm run check:live-readonly` fails the build if that ever stops being true.
 */
function loadDotEnv(): void {
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      for (const raw of readFileSync(candidate, "utf8").split(/\r?\n/)) {
        const match = raw.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        const key = match?.[1];
        const value = match?.[2];
        if (key === undefined || value === undefined) continue;
        if (process.env[key] === undefined) {
          process.env[key] = value.replace(/^\s*["']|["']\s*$/g, "").trim();
        }
      }
      return;
    }
    dir = resolve(dir, "..");
  }
}

loadDotEnv();

const env = process.env;

/** The live suite runs only when explicitly enabled AND an API key is present. */
export const liveEnabled = env.BESTBUY_LIVE_TESTS === "true" && Boolean(env.BESTBUY_API_KEY);

/** Builds a client from the environment. Never prints the key. */
export function makeLiveClient(): BestBuyClient {
  return createBestBuyClient({
    apiKey: String(env.BESTBUY_API_KEY),
    ...(env.BESTBUY_BASE_URL ? { baseUrl: env.BESTBUY_BASE_URL } : {}),
    ...(env.BESTBUY_SHOP_ID ? { shopId: env.BESTBUY_SHOP_ID } : {}),
    timeoutMs: 60_000,
  });
}
