# @devino/bestbuy-marketplace-sdk

Thin, typed, transport-independent client for the **Best Buy Canada Marketplace** seller API
(a Mirakl Marketplace Platform instance). Offers, products, catalog metadata, shipping
reference data and orders.

Node >= 22.12, ESM only. One runtime dependency: `zod`.

> Read shapes were verified against a live Best Buy Canada seller account on 2026-09-11;
> write shapes are still derived from standard Mirakl conventions and marked ASSUMPTION in the
> repository's `docs/research/bestbuy-api-contracts.md`.

```bash
npm install @devino/bestbuy-marketplace-sdk
```

```ts
import { createBestBuyClient } from "@devino/bestbuy-marketplace-sdk";

const client = createBestBuyClient({ apiKey: process.env.BESTBUY_API_KEY! });

const account = await client.account.get();
for await (const offer of client.offers.listAll({ max: 100 })) {
  console.log(offer.shop_sku, offer.price, offer.quantity);
}
```

Reads are safe; `offers.update`, `offers.importFile`, `products.importFile`, `orders.accept`,
`orders.ship` and `orders.setTracking` mutate the seller account. `OPERATIONS` and
`writeOperationNames()` expose that classification programmatically.

Testing helpers (a route-driven mock `fetch`) live at
`@devino/bestbuy-marketplace-sdk/testing`.

Full documentation, safety rules and the endpoint contracts are in the repository README.

MIT
