import { describe, expect, it } from "vitest";
import { harness, onlyCall, route } from "./helpers.js";

describe("shipping reference data", () => {
  it("lists carriers", async () => {
    const { client, calls } = harness([
      route("GET", "/api/shipping/carriers", 200, {
        carriers: [
          {
            code: "CPCL",
            label: "Canada Post",
            standard_code: "ca-post",
            tracking_url: "https://x/{trackingId}",
          },
        ],
      }),
    ]);
    const carriers = await client.shipping.methods();
    expect(carriers[0]?.code).toBe("CPCL");
    expect(carriers[0]?.standard_code).toBe("ca-post");
    expect(onlyCall(calls).url.pathname).toBe("/api/shipping/carriers");
  });

  it("lists zones from the shipping_zones envelope", async () => {
    const { client, calls } = harness([
      route("GET", "/api/shipping/zones", 200, {
        shipping_zones: [{ code: "ONLocal", label: "Ontario Local", description: "K1A-K9Z" }],
      }),
    ]);
    const zones = await client.shipping.zones();
    expect(zones[0]?.label).toBe("Ontario Local");
    expect(zones[0]?.description).toBe("K1A-K9Z");
    expect(onlyCall(calls).url.pathname).toBe("/api/shipping/zones");
  });

  it("lists shipping types", async () => {
    const { client, calls } = harness([
      route("GET", "/api/shipping/types", 200, {
        shipping_types: [
          {
            code: "M",
            label: "Ground Regular",
            description: "Ground Regular",
            click_and_collect: false,
            mandatory_tracking: true,
            ignore_lead_time_to_ship: false,
            standard_code: "CU_ADD-STD",
          },
        ],
      }),
    ]);
    const types = await client.shipping.types();
    expect(types[0]?.code).toBe("M");
    expect(types[0]?.mandatory_tracking).toBe(true);
    expect(onlyCall(calls).url.pathname).toBe("/api/shipping/types");
  });
});
