import { describe, expect, it } from "vitest";
import { harness, onlyCall, route } from "./helpers.js";

describe("catalog.hierarchies", () => {
  it("unwraps the hierarchies array", async () => {
    const { client } = harness([
      route("GET", "/api/hierarchies", 200, {
        hierarchies: [{ code: "COMPUTERS", label: "Computers", level: 0, parent_code: null }],
      }),
    ]);
    const hierarchies = await client.catalog.hierarchies();
    expect(hierarchies).toHaveLength(1);
    expect(hierarchies[0]?.code).toBe("COMPUTERS");
  });

  it("passes the subtree and depth filters through", async () => {
    const { client, calls } = harness([route("GET", "/api/hierarchies", 200, { hierarchies: [] })]);
    await client.catalog.hierarchies({ hierarchy: "COMPUTERS", maxLevel: 2 });
    const query = onlyCall(calls).url.searchParams;
    expect(query.get("hierarchy")).toBe("COMPUTERS");
    expect(query.get("max_level")).toBe("2");
  });
});

describe("catalog.attributes", () => {
  it("unwraps the attributes array and forwards with_roles", async () => {
    const { client, calls } = harness([
      route("GET", "/api/products/attributes", 200, {
        attributes: [{ code: "brand", label: "Brand", required: true, type: "TEXT" }],
      }),
    ]);
    const attributes = await client.catalog.attributes({ withRoles: true });
    expect(attributes[0]?.code).toBe("brand");
    expect(attributes[0]?.required).toBe(true);
    expect(onlyCall(calls).url.searchParams.get("with_roles")).toBe("true");
  });
});

describe("catalog.valueLists", () => {
  it("unwraps values_lists and filters by code", async () => {
    const { client, calls } = harness([
      route("GET", "/api/values_lists", 200, {
        values_lists: [{ code: "colours", values: [{ code: "black", label: "Black" }] }],
      }),
    ]);
    const lists = await client.catalog.valueLists({ code: "colours" });
    expect(lists[0]?.values?.[0]?.code).toBe("black");
    expect(onlyCall(calls).url.searchParams.get("code")).toBe("colours");
  });
});

describe("catalog.additionalFields", () => {
  it("unwraps additional_fields and comma-joins the entity filter", async () => {
    const { client, calls } = harness([
      route("GET", "/api/additional_fields", 200, {
        additional_fields: [
          { code: "manufacturer-warranty", entity: "OFFER", type: "REGEX", required: true },
        ],
      }),
    ]);
    const fields = await client.catalog.additionalFields({ entities: ["OFFER", "ORDER"] });
    expect(fields[0]?.code).toBe("manufacturer-warranty");
    expect(onlyCall(calls).url.searchParams.get("entities")).toBe("OFFER,ORDER");
  });

  it("omits the filter entirely when no entities are given", async () => {
    const { client, calls } = harness([
      route("GET", "/api/additional_fields", 200, { additional_fields: [] }),
    ]);
    await client.catalog.additionalFields();
    expect(onlyCall(calls).url.searchParams.has("entities")).toBe(false);
  });
});
