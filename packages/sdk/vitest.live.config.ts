import { defineConfig } from "vitest/config";

// Opt-in live smoke tests against the REAL Best Buy Canada Marketplace account.
// Gated inside the suite on BESTBUY_LIVE_TESTS plus a present API key; never included in
// the default `npm test` run and never in CI. Every call in the suite is READ-ONLY.
export default defineConfig({
  test: {
    name: "sdk-live",
    environment: "node",
    include: ["test/live/**/*.live.test.ts"],
    root: import.meta.dirname,
    testTimeout: 120_000,
  },
});
